"""Sprint 1.5 quick win — verify GZipMiddleware compresses responses
just above 200 B (lowered from 500 B in main.py).

The Companion's hottest endpoints (feature-flags, wars/current, ff/{id})
all sit in the 200-300 B range. Before this tune they were shipping
uncompressed; now they get gzipped on the FastAPI hop too.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.testclient import TestClient


def _app_with_payload(body: bytes) -> TestClient:
    """Re-create the production middleware stack with a stub endpoint that
    returns exactly ``body``. Mirroring main.py's middleware order is what
    makes this a contract test rather than testing FastAPI itself."""
    app = FastAPI()
    app.add_middleware(GZipMiddleware, minimum_size=200)

    @app.get("/payload")
    def payload():
        from fastapi.responses import Response

        return Response(content=body, media_type="application/json")

    return TestClient(app)


def test_response_above_threshold_is_gzipped():
    """250 B JSON → should be gzipped (above the 200 B floor)."""
    body = b"x" * 250
    client = _app_with_payload(body)
    resp = client.get("/payload", headers={"Accept-Encoding": "gzip"})
    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") == "gzip"


def test_response_below_threshold_passes_through():
    """50 B → should pass through unmodified (overhead of gzip headers
    exceeds the saving on such a small payload)."""
    body = b"x" * 50
    client = _app_with_payload(body)
    resp = client.get("/payload", headers={"Accept-Encoding": "gzip"})
    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") != "gzip"


def test_production_middleware_uses_200_threshold():
    """Lock the production constant. If someone bumps it back to 500 they
    must update this test in the same PR."""
    import re
    from pathlib import Path

    main_py = Path(__file__).parent.parent / "api" / "main.py"
    src = main_py.read_text()
    match = re.search(r"GZipMiddleware,\s*minimum_size=(\d+)", src)
    assert match is not None, "GZipMiddleware setup not found in api/main.py"
    assert match.group(1) == "200", (
        f"GZipMiddleware minimum_size is {match.group(1)}, expected 200"
    )
