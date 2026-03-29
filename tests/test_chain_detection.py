"""Tests for _detect_chains() from api/routers/chain.py."""
import pytest
from api.routers.chain import _detect_chains, CHAIN_BONUS_HITS


def _attack(chain: int, attacker_id: int = 1, attacker_name: str = "Alice",
            started: int = 1000, ended: int = 1010, respect_gain: float = 1.0) -> dict:
    """Helper to build a minimal attack dict."""
    return {
        "chain": chain,
        "attacker_id": attacker_id,
        "attacker_name": attacker_name,
        "started": started,
        "ended": ended,
        "respect_gain": respect_gain,
    }


class TestDetectChainsEmpty:
    def test_empty_list_returns_no_chains(self):
        assert _detect_chains([]) == []

    def test_non_chain_attacks_return_no_chains(self):
        """Attacks with chain=0 are not part of any chain."""
        attacks = [_attack(chain=0, started=100), _attack(chain=0, started=200)]
        assert _detect_chains(attacks) == []


class TestDetectChainsSingle:
    def test_single_hit_chain(self):
        """A chain=1 attack alone creates a chain of length 1."""
        attacks = [_attack(chain=1, started=100, ended=110, respect_gain=2.5)]
        chains = _detect_chains(attacks)
        assert len(chains) == 1
        c = chains[0]
        assert c["max_chain"] == 1
        assert c["hits"] == 1
        assert c["total_respect"] == 2.5
        assert c["member_count"] == 1
        assert c["start_ts"] == 100
        assert c["end_ts"] == 110

    def test_simple_chain_of_five(self):
        attacks = [
            _attack(chain=1, started=100, ended=110, attacker_id=1, attacker_name="A", respect_gain=1.0),
            _attack(chain=2, started=120, ended=130, attacker_id=2, attacker_name="B", respect_gain=2.0),
            _attack(chain=3, started=140, ended=150, attacker_id=1, attacker_name="A", respect_gain=3.0),
            _attack(chain=4, started=160, ended=170, attacker_id=3, attacker_name="C", respect_gain=1.5),
            _attack(chain=5, started=180, ended=190, attacker_id=2, attacker_name="B", respect_gain=2.5),
        ]
        chains = _detect_chains(attacks)
        assert len(chains) == 1
        c = chains[0]
        assert c["max_chain"] == 5
        assert c["hits"] == 5
        assert c["total_respect"] == 10.0
        assert c["member_count"] == 3
        assert c["start_ts"] == 100
        assert c["end_ts"] == 190
        assert c["starter_name"] == "A"
        assert c["starter_id"] == 1
        assert c["ender_name"] == "B"
        assert c["ender_id"] == 2

    def test_top_hitter_is_calculated(self):
        """The member with most total respect should be top hitter."""
        attacks = [
            _attack(chain=1, attacker_id=10, attacker_name="Low", started=100, ended=110, respect_gain=1.0),
            _attack(chain=2, attacker_id=20, attacker_name="High", started=120, ended=130, respect_gain=10.0),
            _attack(chain=3, attacker_id=10, attacker_name="Low", started=140, ended=150, respect_gain=1.0),
        ]
        chains = _detect_chains(attacks)
        assert chains[0]["top_hitter_name"] == "High"
        assert chains[0]["top_hitter_id"] == 20
        assert chains[0]["top_hitter_respect"] == 10.0

    def test_duration_calculated(self):
        attacks = [
            _attack(chain=1, started=1000, ended=1005),
            _attack(chain=2, started=1050, ended=1060),
        ]
        chains = _detect_chains(attacks)
        assert chains[0]["duration"] == 1060 - 1000


class TestDetectChainsMultiple:
    def test_two_separate_chains(self):
        """chain=1 appearing again marks the start of a new chain."""
        attacks = [
            _attack(chain=1, started=100, ended=110, attacker_id=1),
            _attack(chain=2, started=120, ended=130, attacker_id=2),
            _attack(chain=3, started=140, ended=150, attacker_id=1),
            # New chain starts here
            _attack(chain=1, started=500, ended=510, attacker_id=3),
            _attack(chain=2, started=520, ended=530, attacker_id=4),
        ]
        chains = _detect_chains(attacks)
        assert len(chains) == 2
        # Result is newest-first
        assert chains[0]["start_ts"] == 500
        assert chains[0]["max_chain"] == 2
        assert chains[0]["hits"] == 2
        assert chains[1]["start_ts"] == 100
        assert chains[1]["max_chain"] == 3
        assert chains[1]["hits"] == 3

    def test_three_chains_returned_newest_first(self):
        attacks = [
            _attack(chain=1, started=100, ended=110),
            _attack(chain=1, started=200, ended=210),
            _attack(chain=1, started=300, ended=310),
        ]
        chains = _detect_chains(attacks)
        assert len(chains) == 3
        assert chains[0]["start_ts"] == 300
        assert chains[1]["start_ts"] == 200
        assert chains[2]["start_ts"] == 100


