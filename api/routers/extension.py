"""TM Hub Companion (browser extension / userscript) endpoints.

The companion is a thin client that runs as a content script on torn.com pages
and injects TM Hub data (off-limits flags, spy estimates, targets) directly
into the game UI. It authenticates against this backend via a long-lived
extension JWT issued through /api/extension/issue-token after the user is
already logged into TM Hub in the same browser.

Why a separate token type instead of reusing the session JWT:
- Session tokens are bound to TM Hub's localStorage/cookies on hub.tri.ovh;
  a content script on www.torn.com cannot read them (different origin).
- We want a longer TTL so the extension does not have to bounce the user
  through hub.tri.ovh every 24h.
- A distinct ``scope=extension`` claim lets us trace and rate-limit ext
  traffic separately in the future.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Header

from api.auth import (
    EXTENSION_TTL_HOURS,
    TOKEN_TYPE_EXTENSION,
    create_jwt,
)
from api.config import (
    ENABLE_ACTIVITY,
    ENABLE_FF_SCORE,
    ENABLE_FLIGHTS,
    ENABLE_HIT_CALLING,
    FACTION_ID,
    JWT_SECRET,
)

logger = logging.getLogger("tm-hub.extension")

router = APIRouter(prefix="/api/extension", tags=["extension"])

# Module-level state set by main.py lifespan
key_store = None
torn_client = None


@router.post("/issue-token")
async def issue_token(x_player_id: int = Header()):
    """Mint a long-lived extension JWT for the authenticated player.

    Caller must already be authenticated via the regular session middleware
    (validates X-Player-Id matches the session JWT subject). We just re-mint
    a fresh extension-scoped token with 90-day TTL.
    """
    if not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    user_key = key_store.get_key(x_player_id)
    if not user_key:
        raise HTTPException(status_code=401, detail="Register your API key first")
    player_name = user_key["player_name"]
    token = create_jwt(
        x_player_id,
        player_name,
        JWT_SECRET,
        expires_hours=EXTENSION_TTL_HOURS,
        token_type=TOKEN_TYPE_EXTENSION,
    )
    logger.info("extension token issued for %s [%d]", player_name, x_player_id)
    return {
        "ext_token": token,
        "player_id": x_player_id,
        "player_name": player_name,
        "expires_hours": EXTENSION_TTL_HOURS,
    }


@router.get("/feature-flags")
async def feature_flags() -> dict[str, bool]:
    """Public read of the FFScouter-parity feature flags.

    The Companion fetches this on startup (no token required, see
    PUBLIC_API_PATHS in main.py) and caches the result for 60s. Flags are
    non-secret booleans — the only thing leaking by serving this anonymously
    is which features are currently on, which is fine. Phases 1-4 flip these
    via env vars on the production deploy.
    """
    return {
        "ff_score": ENABLE_FF_SCORE,
        "flights": ENABLE_FLIGHTS,
        "activity": ENABLE_ACTIVITY,
        "hit_calling": ENABLE_HIT_CALLING,
    }
