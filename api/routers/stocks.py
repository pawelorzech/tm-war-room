from __future__ import annotations
import logging
import time
from fastapi import APIRouter, HTTPException, Header, Query

logger = logging.getLogger("tm-hub.stocks")

router = APIRouter(prefix="/api/stocks", tags=["stocks"])
torn_client = None  # Set by main.py
key_store = None  # Set by main.py
history_repo = None  # Set by main.py

# Cache for item market values (used to price stock benefit items)
_item_prices_cache: dict[int, float] = {}
_item_prices_ts: float = 0
ITEM_CACHE_TTL = 600  # 10 min


async def _get_item_prices() -> dict[int, float]:
    """Fetch item market values from Torn API, cached 10min."""
    global _item_prices_cache, _item_prices_ts
    now = time.time()
    if _item_prices_cache and now - _item_prices_ts < ITEM_CACHE_TTL:
        return _item_prices_cache
    if not torn_client:
        return _item_prices_cache
    try:
        from api.torn_client import _json
        resp = await torn_client._http.get(
            "https://api.torn.com/torn/",
            params={"selections": "items", "key": torn_client._api_key},
        )
        resp.raise_for_status()
        raw = await _json(resp)
        items = raw.get("items", {})
        prices = {}
        for iid_str, item in items.items():
            mv = item.get("market_value", 0) or 0
            if mv > 0:
                prices[int(iid_str)] = mv
        _item_prices_cache = prices
        _item_prices_ts = now
        logger.info("Refreshed item prices for stock ROI: %d items", len(prices))
    except Exception as e:
        logger.warning("Failed to fetch item prices for stocks: %s", e)
    return _item_prices_cache


