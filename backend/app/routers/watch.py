from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.models.flight import FlightSearchRequest
from app.models.watch import (
    LegWatchRequest,
    WatchRecommendation,
    WatchTrainRequest,
    WatchTrainResponse,
)
from app.services.flight_service import search_flights
from app.services.price_simulator import leg_distance_km, reference_base_price, route_key
from app.services import q_price_agent

router = APIRouter(prefix="/api/watch", tags=["watch"])

Q_TABLE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "q_tables"

# In-process cache: route_key -> Q matrix
_q_cache: dict[str, object] = {}


def _days_until(departure_date: str) -> int:
    try:
        d = datetime.strptime(departure_date.strip(), "%Y-%m-%d").date()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {e}") from e
    delta = (d - date.today()).days
    return max(0, min(delta, 365))


def _default_train_routes() -> list[tuple[str, str]]:
    """A small hub subset so empty train still does useful work."""
    hubs = ["JFK", "LHR", "LAX", "NRT", "DXB", "SIN", "ORD", "CDG"]
    pairs: list[tuple[str, str]] = []
    for i, a in enumerate(hubs):
        for b in hubs[i + 1 :]:
            if leg_distance_km(a, b):
                pairs.append((a, b))
    return pairs[:24]


@router.post("/recommend", response_model=WatchRecommendation)
async def watch_recommend(body: LegWatchRequest):
    """
    Q-table buy/wait suggestion for a single leg.
    Uses on-disk Q table (trained on simulator); trains lazily if missing.
    """
    dist = leg_distance_km(body.origin, body.destination)
    if dist is None:
        raise HTTPException(status_code=400, detail="Unknown origin or destination airport")

    rk = route_key(body.origin, body.destination)
    days_left = body.days_left if body.days_left is not None else _days_until(body.date)
    days_left = min(days_left, q_price_agent.DEFAULT_MAX_DAYS)
    ref = reference_base_price(dist)

    if body.current_price_usd is not None:
        price = float(body.current_price_usd)
    else:
        flights = await search_flights(
            FlightSearchRequest(
                origin=body.origin.upper(),
                destination=body.destination.upper(),
                date=body.date,
                passengers=1,
            )
        )
        if not flights:
            raise HTTPException(status_code=404, detail="No mock flights for this leg/date")
        price = float(min(f.price_usd for f in flights))

    if rk not in _q_cache:
        Q = q_price_agent.ensure_q_table(Q_TABLE_DIR, body.origin, body.destination)
        _q_cache[rk] = Q
    else:
        Q = _q_cache[rk]  # type: ignore[assignment]

    action, confidence, debug = q_price_agent.recommend(
        Q, days_left, price, ref, max_days=q_price_agent.DEFAULT_MAX_DAYS
    )

    return WatchRecommendation(
        action=action,
        confidence=confidence,
        route_key=rk,
        days_left=days_left,
        current_price_usd=price,
        reference_price_usd=ref,
        debug=debug,
    )


@router.post("/train", response_model=WatchTrainResponse)
async def watch_train(body: WatchTrainRequest):
    """
    Warm-start or refresh Q tables for one or more routes (simulator-based).
    """
    routes_in: list[tuple[str, str]]
    if body.routes:
        routes_in = [(r.origin.upper(), r.destination.upper()) for r in body.routes]
    else:
        routes_in = _default_train_routes()

    trained_keys: list[str] = []
    for o, d in routes_in:
        if not leg_distance_km(o, d):
            continue
        Q = q_price_agent.train_route(o, d, episodes=body.episodes)
        rk = route_key(o, d)
        path = q_price_agent.q_table_path(Q_TABLE_DIR, o, d)
        q_price_agent.save_q_table(
            path,
            Q,
            meta={
                "origin": o,
                "destination": d,
                "episodes": body.episodes,
                "max_days": q_price_agent.DEFAULT_MAX_DAYS,
            },
        )
        _q_cache[rk] = Q
        trained_keys.append(rk)

    if not trained_keys:
        raise HTTPException(status_code=400, detail="No valid routes to train")

    return WatchTrainResponse(
        trained=trained_keys,
        episodes=body.episodes,
        message=f"Updated {len(trained_keys)} Q-table(s) under data/q_tables/",
    )
