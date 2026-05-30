"""Slack-syntax chat search parser + FTS5 SQL builder (Roadmap Task #5).

Supported operators
-------------------

* ``from:Name`` or ``from:@Name``  → match by author name (case-insensitive
  substring on ``chat_messages.player_name``)
* ``in:channel-name``              → match by channel slug
* ``has:link``                     → message body contains an http(s) URL
* ``has:reaction``                 → message has ≥1 reaction
* ``has:pin``                      → message is pinned
* ``before:YYYY-MM-DD``            → ``created_at`` < midnight UTC of that day
* ``after:YYYY-MM-DD``             → ``created_at`` ≥ midnight UTC of that day
* ``-word``                        → exclude messages containing ``word``
* free text                        → FTS5 MATCH on ``content``

Unknown operators (``foo:bar``) fall through as free-text tokens so we
don't punish the user for typos.

This module is pure-Python — no DB I/O. ``build_search_sql`` returns
``(sql, params)`` for the caller to execute against the chat DB.
"""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass, field

__all__ = ["ParsedQuery", "parse_query", "build_search_sql", "MAX_LIMIT"]

# Defence: cap returned rows even if the caller passes a huge limit. FTS
# scoring is fast but pagination + frontend rendering aren't.
MAX_LIMIT = 200

_VALID_HAS = {"link", "reaction", "pin"}

# Token regex: capture operator:value pairs (value may be quoted, bare,
# or absent), bare negation ``-word``, or a plain word. Whitespace is the
# separator. ``op:`` with an empty value is captured so the parser can
# drop it instead of leaking the literal into free text.
_TOKEN_RE = re.compile(
    r"""
    (?:
        (?P<op>[A-Za-z]+):                # operator:
        (?:
            "(?P<qval>[^"]*)"             #   "quoted value"
            |
            (?P<bval>[^\s"]+)             #   bare value
        )?
    )
    |
    (?:-(?P<neg>\S+))                     # -negated_word
    |
    (?P<word>\S+)                         # bare word
    """,
    re.VERBOSE,
)


@dataclass
class ParsedQuery:
    text: str = ""
    neg_text: list[str] = field(default_factory=list)
    from_name: str | None = None
    in_channel: str | None = None
    has: list[str] = field(default_factory=list)
    before_ts_max: int | None = None
    after_ts_min: int | None = None


def _parse_iso_date(s: str) -> int | None:
    """Return midnight UTC epoch for YYYY-MM-DD, else None."""
    try:
        d = datetime.date.fromisoformat(s)
    except ValueError:
        return None
    return int(
        datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp()
    )


def parse_query(query: str) -> ParsedQuery:
    """Parse a Slack-style search string into a :class:`ParsedQuery`."""
    out = ParsedQuery()
    if not query or not query.strip():
        return out

    free_text_words: list[str] = []

    for m in _TOKEN_RE.finditer(query):
        op = (m.group("op") or "").lower()
        val = m.group("qval") if m.group("qval") is not None else m.group("bval")
        neg = m.group("neg")
        word = m.group("word")

        if op:
            if not val:
                # ``from:`` with empty value — drop it so the user's intent
                # (a partial query they're about to finish typing) doesn't
                # leak into FTS as literal text.
                continue
            if op == "from":
                out.from_name = val.lstrip("@")
                continue
            if op == "in":
                out.in_channel = val.lstrip("#")
                continue
            if op == "has":
                v = val.lower()
                if v in _VALID_HAS and v not in out.has:
                    out.has.append(v)
                # Drop unsupported has: flags silently — don't pollute text.
                continue
            if op == "before":
                ts = _parse_iso_date(val)
                if ts is not None:
                    out.before_ts_max = ts
                continue
            if op == "after":
                ts = _parse_iso_date(val)
                if ts is not None:
                    out.after_ts_min = ts
                continue
            # Unknown operator: fall through as text.
            free_text_words.append(f"{op}:{val}")
            continue

        if neg:
            out.neg_text.append(neg)
            continue
        if word:
            free_text_words.append(word)

    out.text = " ".join(free_text_words).strip()
    return out


