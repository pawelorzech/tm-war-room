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
        return "\u2705 Wszystko OK \u2014 nikt nie ma w\u0142\u0105czonych revives."

    lines = []
    for m in risky_members:
        lines.append(f"\u2022 @{m.name} ({m.revive_setting})")
    member_list = "\n".join(lines)

    if war_active:
        return (
            "\u26a0\ufe0f **UWAGA! Trwa wojna!**\n\n"
            "Nast\u0119puj\u0105cy gracze maj\u0105 w\u0142\u0105czone revives \u2014 "
            "wy\u0142\u0105czcie je natychmiast!\n"
            "Wr\u00f3g mo\u017ce was wskrzesza\u0107 i zabija\u0107 dla punkt\u00f3w.\n\n"
            f"{member_list}\n\n"
            "\U0001F449 Torn \u2192 Settings \u2192 Revive \u2192 \"No one\""
        )
    else:
        return (
            "\U0001F4CB Przypomnienie o revives\n\n"
            "Poni\u017csi gracze maj\u0105 w\u0142\u0105czone revives. "
            "Warto wy\u0142\u0105czy\u0107 przed kolejn\u0105 wojn\u0105:\n\n"
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
