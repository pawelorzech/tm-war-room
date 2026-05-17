"""Table-driven tests for the chat entity resolver.

Covers all four entity kinds with positive and negative cases, plus
ordering, span correctness, and overlap handling.
"""

from __future__ import annotations

import pytest

from api.chat_entities import EntityRef, find_entities, find_entities_as_dicts


# ---------------------------------------------------------------------------
# Player entities
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "content,expected",
    [
        # 1 — full URL with scheme + www
        ("hit https://www.torn.com/profiles.php?XID=2362436 now", [("player", 2362436)]),
        # 2 — without scheme
        ("see torn.com/profiles.php?XID=12345", [("player", 12345)]),
        # 3 — without www but with scheme
        ("https://torn.com/profiles.php?XID=999", [("player", 999)]),
        # 4 — extra query params before XID
        ("torn.com/profiles.php?sid=attack&XID=42&user2ID=1", [("player", 42)]),
        # 5 — lowercase xid still works
        ("torn.com/profiles.php?xid=77", [("player", 77)]),
        # 6 — bracket shorthand
        ("ping [2362436] for backup", [("player", 2362436)]),
        # 7 — bracket shorthand short id (still 3+ digits)
        ("[100]", [("player", 100)]),
        # 8 — @mention
        ("yo @Bombel ready?", [("player", None)]),
        # 9 — @mention with digits/underscores
        ("hi @Wolf_99", [("player", None)]),
        # 10 — multiple players in one message
        (
            "torn.com/profiles.php?XID=1 vs [2222] vs @Foo",
            [("player", 1), ("player", 2222), ("player", None)],
        ),
        # 11 — negative: too-short bracket digit ([12] won't trigger — min 3)
        ("[12]", []),
        # 12 — negative: @mention with too few chars
        ("@ab", []),
        # 13 — negative: malformed URL (missing XID value)
        ("torn.com/profiles.php?XID=", []),
        # 14 — negative: email-shaped @ (lookbehind blocks)
        ("hello@example.com", []),
    ],
)
def test_player_entities(content: str, expected: list[tuple[str, int | None]]) -> None:
    result = [(e.kind, e.id) for e in find_entities(content)]
    assert result == expected


# ---------------------------------------------------------------------------
# Faction entities
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "content,expected",
    [
        ("torn.com/factions.php?step=profile&ID=11559", [("faction", 11559)]),
        ("https://www.torn.com/factions.php?step=profile&ID=1", [("faction", 1)]),
        ("hit torn.com/factions.php?ID=42&step=profile please", [("faction", 42)]),
        ("torn.com/factions.php?step=profile&ID=999&extra=x", [("faction", 999)]),
        ("torn.com/factions.php?STEP=profile&ID=10", [("faction", 10)]),
        ("torn.com/factions.php?step=PROFILE&id=20", [("faction", 20)]),
        # negative: no step → ignored
        ("torn.com/factions.php?ID=1", []),
        # negative: step != profile
        ("torn.com/factions.php?step=main&ID=1", []),
        # negative: missing ID
        ("torn.com/factions.php?step=profile", []),
        # negative: malformed ID
        ("torn.com/factions.php?step=profile&ID=abc", []),
        # two factions in one message
        (
            "torn.com/factions.php?step=profile&ID=1 vs torn.com/factions.php?step=profile&ID=2",
            [("faction", 1), ("faction", 2)],
        ),
    ],
)
def test_faction_entities(content: str, expected: list[tuple[str, int]]) -> None:
    result = [(e.kind, e.id) for e in find_entities(content)]
    assert result == expected


# ---------------------------------------------------------------------------
# Item entities
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "content,expected",
    [
        # URL forms — id present
        ("torn.com/item.php?XID=206", [("item", 206)]),
        ("https://www.torn.com/item.php?XID=180", [("item", 180)]),
        ("look at torn.com/item.php?XID=1 plox", [("item", 1)]),
        ("torn.com/item.php?xid=42", [("item", 42)]),
        # Bracket shorthand — id unresolved
        ("anyone selling [Xanax]?", [("item", None)]),
        ("trade [Six Pack of Energy Drink] for chain", [("item", None)]),
        ("[First Aid Kit]", [("item", None)]),
        # Apostrophes / hyphens allowed in names
        ("got [Eau-de-Vie]", [("item", None)]),
        # negative: malformed URL
        ("torn.com/item.php?XID=", []),
        # negative: too short bracket name
        ("[a]", []),
        # negative: digits-only bracket → player (covered elsewhere), not item
        ("[12345]", [("player", 12345)]),
        # mix: url + bracket name in one message
        (
            "torn.com/item.php?XID=180 also [Plushie]",
            [("item", 180), ("item", None)],
        ),
    ],
)
def test_item_entities(content: str, expected: list[tuple[str, int | None]]) -> None:
    result = [(e.kind, e.id) for e in find_entities(content)]
    assert result == expected


