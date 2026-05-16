-- FFScouter parity (Phase 0): time-bucketed activity tracking.
--
-- `activity_bins` accumulates online-time per player per discrete bin window
-- (Phase 3 will define the bin size; rows are sum-on-conflict so refresh jobs
-- can re-emit the same bucket without dedup logic at the call site).
--
-- `activity_tracked_outsiders` enrolls non-faction players for tracking. The
-- enrollment is organic: when a faction member views an outsider's profile
-- (Phase 3), we drop the player_id in here so subsequent refresh cycles
-- include them. `last_bin_at` is the timestamp of the most recent bin we
-- recorded for this outsider, used by `purge_idle_outsiders` to drop players
-- who have gone silent (idle threshold defined in Phase 3).
CREATE TABLE IF NOT EXISTS activity_bins (
    player_id INTEGER NOT NULL,
    bin_start INTEGER NOT NULL,
    online_seconds INTEGER NOT NULL,
    PRIMARY KEY (player_id, bin_start)
);
CREATE INDEX IF NOT EXISTS ix_activity_bins_recent ON activity_bins(bin_start);

CREATE TABLE IF NOT EXISTS activity_tracked_outsiders (
    player_id INTEGER PRIMARY KEY,
    enrolled_at INTEGER NOT NULL,
    last_bin_at INTEGER
);
