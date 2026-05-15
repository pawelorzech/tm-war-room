#!/usr/bin/env python3
"""Probe Torn API v1/v2 shapes and validate test mocks against live responses.

We keep a deliberate v1/v2 mix in api/torn_client.py — see docs/torn-api-v2-migration.md.
This script lets us:

  capture       Hit live Torn API for a curated list of selections, sanitize the
                response (strip personal data, keep structure), and write JSON
                fixtures to tests/fixtures/torn/. Re-run whenever you suspect
                drift.

  diff          Re-probe live API and compare structure against existing
                fixtures. Exit 1 if any shape change is detected (type change,
                added/removed field, dict↔list). Run before migrating a
                selection v1→v2 or v2→v1.

  audit-fakes   Parse tests/test_torn_client.py for module-level FAKE_*_RESPONSE
                literals and compare their shape against the matching fixture.
                Reports missing fields, extra fields, type mismatches. Doesn't
                modify tests — gives you a worklist.

Usage:
    TORN_API_KEY=... uv run python scripts/probe_torn_shapes.py capture
    TORN_API_KEY=... uv run python scripts/probe_torn_shapes.py diff
    uv run python scripts/probe_torn_shapes.py audit-fakes

The API key is never written to disk — only read from env. Fixtures are
sanitized (player IDs masked, names replaced) so they're safe to commit.
"""

from __future__ import annotations

import argparse
import ast
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import httpx


REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "torn"

V1_BASE = "https://api.torn.com"
V2_BASE = "https://api.torn.com/v2"


# Each probe targets one selection. `versions` chooses which base URLs to hit.
# `fixture` is the JSON filename (without _v1/_v2 suffix or .json).
# `path` is the URL path (no leading slash on `/`), `params` are query params
# *minus* the api key.
PROBES: list[dict[str, Any]] = [
    # ── v1-fallback selections (the bugs we keep getting) ──
    {"fixture": "user_bars", "path": "/user/", "params": {"selections": "bars,cooldowns"}, "versions": ["v1", "v2"]},
    {"fixture": "user_profile", "path": "/user/", "params": {"selections": "profile"}, "versions": ["v1", "v2"]},
    {"fixture": "user_personalstats", "path": "/user/", "params": {"selections": "personalstats"}, "versions": ["v1", "v2"]},
    {"fixture": "user_stocks", "path": "/user/", "params": {"selections": "stocks"}, "versions": ["v1", "v2"]},
    {"fixture": "torn_stocks", "path": "/torn/", "params": {"selections": "stocks"}, "versions": ["v1", "v2"]},
    {"fixture": "torn_honors_medals", "path": "/torn/", "params": {"selections": "honors,medals"}, "versions": ["v1", "v2"]},
    {"fixture": "torn_items", "path": "/torn/", "params": {"selections": "items"}, "versions": ["v1", "v2"], "truncate_list": 5, "truncate_dict": 5},
    # ── baseline (selections already on v2 in prod) ──
    {"fixture": "faction_members", "path": "/faction/members", "params": {}, "versions": ["v2"]},
    {"fixture": "faction_wars", "path": "/faction/", "params": {"selections": "wars"}, "versions": ["v2"]},
    {"fixture": "faction_chain", "path": "/faction/", "params": {"selections": "chain"}, "versions": ["v2"]},
    {"fixture": "key_info", "path": "/key/info", "params": {}, "versions": ["v2"]},
    {"fixture": "torn_companies", "path": "/torn/", "params": {"selections": "companies"}, "versions": ["v2"], "truncate_dict": 3},
]


# Sanitization rules — applied via recursive walk. Keys are matched case-insensitively
# as substrings; longer/more specific keys win.
ID_PLACEHOLDER = 1111
LEADER_PLACEHOLDER = 2222
NAME_PLACEHOLDER = "TestPlayer"
TAG_PLACEHOLDER = "TST"
TIMESTAMP_PLACEHOLDER = 1700000000
STAT_PLACEHOLDER = 100
MONEY_PLACEHOLDER = 1000
DESCRIPTION_PLACEHOLDER = "test description"

# Keys whose literal string values we keep verbatim (short enums/flags). Numbers
# under these keys still get masked.
PRESERVE_LITERAL_KEYS = {
    "state", "color", "type", "category",
    "country", "division", "gender", "role", "position", "job",
    "frequency",  # dividend frequency is structural (small int enum)
}

