"""
Stochastic daily price paths for RL training (mock market).
Volatility scales loosely with great-circle distance.
"""

from __future__ import annotations

import numpy as np

from app.services.flight_service import get_airport, _haversine_km


def route_key(origin: str, destination: str) -> str:
    return f"{origin.upper()}-{destination.upper()}"


def leg_distance_km(origin_code: str, destination_code: str) -> float | None:
    o = get_airport(origin_code)
    d = get_airport(destination_code)
    if not o or not d:
        return None
    return float(_haversine_km(o.lat, o.lng, d.lat, d.lng))


def reference_base_price(dist_km: float) -> float:
    """Mid-range $/km consistent with mock flight_service order of magnitude."""
    return float(dist_km * 0.10)


def simulate_price_path(
    days: int,
    dist_km: float,
    seed: int | None = None,
) -> np.ndarray:
    """
    Daily prices from `days` days before departure through departure day.

    - path[0]: price when `days` days remain
    - path[days]: price on departure day (0 days left)
    """
    rng = np.random.default_rng(seed)
    base = reference_base_price(dist_km)
    sigma = 0.012 + min(0.035, float(dist_km) / 250_000.0)
    mu = -0.0003

    n = int(days) + 1
    prices = np.zeros(n, dtype=np.float64)
    prices[0] = base * float(rng.uniform(0.82, 1.22))

    for t in range(1, n):
        shock = float(rng.normal(mu, sigma))
        prices[t] = prices[t - 1] * float(np.exp(shock))
        # Mild mean reversion around a drifting base
        anchor = base * float(rng.uniform(0.92, 1.08))
        prices[t] = prices[t] * 0.62 + anchor * 0.38

    prices = np.maximum(prices, base * 0.32)
    return prices
