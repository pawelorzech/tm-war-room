from __future__ import annotations
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


class CustomGroupRepository(BaseRepository):
    def create(self, name: str, description: str | None, created_by: int) -> int:
        now = datetime.now(timezone.utc).isoformat()
        return self.mutate(
            """INSERT INTO custom_groups (name, description, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (name, description, created_by, now, now),
        )

    def get_by_id(self, group_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM custom_groups WHERE id = ?", (group_id,))
        return dict(row) if row else None

    def list_all(self) -> list[dict]:
        rows = self.execute(
            """SELECT g.*, COUNT(m.id) as member_count
               FROM custom_groups g
               LEFT JOIN custom_group_members m ON g.id = m.group_id
               GROUP BY g.id ORDER BY g.name"""
        )
        return [dict(r) for r in rows]

    def update(self, group_id: int, name: str | None = None, description: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        current = self.get_by_id(group_id)
        if not current:
            return
        self.mutate(
            "UPDATE custom_groups SET name=?, description=?, updated_at=? WHERE id=?",
            (name or current["name"], description if description is not None else current["description"], now, group_id),
        )

    def delete(self, group_id: int) -> None:
        self.mutate("DELETE FROM custom_groups WHERE id = ?", (group_id,))

    def add_member(self, group_id: int, player_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.mutate(
            "INSERT OR IGNORE INTO custom_group_members (group_id, player_id, added_at) VALUES (?, ?, ?)",
            (group_id, player_id, now),
        )

    def remove_member(self, group_id: int, player_id: int) -> None:
        self.mutate(
            "DELETE FROM custom_group_members WHERE group_id = ? AND player_id = ?",
            (group_id, player_id),
        )

    def get_members(self, group_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM custom_group_members WHERE group_id = ? ORDER BY added_at",
            (group_id,),
        )
        return [dict(r) for r in rows]

    def get_player_ids(self, group_id: int) -> list[int]:
        rows = self.execute(
            "SELECT player_id FROM custom_group_members WHERE group_id = ?",
            (group_id,),
        )
        return [r["player_id"] for r in rows]