# Keys whose ENTIRE subtree is preserved verbatim — public catalogs / permission
# enums that aren't personal data and whose nested strings carry shape signal we
# don't want to mask (e.g. /v2/key/info returns the full list of available
# selection names per category).
SUBTREE_PRESERVE_KEYS = {"selections", "access", "log"}

# Tag-like keys (short faction tags, look like IDs).
TAG_KEY_PATTERN = re.compile(r"(^|_)(tag)$", re.IGNORECASE)

# Name-like keys.
NAME_KEY_PATTERN = re.compile(r"(^|_)(name|nickname|signature)$", re.IGNORECASE)

# Descriptive text keys.
DESC_KEY_PATTERN = re.compile(r"(^|_)(description|details|reason|message|note|address|street)$", re.IGNORECASE)

DIGIT_RUN_RE = re.compile(r"\d{3,}")


def sanitize(node: Any, key: str | None = None) -> Any:
    """Recursively replace personal/identifying values with deterministic placeholders.

    Type and structure (dict vs list, nesting depth, key set) are preserved verbatim —
    that's the whole reason we have this script. Values are made opaque enough that
    fixtures can be safely committed to a public repo.

    Numeric values are flattened to STAT_PLACEHOLDER regardless of magnitude. Tests
    that load these fixtures should assert on field presence and types, not specific
    values.
    """
    # Whole-subtree preserve (e.g. /v2/key/info selections catalog) — applied at
    # the entry to the subtree so nested lists of strings aren't masked.
    if (key or "").lower() in SUBTREE_PRESERVE_KEYS:
        return node

    if isinstance(node, dict):
        return {k: sanitize(v, key=k) for k, v in node.items()}
    if isinstance(node, list):
        return [sanitize(v, key=key) for v in node]

    # bool first — isinstance(True, int) is True
    if node is None or isinstance(node, bool):
        return node

    klow = (key or "").lower()

    # Numbers: opaque placeholder, preserve type
    if isinstance(node, int):
        return STAT_PLACEHOLDER
    if isinstance(node, float):
        return float(STAT_PLACEHOLDER)

    if not isinstance(node, str) or not node:
        return node

    # Strings
    if klow in PRESERVE_LITERAL_KEYS:
        return node
    if NAME_KEY_PATTERN.search(klow):
        return NAME_PLACEHOLDER
    if DESC_KEY_PATTERN.search(klow):
        return DESCRIPTION_PLACEHOLDER
    if TAG_KEY_PATTERN.search(klow):
        return TAG_PLACEHOLDER

    # URLs / paths — strip digit runs (IDs embedded in image filenames etc.)
    if "://" in node or node.startswith("/"):
        return DIGIT_RUN_RE.sub(str(ID_PLACEHOLDER), node)

    # Short alphabetic strings — keep (status enums, colors, currencies, etc.)
    if len(node) <= 12 and not any(c.isdigit() for c in node):
        return node

    # Otherwise opaque — preserves "string-ness" without leaking content
    return DESCRIPTION_PLACEHOLDER


def truncate(node: Any, max_dict: int | None, max_list: int | None) -> Any:
    """Optionally cap big dicts/lists at the top level (e.g. torn/items has ~1480 entries)."""
    if isinstance(node, dict) and max_dict is not None and len(node) > max_dict:
        keys = list(node.keys())[:max_dict]
        return {k: node[k] for k in keys}
    if isinstance(node, list) and max_list is not None and len(node) > max_list:
        return node[:max_list]
    return node


def _walk_dict_top_level(raw: dict, max_dict: int | None, max_list: int | None) -> dict:
    """Truncate any top-level value (dict/list) inside the wrapper response."""
    out: dict[str, Any] = {}
    for k, v in raw.items():
        out[k] = truncate(v, max_dict, max_list)
    return out


async def fetch_probe(client: httpx.AsyncClient, base: str, probe: dict, api_key: str) -> dict | None:
    url = f"{base}{probe['path']}"
    params = {**probe["params"], "key": api_key}
    try:
        resp = await client.get(url, params=params, timeout=15.0)
    except httpx.HTTPError as e:
        print(f"  ! HTTP error: {e}", file=sys.stderr)
        return None
    if resp.status_code >= 400:
        print(f"  ! {resp.status_code} from {url}", file=sys.stderr)
        return None
    try:
        data = resp.json()
    except ValueError:
        print(f"  ! non-JSON response from {url}", file=sys.stderr)
        return None
    if isinstance(data, dict) and "error" in data and len(data) <= 2:
        # Torn returns {"error": {"code": N, "error": "msg"}} for invalid/unsupported endpoints.
        # We preserve this — agents need to see that an endpoint is gone.
        return data
    return data


