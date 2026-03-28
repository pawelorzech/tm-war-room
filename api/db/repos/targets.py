from __future__ import annotations
from api.db.repos.base import BaseRepository


class TargetRepository(BaseRepository):
    def add_target(self, player_id: int, player_name: str | None, added_by: int,
                   added_by_name: str | None, tag: str = '', notes: str = '',
                   difficulty: str = 'unknown') -> int:
        return self.mutate("""
            INSERT INTO targets (player_id, player_name, added_by, added_by_name, tag, notes, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET
                player_name = COALESCE(excluded.player_name, player_name),
                tag = excluded.tag,
                notes = excluded.notes,
                difficulty = excluded.difficulty,
                updated_at = CURRENT_TIMESTAMP
        """, (player_id, player_name, added_by, added_by_name, tag, notes, difficulty))

    def remove_target(self, player_id: int) -> None:
        self.mutate("DELETE FROM targets WHERE player_id = ?", (player_id,))

    def update_target(self, player_id: int, tag: str | None = None,
                      notes: str | None = None, difficulty: str | None = None) -> None:
        parts = []
        params: list = []
        if tag is not None:
            parts.append("tag = ?")
            params.append(tag)
        if notes is not None:
            parts.append("notes = ?")
            params.append(notes)
        if difficulty is not None:
            parts.append("difficulty = ?")
            params.append(difficulty)
        if not parts:
            return
        parts.append("updated_at = CURRENT_TIMESTAMP")
        params.append(player_id)
        self.mutate(f"UPDATE targets SET {', '.join(parts)} WHERE player_id = ?", tuple(params))

    def get_all(self) -> list[dict]:
        rows = self.execute("SELECT * FROM targets ORDER BY created_at DESC")
        return [dict(r) for r in rows]

    def get_by_tag(self, tag: str) -> list[dict]:
        rows = self.execute("SELECT * FROM targets WHERE tag = ? ORDER BY created_at DESC", (tag,))
        return [dict(r) for r in rows]

    def get_tags(self) -> list[str]:
        rows = self.execute("SELECT DISTINCT tag FROM targets WHERE tag != '' ORDER BY tag")
        return [r["tag"] for r in rows]

    def get_count(self) -> int:
        row = self.execute_one("SELECT COUNT(*) as cnt FROM targets")
        return row["cnt"] if row else 0
