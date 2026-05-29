from api.mug_candidates import gather_candidate_ids


def test_merges_targets_travel_bounties_dedup():
    target_repo = type("T", (), {"get_all": lambda self: [{"player_id": 1}, {"player_id": 2}]})()
    travel_rows = [{"player_id": 2, "destination": "Cayman Islands"}, {"player_id": 3, "destination": "Switzerland"}]
    bounty_rows = [{"target_id": 4}, {"target_id": 1}]
    ids = gather_candidate_ids(target_repo, travel_rows, bounty_rows)
    assert ids == {1, 2, 3, 4}


def test_handles_empty_sources():
    target_repo = type("T", (), {"get_all": lambda self: []})()
    assert gather_candidate_ids(target_repo, [], []) == set()
