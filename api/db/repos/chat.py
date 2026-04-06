from __future__ import annotations
import json
import time
from api.db.repos.base import BaseRepository


class ChatRepository(BaseRepository):
    # ── Channels ──────────────────────────────────────────────

    def get_channels(self) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM chat_channels ORDER BY position, id"
        )
        return [dict(r) for r in rows]

    def get_channel(self, channel_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM chat_channels WHERE id = ?", (channel_id,)
        )
        return dict(row) if row else None

    def get_channel_by_name(self, name: str) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM chat_channels WHERE name = ?", (name,)
        )
        return dict(row) if row else None

    def create_channel(
        self, name: str, description: str, ch_type: str,
        position: int, admin_only: bool, created_by: int,
    ) -> int:
        return self.mutate(
            """INSERT INTO chat_channels
               (name, description, type, position, admin_only, created_at, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, description, ch_type, position, int(admin_only), int(time.time()), created_by),
        )

    def update_channel(self, channel_id: int, **kwargs) -> None:
        allowed = {"name", "description", "type", "position", "admin_only"}
        parts, vals = [], []
        for k, v in kwargs.items():
            if k in allowed:
                parts.append(f"{k} = ?")
                vals.append(int(v) if k == "admin_only" else v)
        if not parts:
            return
        vals.append(channel_id)
        self.mutate(f"UPDATE chat_channels SET {', '.join(parts)} WHERE id = ?", tuple(vals))

    def delete_channel(self, channel_id: int) -> None:
        self.mutate("DELETE FROM chat_messages WHERE channel_id = ?", (channel_id,))
        self.mutate("DELETE FROM chat_threads WHERE channel_id = ?", (channel_id,))
        self.mutate("DELETE FROM chat_read_positions WHERE channel_id = ?", (channel_id,))
        self.mutate("DELETE FROM chat_channels WHERE id = ?", (channel_id,))

    # ── Messages ──────────────────────────────────────────────

    def get_messages(
        self, channel_id: int, before_id: int | None = None, limit: int = 50,
    ) -> list[dict]:
        if before_id:
            rows = self.execute(
                """SELECT * FROM chat_messages
                   WHERE channel_id = ? AND thread_id IS NULL AND id < ? AND deleted = 0
                   ORDER BY id DESC LIMIT ?""",
                (channel_id, before_id, limit),
            )
        else:
            rows = self.execute(
                """SELECT * FROM chat_messages
                   WHERE channel_id = ? AND thread_id IS NULL AND deleted = 0
                   ORDER BY id DESC LIMIT ?""",
                (channel_id, limit),
            )
        result = [dict(r) for r in rows]
        for m in result:
            m["mentions"] = json.loads(m.get("mentions") or "[]")
        return list(reversed(result))

    def create_message(
        self, channel_id: int, player_id: int, player_name: str,
        content: str, thread_id: int | None = None,
        bot_id: int | None = None, mentions: list[int] | None = None,
    ) -> dict:
        now = int(time.time())
        msg_id = self.mutate(
            """INSERT INTO chat_messages
               (channel_id, thread_id, player_id, player_name, content,
                bot_id, mentions, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (channel_id, thread_id, player_id, player_name, content,
             bot_id, json.dumps(mentions or []), now),
        )
        if thread_id:
            self.mutate(
                "UPDATE chat_threads SET last_message_at = ? WHERE id = ?",
                (now, thread_id),
            )
        return {
            "id": msg_id, "channel_id": channel_id, "thread_id": thread_id,
            "player_id": player_id, "player_name": player_name,
            "content": content, "bot_id": bot_id,
            "mentions": mentions or [], "pinned": 0, "deleted": 0,
            "created_at": now, "edited_at": None,
        }

    def edit_message(self, message_id: int, player_id: int, content: str) -> bool:
        row = self.execute_one(
            "SELECT player_id FROM chat_messages WHERE id = ? AND deleted = 0",
            (message_id,),
        )
        if not row or row["player_id"] != player_id:
            return False
        self.mutate(
            "UPDATE chat_messages SET content = ?, edited_at = ? WHERE id = ?",
            (content, int(time.time()), message_id),
        )
        return True

    def delete_message(self, message_id: int, player_id: int, is_admin: bool) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM chat_messages WHERE id = ? AND deleted = 0",
            (message_id,),
        )
        if not row:
            return None
        if row["player_id"] != player_id and not is_admin:
            return None
        self.mutate(
            "UPDATE chat_messages SET deleted = 1 WHERE id = ?", (message_id,)
        )
        return dict(row)

    def pin_message(self, message_id: int, pinned: bool) -> bool:
        row = self.execute_one(
            "SELECT id FROM chat_messages WHERE id = ? AND deleted = 0",
            (message_id,),
        )
        if not row:
            return False
        self.mutate(
            "UPDATE chat_messages SET pinned = ? WHERE id = ?",
            (int(pinned), message_id),
        )
        return True

    def get_pinned_messages(self, channel_id: int) -> list[dict]:
        rows = self.execute(
            """SELECT * FROM chat_messages
               WHERE channel_id = ? AND pinned = 1 AND deleted = 0
               ORDER BY created_at DESC""",
            (channel_id,),
        )
        result = [dict(r) for r in rows]
        for m in result:
            m["mentions"] = json.loads(m.get("mentions") or "[]")
        return result

    # ── Threads ───────────────────────────────────────────────

    def get_threads(
        self, channel_id: int, before_id: int | None = None, limit: int = 20,
    ) -> list[dict]:
        if before_id:
            rows = self.execute(
                """SELECT * FROM chat_threads
                   WHERE channel_id = ? AND id < ?
                   ORDER BY pinned DESC, last_message_at DESC LIMIT ?""",
                (channel_id, before_id, limit),
            )
        else:
            rows = self.execute(
                """SELECT * FROM chat_threads
                   WHERE channel_id = ?
                   ORDER BY pinned DESC, last_message_at DESC LIMIT ?""",
                (channel_id, limit),
            )
        return [dict(r) for r in rows]

    def get_thread(self, thread_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM chat_threads WHERE id = ?", (thread_id,)
        )
        return dict(row) if row else None

    def create_thread(
        self, channel_id: int, title: str, player_id: int,
        player_name: str, content: str,
    ) -> dict:
        now = int(time.time())
        thread_id = self.mutate(
            """INSERT INTO chat_threads
               (channel_id, title, player_id, player_name, created_at, last_message_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (channel_id, title, player_id, player_name, now, now),
        )
        self.create_message(
            channel_id=channel_id, player_id=player_id,
            player_name=player_name, content=content, thread_id=thread_id,
        )
        return {
            "id": thread_id, "channel_id": channel_id, "title": title,
            "player_id": player_id, "player_name": player_name,
            "pinned": 0, "locked": 0, "created_at": now, "last_message_at": now,
        }

    def get_thread_messages(
        self, thread_id: int, before_id: int | None = None, limit: int = 50,
    ) -> list[dict]:
        if before_id:
            rows = self.execute(
                """SELECT * FROM chat_messages
                   WHERE thread_id = ? AND id < ? AND deleted = 0
                   ORDER BY id DESC LIMIT ?""",
                (thread_id, before_id, limit),
            )
        else:
            rows = self.execute(
                """SELECT * FROM chat_messages
                   WHERE thread_id = ? AND deleted = 0
                   ORDER BY id DESC LIMIT ?""",
                (thread_id, limit),
            )
        result = [dict(r) for r in rows]
        for m in result:
            m["mentions"] = json.loads(m.get("mentions") or "[]")
        return list(reversed(result))

    def lock_thread(self, thread_id: int, locked: bool) -> None:
        self.mutate(
            "UPDATE chat_threads SET locked = ? WHERE id = ?",
            (int(locked), thread_id),
        )

    def pin_thread(self, thread_id: int, pinned: bool) -> None:
        self.mutate(
            "UPDATE chat_threads SET pinned = ? WHERE id = ?",
            (int(pinned), thread_id),
        )

    def delete_thread(self, thread_id: int) -> None:
        self.mutate("DELETE FROM chat_messages WHERE thread_id = ?", (thread_id,))
        self.mutate("DELETE FROM chat_read_positions WHERE thread_id = ?", (thread_id,))
        self.mutate("DELETE FROM chat_threads WHERE id = ?", (thread_id,))

    # ── Read tracking ─────────────────────────────────────────

    def update_read_position(
        self, player_id: int, channel_id: int,
        message_id: int, thread_id: int = 0,
    ) -> None:
        self.mutate(
            """INSERT INTO chat_read_positions
               (player_id, channel_id, thread_id, last_read_message_id, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (player_id, channel_id, thread_id)
               DO UPDATE SET last_read_message_id = MAX(last_read_message_id, ?), updated_at = ?""",
            (player_id, channel_id, thread_id, message_id, int(time.time()),
             message_id, int(time.time())),
        )

    def get_unread_counts(self, player_id: int) -> dict[int, int]:
        rows = self.execute(
            """SELECT c.id as channel_id,
                      COALESCE(
                        (SELECT COUNT(*) FROM chat_messages m
                         WHERE m.channel_id = c.id AND m.thread_id IS NULL AND m.deleted = 0
                           AND m.id > COALESCE(
                             (SELECT last_read_message_id FROM chat_read_positions rp
                              WHERE rp.player_id = ? AND rp.channel_id = c.id AND rp.thread_id = 0),
                             0)),
                        0) as unread
               FROM chat_channels c""",
            (player_id,),
        )
        return {r["channel_id"]: r["unread"] for r in rows}

    # ── Mutes ─────────────────────────────────────────────────

    def is_muted(self, player_id: int) -> bool:
        row = self.execute_one(
            "SELECT * FROM chat_mutes WHERE player_id = ?", (player_id,)
        )
        if not row:
            return False
        if row["muted_until"] and row["muted_until"] < int(time.time()):
            self.mutate("DELETE FROM chat_mutes WHERE player_id = ?", (player_id,))
            return False
        return True

    def mute_player(
        self, player_id: int, muted_by: int,
        reason: str = "", muted_until: int | None = None,
    ) -> None:
        self.mutate(
            """INSERT OR REPLACE INTO chat_mutes
               (player_id, muted_by, reason, muted_until, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (player_id, muted_by, reason, muted_until, int(time.time())),
        )

    def unmute_player(self, player_id: int) -> None:
        self.mutate("DELETE FROM chat_mutes WHERE player_id = ?", (player_id,))

    # ── Bots ──────────────────────────────────────────────────

    def create_bot(
        self, name: str, token: str, allowed_channels: str,
        created_by: int,
    ) -> int:
        return self.mutate(
            """INSERT INTO chat_bots (name, token, allowed_channels, created_by, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (name, token, allowed_channels, created_by, int(time.time())),
        )

    def get_bot_by_token(self, token: str) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM chat_bots WHERE token = ? AND active = 1", (token,)
        )
        return dict(row) if row else None

    def get_bots(self) -> list[dict]:
        rows = self.execute("SELECT id, name, avatar, allowed_channels, created_by, active, created_at FROM chat_bots ORDER BY id")
        return [dict(r) for r in rows]

    def update_bot(self, bot_id: int, **kwargs) -> None:
        allowed = {"name", "allowed_channels", "active", "avatar"}
        parts, vals = [], []
        for k, v in kwargs.items():
            if k in allowed:
                parts.append(f"{k} = ?")
                vals.append(v)
        if not parts:
            return
        vals.append(bot_id)
        self.mutate(f"UPDATE chat_bots SET {', '.join(parts)} WHERE id = ?", tuple(vals))

    def delete_bot(self, bot_id: int) -> None:
        self.mutate("DELETE FROM chat_bots WHERE id = ?", (bot_id,))
