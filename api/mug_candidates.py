"""Gather candidate player IDs to mug-score, from sources TM Hub already has.

Pure aggregation: takes already-fetched rows (the router supplies them from
the travel + bounties data it already caches) plus the manual target repo,
and returns a deduped set of player IDs. No I/O here so it stays testable.
"""
from __future__ import annotations


def gather_candidate_ids(target_repo, travel_rows: list[dict], bounty_rows: list[dict]) -> set[int]:
    ids: set[int] = set()
    for t in target_repo.get_all():
        pid = t.get("player_id")
        if pid:
            ids.add(int(pid))
    for row in travel_rows:
        pid = row.get("player_id")
        if pid:
            ids.add(int(pid))
    for row in bounty_rows:
        pid = row.get("target_id")
        if pid:
            ids.add(int(pid))
    return ids
