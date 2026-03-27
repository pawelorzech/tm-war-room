from __future__ import annotations

from pydantic import BaseModel


class LastAction(BaseModel):
    status: str
    timestamp: int
    relative: str


class MemberStatus(BaseModel):
    description: str
    details: str | None = None
    state: str
    color: str
    until: int | None = None


class FactionMember(BaseModel):
    id: int
    name: str
    level: int
    days_in_faction: int
    last_action: LastAction
    status: MemberStatus
    position: str
    is_on_wall: bool = False
    is_revivable: bool = False
    is_in_oc: bool = False


class WarFaction(BaseModel):
    id: int
    name: str
    score: int
    chain: int


class WarStatus(BaseModel):
    war_id: int | None
    start: int | None
    end: int | None
    target: int | None
    winner: int | None
    factions: list[WarFaction]


class Bar(BaseModel):
    current: int
    maximum: int


class Cooldowns(BaseModel):
    drug: int = 0
    medical: int = 0
    booster: int = 0


class MemberBars(BaseModel):
    energy: Bar
    happy: Bar
    cooldowns: Cooldowns

    @property
    def is_stacking(self) -> bool:
        return self.energy.current > self.energy.maximum


class OverviewResponse(BaseModel):
    members: list[FactionMember]
    war: WarStatus | None
    cached_at: int


class MemberDetail(BaseModel):
    player_id: int
    name: str
    bars: MemberBars | None = None
    error: str | None = None


class DetailResponse(BaseModel):
    members: list[MemberDetail]
    cached_at: int


class PersonalStats(BaseModel):
    xanax_taken: int = 0
    refills: int = 0
    stat_enhancers_used: int = 0
    attacks_won: int = 0
    attacks_lost: int = 0
    defends_won: int = 0
    defends_lost: int = 0
    networth: int = 0
    highest_beaten: int = 0
    best_damage: int = 0
    best_kill_streak: int = 0
    damage_done: int = 0

    @classmethod
    def from_torn_api(cls, raw: dict) -> "PersonalStats":
        """Parse from Torn API v1 personalstats (lowercase keys)."""
        return cls(
            xanax_taken=raw.get("xantaken", 0),
            refills=raw.get("refills", 0),
            stat_enhancers_used=raw.get("statenhancersused", 0),
            attacks_won=raw.get("attackswon", 0),
            attacks_lost=raw.get("attackslost", 0),
            defends_won=raw.get("defendswon", 0),
            defends_lost=raw.get("defendslost", 0),
            networth=raw.get("networth", 0),
            highest_beaten=raw.get("highestbeaten", 0),
            best_damage=raw.get("bestdamage", 0),
            best_kill_streak=raw.get("bestkillstreak", 0),
            damage_done=raw.get("attackdamage", 0),
        )

    @classmethod
    def from_tornstats(cls, raw: dict) -> "PersonalStats":
        return cls(
            xanax_taken=raw.get("Xanax Taken", 0),
            refills=raw.get("Refills", 0),
            stat_enhancers_used=raw.get("Stat Enhancers Used", 0),
            attacks_won=raw.get("Attacks Won", 0),
            attacks_lost=raw.get("Attacks Lost", 0),
            defends_won=raw.get("Defends Won", 0),
            defends_lost=raw.get("Defends Lost", 0),
            networth=raw.get("Networth", 0),
            highest_beaten=raw.get("Highest Level Beaten", 0),
            best_damage=raw.get("Best Damage Made", 0),
            best_kill_streak=raw.get("Best Kill Streak", 0),
            damage_done=raw.get("Damage Done", 0),
        )


class FactionInfo(BaseModel):
    id: int
    name: str
    tag: str = ""
    respect: int = 0
    members_count: int = 0
    rank_name: str = ""
    rank_level: int = 0
    best_chain: int = 0
    wins: int = 0