@router.get("/market")
async def stock_market():
    """Get all stock listings with current prices."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")
    raw = await torn_client.fetch_stock_market()
    stocks = []
    for sid, s in raw.items():
        benefit = s.get("benefit") or {}
        stocks.append({
            "id": int(sid),
            "name": s.get("name", ""),
            "acronym": s.get("acronym", ""),
            "current_price": s.get("current_price", 0),
            "market_cap": s.get("market_cap", 0),
            "total_shares": s.get("total_shares", 0),
            "investors": s.get("investors", 0),
            "benefit_type": benefit.get("type", ""),
            "benefit_desc": benefit.get("description", ""),
            "benefit_requirement": benefit.get("requirement", 0),
        })
    stocks.sort(key=lambda s: s["id"])
    return {"stocks": stocks, "count": len(stocks)}


@router.get("/portfolio")
async def stock_portfolio(x_player_id: int = Header()):
    """Get player's stock portfolio with P/L calculations."""
    if not torn_client or not key_store:
        raise HTTPException(status_code=503, detail="Not initialized")
    user_key = key_store.get_key(x_player_id)
    if not user_key:
        raise HTTPException(status_code=401, detail="Register your API key first")

    market = await torn_client.fetch_stock_market()
    try:
        portfolio = await torn_client.fetch_user_stocks(user_key["api_key"])
    except Exception as e:
        err_str = str(e).lower()
        if "access" in err_str or "permission" in err_str or "incorrect" in err_str:
            raise HTTPException(
                status_code=403,
                detail="Your API key doesn't have stock access. Use a Full Access key from Torn Settings → API Keys."
            )
        raise HTTPException(status_code=502, detail=f"Torn API error: {e}")

    if not portfolio:
        raise HTTPException(
            status_code=403,
            detail="No stock data returned. Your API key may be limited. Use a Full Access key."
        )

    holdings = []
    total_value = 0
    total_cost = 0

    for sid, holding in portfolio.items():
        stock_id = int(sid)
        market_info = market.get(str(stock_id), {})
        current_price = market_info.get("current_price", 0)
        total_shares = holding.get("total_shares", 0)

        # Calculate cost basis from transactions
        transactions = holding.get("transactions", {})
        cost_basis = 0
        buys = []
        for tid, tx in transactions.items():
            shares = tx.get("shares", 0)
            bought_price = tx.get("bought_price", 0)
            cost_basis += shares * bought_price
            buys.append({
                "shares": shares,
                "bought_price": bought_price,
                "time_bought": tx.get("time_bought", 0),
            })

        current_value = total_shares * current_price
        profit = current_value - cost_basis
        profit_pct = ((current_value / cost_basis) - 1) * 100 if cost_basis > 0 else 0

        # Benefit/dividend progress
        benefit = holding.get("benefit", {})
        dividend = holding.get("dividend", {})

        total_value += current_value
        total_cost += cost_basis

        holdings.append({
            "stock_id": stock_id,
            "name": market_info.get("name", f"Stock #{stock_id}"),
            "acronym": market_info.get("acronym", ""),
            "total_shares": total_shares,
            "current_price": current_price,
            "current_value": round(current_value, 2),
            "cost_basis": round(cost_basis, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "benefit_ready": bool(benefit.get("ready")),
            "benefit_progress": benefit.get("progress", 0),
            "benefit_frequency": benefit.get("frequency", 0),
            "dividend_ready": bool(dividend.get("ready")),
            "dividend_progress": dividend.get("progress", 0),
            "dividend_frequency": dividend.get("frequency", 0),
            "transactions": buys,
        })

    holdings.sort(key=lambda h: h["current_value"], reverse=True)
    total_profit = total_value - total_cost

    return {
        "holdings": holdings,
        "count": len(holdings),
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_profit": round(total_profit, 2),
        "total_profit_pct": round(((total_value / total_cost) - 1) * 100, 2) if total_cost > 0 else 0,
    }


# Stock benefit definitions — Active stocks with measurable $ payouts
# "item_id" links to Torn item for live market pricing; "payout" is fallback only
# "max_inc" caps increments (MCS energy capped at 10 in game)
# Excluded: Passive perks (education, racing, coding, company boost, etc)
STOCK_PAYOUTS: dict[int, dict] = {
    # Cash payouts (direct $) — no item_id needed, payout is exact
    1:  {"shares": 3_000_000, "payout": 50_000_000, "freq": 31, "desc": "$50M cash"},         # TSB
    5:  {"shares": 3_000_000, "payout": 12_000_000, "freq": 31, "desc": "$12M cash"},         # IOU
    6:  {"shares": 500_000, "payout": 4_000_000, "freq": 31, "desc": "$4M cash"},             # GRN
    9:  {"shares": 100_000, "payout": 1_000_000, "freq": 31, "desc": "$1M cash"},             # TCT
    10: {"shares": 7_500_000, "payout": 80_000_000, "freq": 31, "desc": "$80M cash"},         # CNC
    12: {"shares": 6_000_000, "payout": 25_000_000, "freq": 31, "desc": "$25M cash"},         # TMI
    # Item payouts — item_id enables live market pricing
    4:  {"shares": 750_000, "payout": 1_500_000, "freq": 7, "desc": "Lawyer Business Card", "item_id": 261},     # LAG
    7:  {"shares": 150_000, "payout": 272_871, "freq": 7, "desc": "Box of Medical Supplies", "item_id": 364},    # THS
    15: {"shares": 2_000_000, "payout": 12_446_756, "freq": 7, "desc": "Feathery Hotel Coupon", "item_id": 366}, # FHG
    16: {"shares": 500_000, "payout": 4_324_640, "freq": 7, "desc": "Drug Pack", "item_id": 370},               # SYM
    17: {"shares": 500_000, "payout": 894_234, "freq": 7, "desc": "Lottery Voucher", "item_id": 365},           # LSC
    18: {"shares": 1_000_000, "payout": 4_015_007, "freq": 7, "desc": "Erotic DVD", "item_id": 367},            # PRN
    19: {"shares": 1_000_000, "payout": 1_092_430, "freq": 7, "desc": "Box of Grenades", "item_id": 368},       # EWM
    22: {"shares": 10_000_000, "payout": 45_456_058, "freq": 31, "desc": "Random Property", "item_id": 369},    # HRG
    24: {"shares": 5_000_000, "payout": 12_990_513, "freq": 7, "desc": "Six-Pack Energy Drink", "item_id": 371},# MUN
    27: {"shares": 3_000_000, "payout": 3_000_000, "freq": 7, "desc": "Ammunition Pack", "item_id": 372},       # BAG
    29: {"shares": 350_000, "payout": 807_440, "freq": 7, "desc": "100 energy", "max_inc": 10},                 # MCS
    31: {"shares": 7_500_000, "payout": 12_446_756, "freq": 7, "desc": "Clothing Cache", "item_id": 373},       # TCC  # NOTE: was wrong value
    32: {"shares": 1_000_000, "payout": 878_841, "freq": 7, "desc": "Six-Pack Alcohol", "item_id": 374},        # ASS
    33: {"shares": 350_000, "payout": 272_871, "freq": 7, "desc": "50 nerve"},                                  # CBD — no tradeable item
    35: {"shares": 10_000_000, "payout": 3_365_600, "freq": 7, "desc": "100 points"},                           # PTS — points, not an item
}

MAX_INCREMENTS = 5  # Generate up to 5 benefit blocks per stock


@router.get("/roi")
async def stock_roi(x_player_id: int | None = Header(default=None)):
    """Compute ROI for each stock benefit block — days to payback, annual ROI %.

    Generates up to MAX_INCREMENTS benefit blocks per stock (each doubles in share cost).
    Uses live item market prices for item-based benefits when available.
    """
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    market = await torn_client.fetch_stock_market()
    item_prices = await _get_item_prices()

    # Get player holdings if available
    holdings = {}
    if x_player_id and key_store:
        user_key = key_store.get_key(x_player_id)
        if user_key:
            try:
                portfolio = await torn_client.fetch_user_stocks(user_key["api_key"])
                for sid, h in portfolio.items():
                    holdings[int(sid)] = h.get("total_shares", 0)
            except Exception:
                pass

    recommendations = []
    for stock_id, info in STOCK_PAYOUTS.items():
        market_info = market.get(str(stock_id), {})
        if not market_info:
            continue
        current_price = market_info.get("current_price", 0)
        if current_price <= 0:
            continue

        acronym = market_info.get("acronym", "")
        name = market_info.get("name", "")
        benefit = market_info.get("benefit", {})
        benefit_desc = benefit.get("description", "")
        owned_shares = holdings.get(stock_id, 0)
        base_shares = info["shares"]
        freq = info["freq"]
        max_inc = info.get("max_inc", MAX_INCREMENTS)

        # Use live item price if available, otherwise fallback to hardcoded
        item_id = info.get("item_id")
        payout_value = item_prices.get(item_id, info["payout"]) if item_id else info["payout"]
        price_is_live = bool(item_id and item_id in item_prices)

        for inc_idx in range(min(max_inc, MAX_INCREMENTS)):
            shares_this_block = base_shares * (2 ** inc_idx)
            total_shares_for_inc = sum(base_shares * (2 ** i) for i in range(inc_idx + 1))
            cost = shares_this_block * current_price

            # Payout scales with increment number (each block = +1x payout)
            inc_payout = payout_value * (inc_idx + 1)
            daily_value = inc_payout / freq
            # Cost to get from 0 to this increment level
            total_cost = total_shares_for_inc * current_price
            days_to_breakeven = total_cost / daily_value if daily_value > 0 else 99999
            roi_annual = (365 / days_to_breakeven * 100) if days_to_breakeven > 0 else 0

            shares_still_needed = max(0, total_shares_for_inc - owned_shares)
            cost_remaining = shares_still_needed * current_price
            # Marginal payback: cost of THIS block / marginal daily gain
            marginal_daily = payout_value / freq
            marginal_payback = cost / marginal_daily if marginal_daily > 0 else 99999
            marginal_roi = (365 / marginal_payback * 100) if marginal_payback > 0 else 0

            recommendations.append({
                "stock_id": stock_id,
                "acronym": acronym,
                "name": name,
                "benefit_desc": info.get("desc", benefit_desc),
                "increment": inc_idx + 1,
                "shares_required": total_shares_for_inc,
                "shares_this_block": shares_this_block,
                "cost_total": round(total_cost, 0),
                "cost_this_block": round(cost, 0),
                "payout_value": round(payout_value, 0),
                "payout_freq_days": freq,
                "daily_value": round(daily_value, 0),
                "days_to_breakeven": round(days_to_breakeven, 0),
                "roi_annual_pct": round(roi_annual, 2),
                "marginal_payback_days": round(marginal_payback, 0),
                "marginal_roi_pct": round(marginal_roi, 2),
                "owned_shares": owned_shares,
                "shares_needed": shares_still_needed,
                "cost_remaining": round(cost_remaining, 0),
                "is_active": owned_shares >= total_shares_for_inc,
                "price_is_live": price_is_live,
            })

    # Sort: active at bottom, then by marginal ROI (first uncompleted block matters most)
    recommendations.sort(key=lambda r: (r["is_active"], -r["marginal_roi_pct"]))

    return {"recommendations": recommendations, "count": len(recommendations)}


@router.get("/history/{stock_id}")
async def stock_price_history(stock_id: int, days: int = Query(default=30, ge=1, le=365)):
    """Get historical price data for a stock."""
    if not history_repo:
        raise HTTPException(status_code=503, detail="History not available")
    data = history_repo.get_stock_history(stock_id, days)
    return {"stock_id": stock_id, "prices": data, "count": len(data)}
