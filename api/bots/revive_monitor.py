from __future__ import annotations

import logging
import time

from api.models import FactionMember

logger = logging.getLogger("tm-hub.bots.revive")

BOT_NAME = "Revive Monitor"
CHANNEL_NAME = "revives"

# Throttle state
_last_post_ts: float = 0.0
PEACE_INTERVAL = 3600  # 60 minutes

# Injected by main.py during startup
_notify_mentions_fn = None


async def _noop_notify(*args, **kwargs):
    pass


def _filter_revive_enabled(members: list[FactionMember]) -> list[FactionMember]:
    """Return members whose revive_setting is NOT 'No one'."""
    return [m for m in members if m.revive_setting != "No one"]


def _format_message(risky_members: list[FactionMember], war_active: bool) -> str:
    """Format the bot message based on war state and member list."""
    if not risky_members:
        return "\u2705 All clear \u2014 no one has revives enabled."

    lines = []
    for m in risky_members:
        lines.append(f"\u2022 @{m.name} ({m.revive_setting})")
    member_list = "\n".join(lines)

    if war_active:
        return (
            "\u26a0\ufe0f **WARNING! War is active!**\n\n"
            "The following members have revives enabled \u2014 "
            "disable them immediately!\n"
            "The enemy can revive and kill you for points.\n\n"
            f"{member_list}\n\n"
            "\U0001F449 Torn \u2192 Settings \u2192 Revive \u2192 \"No one\""
        )
    else:
        return (
            "\U0001F4CB Revive reminder\n\n"
            "These members have revives enabled. "
            "Consider disabling before the next war:\n\n"
            f"{member_list}\n\n"
            "\U0001F449 Torn \u2192 Settings \u2192 Revive \u2192 \"No one\""
        )


async def run(
    torn_client,
    chat_repo,
    chat_manager,
    war_active: bool,
    force: bool = False,
) -> dict:
    global _last_post_ts

    now = time.time()
    if not force and not war_active:
        if now - _last_post_ts < PEACE_INTERVAL:
            return {"posted": False, "risky_count": -1, "message": "Throttled (peacetime)"}

    bot = chat_repo.get_bot_by_name(BOT_NAME)
    if not bot or not bot.get("active", 1):
        return {"posted": False, "risky_count": -1, "message": "Bot not found or inactive"}

    channel = chat_repo.get_channel_by_name(CHANNEL_NAME)
    if not channel:
        return {"posted": False, "risky_count": -1, "message": "Channel not found"}

    members = await torn_client.fetch_members()
    risky = _filter_revive_enabled(members)
    content = _format_message(risky, war_active)
    mentions = [m.id for m in risky]

    msg = chat_repo.create_message(
        channel_id=channel["id"],
        player_id=0,
        player_name=bot["name"],
        content=content,
        bot_id=bot["id"],
        mentions=mentions,
    )
    if chat_manager:
        await chat_manager.broadcast({"type": "message", "payload": msg})

    notify = _notify_mentions_fn or _noop_notify
    await notify(mentions, bot["name"], content, channel["id"])

    _last_post_ts = now
    logger.info("Revive monitor posted: %d risky members, war=%s", len(risky), war_active)

    return {"posted": True, "risky_count": len(risky), "message": content}
