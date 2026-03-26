"""
Scoring function for the price-to-time tradeoff.

score = α * normalized_price + (1 - α) * normalized_time

α = 1.0 → pure price optimization
α = 0.0 → pure time optimization  
α = 0.5 → balanced (default)
"""

from app.models.flight import FlightOption


def score_flight(
    flight: FlightOption,
    price_range: tuple[float, float],
    time_range: tuple[int, int],
    alpha: float = 0.5,
) -> float:
    """
    Score a single flight based on price-time tradeoff.
    
    Args:
        flight: The flight to score
        price_range: (min_price, max_price) across all options for normalization
        time_range: (min_minutes, max_minutes) across all options
        alpha: Weight for price (0=time only, 1=price only)
    
    Returns:
        Score between 0 (best) and 1 (worst)
    """
    min_price, max_price = price_range
    min_time, max_time = time_range

    # Normalize to [0, 1]
    if max_price > min_price:
        norm_price = (flight.price_usd - min_price) / (max_price - min_price)
    else:
        norm_price = 0.0

    if max_time > min_time:
        norm_time = (flight.duration_minutes - min_time) / (max_time - min_time)
    else:
        norm_time = 0.0

    return alpha * norm_price + (1 - alpha) * norm_time


def score_itinerary_legs(
    legs: list[FlightOption],
    all_flights_per_leg: list[list[FlightOption]],
    alpha: float = 0.5,
) -> tuple[list[float], float]:
    """
    Score each leg and return (per_leg_scores, total_score).
    
    Normalization is done per-leg so each leg contributes equally.
    """
    leg_scores = []

    for flight, options in zip(legs, all_flights_per_leg):
        if not options:
            leg_scores.append(0.0)
            continue

        prices = [f.price_usd for f in options]
        times = [f.duration_minutes for f in options]

        price_range = (min(prices), max(prices))
        time_range = (min(times), max(times))

        score = score_flight(flight, price_range, time_range, alpha)
        leg_scores.append(round(score, 4))

    total = sum(leg_scores) / len(leg_scores) if leg_scores else 0.0
    return leg_scores, round(total, 4)
