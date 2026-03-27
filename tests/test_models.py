from app.models import FactionMember, WarStatus, MemberBars


def test_parse_faction_member():
    raw = {
        "id": 467331,
        "name": "Maukun",
        "level": 92,
        "days_in_faction": 1298,
        "last_action": {"status": "Offline", "timestamp": 1774592942, "relative": "2 hours ago"},
        "status": {"description": "Okay", "details": None, "state": "Okay", "color": "green", "until": None},
        "position": "Team 3",
        "is_on_wall": False,
        "is_revivable": False,
        "is_in_oc": True,
    }
    m = FactionMember(**raw)
    assert m.name == "Maukun"
    assert m.last_action.status == "Offline"
    assert m.status.state == "Okay"


def test_parse_war_status_active():
    raw = {
        "war_id": 39363,
        "start": 1774630800,
        "end": None,
        "target": 11800,
        "winner": None,
        "factions": [
            {"id": 9420, "name": "The Pusheen Army", "score": 0, "chain": 0},
            {"id": 11559, "name": "The Masters", "score": 0, "chain": 0},
        ],
    }
    w = WarStatus(**raw)
    assert w.war_id == 39363
    assert len(w.factions) == 2
    assert w.factions[0].name == "The Pusheen Army"


def test_parse_war_status_none():
    w = WarStatus(war_id=None, start=None, end=None, target=None, winner=None, factions=[])
    assert w.war_id is None


def test_parse_member_bars():
    raw = {
        "energy": {"current": 900, "maximum": 150},
        "happy": {"current": 4525, "maximum": 4525},
        "cooldowns": {"drug": 17919, "medical": 0, "booster": 89600},
    }
    b = MemberBars(**raw)
    assert b.energy.current == 900
    assert b.energy.maximum == 150
    assert b.is_stacking is True
    assert b.cooldowns.drug == 17919


def test_member_bars_not_stacking():
    raw = {
        "energy": {"current": 100, "maximum": 150},
        "happy": {"current": 4525, "maximum": 4525},
        "cooldowns": {"drug": 0, "medical": 0, "booster": 0},
    }
    b = MemberBars(**raw)
    assert b.is_stacking is False
    assert b.cooldowns.drug == 0