def fixture_path(probe: dict, version: str) -> Path:
    return FIXTURE_DIR / f"{probe['fixture']}_{version}.json"


def write_fixture(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


# ──────────────────────────────────────────────────────────────────────────────
# CAPTURE
# ──────────────────────────────────────────────────────────────────────────────


async def cmd_capture(args: argparse.Namespace) -> int:
    api_key = os.environ.get("TORN_API_KEY")
    if not api_key:
        print("ERROR: TORN_API_KEY env var required", file=sys.stderr)
        return 2

    only = set(args.only.split(",")) if args.only else None
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(headers={"User-Agent": "TM-Hub-Probe/1.0"}) as client:
        for probe in PROBES:
            if only and probe["fixture"] not in only:
                continue
            for version in probe["versions"]:
                base = V1_BASE if version == "v1" else V2_BASE
                print(f"→ {probe['fixture']} ({version})")
                raw = await fetch_probe(client, base, probe, api_key)
                if raw is None:
                    continue
                truncated = _walk_dict_top_level(
                    raw if isinstance(raw, dict) else {"_root": raw},
                    probe.get("truncate_dict"),
                    probe.get("truncate_list"),
                )
                if "_root" in truncated and len(truncated) == 1:
                    truncated = truncated["_root"]
                sanitized = sanitize(truncated)
                path = fixture_path(probe, version)
                write_fixture(path, sanitized)
                print(f"  ✓ {path.relative_to(REPO_ROOT)}")
    return 0


# ──────────────────────────────────────────────────────────────────────────────
# DIFF
# ──────────────────────────────────────────────────────────────────────────────


def shape_of(node: Any) -> Any:
    """Return a hashable shape descriptor: nested dict of types and keys, not values."""
    if isinstance(node, dict):
        return {"__type__": "dict", "fields": {k: shape_of(v) for k, v in sorted(node.items())}}
    if isinstance(node, list):
        # For lists, sample the first element's shape (assumes homogeneous list — true for Torn).
        if not node:
            return {"__type__": "list", "elem": None}
        return {"__type__": "list", "elem": shape_of(node[0])}
    return {"__type__": type(node).__name__}


def diff_shapes(want: Any, got: Any, path: str = "") -> list[str]:
    """Compare two shape descriptors and yield human-readable diff lines."""
    if not isinstance(want, dict) or not isinstance(got, dict):
        return [f"{path}: invalid shape descriptor"]

    if want.get("__type__") != got.get("__type__"):
        return [f"{path}: type changed {want.get('__type__')} → {got.get('__type__')}"]

    diffs: list[str] = []
    t = want["__type__"]
    if t == "dict":
        want_keys = set(want.get("fields", {}))
        got_keys = set(got.get("fields", {}))
        for k in sorted(want_keys - got_keys):
            diffs.append(f"{path}.{k}: removed")
        for k in sorted(got_keys - want_keys):
            diffs.append(f"{path}.{k}: added (type={got['fields'][k].get('__type__')})")
        for k in sorted(want_keys & got_keys):
            diffs.extend(diff_shapes(want["fields"][k], got["fields"][k], f"{path}.{k}" if path else k))
    elif t == "list":
        want_elem = want.get("elem")
        got_elem = got.get("elem")
        if want_elem is None and got_elem is not None:
            diffs.append(f"{path}[]: list was empty, now has elements (type={got_elem.get('__type__')})")
        elif want_elem is not None and got_elem is None:
            diffs.append(f"{path}[]: list became empty")
        elif want_elem is not None and got_elem is not None:
            diffs.extend(diff_shapes(want_elem, got_elem, f"{path}[]"))
    return diffs


async def cmd_diff(args: argparse.Namespace) -> int:
    api_key = os.environ.get("TORN_API_KEY")
    if not api_key:
        print("ERROR: TORN_API_KEY env var required", file=sys.stderr)
        return 2

    any_drift = False
    async with httpx.AsyncClient(headers={"User-Agent": "TM-Hub-Probe/1.0"}) as client:
        for probe in PROBES:
            for version in probe["versions"]:
                path = fixture_path(probe, version)
                if not path.exists():
                    print(f"⚠ {probe['fixture']} ({version}): no fixture, run capture first", file=sys.stderr)
                    continue
                base = V1_BASE if version == "v1" else V2_BASE
                raw = await fetch_probe(client, base, probe, api_key)
                if raw is None:
                    continue
                truncated = _walk_dict_top_level(
                    raw if isinstance(raw, dict) else {"_root": raw},
                    probe.get("truncate_dict"),
                    probe.get("truncate_list"),
                )
                if "_root" in truncated and len(truncated) == 1:
                    truncated = truncated["_root"]
                live_shape = shape_of(sanitize(truncated))
                fixture_shape = shape_of(json.loads(path.read_text()))
                drifts = diff_shapes(fixture_shape, live_shape, "")
                if drifts:
                    any_drift = True
                    print(f"✗ {probe['fixture']} ({version}) — {len(drifts)} change(s):")
                    for d in drifts:
                        print(f"    {d}")
                else:
                    print(f"✓ {probe['fixture']} ({version})")
    return 1 if any_drift else 0


# ──────────────────────────────────────────────────────────────────────────────
# AUDIT-FAKES
# ──────────────────────────────────────────────────────────────────────────────


# Map FAKE_* constant name in tests/test_torn_client.py → fixture name.
FAKE_TO_FIXTURE = {
    "FAKE_MEMBERS_RESPONSE": "faction_members_v2",
    "FAKE_WARS_RESPONSE": "faction_wars_v2",
    "FAKE_BARS_RESPONSE": "user_bars_v1",
    "FAKE_ENEMY_MEMBERS": "faction_members_v2",
    "FAKE_FACTION_INFO": None,  # /v2/faction/{id} — not covered by current probes
    "FAKE_TORNSTATS_SPY": None,  # External (YATA-like) shape, not Torn API
}


def _extract_fake_literals(source: str) -> dict[str, Any]:
    """Parse `FAKE_X = {...}` literals from tests/test_torn_client.py."""
    tree = ast.parse(source)
    out: dict[str, Any] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name) or not target.id.startswith("FAKE_"):
            continue
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, SyntaxError):
            continue
        out[target.id] = value
    return out


