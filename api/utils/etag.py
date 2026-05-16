"""ETag-aware JSON response helper.

Sprint 2 of the Companion perf plan: most polls return the same payload,
so we hash the body and respond 304 No Content when the client already
has it. Saves ~60-90% bytes on /api/wars/current, /api/war-off-limits/{id},
/api/ff/{id} per the plan's estimate.

ETag is a strong validator computed via MD5 over the canonical JSON form
(sorted keys, compact separators). MD5 is sufficient for cache validation —
we're not signing anything.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import Request, Response


_CACHE_CONTROL_DEFAULT = "private, max-age=30, stale-while-revalidate=60"


def etag_response(
    payload: Any,
    request: Request,
    *,
    cache_control: str = _CACHE_CONTROL_DEFAULT,
) -> Response:
    """Return ``payload`` as JSON with an ETag, or 304 if the client's
    ``If-None-Match`` matches.

    ``sort_keys=True`` so two structurally identical payloads always hash
    to the same ETag even if the dict insertion order differs.
    """
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    etag = '"' + hashlib.md5(body).hexdigest() + '"'
    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=304,
            headers={"ETag": etag, "Cache-Control": cache_control},
        )
    return Response(
        content=body,
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": cache_control},
    )
