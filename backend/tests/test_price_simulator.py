import numpy as np

from app.services.price_simulator import (
    leg_distance_km,
    reference_base_price,
    route_key,
    simulate_price_path,
)


def test_route_key_normalizes():
    assert route_key("bos", "lhr") == "BOS-LHR"


def test_leg_distance_known_pair():
    d = leg_distance_km("BOS", "LHR")
    assert d is not None
    assert 4000 < d < 6000


def test_leg_distance_unknown():
    assert leg_distance_km("XXX", "LHR") is None


def test_reference_base_price_positive():
    assert reference_base_price(5000) == 500.0


def test_simulate_price_path_length_and_bounds():
    path = simulate_price_path(30, 4000.0, seed=42)
    assert path.shape == (31,)
    assert np.all(path > 0)
    base = reference_base_price(4000.0)
    assert np.all(path >= base * 0.25)


def test_simulate_price_path_reproducible():
    a = simulate_price_path(20, 3500.0, seed=7)
    b = simulate_price_path(20, 3500.0, seed=7)
    assert np.allclose(a, b)
