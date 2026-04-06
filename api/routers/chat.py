from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Header, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from api.db.repos.chat import ChatRepository
from api.chat_manager import ChatManager
from api.config import SUPERADMIN_ID

logger = logging.getLogger("tm-hub.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Set by main.py during startup
chat_repo: ChatRepository | None = None
chat_manager: ChatManager | None = None
key_store = None
push_service = None
settings_repo = None
notification_dispatcher = None  # Set by main.py


def _not_ready():
    if not chat_repo or not chat_manager:
        raise HTTPException(status_code=503, detail="Chat not initialized")


def _verify_member(player_id: int):
    _not_ready()
    all_keys = key_store.get_all_keys() if key_store else []
    if not any(k["player_id"] == player_id for k in all_keys):
        raise HTTPException(status_code=403, detail="Not a faction member")
    _check_chat_access(player_id)


def _is_admin(player_id: int) -> bool:
    if player_id == SUPERADMIN_ID:
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
    channel_id: int, before: int | None = None,
    limit: int = 50, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    ch = chat_repo.get_channel(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    messages = chat_repo.get_messages(channel_id, before_id=before, limit=min(limit, 100))
    return {"messages": messages}


@router.post("/channels/{channel_id}/messages")
async def send_message(
    channel_id: int, body: MessageCreate, x_player_id: int = Header(),
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
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body.content) > 4000:
        raise HTTPException(status_code=400, detail="Message too long (max 4000 chars)")

    all_keys = key_store.get_all_keys() if key_store else []
    sender = next((k for k in all_keys if k["player_id"] == x_player_id), None)
    name = sender["player_name"] if sender else str(x_player_id)

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
    return {"messages": chat_repo.get_pinned_messages(channel_id)}


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

    all_keys = key_store.get_all_keys() if key_store else []
    sender = next((k for k in all_keys if k["player_id"] == x_player_id), None)
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
    limit: int = 50, x_player_id: int = Header(),
):
    _verify_member(x_player_id)
    thread = chat_repo.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = chat_repo.get_thread_messages(thread_id, before_id=before, limit=min(limit, 100))
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

    all_keys = key_store.get_all_keys() if key_store else []
    sender = next((k for k in all_keys if k["player_id"] == x_player_id), None)
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


@router.get("/admin-ids")
async def get_admin_ids(x_player_id: int = Header()):
    """Return list of admin player IDs for badge display."""
    _verify_member(x_player_id)
    admins = key_store.get_admins() if key_store else []
    admin_ids = [a["player_id"] for a in admins]
    if SUPERADMIN_ID not in admin_ids:
        admin_ids.append(SUPERADMIN_ID)
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
    return {"online": chat_manager.get_online_players()}


# ── WebSocket ─────────────────────────────────────────────────

@router.websocket("/ws")
async def chat_websocket(ws: WebSocket, player_id: int):
    _not_ready()
    # Validate the player
    all_keys = key_store.get_all_keys() if key_store else []
    if not any(k["player_id"] == player_id for k in all_keys):
        await ws.close(code=4003, reason="not_authorized")
        return

    # Check chat access (beta gate)
    if not _is_admin(player_id):
        if settings_repo:
            enabled = settings_repo.get("chat_enabled_for_all")
            if enabled != "true":
                await ws.close(code=4003, reason="Chat is in beta — admin only")
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
                await _handle_ws_message(player_id, payload)
            elif msg_type == "typing":
                ch_id = payload.get("channel_id")
                if ch_id:
                    sender = next((k for k in all_keys if k["player_id"] == player_id), None)
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

    all_keys = key_store.get_all_keys() if key_store else []
    sender = next((k for k in all_keys if k["player_id"] == player_id), None)
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
                )
            elif push_service:
                push_service.dispatch_to_player(
                    pid, "chat_mention",
                    f"@{sender_name} mentioned you",
                    preview, f"/chat?channel={channel_id}",
                )
        except Exception as e:
            logger.debug("Push notify mention failed for %d: %s", pid, e)
