from __future__ import annotations

import inspect
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import TORN_API_KEY, FACTION_ID, CACHE_TTL, ENCRYPTION_KEY
from app.torn_client import TornClient
from app.db import KeyStore

torn_client: TornClient | None = None
key_store: KeyStore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global torn_client, key_store
    os.makedirs("data", exist_ok=True)
    torn_client = TornClient(api_key=TORN_API_KEY, cache_ttl=CACHE_TTL)
    key_store = KeyStore(db_path="data/keys.db", encryption_key=ENCRYPTION_KEY)
    yield
    await torn_client.close()


app = FastAPI(title="TM War Room", lifespan=lifespan)


@app.get("/api/overview")
async def overview():
    members = await torn_client.fetch_members()
    war = await torn_client.fetch_war()
    return {
        "members": [m.model_dump() for m in members],
        "war": war.model_dump() if war else None,
        "cached_at": int(time.time()),
    }


@app.get("/api/members/detail")
async def members_detail():
    keys = key_store.get_all_keys()
    results = []
    for entry in keys:
        try:
            bars = await torn_client.fetch_member_bars(entry["api_key"])
            results.append({
                "player_id": entry["player_id"],
                "name": entry["player_name"],
                "bars": bars.model_dump(),
                "error": None,
            })
        except Exception as e:
            results.append({
                "player_id": entry["player_id"],
                "name": entry["player_name"],
                "bars": None,
                "error": str(e),
            })
    return {"members": results, "cached_at": int(time.time())}


class KeyRegister(BaseModel):
    api_key: str


@app.post("/api/keys")
async def register_key(body: KeyRegister):
    resp = await torn_client._http.get(
        "https://api.torn.com/user/",
        params={"selections": "basic", "key": body.api_key},
    )
    resp.raise_for_status()
    raw = resp.json()
    if inspect.isawaitable(raw):
        raw = await raw
    if "error" in raw:
        raise HTTPException(status_code=400, detail=raw["error"]["error"])
    player_id = raw["player_id"]
    player_name = raw["name"]

    key_store.save_key(player_id=player_id, player_name=player_name, api_key=body.api_key)
    return {"status": "ok", "player_id": player_id, "name": player_name}


@app.delete("/api/keys/{player_id}")
async def delete_key(player_id: int):
    key_store.delete_key(player_id=player_id)
    return {"status": "ok"}


# Static files — mount AFTER API routes
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(static_dir, "index.html"))
