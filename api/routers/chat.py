from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Header, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from api.auth import decode_jwt, rate_limiter
from api.chat_commands import (
    default_registry as chat_command_registry,
    parse_command_invocation,
)
from api.chat_entities import find_entities_as_dicts
from api import chat_resolver
from api.chat_manager import ChatManager
from api.chat_search import parse_query, build_search_sql, MAX_LIMIT as SEARCH_MAX_LIMIT
from api import chat_war_card
from api import chat_oc_digest
# Import for side-effect: registers the /chain handler into default_registry.
from api import chat_chain  # noqa: F401
from api.config import SUPERADMIN_ID, SUPERADMIN_IDS, JWT_SECRET

logger = logging.getLogger("tm-hub.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Set by main.py during startup
chat_repo: ChatRepository | None = None
chat_manager: ChatManager | None = None
key_store = None
push_service = None
settings_repo = None
notification_dispatcher = None  # Set by main.py
torn_client = None  # Set by main.py
presence_repo = None  # Set by main.py
chain_assist_repo = None  # Set by main.py (Task #10)


def _msg_rate_ok(player_id: int) -> bool:
    """Allow max 10 messages per 5-second window (shared across HTTP + WS)."""
    return rate_limiter.check(f"chat_msg:{player_id}", max_requests=10, window_seconds=5)


def _not_ready():
    if not chat_repo or not chat_manager:
        raise HTTPException(status_code=503, detail="Chat not initialized")


def _verify_member(player_id: int):
    _not_ready()
    if not key_store or not key_store.has_key(player_id):
        raise HTTPException(status_code=403, detail="Not a faction member")
    _check_chat_access(player_id)


def _is_admin(player_id: int) -> bool:
    if player_id in SUPERADMIN_IDS:
        return True
    return key_store.is_admin(player_id) if key_store else False


def _check_chat_access(player_id: int):
    """Block non-admins when chat is in beta (admin-only) mode."""
    if _is_admin(player_id):
        return
    if settings_repo:
        enabled = settings_repo.get("chat_enabled_for_all")
        if enabled != "true":
            raise HTTPException(status_code=403, detail="Chat is currently in beta — admin only")


def _auth_bot(authorization: str) -> dict:
    """Authenticate a bot by bearer token. Returns bot dict."""
    _not_ready()
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[7:]
    bot = chat_repo.get_bot_by_token(token)
    if not bot:
        raise HTTPException(status_code=401, detail="Invalid bot token")
    return bot


# ── Channels ──────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str
    description: str = ""
    type: str = "chat"
    position: int = 0
    admin_only: bool = False


class ChannelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    type: str | None = None
    position: int | None = None
    admin_only: bool | None = None


@router.get("/channels")
async def list_channels(x_player_id: int = Header()):
    _verify_member(x_player_id)
    channels = chat_repo.get_channels()
    if not _is_admin(x_player_id):
        channels = [ch for ch in channels if not ch["admin_only"]]
    unread = chat_repo.get_unread_counts(x_player_id)
    for ch in channels:
        ch["unread"] = unread.get(ch["id"], 0)
    return {"channels": channels}


@router.post("/channels")
async def create_channel(body: ChannelCreate, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    if body.type not in ("chat", "forum"):
        raise HTTPException(status_code=400, detail="Type must be 'chat' or 'forum'")
    try:
        channel_id = chat_repo.create_channel(
            name=body.name, description=body.description,
            ch_type=body.type, position=body.position,
            admin_only=body.admin_only, created_by=x_player_id,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Channel name already exists")
    return {"status": "ok", "channel_id": channel_id}


@router.put("/channels/{channel_id}")
async def update_channel(channel_id: int, body: ChannelUpdate, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        chat_repo.update_channel(channel_id, **updates)
    return {"status": "ok"}


@router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    chat_repo.delete_channel(channel_id)
    return {"status": "ok"}


# ── Messages ──────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str
    mentions: list[int] = []


class MessageEdit(BaseModel):
    content: str


@router.get("/channels/{channel_id}/messages")
async def get_messages(
    channel_id: int,
    before: int | None = None,
    after: int | None = None,
    limit: int = Query(50, ge=1, le=100),
    include: str | None = Query(None, description="Comma-separated extras: 'entities'"),
    x_player_id: int = Header(),
):
    """Fetch messages from a channel.

    - ``?before=<id>``: paginate older messages (newest first by default)
    - ``?after=<id>``: fetch new messages since the last seen id, used by
      the Companion chat dock polling loop
    - ``?include=entities``: attach a detected Torn-entity list to each
      message (foundation for live entity cards). Default off.
    """
    _verify_member(x_player_id)
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if ch["admin_only"] and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin-only channel")
    messages = chat_repo.get_messages(
        channel_id,
        before_id=before,
        after_id=after,
        limit=limit,
    )
    if messages:
        reactions_map = chat_repo.get_reactions_for_messages([m["id"] for m in messages])
        for m in messages:
            m["reactions"] = reactions_map.get(m["id"], [])
    if include and "entities" in {p.strip() for p in include.split(",")}:
        for m in messages:
            m["entities"] = find_entities_as_dicts(m.get("content") or "")
    return {"messages": messages}


@router.post("/channels/{channel_id}/messages")
async def send_message(
    channel_id: int, body: MessageCreate, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    if not _msg_rate_ok(x_player_id):
        raise HTTPException(status_code=429, detail="Too many messages, slow down")
    if chat_repo.is_muted(x_player_id):
        raise HTTPException(status_code=403, detail="You are muted")
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if ch["admin_only"] and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin-only channel")
    if ch.get("write_restricted") and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Only admins can post in this channel")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body.content) > 4000:
        raise HTTPException(status_code=400, detail="Message too long (max 4000 chars)")

    sender = key_store.get_key(x_player_id) if key_store else None
    name = sender["player_name"] if sender else str(x_player_id)

    # Slash-command interception. Anything that parses as a command is
    # routed through the registry BEFORE it hits the DB or pub/sub. The
    # raw "/cmd args" body never appears in the chat history.
    parsed_cmd = parse_command_invocation(body.content)
    if parsed_cmd is not None:
        cmd_name, cmd_args = parsed_cmd
        if chat_command_registry.has(cmd_name):
            result = await chat_command_registry.dispatch(
                cmd_name, x_player_id, cmd_args, channel_id,
            )
            assert result is not None  # `has` just returned True
            if result.broadcast and result.message_back:
                bot_msg = chat_repo.create_message(
                    channel_id=channel_id, player_id=0,
                    player_name="tm-bot", content=result.message_back,
                    mentions=[],
                )
                chat_repo.update_read_position(x_player_id, channel_id, bot_msg["id"])
                await chat_manager.broadcast({"type": "message", "payload": bot_msg})
                return bot_msg
            # Ephemeral: sender-only, no DB, no broadcast.
            return _ephemeral_command_message(
                channel_id=channel_id,
                content=result.message_back or "",
                render=result.render,
            )
        # Looked like a command but isn't registered — ephemeral hint.
        return _ephemeral_command_message(
            channel_id=channel_id,
            content=(
                f"Unknown command: `/{cmd_name}`. "
                f"Type `/help` to see the available commands."
            ),
        )

    msg = chat_repo.create_message(
        channel_id=channel_id, player_id=x_player_id,
        player_name=name, content=body.content.strip(),
        mentions=body.mentions,
    )
    # Auto-mark own message as read so it doesn't count as unread for sender
    chat_repo.update_read_position(x_player_id, channel_id, msg["id"])
    await chat_manager.broadcast({"type": "message", "payload": msg})
    await _notify_mentions(body.mentions, name, body.content, channel_id)
    return msg


@router.put("/messages/{message_id}")
async def edit_message(message_id: int, body: MessageEdit, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    ok = chat_repo.edit_message(message_id, x_player_id, body.content.strip())
    if not ok:
        raise HTTPException(status_code=403, detail="Cannot edit this message")
    await chat_manager.broadcast({"type": "edit", "payload": {"id": message_id, "content": body.content.strip()}})
    return {"status": "ok"}


@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    deleted = chat_repo.delete_message(message_id, x_player_id, _is_admin(x_player_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found or not authorized")
    await chat_manager.broadcast({
        "type": "delete",
        "payload": {"message_id": message_id, "channel_id": deleted["channel_id"]},
    })
    # Auto-delete thread if this was the last visible message
    if deleted.get("thread_id"):
        remaining = chat_repo.execute(
            "SELECT COUNT(*) as cnt FROM chat_messages WHERE thread_id = ? AND deleted = 0",
            (deleted["thread_id"],),
        )
        if remaining and remaining[0]["cnt"] == 0:
            chat_repo.delete_thread(deleted["thread_id"])
    return {"status": "ok"}


@router.post("/messages/{message_id}/pin")
async def toggle_pin(message_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    row = chat_repo.execute_one(
        "SELECT pinned, channel_id FROM chat_messages WHERE id = ? AND deleted = 0",
        (message_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    new_pinned = not bool(row["pinned"])
    chat_repo.pin_message(message_id, new_pinned)
    await chat_manager.broadcast({
        "type": "pin",
        "payload": {"message_id": message_id, "pinned": new_pinned, "channel_id": row["channel_id"]},
    })
    return {"status": "ok", "pinned": new_pinned}


@router.get("/channels/{channel_id}/pinned")
async def get_pinned(channel_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    ch = chat_repo.get_channel(channel_id)
    if ch and ch["admin_only"] and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin-only channel")
    return {"messages": chat_repo.get_pinned_messages(channel_id)}


# ── Slash commands ────────────────────────────────────────────


def _ephemeral_command_message(
    *, channel_id: int, content: str, render: dict | None = None,
) -> dict:
    """Build a Message-shaped dict that the sender's client appends locally.

    The ``ephemeral`` flag tells the client: "this message exists for you
    only, was not persisted, do not expect a WS echo, do not re-fetch on
    reload". Server returns the same dict for both registered-but-quiet
    commands AND the unknown-command hint.
    """
    return {
        "id": 0,
        "channel_id": channel_id,
        "thread_id": None,
        "player_id": 0,
        "player_name": "tm-bot",
        "content": content,
        "bot_id": 0,
        "mentions": [],
        "pinned": 0,
        "deleted": 0,
        "created_at": int(time.time()),
        "edited_at": None,
        "reactions": [],
        "ephemeral": True,
        "render": render,
    }


@router.get("/commands")
async def list_commands(x_player_id: int = Header()):
    """Return the registered slash commands so the frontend can show an
    autocomplete dropdown when a user types ``/``."""
    _verify_member(x_player_id)
    return {"commands": chat_command_registry.list()}


# ── Chain assist (Task #10) ───────────────────────────────────


def _assist_to_dict(a: dict | None) -> dict | None:
    if a is None:
        return None
    return {
        "id": a["id"],
        "channel_id": a["channel_id"],
        "message_id": a.get("message_id"),
        "target_id": a["target_id"],
        "target_name": a.get("target_name", ""),
        "target_status_state": a.get("target_status_state", ""),
        "started_by": a["started_by"],
        "started_by_name": a.get("started_by_name", ""),
        "started_at": a["started_at"],
        "ended_at": a.get("ended_at"),
        "hitters": a.get("hitters") or [],
    }


@router.get("/assist/{assist_id}")
async def get_chain_assist(assist_id: int, x_player_id: int = Header()):
    """Return the current state of a chain-assist (used by the card poller)."""
    _verify_member(x_player_id)
    if chain_assist_repo is None:
        raise HTTPException(status_code=503, detail="Chain assist not initialized")
    a = chain_assist_repo.get(assist_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Assist not found")
    return _assist_to_dict(a)


@router.post("/assist/{assist_id}/join")
async def join_chain_assist(assist_id: int, x_player_id: int = Header()):
    """Add the caller to the assist's hitters list. Idempotent."""
    _verify_member(x_player_id)
    if chain_assist_repo is None or chat_manager is None or key_store is None:
        raise HTTPException(status_code=503, detail="Chain assist not initialized")
    info = key_store.get_key(x_player_id)
    name = info["player_name"] if info else str(x_player_id)
    updated = chain_assist_repo.add_hitter(assist_id, x_player_id, name)
    if updated is None:
        raise HTTPException(status_code=410, detail="Assist closed")
    await chat_manager.broadcast({
        "type": "chain_assist_update",
        "payload": {"assist_id": assist_id, "joined": x_player_id},
    })
    return _assist_to_dict(updated)


@router.post("/assist/{assist_id}/end")
async def end_chain_assist(assist_id: int, x_player_id: int = Header()):
    """Close an active assist. Only the leader or an admin can end."""
    _verify_member(x_player_id)
    if chain_assist_repo is None or chat_manager is None:
        raise HTTPException(status_code=503, detail="Chain assist not initialized")
    a = chain_assist_repo.get(assist_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Assist not found")
    if a.get("ended_at"):
        return _assist_to_dict(a)
    if a["started_by"] != x_player_id and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Only the leader can end this assist")
    chain_assist_repo.end(assist_id)
    await chat_manager.broadcast({
        "type": "chain_assist_update",
        "payload": {"assist_id": assist_id, "ended": True},
    })
    return _assist_to_dict(chain_assist_repo.get(assist_id))


# ── War-room pinned card (Task #9) ────────────────────────────


@router.get("/oc-digest")
async def get_oc_digest(x_player_id: int = Header()):
    """OC 2.0 digest card payload — ready/waiting OCs, blocking tools,
    traveling participants. Refresh every ~5 min on the frontend."""
    _verify_member(x_player_id)
    if torn_client is None:
        raise HTTPException(status_code=503, detail="Torn client not initialized")

    async def _fetch_team():
        try:
            members = await torn_client.fetch_members()
        except Exception:  # noqa: BLE001
            return []
        # Flatten to the shape build_oc_digest_card expects.
        out = []
        for m in members:
            d = m.model_dump() if hasattr(m, "model_dump") else dict(m)
            out.append(d)
        return out

    return await chat_oc_digest.build_oc_digest_card(
        torn_client=torn_client, fetch_team=_fetch_team,
    )


@router.get("/war-room-card")
async def get_war_room_card(x_player_id: int = Header()):
    """Live war-room card payload.

    Returns ``{"active": false}`` when no ranked war is running so the
    frontend can hide the card. When ``active=true`` the payload has score,
    time remaining, opponent, and the top 5 easiest currently-attackable
    enemy targets.
    """
    _verify_member(x_player_id)
    if torn_client is None:
        raise HTTPException(status_code=503, detail="Torn client not initialized")
    return await chat_war_card.build_war_room_card(torn_client)


# ── Search (Task #5) ──────────────────────────────────────────


@router.get("/search")
async def search_messages(
    q: str = Query(..., min_length=1, max_length=500),
    limit: int = Query(50, ge=1, le=SEARCH_MAX_LIMIT),
    offset: int = Query(0, ge=0, le=5000),
    x_player_id: int = Header(),
):
    """Full-text search across chat history with Slack-syntax filters.

    Supports ``from:Name``, ``in:channel``, ``has:link|reaction|pin``,
    ``before:YYYY-MM-DD``, ``after:YYYY-MM-DD``, free-text and ``-negation``.

    Non-admin members never see results from admin-only channels.
    """
    _verify_member(x_player_id)
    parsed = parse_query(q)
    sql, params = build_search_sql(parsed, limit=limit, offset=offset)

    excluded: list[int] = []
    if not _is_admin(x_player_id):
        for ch in chat_repo.get_channels():
            if ch.get("admin_only"):
                excluded.append(ch["id"])

    messages = chat_repo.search_messages(sql, params, excluded_channel_ids=excluded)
    if messages:
        reactions_map = chat_repo.get_reactions_for_messages([m["id"] for m in messages])
        for m in messages:
            m["reactions"] = reactions_map.get(m["id"], [])
    return {
        "query": q,
        "parsed": {
            "text": parsed.text,
            "neg_text": parsed.neg_text,
            "from_name": parsed.from_name,
            "in_channel": parsed.in_channel,
            "has": parsed.has,
            "before_ts_max": parsed.before_ts_max,
            "after_ts_min": parsed.after_ts_min,
        },
        "messages": messages,
        "limit": limit,
        "offset": offset,
    }


# ── Entity-card resolver (Task #4) ────────────────────────────


class EntityRefIn(BaseModel):
    kind: str
    id: int | None = None


class EntityResolveBody(BaseModel):
    entities: list[EntityRefIn]


@router.post("/entities/resolve")
async def resolve_entities(body: EntityResolveBody, x_player_id: int = Header()):
    """Batched live-data resolver for entity cards.

    Takes the typed refs produced client-side (or extracted server-side via
    ``?include=entities`` on message GETs) and returns compact payloads keyed
    by ``"{kind}:{id}"``. Missing keys mean "no live data available right
    now" — the frontend keeps showing the inline link as a fallback.
    """
    _verify_member(x_player_id)
    if torn_client is None:
        raise HTTPException(status_code=503, detail="Torn client not initialized")
    if len(body.entities) > chat_resolver.MAX_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"too many entities: {len(body.entities)} > {chat_resolver.MAX_BATCH}",
        )
    refs = [r.model_dump() for r in body.entities]
    try:
        resolved = await chat_resolver.resolve_batch(
            torn_client, refs, is_admin=_is_admin(x_player_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"entities": resolved}


# ── Reactions ─────────────────────────────────────────────────


# Emoji is short, but we accept any printable Unicode glyph. Cap at 32 bytes
# to keep storage predictable and to refuse pathological inputs (e.g. a 4KB
# zero-width-joiner megasequence) without hand-rolling a grapheme parser.
_MAX_EMOJI_BYTES = 32


class ReactionBody(BaseModel):
    emoji: str


def _validate_emoji(emoji: str) -> str:
    e = emoji.strip()
    if not e:
        raise HTTPException(status_code=400, detail="Emoji cannot be empty")
    if len(e.encode("utf-8")) > _MAX_EMOJI_BYTES:
        raise HTTPException(status_code=400, detail="Emoji too long")
    # Reject newlines / control chars — emoji should be a single visual token.
    if any(ord(c) < 0x20 for c in e):
        raise HTTPException(status_code=400, detail="Emoji contains control characters")
    return e


@router.post("/messages/{message_id}/reactions")
async def add_reaction(
    message_id: int, body: ReactionBody, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    emoji = _validate_emoji(body.emoji)
    sender = key_store.get_key(x_player_id) if key_store else None
    name = sender["player_name"] if sender else str(x_player_id)
    agg = chat_repo.add_reaction(message_id, x_player_id, name, emoji)
    if agg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    await chat_manager.broadcast({
        "type": "reaction_add",
        "payload": {"message_id": message_id, "emoji": emoji, "reaction": agg},
    })
    return {"status": "ok", "reaction": agg}


@router.delete("/messages/{message_id}/reactions/{emoji}")
async def remove_reaction(
    message_id: int, emoji: str, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    emoji = _validate_emoji(emoji)
    agg = chat_repo.remove_reaction(message_id, x_player_id, emoji)
    if agg is None:
        raise HTTPException(status_code=404, detail="Reaction not found")
    await chat_manager.broadcast({
        "type": "reaction_remove",
        "payload": {"message_id": message_id, "emoji": emoji, "reaction": agg},
    })
    return {"status": "ok", "reaction": agg}


# ── Threads ───────────────────────────────────────────────────

class ThreadCreate(BaseModel):
    title: str
    content: str


@router.get("/channels/{channel_id}/threads")
async def list_threads(
    channel_id: int, before: int | None = None,
    limit: int = 20, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if ch["admin_only"] and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin-only channel")
    threads = chat_repo.get_threads(channel_id, before_id=before, limit=min(limit, 50))
    return {"threads": threads}


@router.post("/channels/{channel_id}/threads")
async def create_thread(
    channel_id: int, body: ThreadCreate, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    if chat_repo.is_muted(x_player_id):
        raise HTTPException(status_code=403, detail="You are muted")
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if ch["admin_only"] and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin-only channel")
    if ch.get("write_restricted") and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Only admins can post in this channel")
    if not body.title.strip() or not body.content.strip():
        raise HTTPException(status_code=400, detail="Title and content required")

    sender = key_store.get_key(x_player_id) if key_store else None
    name = sender["player_name"] if sender else str(x_player_id)

    thread = chat_repo.create_thread(
        channel_id=channel_id, title=body.title.strip(),
        player_id=x_player_id, player_name=name,
        content=body.content.strip(),
    )
    await chat_manager.broadcast({"type": "thread", "payload": thread})
    return thread


@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(
    thread_id: int, before: int | None = None,
    limit: int = 50,
    include: str | None = Query(None, description="Comma-separated extras: 'entities'"),
    x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    thread = chat_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = chat_repo.get_thread_messages(thread_id, before_id=before, limit=min(limit, 100))
    if messages:
        reactions_map = chat_repo.get_reactions_for_messages([m["id"] for m in messages])
        for m in messages:
            m["reactions"] = reactions_map.get(m["id"], [])
    if include and "entities" in {p.strip() for p in include.split(",")}:
        for m in messages:
            m["entities"] = find_entities_as_dicts(m.get("content") or "")
    return {"thread": thread, "messages": messages}


@router.post("/threads/{thread_id}/messages")
async def send_thread_message(
    thread_id: int, body: MessageCreate, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    if chat_repo.is_muted(x_player_id):
        raise HTTPException(status_code=403, detail="You are muted")
    thread = chat_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if thread["locked"] and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Thread is locked")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    sender = key_store.get_key(x_player_id) if key_store else None
    name = sender["player_name"] if sender else str(x_player_id)

    msg = chat_repo.create_message(
        channel_id=thread["channel_id"], player_id=x_player_id,
        player_name=name, content=body.content.strip(),
        thread_id=thread_id, mentions=body.mentions,
    )
    # Auto-mark own message as read so it doesn't count as unread for sender
    chat_repo.update_read_position(x_player_id, thread["channel_id"], msg["id"], thread_id=thread_id)
    await chat_manager.broadcast({"type": "thread_message", "payload": msg})
    await _notify_mentions(body.mentions, name, body.content, thread["channel_id"])
    return msg


@router.post("/threads/{thread_id}/lock")
async def toggle_thread_lock(thread_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    thread = chat_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    new_locked = not bool(thread["locked"])
    chat_repo.lock_thread(thread_id, new_locked)
    return {"status": "ok", "locked": new_locked}


@router.post("/threads/{thread_id}/pin")
async def toggle_thread_pin(thread_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    thread = chat_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    new_pinned = not bool(thread["pinned"])
    chat_repo.pin_thread(thread_id, new_pinned)
    return {"status": "ok", "pinned": new_pinned}


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    thread = chat_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if thread["player_id"] != x_player_id and not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Only the thread author or an admin can delete this thread")
    chat_repo.delete_thread(thread_id)
    return {"status": "ok"}


# ── Read tracking ─────────────────────────────────────────────

class ReadUpdate(BaseModel):
    channel_id: int
    message_id: int
    thread_id: int = 0


@router.post("/read")
async def update_read(body: ReadUpdate, x_player_id: int = Header()):
    _verify_member(x_player_id)
    chat_repo.update_read_position(
        x_player_id, body.channel_id, body.message_id, body.thread_id,
    )
    return {"status": "ok"}


@router.get("/unread")
async def get_unread(x_player_id: int = Header()):
    _verify_member(x_player_id)
    counts = chat_repo.get_unread_counts(x_player_id)
    if not _is_admin(x_player_id):
        admin_only_ids = {ch["id"] for ch in chat_repo.get_channels() if ch["admin_only"]}
        counts = {k: v for k, v in counts.items() if k not in admin_only_ids}
    total = sum(counts.values())
    return {"channels": counts, "total": total}


@router.get("/mentions/recent")
async def get_recent_mentions(
    since: int = Query(0, ge=0, description="Last seen message id (exclusive)"),
    limit: int = Query(20, ge=1, le=50),
    x_player_id: int = Header(),
):
    """Return recent chat messages where the caller was @mentioned.

    Powers the TM Hub Companion userscript's @mention toast feature: the
    userscript polls this endpoint every ~15s with `since=<last_seen_id>`,
    renders new mentions as toast cards on torn.com.

    Content is truncated to 200 chars (UI clamps anyway) to keep the payload
    small and reduce the risk of leaking secrets pasted in chat.
    """
    if not chat_repo:
        raise HTTPException(status_code=503, detail="Not initialized")
    _verify_member(x_player_id)
    rows = chat_repo.get_recent_mentions(x_player_id, since=since, limit=limit)
    if not _is_admin(x_player_id):
        admin_only_ids = {ch["id"] for ch in chat_repo.get_channels() if ch["admin_only"]}
        rows = [r for r in rows if r["channel_id"] not in admin_only_ids]
    # Truncate content for safety / bandwidth.
    for r in rows:
        content = r.get("content") or ""
        if len(content) > 200:
            r["content"] = content[:197] + "…"
    return {"mentions": rows, "count": len(rows)}


@router.get("/admin-ids")
async def get_admin_ids(x_player_id: int = Header()):
    """Return list of admin player IDs for badge display."""
    _verify_member(x_player_id)
    admins = key_store.get_admins() if key_store else []
    admin_ids = [a["player_id"] for a in admins]
    for sid in SUPERADMIN_IDS:
        if sid not in admin_ids:
            admin_ids.append(sid)
    return {"admin_ids": admin_ids}


# ── Mutes ─────────────────────────────────────────────────────

class MuteCreate(BaseModel):
    reason: str = ""
    duration_hours: int | None = None


@router.post("/mute/{player_id}")
async def mute_player(player_id: int, body: MuteCreate, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    import time
    muted_until = None
    if body.duration_hours:
        muted_until = int(time.time()) + body.duration_hours * 3600
    chat_repo.mute_player(player_id, x_player_id, body.reason, muted_until)
    return {"status": "ok"}


@router.delete("/mute/{player_id}")
async def unmute_player(player_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    chat_repo.unmute_player(player_id)
    return {"status": "ok"}


# ── Bot API ───────────────────────────────────────────────────

class BotCreate(BaseModel):
    name: str
    allowed_channels: str = "*"


class BotUpdate(BaseModel):
    name: str | None = None
    allowed_channels: str | None = None
    active: int | None = None


class BotMessage(BaseModel):
    channel_id: int
    content: str
    mentions: list[int] = []
    thread_id: int | None = None


@router.post("/bots")
async def create_bot(body: BotCreate, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    token = str(uuid.uuid4())
    try:
        bot_id = chat_repo.create_bot(
            name=body.name, token=token,
            allowed_channels=body.allowed_channels,
            created_by=x_player_id,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Bot name already exists")
    return {"bot_id": bot_id, "token": token}


@router.get("/bots")
async def list_bots(x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    return {"bots": chat_repo.get_bots()}


@router.put("/bots/{bot_id}")
async def update_bot(bot_id: int, body: BotUpdate, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        chat_repo.update_bot(bot_id, **updates)
    return {"status": "ok"}


@router.delete("/bots/{bot_id}")
async def delete_bot(bot_id: int, x_player_id: int = Header()):
    _verify_member(x_player_id)
    if not _is_admin(x_player_id):
        raise HTTPException(status_code=403, detail="Admin only")
    chat_repo.delete_bot(bot_id)
    return {"status": "ok"}


@router.post("/bot/messages")
async def bot_send_message(body: BotMessage, authorization: str = Header()):
    _not_ready()
    bot = _auth_bot(authorization)
    # Check channel permissions
    if bot["allowed_channels"] != "*":
        try:
            allowed = json.loads(bot["allowed_channels"])
            if body.channel_id not in allowed:
                raise HTTPException(status_code=403, detail="Bot not allowed in this channel")
        except (json.JSONDecodeError, TypeError):
            pass
    ch = chat_repo.get_channel(body.channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg = chat_repo.create_message(
        channel_id=body.channel_id, player_id=0,
        player_name=bot["name"], content=body.content.strip(),
        thread_id=body.thread_id, bot_id=bot["id"],
        mentions=body.mentions,
    )
    await chat_manager.broadcast({"type": "message", "payload": msg})
    await _notify_mentions(body.mentions, bot["name"], body.content, body.channel_id)
    return msg


@router.get("/bot/channels")
async def bot_list_channels(authorization: str = Header()):
    _not_ready()
    bot = _auth_bot(authorization)
    channels = chat_repo.get_channels()
    if bot["allowed_channels"] != "*":
        try:
            allowed = json.loads(bot["allowed_channels"])
            channels = [c for c in channels if c["id"] in allowed]
        except (json.JSONDecodeError, TypeError):
            pass
    return {"channels": channels}


# ── Online status ─────────────────────────────────────────────

@router.get("/online")
async def get_online(x_player_id: int = Header()):
    _verify_member(x_player_id)
    if presence_repo:
        return {"online": presence_repo.get_online(ttl_seconds=120)}
    return {"online": await chat_manager.get_online_players()}


# ── Traveling members ─────────────────────────────────────────

@router.get("/traveling")
async def get_traveling(x_player_id: int = Header()):
    """Return list of faction members currently traveling."""
    _verify_member(x_player_id)
    if not torn_client:
        return {"travelers": []}

    try:
        members = await torn_client.fetch_members()
    except Exception:
        return {"travelers": []}

    travelers = []
    for m in members:
        state = m.status.state.lower()
        desc = m.status.description.lower()
        if "travel" in state or "abroad" in state or "travel" in desc or "abroad" in desc:
            travelers.append({
                "player_id": m.id,
                "name": m.name,
                "status": m.status.description,
            })
    return {"travelers": travelers}


# ── WebSocket ─────────────────────────────────────────────────

@router.websocket("/ws")
async def chat_websocket(ws: WebSocket):
    _not_ready()
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4003, reason="missing_token")
        return

    payload = decode_jwt(token, JWT_SECRET)
    if payload is None or payload.get("token_type") not in {"session", "admin"}:
        await ws.close(code=4003, reason="invalid_token")
        return

    player_id = payload["sub"]
    if not key_store or not key_store.has_key(player_id):
        await ws.close(code=4003, reason="not_authorized")
        return

    try:
        _check_chat_access(player_id)
    except HTTPException as exc:
        await ws.close(code=4003, reason=str(exc.detail))
        return

    await chat_manager.connect(player_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            payload = msg.get("payload", {})

            if msg_type == "message":
                if not _msg_rate_ok(player_id):
                    continue  # silently drop — client won't notice lag
                await _handle_ws_message(player_id, payload)
            elif msg_type == "typing":
                ch_id = payload.get("channel_id")
                if ch_id:
                    sender = key_store.get_key(player_id) if key_store else None
                    name = sender["player_name"] if sender else str(player_id)
                    await chat_manager.broadcast(
                        {"type": "typing", "payload": {"channel_id": ch_id, "player_id": player_id, "player_name": name}},
                        exclude=player_id,
                    )
            elif msg_type == "read":
                ch_id = payload.get("channel_id")
                msg_id = payload.get("message_id")
                thread_id = payload.get("thread_id", 0)
                if ch_id and msg_id:
                    chat_repo.update_read_position(player_id, ch_id, msg_id, thread_id)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("Chat WS error for player %d: %s", player_id, e)
    finally:
        chat_manager.disconnect(player_id)


async def _handle_ws_message(player_id: int, payload: dict) -> None:
    """Handle a message sent via WebSocket."""
    channel_id = payload.get("channel_id")
    content = payload.get("content", "").strip()
    thread_id = payload.get("thread_id")
    mentions = payload.get("mentions", [])

    if not channel_id or not content:
        return
    if len(content) > 4000:
        return
    if chat_repo.is_muted(player_id):
        return

    ch = chat_repo.get_channel(channel_id)
    if not ch:
        return
    if ch["admin_only"] and not _is_admin(player_id):
        return
    if ch.get("write_restricted") and not _is_admin(player_id):
        return
    if thread_id:
        thread = chat_repo.get_thread(thread_id)
        if not thread or thread["locked"]:
            return

    sender = key_store.get_key(player_id) if key_store else None
    name = sender["player_name"] if sender else str(player_id)

    msg = chat_repo.create_message(
        channel_id=channel_id, player_id=player_id,
        player_name=name, content=content,
        thread_id=thread_id, mentions=mentions,
    )
    # Auto-mark own message as read
    chat_repo.update_read_position(player_id, channel_id, msg["id"], thread_id=thread_id or 0)
    msg_type = "thread_message" if thread_id else "message"
    await chat_manager.broadcast({"type": msg_type, "payload": msg})
    await _notify_mentions(mentions, name, content, channel_id)


async def _notify_mentions(
    mentions: list[int], sender_name: str, content: str, channel_id: int,
) -> None:
    """Send push notifications to mentioned players."""
    if not mentions:
        return
    preview = content[:100] + ("..." if len(content) > 100 else "")
    for pid in mentions:
        try:
            if notification_dispatcher:
                notification_dispatcher.send(
                    title=f"@{sender_name} mentioned you",
                    body=preview,
                    url=f"/chat?channel={channel_id}",
                    target_type="player",
                    target_value=str(pid),
                    sent_by="system",
                    preference_filter="chat_mention",
                )
            elif push_service:
                push_service.dispatch_to_player(
                    pid, "chat_mention",
                    f"@{sender_name} mentioned you",
                    preview, f"/chat?channel={channel_id}",
                )
        except Exception as e:
            logger.debug("Push notify mention failed for %d: %s", pid, e)