def cmd_audit_fakes(args: argparse.Namespace) -> int:
    test_path = REPO_ROOT / "tests" / "test_torn_client.py"
    if not test_path.exists():
        print(f"ERROR: {test_path} not found", file=sys.stderr)
        return 2
    fakes = _extract_fake_literals(test_path.read_text())
    if not fakes:
        print("No FAKE_* literals found.", file=sys.stderr)
        return 0

    any_gap = False
    for name, fixture_name in FAKE_TO_FIXTURE.items():
        if name not in fakes:
            continue
        if fixture_name is None:
            print(f"⊘ {name}: no live fixture mapped (skipped)")
            continue
        fixture_path_ = FIXTURE_DIR / f"{fixture_name}.json"
        if not fixture_path_.exists():
            print(f"⚠ {name}: fixture {fixture_path_.name} missing, run `capture` first", file=sys.stderr)
            continue
        fake_shape = shape_of(fakes[name])
        live_shape = shape_of(json.loads(fixture_path_.read_text()))
        drifts = diff_shapes(live_shape, fake_shape, "")  # live is "expected", fake is "got"
        if drifts:
            any_gap = True
            print(f"✗ {name} vs {fixture_name}: {len(drifts)} gap(s)")
            for d in drifts:
                print(f"    {d}")
        else:
            print(f"✓ {name} vs {fixture_name}: structure matches")
    return 1 if any_gap else 0


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_cap = sub.add_parser("capture", help="Capture live Torn API responses to tests/fixtures/torn/")
    p_cap.add_argument("--only", help="Comma-separated list of fixture names to capture (default: all)")
    p_cap.set_defaults(func=cmd_capture)

    p_diff = sub.add_parser("diff", help="Compare existing fixtures against fresh live responses")
    p_diff.set_defaults(func=cmd_diff)

    p_audit = sub.add_parser("audit-fakes", help="Check hand-written FAKE_* mocks in test_torn_client.py against fixtures")
    p_audit.set_defaults(func=cmd_audit_fakes)

    args = parser.parse_args()
    func = args.func
    if asyncio.iscoroutinefunction(func):
        return asyncio.run(func(args))
    return func(args)


if __name__ == "__main__":
    sys.exit(main())