# ---------------------------------------------------------------------------
# Rankedwar entities
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "content,expected",
    [
        ("torn.com/factions.php?step=rankedwar&ID=12345", [("rankedwar", 12345)]),
        (
            "https://www.torn.com/factions.php?step=rankedwar&ID=99",
            [("rankedwar", 99)],
        ),
        ("torn.com/factions.php?ID=7&step=rankedwar", [("rankedwar", 7)]),
        ("torn.com/rankedwars/4242", [("rankedwar", 4242)]),
        ("see https://torn.com/rankedwars/1 live", [("rankedwar", 1)]),
        ("https://www.torn.com/rankedwars/55", [("rankedwar", 55)]),
        # uppercase step value
        ("torn.com/factions.php?step=RANKEDWAR&ID=8", [("rankedwar", 8)]),
        # negative: step=profile is not a rankedwar
        ("torn.com/factions.php?step=profile&ID=10", [("faction", 10)]),
        # negative: malformed rankedwars path
        ("torn.com/rankedwars/", []),
        # negative: extra dir after path-id
        # rankedwars/4242 still matches even with trailing text
        ("torn.com/rankedwars/4242/something", [("rankedwar", 4242)]),
        # two rankedwars in one message
        (
            "torn.com/rankedwars/1 then torn.com/rankedwars/2",
            [("rankedwar", 1), ("rankedwar", 2)],
        ),
    ],
)
def test_rankedwar_entities(content: str, expected: list[tuple[str, int]]) -> None:
    result = [(e.kind, e.id) for e in find_entities(content)]
    assert result == expected


# ---------------------------------------------------------------------------
# Mixed / ordering / overlap
# ---------------------------------------------------------------------------


def test_entities_returned_in_source_order() -> None:
    content = (
        "first [Xanax] then torn.com/profiles.php?XID=1 then @Bob and "
        "torn.com/factions.php?step=profile&ID=11559 ends"
    )
    refs = find_entities(content)
    assert [r.kind for r in refs] == ["item", "player", "player", "faction"]
    # spans strictly increasing
    spans = [r.span[0] for r in refs]
    assert spans == sorted(spans)


def test_spans_extract_back_to_raw() -> None:
    content = "hit https://www.torn.com/profiles.php?XID=42 NOW"
    refs = find_entities(content)
    assert len(refs) == 1
    s, e = refs[0].span
    assert content[s:e] == refs[0].raw
    assert refs[0].raw == "https://www.torn.com/profiles.php?XID=42"


def test_empty_input_returns_empty_list() -> None:
    assert find_entities("") == []
    assert find_entities("   ") == []
    assert find_entities("no entities here, just plain text") == []


def test_dict_serialisation_shape() -> None:
    dicts = find_entities_as_dicts("torn.com/profiles.php?XID=2362436")
    assert dicts == [
        {
            "kind": "player",
            "raw": "torn.com/profiles.php?XID=2362436",
            "id": 2362436,
            "span": [0, 33],
        }
    ]


def test_no_overlapping_spans() -> None:
    # URL form should win — the trailing digits aren't separately re-detected
    # as a player shorthand.
    content = "torn.com/profiles.php?XID=2362436"
    refs = find_entities(content)
    assert len(refs) == 1
    assert refs[0].kind == "player"
    assert refs[0].id == 2362436


def test_entity_ref_to_dict_preserves_fields() -> None:
    ref = EntityRef(kind="player", raw="[123]", id=123, span=(0, 5))
    assert ref.to_dict() == {
        "kind": "player",
        "raw": "[123]",
        "id": 123,
        "span": [0, 5],
    }


def test_no_io_or_external_calls() -> None:
    """Sanity: find_entities never touches the network.

    Implemented by simply asserting the module imports without any of the
    suspicious heavy deps. The real guarantee is in the source — pure regex.
    """
    import api.chat_entities as mod

    # The module must not import any HTTP / DB clients
    forbidden = {"httpx", "requests", "sqlite3", "aiohttp", "urllib.request"}
    src = open(mod.__file__).read()
    for name in forbidden:
        assert f"import {name}" not in src
        assert f"from {name}" not in src
