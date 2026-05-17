"""``/chain`` slash-command implementation (Roadmap Task #10).

Parses the args, validates the subcommand, creates / closes a
``chain_assists`` row, and writes a bot-message in the channel whose
content uses a stable marker (``:chain-assist:<assist_id>:``) so both the
main frontend and the companion dock render a live card.

The router (``api/routers/chat.py``) wires this in via
``default_registry.register("chain", ...)`` at import time.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from api.chat_commands import CommandResult, default_registry

logger = logging.getLogger("tm-hub.chat.chain")

# ── External hooks (set by main.py) ───────────────────────────
chain_assist_repo: Any = None
chat_repo: Any = None
chat_manager: Any = None
key_store: Any = None
torn_client: Any = None


# Card marker: stable token the bot writes into chat_messages.content so
# every renderer recognises an assist card without a schema change.
# Frontend MessageBubble + companion dock both regex for it.
CARD_MARKER_RE = re.compile(r":chain-assist:(\d+):")

# Permitted subcommands.
_SUBCOMMANDS = {"target", "end"}

# Player-id extractors: numeric, [12345] shorthand, profile URL.
_ID_RE = re.compile(r"(?:^|[\[\?#&])(?:XID=|\b)(\d{3,12})")


def parse_chain_args(args: str) -> tuple[str, int | None] | None:
    """Pure parser: ``(subcommand, target_id_or_None) | None``.

    * ``target NNN`` / ``target [NNN]`` / ``target <profile URL>``
    * ``end`` — close the current assist (no target id needed)
    """
    if not args:
        return None
    parts = args.strip().split(None, 1)
    sub = parts[0].lower() if parts else ""
    if sub not in _SUBCOMMANDS:
        return None
    if sub == "end":
        return ("end", None)
    if len(parts) < 2:
        return None
    rest = parts[1].strip()
    if rest.isdigit():
        return ("target", int(rest))
    # [NNN] bracket
    if rest.startswith("[") and rest.endswith("]") and rest[1:-1].isdigit():
        return ("target", int(rest[1:-1]))
    # Profile URL
    m = _ID_RE.search(rest)
    if m:
        return ("target", int(m.group(1)))
    return None


def _make_card_content(assist_id: int, target_name: str, target_id: int) -> str:
    """Bot message body. Renderers regex out the marker; the human-readable
    rest is the fallback shown when a renderer doesn't know about cards."""
    return (
        f":chain-assist:{assist_id}: 🔗 Chain target: "
        f"{target_name or 'Player'} [{target_id}] — click the card to join."
    )


async def _handle_chain(player_id: int, args: str, channel_id: int) -> CommandResult:
    """`/chain target NNN` or `/chain end`."""
    if chain_assist_repo is None or chat_repo is None or chat_manager is None:
        return CommandResult(
            message_back="Chain assist is not available right now.",
            broadcast=False,
        )

    parsed = parse_chain_args(args)
    if parsed is None:
        return CommandResult(
            message_back=(
                "Usage:\n"
                "  `/chain target 2362436`        — start an assist\n"
                "  `/chain target [2362436]`      — same, bracket form\n"
                "  `/chain target <profile URL>`  — same, paste a profile link\n"
                "  `/chain end`                   — close the current assist"
            ),
            broadcast=False,
        )

    sub, target_id = parsed

    # /chain end
    if sub == "end":
        active = chain_assist_repo.get_active_for_channel(channel_id)
        if not active:
            return CommandResult(
                message_back="No active chain assist in this channel.",
                broadcast=False,
            )
        chain_assist_repo.end(active["id"])
        try:
            await chat_manager.broadcast({
                "type": "chain_assist_update",
                "payload": {"assist_id": active["id"], "ended": True},
            })
        except Exception:  # noqa: BLE001
            pass
        return CommandResult(
            message_back=f"Chain assist on {active.get('target_name') or active.get('target_id')} closed.",
            broadcast=False,
        )

    # /chain target NNN — close any previous active assist first.
    existing = chain_assist_repo.get_active_for_channel(channel_id)
    if existing:
        chain_assist_repo.end(existing["id"])
        try:
            await chat_manager.broadcast({
                "type": "chain_assist_update",
                "payload": {"assist_id": existing["id"], "ended": True},
            })
        except Exception:  # noqa: BLE001
            pass

    # Best-effort live target lookup. We don't FAIL the command if it
    # 404s — the card is still useful with just the ID; the scheduler
    # poll fills in details on the next 30s tick.
    target_name = f"Player {target_id}"
    target_state = ""
    if torn_client is not None:
        try:
            data = await torn_client.fetch_user_basic(target_id)
            if data:
                target_name = data.get("name") or target_name
                status = data.get("status") or {}
                target_state = status.get("state", "") if isinstance(status, dict) else ""
        except Exception as e:  # noqa: BLE001
            logger.warning("/chain target %s: fetch_user_basic failed: %s", target_id, e)

    leader_name = ""
    if key_store is not None:
        info = key_store.get_key(player_id)
        if info:
            leader_name = info["player_name"]

    assist_id = chain_assist_repo.create(
        channel_id=channel_id,
        target_id=target_id,
        target_name=target_name,
        target_status_state=target_state,
        started_by=player_id,
        started_by_name=leader_name or "leader",
    )

    bot_msg = chat_repo.create_message(
        channel_id=channel_id, player_id=0,
        player_name="tm-bot",
        content=_make_card_content(assist_id, target_name, target_id),
        mentions=[],
    )
    chain_assist_repo.attach_message(assist_id, bot_msg["id"])

    try:
        chat_repo.update_read_position(player_id, channel_id, bot_msg["id"])
    except Exception:  # noqa: BLE001
        # Read-position is a quality-of-life update; never let it fail the command.
        pass

    try:
        await chat_manager.broadcast({"type": "message", "payload": bot_msg})
        await chat_manager.broadcast({
            "type": "chain_assist_update",
            "payload": {"assist_id": assist_id, "created": True},
        })
    except Exception:  # noqa: BLE001
        pass

    # The card is the announcement — return ephemeral so the slash text
    # doesn't get echoed back to the leader twice.
    return CommandResult(message_back=None, broadcast=False)


# Register at import time. Idempotent: re-importing during tests overwrites.
default_registry.register(
    "chain", "Coordinate chain attacks: `/chain target <ID>` or `/chain end`",
)(_handle_chain)
