"""
Multi-city route optimizer.

For N cities:
- N ≤ 8: Exact solution via permutation enumeration
- N > 8: Simulated annealing heuristic

The optimizer:
1. Generates all valid city orderings
2. For each ordering, picks the best flight per leg
3. Scores each itinerary using the price-time tradeoff
4. Returns top-k results
"""

import uuid
import math
import random
from itertools import permutations

from app.models.flight import FlightOption, FlightSearchRequest
from app.models.itinerary import (
    OptimizeRequest,
    OptimizeResponse,
    ItineraryResult,
    LegResult,
)
from app.services.flight_service import search_flights
from app.services.scorer import score_flight


# ─── Flight cache for a single optimization run ─────────────────────────────

async def _fetch_flights_for_pairs(
    city_pairs: set[tuple[str, str]],
    date: str,
    passengers: int,
) -> dict[tuple[str, str], list[FlightOption]]:
    """Fetch flights for all needed city pairs (deduped)."""
    cache: dict[tuple[str, str], list[FlightOption]] = {}

    for origin, dest in city_pairs:
        req = FlightSearchRequest(
            origin=origin,
            destination=dest,
            date=date,
            passengers=passengers,
        )
        flights = await search_flights(req)
        cache[(origin, dest)] = flights

    return cache


def _best_flight_for_leg(
    flights: list[FlightOption],
    alpha: float,
) -> FlightOption | None:
    """Pick the best single flight for a leg given the tradeoff weight."""
    if not flights:
        return None

    prices = [f.price_usd for f in flights]
    times = [f.duration_minutes for f in flights]
    price_range = (min(prices), max(prices))
    time_range = (min(times), max(times))

    scored = [
        (f, score_flight(f, price_range, time_range, alpha))
        for f in flights
    ]
    scored.sort(key=lambda x: x[1])
    return scored[0][0]


def _score_ordering(
    ordering: list[str],
    flight_cache: dict[tuple[str, str], list[FlightOption]],
    alpha: float,
) -> tuple[list[FlightOption], float]:
    """Score a complete city ordering. Returns (best_flights_per_leg, total_score)."""
    legs = []
    total_score = 0.0

    for i in range(len(ordering) - 1):
        pair = (ordering[i], ordering[i + 1])
        flights = flight_cache.get(pair, [])
        best = _best_flight_for_leg(flights, alpha)

        if best is None:
            return [], float("inf")  # Invalid route

        # Score this leg
        prices = [f.price_usd for f in flights]
        times = [f.duration_minutes for f in flights]
        price_range = (min(prices), max(prices))
        time_range = (min(times), max(times))
        leg_score = score_flight(best, price_range, time_range, alpha)

        legs.append(best)
        total_score += leg_score

    # Normalize by number of legs
    if legs:
        total_score /= len(legs)

    return legs, total_score


# ─── Exact solver (small N) ─────────────────────────────────────────────────

async def _solve_exact(
    request: OptimizeRequest,
    flight_cache: dict[tuple[str, str], list[FlightOption]],
) -> list[tuple[list[str], list[FlightOption], float]]:
    """Enumerate all permutations of intermediate cities."""
    origin = request.cities[0]
    intermediates = request.cities[1:]

    results = []

    if request.trip_type == "round_trip":
        # A → B → A (only 1 intermediate city expected)
        for perm in permutations(intermediates):
            ordering = [origin] + list(perm) + [origin]
            legs, score = _score_ordering(ordering, flight_cache, request.alpha)
            if legs:
                results.append((ordering, legs, score))

    elif request.trip_type == "multi_city":
        # Fixed order: visit cities in the order given, return to origin
        ordering = request.cities + [origin]
        legs, score = _score_ordering(ordering, flight_cache, request.alpha)
        if legs:
            results.append((ordering, legs, score))

    else:  # flexible
        # Try all permutations of intermediates
        for perm in permutations(intermediates):
            ordering = [origin] + list(perm) + [origin]
            legs, score = _score_ordering(ordering, flight_cache, request.alpha)
            if legs:
                results.append((ordering, legs, score))

    results.sort(key=lambda x: x[2])
    return results


# ─── Heuristic solver (large N) ─────────────────────────────────────────────

