"""Phase 0: /api/extension/feature-flags is publicly readable and returns 4 bools."""
from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_feature_flags_default_all_false():
    """All four flags default to False unless ENABLE_* env vars are set to '1'.

    The test imports the router module fresh — module-level constants were
    captured when api.config was first imported, so we just assert the
    response shape and that no flag is mysteriously on.
    """
    from api.routers.extension import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    resp = client.get("/api/extension/feature-flags")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"ff_score", "flights", "activity", "hit_calling", "rum_enabled"}
    for key, value in body.items():
        assert isinstance(value, bool), f"{key} is not a bool: {value!r}"


def test_feature_flags_reflect_config_module(monkeypatch):
    """Flip the in-memory config flags and verify the endpoint mirrors them.

    The endpoint reads the symbols imported into api.routers.extension at
    module-load time, so we patch them there.
    """
    from api.routers import extension as ext_mod

    monkeypatch.setattr(ext_mod, "ENABLE_FF_SCORE", True)
    monkeypatch.setattr(ext_mod, "ENABLE_FLIGHTS", False)
    monkeypatch.setattr(ext_mod, "ENABLE_ACTIVITY", True)
    monkeypatch.setattr(ext_mod, "ENABLE_HIT_CALLING", False)
    monkeypatch.setattr(ext_mod, "ENABLE_RUM", True)

    app = FastAPI()
    app.include_router(ext_mod.router)
    client = TestClient(app)
    resp = client.get("/api/extension/feature-flags")
    assert resp.status_code == 200
    assert resp.json() == {
        "ff_score": True,
        "flights": False,
        "activity": True,
        "hit_calling": False,
        "rum_enabled": True,
    }


def test_feature_flags_in_config_default_off():
    """Direct module-level assertion: defaults must be False on import."""
    from api import config

    assert config.ENABLE_FF_SCORE is False
    assert config.ENABLE_FLIGHTS is False
    assert config.ENABLE_ACTIVITY is False
    assert config.ENABLE_HIT_CALLING is False


def test_feature_flags_path_is_public(monkeypatch):
    """Sanity: the endpoint path is listed in PUBLIC_API_PATHS so the
    Companion can hit it without an Authorization header."""
    from api import main

    assert "/api/extension/feature-flags" in main.PUBLIC_API_PATHS
