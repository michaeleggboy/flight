import numpy as np

from app.services import q_price_agent
from app.services.price_simulator import leg_distance_km, reference_base_price


def test_state_index_in_range():
    ref = 500.0
    for d in (0, 10, 45, 90):
        for p in (200.0, 400.0, 600.0):
            s = q_price_agent.state_index(d, p, ref, max_days=90)
            assert 0 <= s < q_price_agent.N_STATES


def test_train_route_produces_finite_q():
    Q = q_price_agent.train_route("BOS", "LHR", episodes=400, seed_offset=0)
    assert Q.shape == (q_price_agent.N_STATES, q_price_agent.N_ACTIONS)
    assert np.all(np.isfinite(Q))


def test_recommend_returns_action():
    Q = q_price_agent.train_route("ORD", "SEA", episodes=800, seed_offset=2)
    ref = reference_base_price(leg_distance_km("ORD", "SEA") or 2800)
    action, conf, dbg = q_price_agent.recommend(Q, 40, ref * 1.0, ref)
    assert action in ("WAIT", "BUY")
    assert 0 <= conf <= 1
    assert "state_index" in dbg


def test_save_load_roundtrip(tmp_path):
    Q = q_price_agent.train_route("DEN", "SFO", episodes=200, seed_offset=3)
    p = tmp_path / "DEN-SFO.json"
    q_price_agent.save_q_table(p, Q, meta={"k": "v"})
    L = q_price_agent.load_q_table(p)
    assert L is not None
    assert np.allclose(L, Q)
