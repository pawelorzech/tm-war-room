from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException, Request
from api.torn_client import _json
from api.utils.etag import etag_response

logger = logging.getLogger("tm-hub.market")

router = APIRouter(prefix="/api/market", tags=["market"])
torn_client = None  # Set by main.py

_items_cache: list[dict] | None = None
_items_cache_ts: float = 0
CACHE_TTL = 300  # 5 min


def _iso_to_flag(iso: str) -> str:
    """Convert ISO country code (e.g. 'MX') to emoji flag (🇲🇽)."""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in iso.upper())


async def _build_abroad_map(client) -> dict[int, dict]:
    """Build {item_id: {"country_slug": ..., "country_name": ..., "country_flag": "🇲🇽"}}
    from YATA travel stocks. Returns empty dict on failure — items are simply not flagged abroad."""
    from api.routers.travel import YATA_COUNTRY_MAP, COUNTRIES
    by_slug = {c["id"]: c for c in COUNTRIES}
    try:
        yata_raw = await client.fetch_yata_travel_stocks()
    except Exception as e:
        logger.warning("Abroad map: YATA fetch failed (%s) — items will not be flagged abroad", e)
        return {}
    yata_stocks = yata_raw.get("stocks", yata_raw) if yata_raw and isinstance(yata_raw, dict) else {}
    out: dict[int, dict] = {}
    for yk, country_slug in YATA_COUNTRY_MAP.items():
        if yk not in yata_stocks:
            continue
        cdata = yata_stocks[yk]
        c = by_slug.get(country_slug)
        if not c:
            continue
        flag = _iso_to_flag(c["flag"])
        for yi in cdata.get("stocks", cdata.get("items", [])):
            iid = yi.get("id", 0)
            if iid and iid not in out:
                out[iid] = {"country_slug": country_slug, "country_name": c["name"], "country_flag": flag}
    return out


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
        # NB: v2 torn/items returns a LIST with nested value.{buy_price,sell_price,market_price}
        # vs v1 DICT with flat market_value — our consumers below read raw.items.items() and
        # item.market_value, so stay on v1 until we refactor item consumers.
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

    abroad_map = await _build_abroad_map(client)

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

        abroad = abroad_map.get(iid)
        is_shop = bool(buy_price > 0) and abroad is None

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
            "is_shop": is_shop,
            "country_slug": abroad["country_slug"] if abroad else None,
            "country_name": abroad["country_name"] if abroad else None,
            "country_flag": abroad["country_flag"] if abroad else None,
        })

    # Sort by market value descending
    items.sort(key=lambda i: i["market_value"], reverse=True)

    _items_cache = items
    _items_cache_ts = now
    logger.info("Loaded %d items for market scanner (%d flagged abroad)", len(items), len(abroad_map))
    return _items_cache


@router.get("/prices")
async def get_all_items(request: Request):
    """Get ALL items with market values, buy/sell prices for profit calculations."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Market not initialized")
    items = await ensure_items_cache()
    if not items:
        raise HTTPException(status_code=502, detail="Failed to fetch item data")
    return etag_response(
        {"items": items, "count": len(items)},
        request,
        cache_control="private, max-age=60, stale-while-revalidate=300",
    )


@router.get("/items/{item_id}/stats")
async def get_item_stats(item_id: int):
    """Historical circulation + market value for a single item (v2 torn/itemstats).
    Use this to spot inflation/deflation trends or rare item availability shifts."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Market not initialized")
    stats = await torn_client.fetch_item_stats(item_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Item stats unavailable")
    return {"item_id": item_id, "stats": stats}
