from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException
from api.torn_client import _json

logger = logging.getLogger("tm-hub.travel")

router = APIRouter(prefix="/api/travel", tags=["travel"])
torn_client = None  # Set by main.py

# YATA country codes → our IDs
YATA_COUNTRY_MAP = {
    "mex": "mexico", "cay": "cayman", "can": "canada", "haw": "hawaii",
    "uni": "uk", "arg": "argentina", "swi": "switzerland",
    "jap": "japan", "chi": "china", "uae": "uae", "sou": "south_africa",
}

COUNTRIES = [
    {"id": "mexico", "name": "Mexico", "flag": "MX", "travel_min": 26},
    {"id": "cayman", "name": "Cayman Islands", "flag": "KY", "travel_min": 35},
    {"id": "canada", "name": "Canada", "flag": "CA", "travel_min": 41},
    {"id": "hawaii", "name": "Hawaii", "flag": "US", "travel_min": 134},
    {"id": "uk", "name": "United Kingdom", "flag": "GB", "travel_min": 159},
    {"id": "argentina", "name": "Argentina", "flag": "AR", "travel_min": 167},
    {"id": "switzerland", "name": "Switzerland", "flag": "CH", "travel_min": 175},
    {"id": "japan", "name": "Japan", "flag": "JP", "travel_min": 225},
    {"id": "china", "name": "China", "flag": "CN", "travel_min": 242},
    {"id": "uae", "name": "UAE", "flag": "AE", "travel_min": 267},
    {"id": "south_africa", "name": "South Africa", "flag": "ZA", "travel_min": 340},
]

_price_cache: dict | None = None
_price_cache_ts: float = 0
PRICE_CACHE_TTL = 300


@router.get("")
async def travel_info():
    """Get travel planner data with YATA abroad prices + Torn market values."""
    global _price_cache, _price_cache_ts
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    # 1. Fetch Torn item market values (cached 5 min)
    now = time.time()
    if _price_cache and now - _price_cache_ts < PRICE_CACHE_TTL:
        market_prices = _price_cache
    else:
        try:
            # v1 (dict keyed by item id with flat market_value) — see comment in routers/market.py
            resp = await torn_client._http.get(
                "https://api.torn.com/torn/",
                params={"selections": "items", "key": torn_client._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            items_data = raw.get("items", {})
            market_prices = {}
            for iid, item in items_data.items():
                name = item.get("name", "")
                market_prices[int(iid)] = {
                    "id": int(iid),
                    "name": name,
                    "market_value": item.get("market_value", 0),
                }
                # Also index by lowercase name for fallback
                market_prices[name.lower()] = market_prices[int(iid)]
            _price_cache = market_prices
            _price_cache_ts = now
        except Exception as e:
            logger.error("Failed to fetch item data: %s", e)
            market_prices = _price_cache or {}

    # 2. Fetch YATA abroad stocks (cached 15 min in torn_client)
    yata_raw = await torn_client.fetch_yata_travel_stocks()
    # YATA wraps country data under "stocks" key
    yata_stocks = yata_raw.get("stocks", yata_raw) if yata_raw and isinstance(yata_raw, dict) else {}

    # 3. Build response — YATA provides real abroad items + prices
    countries = []
    for c in COUNTRIES:
        items = []
        yata_key = next((yk for yk, cid in YATA_COUNTRY_MAP.items() if cid == c["id"]), None)

        if yata_stocks and yata_key and yata_key in yata_stocks:
            country_data = yata_stocks[yata_key]
            # YATA uses "stocks" not "items" for the item array
            yata_items = country_data.get("stocks", country_data.get("items", []))
            last_update = country_data.get("update", 0)

            seen_ids = set()
            for yi in yata_items:
                item_id = yi.get("id", 0)
                if item_id in seen_ids:
                    continue  # Deduplicate by item_id
                seen_ids.add(item_id)
                item_name = yi.get("name", "")
                abroad_cost = yi.get("cost", 0)
                quantity = yi.get("quantity", 0)

                # Get market value from Torn API
                mp = market_prices.get(item_id) or market_prices.get(item_name.lower(), {})
                market_value = mp.get("market_value", 0)

                items.append({
                    "name": item_name,
                    "item_id": item_id,
                    "abroad_cost": abroad_cost,
                    "market_value": market_value,
                    "quantity": quantity,
                    "source": "yata",
                })

            c_entry = {
                **c,
                "items": items,
                "last_update": last_update,
                "data_source": "yata",
            }
        else:
            # Fallback: no YATA data
            c_entry = {
                **c,
                "items": [],
                "last_update": 0,
                "data_source": "none",
            }

        # Sort by profit descending
        for item in c_entry["items"]:
            item["profit"] = int(item["market_value"] * 0.95 - item["abroad_cost"]) if item["market_value"] > 0 and item["abroad_cost"] > 0 else 0
        c_entry["items"].sort(key=lambda x: x["profit"], reverse=True)
        c_entry["best_profit"] = c_entry["items"][0]["profit"] if c_entry["items"] else 0

        countries.append(c_entry)

    return {"countries": countries, "count": len(countries)}
