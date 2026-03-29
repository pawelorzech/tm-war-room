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


@router.get("/history/{stock_id}")
async def stock_price_history(stock_id: int, days: int = Query(default=30, ge=1, le=365)):
    """Get historical price data for a stock."""
    if not history_repo:
        raise HTTPException(status_code=503, detail="History not available")
    data = history_repo.get_stock_history(stock_id, days)
    return {"stock_id": stock_id, "prices": data, "count": len(data)}
