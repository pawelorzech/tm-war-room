"""MCP server core — FastMCP instance and service registry.

The FastMCP instance is created at module level so that tool/resource
decorators work at import time.  Actual service objects (repos, client,
etc.) are injected later via ``set_services()`` from the FastAPI lifespan.
"""

from __future__ import annotations

import logging
from typing import Any

from fastmcp import FastMCP
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from api.config import MCP_SECRET

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Service registry — populated at startup via set_services()
# ---------------------------------------------------------------------------

_services: dict[str, Any] = {}


def set_services(**kwargs: Any) -> None:
    """Store service references so MCP tools can access them lazily."""
    _services.update(kwargs)
    logger.info("MCP service registry updated: %s", list(kwargs.keys()))


def get_service(name: str) -> Any:
    """Retrieve a service by name. Raises RuntimeError if not yet registered."""
    try:
        return _services[name]
    except KeyError:
        raise RuntimeError(
            f"MCP service '{name}' not available. "
            "The FastAPI lifespan may not have run yet."
        ) from None


# ---------------------------------------------------------------------------
# Auth middleware — bearer token check
# ---------------------------------------------------------------------------

class MCPAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not MCP_SECRET:
            return Response("Not found", status_code=404)
        auth = request.headers.get("authorization", "")
        if auth != f"Bearer {MCP_SECRET}":
            return Response("Unauthorized", status_code=401)
        return await call_next(request)


# ---------------------------------------------------------------------------
# FastMCP instance
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "TM Hub",
    instructions=(
        "TM Hub MCP server for The Masters [TM] faction in Torn.com. "
        "Provides tools to manage competitions, announcements, spy estimates, "
        "targets, chain analytics, stats leaderboards, and more. "
        "All write operations act as superadmin (Bombel [2362436])."
    ),
)

# ---------------------------------------------------------------------------
# Register tools (side-effect imports)
# ---------------------------------------------------------------------------

from api.mcp.tools import register_all_tools  # noqa: E402

register_all_tools(mcp)


def get_mcp_middleware() -> list[Middleware]:
    """Return middleware list for http_app(). MCP stays closed unless a secret is configured."""
    return [Middleware(MCPAuthMiddleware)]
