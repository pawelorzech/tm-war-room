from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException
from api.torn_client import _json

logger = logging.getLogger("tm-hub.travel")

router = APIRouter(prefix="/api/travel", tags=["travel"])
torn_client = None  # Set by main.py

# Static data: countries with travel times and notable items
COUNTRIES = [
    {"id": "mexico", "name": "Mexico", "flag": "MX", "travel_min": 26,
     "items": ["Dahlia", "Crocus", "Orchid", "Heather", "Celosia", "Peony",
               "Edelweiss", "Cherry Blossom", "African Violet", "Tribulus Omanense", "Banana Orchid"]},
    {"id": "cayman", "name": "Cayman Islands", "flag": "KY", "travel_min": 35,
     "items": ["Sheep Plushie", "Teddy Bear Plushie", "Kitten Plushie",
               "Jaguar Plushie", "Chamois Plushie", "Wolverine Plushie",
               "Nessie Plushie", "Red Fox Plushie", "Monkey Plushie",
               "Panda Plushie", "Lion Plushie", "Stingray Plushie", "Camel Plushie"]},
    {"id": "canada", "name": "Canada", "flag": "CA", "travel_min": 41,
     "items": ["Coat", "Gloves", "Jacket", "Scarf", "Ski Mask"]},
    {"id": "hawaii", "name": "Hawaii", "flag": "US", "travel_min": 134,
     "items": ["Coconut", "Hawaiian Shirt", "Surfboard", "Lei"]},
    {"id": "uk", "name": "United Kingdom", "flag": "GB", "travel_min": 159,
     "items": ["Briefcase", "Bowler Hat", "Umbrella", "Walking Cane", "Tea"]},
    {"id": "argentina", "name": "Argentina", "flag": "AR", "travel_min": 167,
     "items": ["Poncho", "Yerba Mate", "Gaucho Knife", "Tango Shoes"]},
    {"id": "switzerland", "name": "Switzerland", "flag": "CH", "travel_min": 175,
     "items": ["Swiss Army Knife", "Chocolate", "Cuckoo Clock", "Swiss Watch"]},
    {"id": "japan", "name": "Japan", "flag": "JP", "travel_min": 225,
     "items": ["Katana", "Sake", "Sushi", "Bonsai Tree", "Kimono"]},
    {"id": "china", "name": "China", "flag": "CN", "travel_min": 242,
     "items": ["Chopsticks", "Fireworks", "Dragon Figurine", "Jade Bracelet", "Silk Robe"]},
    {"id": "uae", "name": "UAE", "flag": "AE", "travel_min": 267,
     "items": ["Gold Ring", "Diamond", "Pearl Necklace", "Gold Necklace"]},
    {"id": "south_africa", "name": "South Africa", "flag": "ZA", "travel_min": 340,
     "items": ["Krugerrand", "Safari Trophy", "Tribal Mask", "Ostrich Feather"]},
]

_price_cache: dict | None = None
_price_cache_ts: float = 0
PRICE_CACHE_TTL = 300


@router.get("")
async def travel_info():
    """Get travel planner data: countries, items, and current market prices."""
    global _price_cache, _price_cache_ts
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    # Fetch item prices (cached 5 min)
    now = time.time()
    if _price_cache and now - _price_cache_ts < PRICE_CACHE_TTL:
        prices = _price_cache
    else:
        try:
            # Fetch all items to get market values
            resp = await torn_client._http.get(
                "https://api.torn.com/torn/",
                params={"selections": "items", "key": torn_client._api_key},
            )
            resp.raise_for_status()
            raw = await _json(resp)
            items_data = raw.get("items", {})
            prices = {}
            for iid, item in items_data.items():
                name = item.get("name", "")
                mv = item.get("market_value", 0)
                buy_price = item.get("buy_price", 0)
                sell_price = item.get("sell_price", 0)
                prices[name.lower()] = {
                    "id": int(iid),
                    "name": name,
                    "market_value": mv,
                    "buy_price": buy_price,
                    "sell_price": sell_price,
                }
            _price_cache = prices
            _price_cache_ts = now
        except Exception as e:
            logger.error("Failed to fetch item data: %s", e)
            prices = _price_cache or {}

    # Build response with prices attached to country items
    countries = []
    for c in COUNTRIES:
        items = []
        for item_name in c["items"]:
            price_info = prices.get(item_name.lower(), {})
            items.append({
                "name": item_name,
                "market_value": price_info.get("market_value", 0),
                "buy_price": price_info.get("buy_price", 0),
                "sell_price": price_info.get("sell_price", 0),
                "item_id": price_info.get("id", 0),
            })
        # Sort by market value descending
        items.sort(key=lambda x: x["market_value"], reverse=True)
        best_value = max((i["market_value"] for i in items), default=0)
        countries.append({
            **c,
            "items": items,
            "best_value": best_value,
        })

    return {"countries": countries, "count": len(countries)}
