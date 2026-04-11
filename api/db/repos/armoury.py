from __future__ import annotations

from api.db.repos.base import BaseRepository


class ArmouryRepository(BaseRepository):

    def create_competition(self, name: str, category: str, start_ts: int, end_ts: int, created_by: int, prize_text: str | None = None, items: str | None = None) -> int:
        return self.mutate(
            "INSERT INTO armoury_competitions (name, category, start_ts, end_ts, created_by, prize_text, items) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (name, category, start_ts, end_ts, created_by, prize_text, items),
        )

    def get_competition(self, comp_id: int) -> dict | None:
        row = self.execute_one("SELECT * FROM armoury_competitions WHERE id = ?", (comp_id,))
        return dict(row) if row else None

    def get_active_competitions(self) -> list[dict]:
        rows = self.execute("SELECT * FROM armoury_competitions WHERE status = 'active' ORDER BY start_ts DESC")
        return [dict(r) for r in rows]

    def get_all_competitions(self) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM armoury_competitions ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, start_ts DESC"
        )
        return [dict(r) for r in rows]

    def update_competition(self, comp_id: int, **kwargs) -> None:
        if not kwargs:
            return
        cols = ", ".join(f"{k} = ?" for k in kwargs)
        vals = tuple(kwargs.values()) + (comp_id,)
        self.mutate(f"UPDATE armoury_competitions SET {cols} WHERE id = ?", vals)

    def end_competition(self, comp_id: int) -> None:
        self.mutate("UPDATE armoury_competitions SET status = 'ended' WHERE id = ?", (comp_id,))

    def insert_deposit(
        self, competition_id: int, player_id: int, player_name: str,
        item_name: str, quantity: int, deposited_at: int, news_id: str,
    ) -> int:
        return self.mutate(
            "INSERT OR IGNORE INTO armoury_deposits "
            "(competition_id, player_id, player_name, item_name, quantity, deposited_at, news_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (competition_id, player_id, player_name, item_name, quantity, deposited_at, news_id),
        )

    def get_leaderboard(self, competition_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT player_id, player_name, SUM(quantity) AS total, COUNT(*) AS deposits, "
            "MAX(deposited_at) AS last_deposit "
            "FROM armoury_deposits WHERE competition_id = ? "
            "GROUP BY player_id ORDER BY total DESC",
            (competition_id,),
        )
        return [dict(r) for r in rows]

    def get_deposits(self, competition_id: int) -> list[dict]:
        rows = self.execute(
            "SELECT * FROM armoury_deposits WHERE competition_id = ? ORDER BY deposited_at DESC",
            (competition_id,),
        )
        return [dict(r) for r in rows]

    def get_last_poll_ts(self, competition_id: int) -> int | None:
        row = self.execute_one(
            "SELECT MAX(deposited_at) AS last_ts FROM armoury_deposits WHERE competition_id = ?",
            (competition_id,),
        )
        return row["last_ts"] if row and row["last_ts"] is not None else None
