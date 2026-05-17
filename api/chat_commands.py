"""Slash-command framework for chat messages.

Layered design — each layer is independently testable:

  1. ``parse_command_invocation(content) -> (name, args) | None``
     Pure text parsing. Decides whether a chat message looks like a
     slash-command (``/foo arg1 arg2``) versus regular content. Returns
     ``None`` for anything that doesn't match, so the caller can fall back
     to the normal "post a message" path with zero special-casing.

  2. ``CommandRegistry``
     Holds the ``name -> (handler, description)`` map. Handlers are async
     callables returning ``CommandResult``. Used by Task #7+ to plug in
     specific commands (/ready, /chain target, /poll, …).

  3. ``default_registry``
     The module-level registry the chat router dispatches against. Ships
     with one built-in for now: ``/help``, which lists registered
     commands. Keeping the list lean is deliberate — Task #3 lands the
     framework; future tasks add features through it.

The router (``api/routers/chat.py``) is responsible for: intercepting
content with the parser, running ``dispatch``, and either broadcasting
the result as a regular chat message OR returning it ephemerally to the
sender only (when ``broadcast=False``). The framework does NOT touch the
DB or pub/sub — that stays in the router so all storage/broadcast paths
stay funneled through one place.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Awaitable, Callable


@dataclass
class CommandResult:
    """The structured outcome of a slash-command dispatch.

    - ``message_back``: text to surface back. May be ``None`` for commands
      whose only side-effect is action (e.g. setting a status).
    - ``broadcast``: when True, the router posts the message_back as a
      regular chat message (everyone sees it). When False, the message_back
      is returned to the sender only (no DB write, no fanout).
    - ``render``: optional structured payload for rich-card commands later
      on (Task #9 war-room card, Task #12 OC digest). The router stuffs it
      under the same name in the response so the frontend can decide.
    """

    message_back: str | None = None
    broadcast: bool = False
    render: dict | None = None


Handler = Callable[[int, str, int], Awaitable[CommandResult]]


# A command attempt is "/<letter><alnum/_-/...>" possibly followed by space + args.
# We require a leading letter so digits-after-slash (like "/123") and "/" alone
# don't accidentally trigger dispatch — those are common in URLs, paths,
# fractions etc. and should pass through as plain text.
_COMMAND_RE = re.compile(r"^/([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*))?$")


def parse_command_invocation(content: str) -> tuple[str, str] | None:
    """Parse a chat-message body. Returns ``(name_lowercase, args_stripped)``
    when it looks like a slash-command, ``None`` otherwise.

    Rules:
      - Leading whitespace on the input is tolerated and stripped.
      - Multi-line content is never treated as a command (only single-line).
      - Command names are case-insensitive and lower-cased on return.
      - Args are collapsed of leading/trailing whitespace (interior spacing
        is preserved verbatim — quoting/escaping is the handler's job).
    """
    if not content:
        return None
    text = content.strip()
    if not text or "\n" in text:
        return None
    m = _COMMAND_RE.match(text)
    if not m:
        return None
    name = m.group(1).lower()
    args = (m.group(2) or "").strip()
    return name, args


class CommandRegistry:
    """In-memory map of command names to async handlers.

    Handlers receive ``(player_id, args, channel_id)`` so they can reach
    DB-side state through closures captured at registration time.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, tuple[Handler, str]] = {}

    def register(self, name: str, description: str = "") -> Callable[[Handler], Handler]:
        """Decorator: ``@registry.register("echo", "echo your args")``.

        Last write wins — re-registering the same name overwrites; useful
        for tests, harmless in prod where registration happens at import
        time once.
        """
        key = name.lower()

        def deco(fn: Handler) -> Handler:
            self._handlers[key] = (fn, description)
            return fn

        return deco

    def has(self, name: str) -> bool:
        return name.lower() in self._handlers

    async def dispatch(
        self, name: str, player_id: int, args: str, channel_id: int,
    ) -> CommandResult | None:
        entry = self._handlers.get(name.lower())
        if not entry:
            return None
        handler, _ = entry
        return await handler(player_id, args, channel_id)

    def list(self) -> list[dict]:
        """Return all registered commands sorted by name."""
        return [
            {"name": n, "description": desc}
            for n, (_, desc) in sorted(self._handlers.items())
        ]


# ── The default registry the chat router talks to ─────────────────────────


default_registry = CommandRegistry()


@default_registry.register("help", "List available chat commands")
async def _help_command(
    _player_id: int, _args: str, _channel_id: int,
) -> CommandResult:
    listing = default_registry.list()
    if not listing:
        body = "No commands are registered yet."
    else:
        lines = ["**Available commands:**"]
        for entry in listing:
            desc = entry["description"] or ""
            suffix = f" — {desc}" if desc else ""
            lines.append(f"`/{entry['name']}`{suffix}")
        body = "\n".join(lines)
    return CommandResult(message_back=body, broadcast=False)
