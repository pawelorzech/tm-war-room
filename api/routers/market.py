from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
import httpx
import time
import logging

logger = logging.getLogger("tm-hub.market")

router = APIRouter(prefix="/api/market", tags=["market"])
torn_client = None  # Set by main.py

# Key items for training/war
TRACKED_ITEMS = {
    206: "Xanax",
    367: "Stat Enhancer",
    366: "Feathery Hotel Coupon",
    196: "Energy Drink",
    197: "Small Energy Drink",
    198: "Can of Damp Rid",
    199: "Can of Munster",
    200: "Bottle of Beer",
    264: "Box of Chocolate Bars",
    265: "Bag of Candy Kisses",
    266: "Bag of Tootsie Rolls",
    370: "Drug Pack",
    176: "Ecstasy",
    392: "Erotic DVD",
}

# In-memory cache
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 120  # 2 min


@router.get("/prices")
async def get_market_prices(items: str = Query(default="")):
    """Get current market prices for tracked items or specific item IDs."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Market not initialized")

    if items:
        item_ids = [int(x.strip()) for x in items.split(",") if x.strip().isdigit()]
    else:
        item_ids = list(TRACKED_ITEMS.keys())

    now = time.time()
    results = []

    for item_id in item_ids:
        cache_key = f"market_{item_id}"
        if cache_key in _cache and now - _cache[cache_key][0] < CACHE_TTL:
            results.append(_cache[cache_key][1])
            continue

        try:
            resp = await torn_client._http.get(
                f"https://api.torn.com/v2/market",
                params={"key": torn_client._api_key, "selections": "itemmarket", "id": item_id},
            )
            resp.raise_for_status()
            raw = resp.json()
            listings = raw.get("itemmarket", {}).get("listings", raw.get("itemmarket", []))
            if isinstance(listings, list) and listings:
                cheapest = listings[0]
                avg_price = sum(l["price"] for l in listings[:5]) / min(len(listings), 5)
                total_available = sum(l.get("amount", 1) for l in listings)
            else:
                cheapest = None
                avg_price = 0
                total_available = 0

            # Get item market value
            item_resp = await torn_client._http.get(
                f"https://api.torn.com/v2/torn",
                params={"key": torn_client._api_key, "selections": "items", "id": item_id},
            )
            item_raw = item_resp.json()
            item_data = item_raw.get("items", {})
            if isinstance(item_data, list) and item_data:
                item_info = item_data[0]
            elif isinstance(item_data, dict):
                item_info = item_data
            else:
                item_info = {}

            market_value = item_info.get("value", {}).get("market_price", 0) if isinstance(item_info.get("value"), dict) else 0
            item_name = item_info.get("name", TRACKED_ITEMS.get(item_id, f"Item #{item_id}"))

            entry = {
                "item_id": item_id,
                "name": item_name,
                "market_value": market_value,
                "cheapest_price": cheapest["price"] if cheapest else None,
                "cheapest_amount": cheapest.get("amount", 0) if cheapest else 0,
                "avg_top5_price": round(avg_price),
                "total_available": total_available,
                "listings_count": len(listings) if isinstance(listings, list) else 0,
                "discount_pct": round((1 - cheapest["price"] / market_value) * 100, 1) if cheapest and market_value > 0 else 0,
            }
            _cache[cache_key] = (now, entry)
            results.append(entry)
        except Exception as e:
            logger.error("Market fetch failed for item %d: %s", item_id, e)
            results.append({
                "item_id": item_id,
                "name": TRACKED_ITEMS.get(item_id, f"Item #{item_id}"),
                "error": str(e),
            })

    results.sort(key=lambda r: abs(r.get("discount_pct", 0)), reverse=True)
    return {"items": results, "count": len(results)}
