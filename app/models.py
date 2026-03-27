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
