from __future__ import annotations
from datetime import datetime, timedelta
from api.db.repos.spies import SpyRepository

SOURCE_PRIORITY = {"member_submit": 0, "tornstats": 1, "yata": 2}
EXACT_MAX_AGE_DAYS = 7
FRESH_MAX_AGE_DAYS = 30

class SpyService:
    def __init__(self, repo: SpyRepository):
        self.repo = repo

    def refresh_estimate(self, player_id: int) -> None:
        reports = self.repo.get_reports(player_id)
        if not reports:
            return
        now = datetime.utcnow()
        best = None
        best_priority = 999
        best_age = 999
        for r in reports:
            reported_at = datetime.fromisoformat(r["reported_at"])
            age_days = (now - reported_at).total_seconds() / 86400
            source = r["source"]
            priority = SOURCE_PRIORITY.get(source, 10)
            if source == "member_submit" and age_days > EXACT_MAX_AGE_DAYS:
                priority = 10
            if priority < best_priority or (priority == best_priority and age_days < best_age):
                best = r
                best_priority = priority
                best_age = age_days
        if best is None:
            return
        reported_at = datetime.fromisoformat(best["reported_at"])
        age_days = (now - reported_at).total_seconds() / 86400
        if best["source"] == "member_submit" and age_days <= EXACT_MAX_AGE_DAYS:
            confidence = "exact"
        elif age_days <= FRESH_MAX_AGE_DAYS:
            confidence = "estimate"
        else:
            confidence = "stale"
        self.repo.update_estimate(
            player_id=player_id, player_name=best["player_name"], source=best["source"],
            strength=best["strength"], defense=best["defense"], speed=best["speed"],
            dexterity=best["dexterity"], total=best["total"], confidence=confidence,
            reported_at=best["reported_at"],
        )
