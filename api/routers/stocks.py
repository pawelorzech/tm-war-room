from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, Header, Query

logger = logging.getLogger("tm-hub.stocks")

router = APIRouter(prefix="/api/stocks", tags=["stocks"])
torn_client = None  # Set by main.py
key_store = None  # Set by main.py
history_repo = None  # Set by main.py


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
    all_keys = key_store.get_all_keys()
    user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    if not user_key:
        raise HTTPException(status_code=401, detail="Register your API key first")

    market = await torn_client.fetch_stock_market()
    portfolio = await torn_client.fetch_user_stocks(user_key["api_key"])

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


# Stock benefit payout values — ONLY Active stocks with measurable $ payouts
# IDs verified against Torn API /stocks/market (March 2026)
# Payout values from user's spreadsheet
# Excluded: Passive perks (education, racing, coding, company boost, etc)
STOCK_PAYOUTS: dict[int, list[dict]] = {
    # Cash payouts (direct $)
    1:  [{"shares": 3_000_000, "payout": 50_000_000, "freq": 31, "desc": "$50M cash"}],       # TSB
    5:  [{"shares": 3_000_000, "payout": 12_000_000, "freq": 31, "desc": "$12M cash"}],       # IOU
    6:  [{"shares": 500_000, "payout": 4_000_000, "freq": 31, "desc": "$4M cash"}],           # GRN
    9:  [{"shares": 100_000, "payout": 1_000_000, "freq": 31, "desc": "$1M cash"}],           # TCT
    10: [{"shares": 7_500_000, "payout": 80_000_000, "freq": 31, "desc": "$80M cash"}],       # CNC
    12: [{"shares": 6_000_000, "payout": 25_000_000, "freq": 31, "desc": "$25M cash"}],       # TMI
    # Item payouts (market value estimated)
    4:  [{"shares": 750_000, "payout": 1_500_000, "freq": 7, "desc": "Lawyer's Business Card"}], # LAG
    7:  [{"shares": 150_000, "payout": 272_871, "freq": 7, "desc": "Box of Medical Supplies"}],  # THS
    15: [{"shares": 2_000_000, "payout": 12_446_756, "freq": 7, "desc": "Feathery Hotel Coupon"}], # FHG
    16: [{"shares": 500_000, "payout": 4_324_640, "freq": 7, "desc": "Drug Pack"}],           # SYM
    17: [{"shares": 500_000, "payout": 894_234, "freq": 7, "desc": "Lottery Voucher"}],       # LSC
    18: [{"shares": 1_000_000, "payout": 4_015_007, "freq": 7, "desc": "Erotic DVD"}],        # PRN
    19: [{"shares": 1_000_000, "payout": 1_092_430, "freq": 7, "desc": "Box of Grenades"}],   # EWM
    22: [{"shares": 10_000_000, "payout": 45_456_058, "freq": 31, "desc": "Random Property"}], # HRG
    24: [{"shares": 5_000_000, "payout": 12_990_513, "freq": 7, "desc": "Six-Pack Energy Drink"}], # MUN
    27: [{"shares": 3_000_000, "payout": 3_000_000, "freq": 7, "desc": "Ammunition Pack"}],   # BAG
    # EVL (1000 happiness) excluded — value is subjective, not directly monetizable
    29: [{"shares": 350_000, "payout": 807_440, "freq": 7, "desc": "100 energy"}],            # MCS
    31: [{"shares": 7_500_000, "payout": 12_446_756, "freq": 7, "desc": "Clothing Cache"}],   # TCC
    32: [{"shares": 1_000_000, "payout": 878_841, "freq": 7, "desc": "Six-Pack Alcohol"}],    # ASS
    33: [{"shares": 350_000, "payout": 272_871, "freq": 7, "desc": "50 nerve"}],              # CBD
    35: [{"shares": 10_000_000, "payout": 3_365_600, "freq": 7, "desc": "100 points"}],       # PTS
}


@router.get("/roi")
async def stock_roi(x_player_id: int | None = Header(default=None)):
    """Compute ROI for each stock benefit block — days to payback, annual ROI %."""
    if not torn_client:
        raise HTTPException(status_code=503, detail="Not initialized")

    market = await torn_client.fetch_stock_market()

    # Get player holdings if available
    holdings = {}
    if x_player_id and key_store:
        all_keys = key_store.get_all_keys()
        user_key = next((k for k in all_keys if k["player_id"] == x_player_id), None)
        if user_key:
            try:
                portfolio = await torn_client.fetch_user_stocks(user_key["api_key"])
                for sid, h in portfolio.items():
                    holdings[int(sid)] = h.get("total_shares", 0)
            except Exception:
                pass

    recommendations = []
    for stock_id, increments in STOCK_PAYOUTS.items():
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

        for inc_idx, inc in enumerate(increments):
            shares_needed = inc["shares"] * (2 ** inc_idx)  # Each increment doubles
            total_shares_for_inc = sum(inc["shares"] * (2 ** i) for i in range(inc_idx + 1))
            cost = shares_needed * current_price
            payout_value = inc["payout"]
            freq = inc["freq"]

            daily_value = payout_value / freq
            days_to_breakeven = cost / daily_value if daily_value > 0 else 99999
            roi_annual = (365 / days_to_breakeven * 100) if days_to_breakeven > 0 else 0

            # How many shares still needed
            shares_still_needed = max(0, total_shares_for_inc - owned_shares)
            cost_remaining = shares_still_needed * current_price
            days_remaining = cost_remaining / daily_value if daily_value > 0 else 99999

            recommendations.append({
                "stock_id": stock_id,
                "acronym": acronym,
                "name": name,
                "benefit_desc": inc.get("desc", benefit_desc),
                "increment": inc_idx + 1,
                "shares_required": total_shares_for_inc,
                "cost_total": round(cost, 0),
                "payout_value": payout_value,
                "payout_freq_days": freq,
                "daily_value": round(daily_value, 0),
                "days_to_breakeven": round(days_to_breakeven, 0),
                "roi_annual_pct": round(roi_annual, 2),
                "owned_shares": owned_shares,
                "shares_needed": shares_still_needed,
                "cost_remaining": round(cost_remaining, 0),
                "days_remaining": round(days_remaining, 0),
                "is_active": owned_shares >= total_shares_for_inc,
            })

    # Sort by ROI (highest first), active at bottom
    recommendations.sort(key=lambda r: (r["is_active"], -r["roi_annual_pct"]))

    return {"recommendations": recommendations, "count": len(recommendations)}


@router.get("/history/{stock_id}")
async def stock_price_history(stock_id: int, days: int = Query(default=30, ge=1, le=365)):
    """Get historical price data for a stock."""
    if not history_repo:
        raise HTTPException(status_code=503, detail="History not available")
    data = history_repo.get_stock_history(stock_id, days)
    return {"stock_id": stock_id, "prices": data, "count": len(data)}
