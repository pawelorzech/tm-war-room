"""Sprint 2 — ETag helper for Companion-hot endpoints (#12 from plan).

Goal: when the underlying data hasn't changed (which is most polls), respond
with 304 and no body instead of the full JSON. The plan estimates -60-90%
bytes-on-the-wire for /api/wars/current, /api/war-off-limits/{id}, /api/ff/{id}.

TDD red-first — these tests run before api/utils/etag.py exists.
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


def _make_client(payload):
    """A trivial FastAPI app whose single endpoint round-trips ``payload``
    through ``etag_response`` so we can assert ETag/304 behaviour without
    touching the real routers."""
    from api.utils.etag import etag_response

    app = FastAPI()

    @app.get("/echo")
    def echo(request: Request):
        return etag_response(payload, request)

    return TestClient(app)


# ----- Helper invariants -----


def test_first_call_returns_200_with_etag_header():
    client = _make_client({"war_id": 11559, "opponent_faction_id": 42})
    resp = client.get("/echo")
    assert resp.status_code == 200
    assert "etag" in {k.lower() for k in resp.headers.keys()}
    etag = resp.headers["etag"]
    # ETag must be quoted per RFC 7232.
    assert etag.startswith('"') and etag.endswith('"')


def test_matching_if_none_match_returns_304_no_body():
    client = _make_client({"war_id": 11559})
    first = client.get("/echo")
    etag = first.headers["etag"]
    second = client.get("/echo", headers={"If-None-Match": etag})
    assert second.status_code == 304
    assert second.content == b""
    assert second.headers.get("etag") == etag


def test_stale_if_none_match_returns_200_with_new_etag():
    client = _make_client({"war_id": 11559})
    stale = '"deadbeef"'
    resp = client.get("/echo", headers={"If-None-Match": stale})
    assert resp.status_code == 200
    assert resp.headers["etag"] != stale


def test_different_payloads_produce_different_etags():
    c1 = _make_client({"war_id": 1})
    c2 = _make_client({"war_id": 2})
    e1 = c1.get("/echo").headers["etag"]
    e2 = c2.get("/echo").headers["etag"]
    assert e1 != e2


def test_etag_is_stable_across_key_order():
    """Same content with different dict insertion order → same ETag.
    Otherwise downstream caches would treat semantically-identical
    responses as new."""
    c1 = _make_client({"a": 1, "b": 2})
    c2 = _make_client({"b": 2, "a": 1})
    e1 = c1.get("/echo").headers["etag"]
    e2 = c2.get("/echo").headers["etag"]
    assert e1 == e2


def test_cache_control_swr_is_preserved_on_200():
    """ETag works with Cache-Control: stale-while-revalidate. The 200
    response should still set Cache-Control so the browser knows the
    freshness window."""
    client = _make_client({"x": 1})
    resp = client.get("/echo")
    cc = resp.headers.get("cache-control", "")
    assert "max-age" in cc
    assert "stale-while-revalidate" in cc