def _fts_phrase(text: str) -> str:
    """Quote a free-text term as an FTS5 phrase, escaping embedded quotes.

    FTS5 treats ``"`` as a phrase delimiter; embedded ``"`` is represented
    by ``""``. Wrapping the whole string in a phrase neutralises operators
    like ``AND OR NOT NEAR`` that would otherwise be honoured.
    """
    escaped = text.replace('"', '""')
    return f'"{escaped}"'


def build_search_sql(
    parsed: ParsedQuery, *, limit: int = 50, offset: int = 0
) -> tuple[str, list]:
    """Build the SELECT + WHERE clause for an FTS5-driven message search.

    Returns ``(sql, params)`` ready to pass to ``conn.execute(sql, params)``.

    The result columns are the same shape the existing chat repo returns
    for ``get_messages``, plus a ``snippet`` column with the FTS5 snippet
    string for inline highlighting.
    """
    where: list[str] = ["m.deleted = 0"]
    params: list = []

    # FTS MATCH expression: combine free text + negations into one MATCH
    # argument so we hit the index once instead of joining FTS multiple
    # times.
    match_terms: list[str] = []
    if parsed.text:
        match_terms.append(_fts_phrase(parsed.text))
    for n in parsed.neg_text:
        match_terms.append(f"NOT {_fts_phrase(n)}")

    # Base query: when there's any FTS term we join via the FTS table to
    # get scoring + snippet. Otherwise we just filter chat_messages.
    if match_terms:
        match_expr = " ".join(match_terms)
        sql = (
            "SELECT m.id, m.channel_id, m.thread_id, m.player_id, m.player_name, "
            "m.content, m.bot_id, m.mentions, m.pinned, m.deleted, m.created_at, "
            "m.edited_at, "
            "snippet(chat_messages_fts, 0, '\x01', '\x02', '…', 16) AS snippet "
            "FROM chat_messages_fts f "
            "JOIN chat_messages m ON m.id = f.rowid "
        )
        where.insert(0, "chat_messages_fts MATCH ?")
        params.append(match_expr)
    else:
        sql = (
            "SELECT m.id, m.channel_id, m.thread_id, m.player_id, m.player_name, "
            "m.content, m.bot_id, m.mentions, m.pinned, m.deleted, m.created_at, "
            "m.edited_at, "
            "NULL AS snippet "
            "FROM chat_messages m "
        )

    if parsed.from_name:
        where.append("LOWER(m.player_name) = LOWER(?)")
        params.append(parsed.from_name)

    if parsed.in_channel:
        # Channel filter joins chat_channels by slug-style name (we keep
        # this loose so '#war-room' and 'war-room' both work).
        sql += "JOIN chat_channels c ON c.id = m.channel_id "
        where.append("LOWER(c.name) = LOWER(?)")
        params.append(parsed.in_channel)

    if parsed.before_ts_max is not None:
        where.append("m.created_at < ?")
        params.append(parsed.before_ts_max)
    if parsed.after_ts_min is not None:
        where.append("m.created_at >= ?")
        params.append(parsed.after_ts_min)

    if "link" in parsed.has:
        where.append("(m.content LIKE ? OR m.content LIKE ?)")
        params.extend(["%http://%", "%https://%"])
    if "pin" in parsed.has:
        where.append("m.pinned = 1")
    if "reaction" in parsed.has:
        where.append("EXISTS (SELECT 1 FROM chat_reactions r WHERE r.message_id = m.id)")

    sql += "WHERE " + " AND ".join(where) + " "

    # Ordering: FTS results by rank when MATCH is present, otherwise by
    # created_at DESC (most recent first).
    if match_terms:
        sql += "ORDER BY f.rank, m.created_at DESC "
    else:
        sql += "ORDER BY m.created_at DESC "

    capped_limit = max(1, min(int(limit), MAX_LIMIT))
    sql += "LIMIT ? OFFSET ?"
    params.append(capped_limit)
    params.append(max(0, int(offset)))

    return sql, params
