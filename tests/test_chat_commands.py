"""Tests for the slash-command framework (api/chat_commands.py).

Covers the three layers:

  1. ``parse_command_invocation`` — pure text → (name, args) | None.
     Determines whether a chat message is a command attempt.
  2. ``CommandRegistry`` — register handlers + dispatch.
  3. The default registry's built-in ``/help`` command.

Router-level integration (``send_message`` intercepts commands) is
exercised in ``tests/test_chat_routes.py``.
"""
from __future__ import annotations

import pytest

from api.chat_commands import (
    CommandRegistry,
    CommandResult,
    default_registry,
    parse_command_invocation,
)


# ── parse_command_invocation ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "content,expected",
    [
        # Positive — plain command, no args
        ("/echo", ("echo", "")),
        # Positive — command with args
        ("/echo hello world", ("echo", "hello world")),
        # Positive — args with leading/trailing whitespace collapsed
        ("/echo    hello   ", ("echo", "hello")),
        # Positive — leading whitespace on the input is tolerated
        ("  /echo hi", ("echo", "hi")),
        # Positive — case-insensitive command name
        ("/ECHO yo", ("echo", "yo")),
        ("/Echo yo", ("echo", "yo")),
        # Positive — single-letter command
        ("/x", ("x", "")),
        # Positive — hyphen / underscore in command name allowed
        ("/chain-target 2362436", ("chain-target", "2362436")),
        ("/chain_target 2362436", ("chain_target", "2362436")),
        # Negative — empty input
        ("", None),
        ("   ", None),
        # Negative — no leading slash
        ("echo hello", None),
        ("hello /echo", None),
        # Negative — slash alone or slash + space
        ("/", None),
        ("/ ", None),
        ("/ echo", None),
        # Negative — slash followed by digits (would clash with paths like /1d2)
        ("/123", None),
        # Negative — slash inside a URL
        ("http://foo/bar", None),
        # Negative — multi-line; only single-line commands supported
        ("/echo\nhi", None),
    ],
)
def test_parse_command_invocation(
    content: str, expected: tuple[str, str] | None
) -> None:
    assert parse_command_invocation(content) == expected


# ── CommandRegistry ────────────────────────────────────────────────────────


@pytest.fixture
def registry() -> CommandRegistry:
    return CommandRegistry()


async def test_register_and_dispatch(registry: CommandRegistry) -> None:
    @registry.register("echo", "echo back the args")
    async def _echo(player_id: int, args: str, channel_id: int) -> CommandResult:
        return CommandResult(message_back=f"you: {args}", broadcast=False)

    result = await registry.dispatch("echo", 100, "hi", 1)
    assert result is not None
    assert result.message_back == "you: hi"
    assert result.broadcast is False


async def test_dispatch_unknown_returns_none(registry: CommandRegistry) -> None:
    assert await registry.dispatch("nope", 100, "", 1) is None


async def test_dispatch_is_case_insensitive(registry: CommandRegistry) -> None:
    @registry.register("Greet", "say hi")
    async def _g(_pid: int, _args: str, _cid: int) -> CommandResult:
        return CommandResult(message_back="hi")

    result = await registry.dispatch("greet", 1, "", 1)
    assert result is not None
    assert result.message_back == "hi"


async def test_has_command(registry: CommandRegistry) -> None:
    assert registry.has("echo") is False

    @registry.register("echo")
    async def _e(_pid: int, _args: str, _cid: int) -> CommandResult:
        return CommandResult()

    assert registry.has("echo") is True
    assert registry.has("ECHO") is True
    assert registry.has("other") is False


def test_list_returns_sorted_name_description(registry: CommandRegistry) -> None:
    @registry.register("zoom", "zoom in")
    async def _z(_pid: int, _args: str, _cid: int) -> CommandResult:
        return CommandResult()

    @registry.register("alpha", "first command")
    async def _a(_pid: int, _args: str, _cid: int) -> CommandResult:
        return CommandResult()

    listing = registry.list()
    assert listing == [
        {"name": "alpha", "description": "first command"},
        {"name": "zoom", "description": "zoom in"},
    ]


async def test_handler_can_be_async(registry: CommandRegistry) -> None:
    @registry.register("delayed", "uses await internally")
    async def _d(_pid: int, args: str, _cid: int) -> CommandResult:
        import asyncio
        await asyncio.sleep(0)
        return CommandResult(message_back=f"echo: {args}")

    result = await registry.dispatch("delayed", 1, "ok", 1)
    assert result is not None
    assert result.message_back == "echo: ok"


def test_register_returns_decorator_returns_original(registry: CommandRegistry) -> None:
    """The decorator must return the original handler unchanged so users
    can still call it directly (handy for tests)."""

    async def original(_pid: int, _args: str, _cid: int) -> CommandResult:
        return CommandResult(message_back="x")

    wrapped = registry.register("x", "description")(original)
    assert wrapped is original


# ── Default registry built-ins ─────────────────────────────────────────────


async def test_default_registry_has_help() -> None:
    assert default_registry.has("help")


async def test_default_help_lists_registered_commands() -> None:
    result = await default_registry.dispatch("help", 1, "", 1)
    assert result is not None
    assert result.broadcast is False, "help must be ephemeral, not spam the channel"
    assert result.message_back is not None
    assert "/help" in result.message_back
