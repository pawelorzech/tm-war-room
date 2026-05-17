from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

from api.db.repos.pinned_navs import PinnedNavsRepository
from api.torn_client import TornStatsAuthError

logger = logging.getLogger("tm-hub.preferences")

router = APIRouter(prefix="/api/preferences", tags=["preferences"])
pinned_navs_repo: PinnedNavsRepository | None = None  # Set by main.py
key_store = None  # Set by main.py
torn_client = None  # Set by main.py — for validating TornStats keys before save

# Hard cap to prevent abuse — matches frontend MAX_PINNED.
MAX_PINNED_HREFS = 32
MAX_HREF_LEN = 200


class PinnedNavsBody(BaseModel):
    hrefs: list[str] = Field(default_factory=list)


def _verify_member(player_id: int) -> None:
    if not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    if not key_store.has_key(player_id):
        raise HTTPException(status_code=401, detail="Register your API key first")


@router.get("/pinned-navs")
async def get_pinned_navs(x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not pinned_navs_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    return {"hrefs": pinned_navs_repo.list_for(x_player_id)}


@router.put("/pinned-navs")
async def set_pinned_navs(body: PinnedNavsBody, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not pinned_navs_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    # Sanitize: strip, dedupe preserving order, cap length and count, only allow internal paths.
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in body.hrefs:
        h = (raw or "").strip()
        if not h or len(h) > MAX_HREF_LEN:
            continue
        if not h.startswith("/"):
            continue
        if h in seen:
            continue
        seen.add(h)
        cleaned.append(h)
        if len(cleaned) >= MAX_PINNED_HREFS:
            break
    pinned_navs_repo.set_for(x_player_id, cleaned)
    return {"hrefs": cleaned}


# --- TornStats key (per-user, opt-in) ---------------------------------------
#
# Each member can register their personal TornStats API key in Settings. We
# encrypt it (Fernet, ENCRYPTION_KEY env) and pool keys at lookup time so
# /api/spy/{id} can see whichever faction-spy entries each key has access to.
# See routers/spy._try_tornstats_pool for the lookup order.

class TornStatsKeyBody(BaseModel):
    key: str = Field(min_length=8, max_length=64)


@router.get("/tornstats-key")
async def get_tornstats_key(x_player_id: int = Header()):
    """Status only — never returns the plaintext key (see migration 053 rationale)."""
    _verify_member(x_player_id)
    return key_store.get_tornstats_key_meta(x_player_id)


@router.post("/tornstats-key")
async def set_tornstats_key(body: TornStatsKeyBody, x_player_id: int = Header()):
    """Validate the key against TornStats before storing.

    A single live call to /spy/user/{caller} proves the key is accepted
    (status:true or status:false both mean "authorized — we just have or
    lack data"). Only 401/403 (TornStatsAuthError) is fatal.
    """
    _verify_member(x_player_id)
    if torn_client is None:
        raise HTTPException(status_code=503, detail="Torn client not initialized")
    ts_key = body.key.strip()
    try:
        # Probe with the caller's own XID — guaranteed to exist on TornStats.
        await torn_client.fetch_tornstats_spy_user(x_player_id, ts_key)
    except TornStatsAuthError:
        raise HTTPException(status_code=400, detail="TornStats rejected this key (HTTP 401/403). Check it on tornstats.com → Profile → API.")
    except Exception as e:
        logger.warning("tornstats key validation failed: %s", e)
        raise HTTPException(status_code=502, detail="TornStats unreachable — try again in a moment.")
    key_store.set_tornstats_key(x_player_id, ts_key)
    return key_store.get_tornstats_key_meta(x_player_id)


@router.delete("/tornstats-key")
async def delete_tornstats_key(x_player_id: int = Header()):
    _verify_member(x_player_id)
    key_store.clear_tornstats_key(x_player_id)
    return {"has_key": False, "status": None, "validated_at": None}
