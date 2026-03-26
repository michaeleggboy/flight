"""
Tabular Q-learning agent: WAIT vs BUY per route (origin-destination).
Trained on simulated price paths from price_simulator.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from app.services.price_simulator import (
    leg_distance_km,
    reference_base_price,
    route_key,
    simulate_price_path,
)

WAIT = 0
BUY = 1
N_TIME_BUCKETS = 12
N_PRICE_BUCKETS = 10
N_STATES = N_TIME_BUCKETS * N_PRICE_BUCKETS
N_ACTIONS = 2

# Default training horizon (days)
DEFAULT_MAX_DAYS = 90


def state_index(days_left: int, price: float, ref_price: float, max_days: int = DEFAULT_MAX_DAYS) -> int:
    """Map continuous (days_left, price) to a single discrete state index."""
    md = max(int(max_days), 1)
    d = max(0, min(int(days_left), md))
    tb = int((d / md) * N_TIME_BUCKETS)
    tb = min(tb, N_TIME_BUCKETS - 1)

    ref = max(float(ref_price), 1.0)
    ratio = max(float(price) / ref, 0.25)
    log_lo = np.log(0.35)
    log_hi = np.log(1.65)
    log_r = np.log(min(ratio, np.exp(log_hi)))
    pb = int((log_r - log_lo) / max(log_hi - log_lo, 1e-9) * N_PRICE_BUCKETS)
    pb = int(np.clip(pb, 0, N_PRICE_BUCKETS - 1))

    return tb * N_PRICE_BUCKETS + pb


def _new_q_matrix() -> np.ndarray:
    return np.zeros((N_STATES, N_ACTIONS), dtype=np.float64)


def train_route(
    origin: str,
    destination: str,
    episodes: int = 2000,
    max_days: int = DEFAULT_MAX_DAYS,
    gamma: float = 0.97,
    lr: float = 0.18,
    epsilon: float = 0.25,
    seed_offset: int = 0,
) -> np.ndarray:
    """Run tabular Q-learning on simulated episodes for one route."""
    dist = leg_distance_km(origin, destination)
    if dist is None:
        return _new_q_matrix()

    ref = reference_base_price(dist)
    rk = route_key(origin, destination)
    base_seed = (hash(rk) % (2**31)) + int(seed_offset)
    Q = _new_q_matrix()

    for ep in range(int(episodes)):
        path = simulate_price_path(max_days, dist, seed=base_seed + ep)
        i = 0
        while i <= max_days:
            days_left = max_days - i
            price = float(path[min(i, len(path) - 1)])
            s = state_index(days_left, price, ref, max_days)

            if days_left <= 0:
                min_f = float(np.min(path[i:]))
                regret = price - min_f
                span = float(np.max(path[i:]) - min_f + 1e-6)
                r_buy = -(regret / ref) + 0.45 * (1.0 - min(1.0, regret / span))
                Q[s, BUY] += lr * (r_buy - Q[s, BUY])
                break

            if np.random.random() < epsilon:
                a = int(np.random.randint(0, N_ACTIONS))
            else:
                a = int(np.argmax(Q[s]))

            if a == BUY:
                rest = path[i:]
                min_f = float(np.min(rest))
                regret = price - min_f
                span = float(np.max(rest) - min_f + 1e-6)
                r_buy = -(regret / ref) + 0.45 * (1.0 - min(1.0, regret / span))
                Q[s, BUY] += lr * (r_buy - Q[s, BUY])
                break

            r_wait = -0.02
            i_next = min(i + 1, len(path) - 1)
            days_next = max_days - i_next
            price_next = float(path[i_next])
            s_next = state_index(days_next, price_next, ref, max_days)
            best_next = float(np.max(Q[s_next]))
            Q[s, WAIT] += lr * (r_wait + gamma * best_next - Q[s, WAIT])
            i = i_next

    return Q


def recommend(
    Q: np.ndarray,
    days_left: int,
    current_price_usd: float,
    ref_price: float,
    max_days: int = DEFAULT_MAX_DAYS,
) -> tuple[str, float, dict]:
    """
    Return (action_name, confidence, debug).
    confidence in [0, 1] from softmax spread of Q(s,·).
    """
    s = state_index(days_left, current_price_usd, ref_price, max_days)
    q = Q[s].astype(np.float64)
    # Numerical stability
    q_shift = q - np.max(q)
    exp_q = np.exp(np.clip(q_shift * 4.0, -20, 20))
    probs = exp_q / (np.sum(exp_q) + 1e-12)
    a = int(np.argmax(q))
    action = "BUY" if a == BUY else "WAIT"
    confidence = float(probs[a])
    debug = {
        "state_index": int(s),
        "q_wait": float(q[WAIT]),
        "q_buy": float(q[BUY]),
        "days_left": int(days_left),
        "ref_price_usd": float(ref_price),
    }
    return action, confidence, debug


def q_table_path(base_dir: Path, origin: str, destination: str) -> Path:
    base_dir.mkdir(parents=True, exist_ok=True)
    safe = route_key(origin, destination).replace("/", "-")
    return base_dir / f"{safe}.json"


def save_q_table(path: Path, Q: np.ndarray, meta: dict | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "Q": Q.tolist(),
        "shape": list(Q.shape),
        "meta": meta or {},
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def load_q_table(path: Path) -> np.ndarray | None:
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    arr = np.array(data["Q"], dtype=np.float64)
    if arr.shape != (N_STATES, N_ACTIONS):
        return None
    return arr


def ensure_q_table(
    base_dir: Path,
    origin: str,
    destination: str,
    train_episodes: int = 2000,
) -> np.ndarray:
    """Load from disk or train and save."""
    p = q_table_path(base_dir, origin, destination)
    loaded = load_q_table(p)
    if loaded is not None:
        return loaded
    Q = train_route(origin, destination, episodes=train_episodes)
    meta = {"origin": origin.upper(), "destination": destination.upper(), "episodes": train_episodes}
    save_q_table(p, Q, meta=meta)
    return Q
