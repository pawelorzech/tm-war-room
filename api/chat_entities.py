"""Detect Torn entities inside chat message text.

Pure regex/parsing — no I/O, no DB, no Torn API calls.

The resolver identifies four kinds of entities:

- ``player``   — ``torn.com/profiles.php?XID=NNN`` URL, ``[NNN]`` shorthand,
                 or ``@PlayerName`` mention. ``id`` is the numeric Torn ID
                 when extractable from the source text; otherwise ``None``
                 (caller resolves names via the mentions list or member map).
- ``faction``  — ``torn.com/factions.php?step=profile&ID=NNN`` URL.
- ``item``     — ``torn.com/item.php?XID=NNN`` URL or ``[ItemName]``
                 bracket-shorthand. ``id`` is ``None`` for the shorthand
                 form (resolution requires the items cache, deferred to the
                 live-data endpoint).
- ``rankedwar``— ``torn.com/factions.php?step=rankedwar&ID=NNN`` URL or
                 ``torn.com/rankedwars/NNN`` path.

The function is intentionally permissive about URL forms — it accepts the
URL with or without scheme/www, and tolerates extra query parameters in any
order. Overlapping matches are resolved in favour of the first (URLs and
explicit forms win over bracket shorthand because they are detected first
and registered in the occupied-span set).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

# Match the Torn host prefix. Scheme + www optional. We anchor with a word
# boundary so we don't match inside other tokens.
_HOST: Final = r"(?:https?://)?(?:www\.)?torn\.com/"

# Query-string body: only characters that appear in legitimate Torn URLs.
# Excludes whitespace and trailing punctuation like ".,;!?)" so a URL at the
# end of a sentence doesn't pull the punctuation in with it.
_QS_BODY: Final = r"[A-Za-z0-9&=#._\-/+%]*"

_TORN_URL: Final = re.compile(
    rf"\b{_HOST}(profiles|item|factions)\.php\?({_QS_BODY})",
    re.IGNORECASE,
)
_RANKEDWARS_PATH: Final = re.compile(
    rf"\b{_HOST}rankedwars/(\d+)",
    re.IGNORECASE,
)
# Numeric bracket shorthand: [123456] → player
_PLAYER_SHORTHAND: Final = re.compile(r"\[(\d{3,12})\]")
# Named bracket shorthand: [Xanax], [Six Pack of Energy Drink] → item (id unknown here)
# Requires leading letter and 2-30 char total to avoid matching e.g. "[a]" or
# markdown link prefixes.
_ITEM_SHORTHAND: Final = re.compile(r"\[([A-Za-z][A-Za-z0-9'\- ]{1,29})\]")
# @mention: 3-25 alnum/underscore chars. Lookbehind excludes URL or email
# contexts.
_MENTION: Final = re.compile(r"(?<![\w./])@([A-Za-z][A-Za-z0-9_-]{2,24})\b")


@dataclass(frozen=True)
class EntityRef:
    kind: str  # 'player' | 'faction' | 'item' | 'rankedwar'
    raw: str  # exact substring from the source content
    id: int | None  # numeric Torn ID when extractable; else None
    span: tuple[int, int]  # (start, end) offsets in source content

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "raw": self.raw,
            "id": self.id,
            "span": [self.span[0], self.span[1]],
        }


def _parse_query(qs: str) -> dict[str, str]:
    """Split ``a=1&b=2`` into ``{"a": "1", "b": "2"}`` with lowercased keys."""
    out: dict[str, str] = {}
    for part in qs.split("&"):
        if not part:
            continue
        if "=" in part:
            k, v = part.split("=", 1)
        else:
            k, v = part, ""
        out[k.lower()] = v
    return out


def find_entities(content: str) -> list[EntityRef]:
    """Return all detected entity references in ``content``, ordered by start offset.

    Non-overlapping: if two patterns would match the same byte range, the one
    detected first wins (URL forms detected before bracket/mention shorthand).
    """
    if not content:
        return []

    found: list[EntityRef] = []
    occupied: list[tuple[int, int]] = []

    def is_free(span: tuple[int, int]) -> bool:
        s, e = span
        return all(not (s < oe and e > os) for os, oe in occupied)

    def add(ref: EntityRef) -> None:
        if is_free(ref.span):
            found.append(ref)
            occupied.append(ref.span)

    # 1. torn.com/{profiles,item,factions}.php?...
    for m in _TORN_URL.finditer(content):
        path = m.group(1).lower()
        params = _parse_query(m.group(2))
        if path == "profiles":
            pid = params.get("xid")
            if pid and pid.isdigit():
                add(EntityRef("player", m.group(0), int(pid), m.span()))
        elif path == "item":
            iid = params.get("xid")
            if iid and iid.isdigit():
                add(EntityRef("item", m.group(0), int(iid), m.span()))
        elif path == "factions":
            step = params.get("step", "").lower()
            fid = params.get("id")
            if fid and fid.isdigit():
                if step == "rankedwar":
                    add(EntityRef("rankedwar", m.group(0), int(fid), m.span()))
                elif step == "profile":
                    add(EntityRef("faction", m.group(0), int(fid), m.span()))

    # 2. torn.com/rankedwars/NNN
    for m in _RANKEDWARS_PATH.finditer(content):
        add(EntityRef("rankedwar", m.group(0), int(m.group(1)), m.span()))

    # 3. [NNN] player shorthand
    for m in _PLAYER_SHORTHAND.finditer(content):
        add(EntityRef("player", m.group(0), int(m.group(1)), m.span()))

    # 4. [ItemName] item shorthand (id unresolved at this layer)
    for m in _ITEM_SHORTHAND.finditer(content):
        # Defensive: the regex already excludes digit-only via the leading
        # [A-Za-z], but keep the guard for clarity.
        if m.group(1).strip().isdigit():
            continue
        add(EntityRef("item", m.group(0), None, m.span()))

    # 5. @PlayerName mention (id unresolved — caller maps via mentions list)
    for m in _MENTION.finditer(content):
        add(EntityRef("player", m.group(0), None, m.span()))

    found.sort(key=lambda r: r.span[0])
    return found


def find_entities_as_dicts(content: str) -> list[dict]:
    """Convenience: return entities as JSON-ready dicts."""
    return [e.to_dict() for e in find_entities(content)]
