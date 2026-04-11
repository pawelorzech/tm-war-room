from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException
from api.torn_client import _json

logger = logging.getLogger("tm-hub.market")

router = APIRouter(prefix="/api/market", tags=["market"])
torn_client = None  # Set by main.py

_items_cache: list[dict] | None = None
_items_cache_ts: float = 0
CACHE_TTL = 300  # 5 min


async def ensure_items_cache(tc=None) -> list[dict]:
    """Populate and return the items cache, usable from other routers."""
    global _items_cache, _items_cache_ts
    client = tc or torn_client
    if not client:
        return _items_cache or []

    now = time.time()
    if _items_cache and now - _items_cache_ts < CACHE_TTL:
        return _items_cache

    try:
        resp = await client._http.get(
            "https://api.torn.com/torn/",
            params={"selections": "items", "key": client._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        items_data = raw.get("items", {})
    except Exception as e:
        logger.error("Failed to fetch items: %s", e)
        return _items_cache or []

    items = []
    for iid_str, item in items_data.items():
        try:
            iid = int(iid_str)
        except ValueError:
            continue

        name = item.get("name", "")
        if not name:
            continue

        market_value = item.get("market_value", 0) or 0
        buy_price = item.get("buy_price", 0) or 0
        sell_price = item.get("sell_price", 0) or 0
        circulation = item.get("circulation", 0) or 0
        item_type = item.get("type", "")

        # Profit calculations
        # If you buy from NPC (buy_price) and sell on market (market_value)
        profit_buy_npc = (market_value - buy_price) if buy_price > 0 and market_value > 0 else 0

        items.append({
            "id": iid,
            "name": name,
            "type": item_type,
            "market_value": market_value,
            "buy_price": buy_price,
            "sell_price": sell_price,
            "circulation": circulation,
            "profit_buy_sell": profit_buy_npc,
            "profit_margin_pct": round((profit_buy_npc / buy_price) * 100, 1) if buy_price > 0 and profit_buy_npc > 0 else 0,
        })

    # Sort by market value descending
    items.sort(key=lambda i: i["market_value"], reverse=True)

    _items_cache = items
    _items_cache_ts = now
    logger.info("Loaded %d items for market scanner", len(items))
    return _items_cache


@router.get("/prices")
async def get_all_items():
    """Get ALL items with market values, buy/sell prices for profit calculations."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Market not initialized")
    items = await ensure_items_cache()
    if not items:
        raise HTTPException(status_code=502, detail="Failed to fetch item data")
    return {"items": items, "count": len(items)}
