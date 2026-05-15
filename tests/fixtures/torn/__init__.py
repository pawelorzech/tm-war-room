"""Captured Torn API responses for shape-validated tests.

Fixtures are produced by `scripts/probe_torn_shapes.py capture`. Values are
sanitized (player IDs, names, monetary amounts replaced with placeholders) so
the files are safe to commit. Tests should assert on field presence and types,
not on specific values.

See docs/torn-api-v2-migration.md for the v1/v2 mismatches these fixtures
capture.
"""

from __future__ import annotations

import json
from pathlib import Path

_FIXTURE_DIR = Path(__file__).parent


def load_torn_fixture(name: str) -> dict:
    """Load a captured Torn API response by fixture name (without .json suffix)."""
    return json.loads((_FIXTURE_DIR / f"{name}.json").read_text())