class TestDetectChainsWithGaps:
    def test_chain_zero_attacks_between_chains(self):
        """Non-chain attacks (chain=0) between two chains don't affect detection."""
        attacks = [
            _attack(chain=1, started=100, ended=110),
            _attack(chain=2, started=120, ended=130),
            # Gap: non-chain attacks
            _attack(chain=0, started=200, ended=210),
            _attack(chain=0, started=220, ended=230),
            # Second chain
            _attack(chain=1, started=300, ended=310),
            _attack(chain=2, started=320, ended=330),
        ]
        chains = _detect_chains(attacks)
        assert len(chains) == 2
        assert chains[1]["max_chain"] == 2
        assert chains[0]["max_chain"] == 2

    def test_chain_zero_before_first_chain(self):
        """Non-chain attacks before any chain=1 are ignored."""
        attacks = [
            _attack(chain=0, started=50, ended=60),
            _attack(chain=0, started=70, ended=80),
            _attack(chain=1, started=100, ended=110),
            _attack(chain=2, started=120, ended=130),
        ]
        chains = _detect_chains(attacks)
        assert len(chains) == 1
        assert chains[0]["hits"] == 2


class TestDetectChainsNumberReset:
    def test_chain_number_reset_to_one(self):
        """When chain goes from e.g. 50 back to 1, a new chain starts."""
        attacks = [
            _attack(chain=1, started=100, ended=110, attacker_id=1),
        ]
        # Build a chain up to 50
        for i in range(2, 51):
            attacks.append(_attack(chain=i, started=100 + i * 10, ended=110 + i * 10, attacker_id=i % 5 + 1))
        # New chain resets to 1
        attacks.append(_attack(chain=1, started=2000, ended=2010, attacker_id=10))
        attacks.append(_attack(chain=2, started=2020, ended=2030, attacker_id=11))

        chains = _detect_chains(attacks)
        assert len(chains) == 2
        # Newest first
        assert chains[0]["max_chain"] == 2
        assert chains[1]["max_chain"] == 50

    def test_consecutive_chain_ones_create_separate_chains(self):
        """Multiple chain=1 in a row means multiple single-hit chains."""
        attacks = [
            _attack(chain=1, started=100, ended=110, attacker_id=1, respect_gain=1.0),
            _attack(chain=1, started=200, ended=210, attacker_id=2, respect_gain=2.0),
            _attack(chain=1, started=300, ended=310, attacker_id=3, respect_gain=3.0),
        ]
        chains = _detect_chains(attacks)
        assert len(chains) == 3
        # Each is a single-hit chain
        for c in chains:
            assert c["hits"] == 1
            assert c["max_chain"] == 1


class TestDetectChainsBonusHits:
    def test_bonus_hit_at_ten(self):
        """Chain number 10 should be recorded as a bonus hit."""
        attacks = [_attack(chain=1, started=100, ended=110, attacker_id=1)]
        for i in range(2, 11):
            attacks.append(
                _attack(chain=i, started=100 + i * 10, ended=110 + i * 10,
                        attacker_id=99, attacker_name="BonusHitter")
            )
        chains = _detect_chains(attacks)
        assert len(chains) == 1
        bonus = chains[0]["bonus_hits"]
        assert len(bonus) == 1
        assert bonus[0]["chain"] == 10
        assert bonus[0]["attacker_name"] == "BonusHitter"

    def test_multiple_bonus_hits(self):
        attacks = [_attack(chain=1, started=100, ended=110)]
        for i in range(2, 101):
            attacks.append(_attack(chain=i, started=100 + i, ended=110 + i,
                                   attacker_id=i, attacker_name=f"P{i}"))
        chains = _detect_chains(attacks)
        bonus_chains = {b["chain"] for b in chains[0]["bonus_hits"]}
        # Should contain 10, 25, 50, 100
        assert {10, 25, 50, 100}.issubset(bonus_chains)


class TestDetectChainsEdgeCases:
    def test_missing_attacker_name_uses_id_fallback(self):
        attacks = [
            {
                "chain": 1, "attacker_id": 42, "attacker_name": None,
                "started": 100, "ended": 110, "respect_gain": 1.0,
            }
        ]
        chains = _detect_chains(attacks)
        assert chains[0]["starter_name"] == "#42"
        assert chains[0]["top_hitter_name"] == "#42"

    def test_none_respect_treated_as_zero(self):
        attacks = [
            {
                "chain": 1, "attacker_id": 1, "attacker_name": "A",
                "started": 100, "ended": 110, "respect_gain": None,
            },
            {
                "chain": 2, "attacker_id": 2, "attacker_name": "B",
                "started": 120, "ended": 130, "respect_gain": None,
            },
        ]
        chains = _detect_chains(attacks)
        assert chains[0]["total_respect"] == 0