async def _solve_simulated_annealing(
    request: OptimizeRequest,
    flight_cache: dict[tuple[str, str], list[FlightOption]],
    iterations: int = 10000,
    temp_start: float = 1.0,
    temp_end: float = 0.001,
) -> list[tuple[list[str], list[FlightOption], float]]:
    """Simulated annealing for large city counts."""
    origin = request.cities[0]
    intermediates = list(request.cities[1:])

    # Initial solution: random ordering
    random.shuffle(intermediates)
    current_order = [origin] + intermediates + [origin]
    current_legs, current_score = _score_ordering(current_order, flight_cache, request.alpha)

    best_order = current_order[:]
    best_legs = current_legs[:]
    best_score = current_score

    seen: list[tuple[list[str], list[FlightOption], float]] = []

    for i in range(iterations):
        # Temperature schedule (exponential decay)
        t = temp_start * (temp_end / temp_start) ** (i / iterations)

        # Neighbor: swap two intermediate cities
        new_inter = intermediates[:]
        a, b = random.sample(range(len(new_inter)), 2)
        new_inter[a], new_inter[b] = new_inter[b], new_inter[a]

        new_order = [origin] + new_inter + [origin]
        new_legs, new_score = _score_ordering(new_order, flight_cache, request.alpha)

        if not new_legs:
            continue

        # Accept or reject
        delta = new_score - current_score
        if delta < 0 or random.random() < math.exp(-delta / max(t, 1e-10)):
            intermediates = new_inter
            current_order = new_order
            current_legs = new_legs
            current_score = new_score

            if current_score < best_score:
                best_order = current_order[:]
                best_legs = current_legs[:]
                best_score = current_score

            # Track diverse solutions
            order_key = tuple(current_order)
            if not any(tuple(s[0]) == order_key for s in seen):
                seen.append((current_order[:], current_legs[:], current_score))

    # Return best + diverse alternatives
    seen.append((best_order, best_legs, best_score))
    seen.sort(key=lambda x: x[2])

    # Deduplicate
    unique = []
    seen_keys = set()
    for order, legs, score in seen:
        key = tuple(order)
        if key not in seen_keys:
            seen_keys.add(key)
            unique.append((order, legs, score))

    return unique


# ─── Main optimizer entry point ──────────────────────────────────────────────

async def optimize_route(request: OptimizeRequest) -> OptimizeResponse:
    """Find the best multi-city itinerary."""

    # 1. Determine all city pairs we need flights for
    all_pairs: set[tuple[str, str]] = set()
    intermediates = request.cities[1:]

    if request.trip_type == "multi_city":
        # Fixed order + return
        full_order = request.cities + [request.cities[0]]
        for i in range(len(full_order) - 1):
            all_pairs.add((full_order[i], full_order[i + 1]))
    else:
        # Need flights between all pairs for flexible ordering
        origin = request.cities[0]
        all_cities = request.cities
        for a in all_cities:
            for b in all_cities:
                if a != b:
                    all_pairs.add((a, b))
        # Also need return legs
        for city in intermediates:
            all_pairs.add((city, origin))

    # 2. Fetch all flights
    date = request.dates[0] if request.dates else "2026-06-15"
    flight_cache = await _fetch_flights_for_pairs(
        all_pairs, date, request.passengers
    )

    # 3. Solve
    n_cities = len(request.cities)
    if n_cities <= 8:
        solutions = await _solve_exact(request, flight_cache)
        method = "exact"
    else:
        solutions = await _solve_simulated_annealing(request, flight_cache)
        method = "heuristic"

    # 4. Build response
    itineraries = []
    for rank, (ordering, legs, score) in enumerate(
        solutions[: request.max_results], start=1
    ):
        leg_results = []
        for flight in legs:
            pair = (flight.origin.code, flight.destination.code)
            options = flight_cache.get(pair, [])
            prices = [f.price_usd for f in options] if options else [flight.price_usd]
            times = [f.duration_minutes for f in options] if options else [flight.duration_minutes]
            price_range = (min(prices), max(prices))
            time_range = (min(times), max(times))
            leg_score = score_flight(flight, price_range, time_range, request.alpha)

            leg_results.append(LegResult(flight=flight, leg_score=round(leg_score, 4)))

        itineraries.append(
            ItineraryResult(
                id=str(uuid.uuid4())[:8],
                legs=leg_results,
                city_order=ordering,
                total_price_usd=round(sum(l.flight.price_usd for l in leg_results), 2),
                total_duration_minutes=sum(l.flight.duration_minutes for l in leg_results),
                total_score=round(score, 4),
                rank=rank,
            )
        )

    return OptimizeResponse(
        itineraries=itineraries,
        alpha=request.alpha,
        cities_searched=request.cities,
        optimization_method=method,
    )
