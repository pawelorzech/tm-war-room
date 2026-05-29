from __future__ import annotations
from api.db.repos.base import BaseRepository


class MugRepository(BaseRepository):
    def log_mug(self, owner_player_id: int, target_player_id: int, mugged_at: int) -> None:
        self.mutate(
            "INSERT INTO mug_log (owner_player_id, target_player_id, mugged_at) VALUES (?, ?, ?)",
            (owner_player_id, target_player_id, mugged_at),
        )

    def last_mug_at(self, owner_player_id: int, target_player_id: int) -> int | None:
        row = self.execute_one(
            "SELECT MAX(mugged_at) AS m FROM mug_log WHERE owner_player_id = ? AND target_player_id = ?",
            (owner_player_id, target_player_id),
        )
        return row["m"] if row and row["m"] is not None else None

    def add_trade(self, owner_player_id: int, seller_player_id: int, kind: str, source: str, created_at: int) -> None:
        self.mutate(
            "INSERT INTO recent_trades (owner_player_id, seller_player_id, kind, source, created_at) VALUES (?, ?, ?, ?, ?)",
            (owner_player_id, seller_player_id, kind, source, created_at),
        )

    def last_trade_at(self, owner_player_id: int, seller_player_id: int) -> int | None:
        row = self.execute_one(
            "SELECT MAX(created_at) AS c FROM recent_trades WHERE owner_player_id = ? AND seller_player_id = ?",
            (owner_player_id, seller_player_id),
        )
        return row["c"] if row and row["c"] is not None else None
