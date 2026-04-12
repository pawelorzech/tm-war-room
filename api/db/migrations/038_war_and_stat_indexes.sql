-- War reports filter by defender_faction_id + started — currently full table scan
CREATE INDEX IF NOT EXISTS idx_atk_defender_faction_started
ON attack_log(defender_faction_id, started DESC);

-- stat_snapshots: get_all_latest() and get_latest_snapshot() need fast MAX(snapshot_date) per player
CREATE INDEX IF NOT EXISTS idx_snap_player_date_desc
ON stat_snapshots(player_id, snapshot_date DESC);

-- stat_snapshots: get_all_growth() filters by snapshot_date >= cutoff
CREATE INDEX IF NOT EXISTS idx_snap_date
ON stat_snapshots(snapshot_date);
