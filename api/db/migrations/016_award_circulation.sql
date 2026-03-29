-- Award circulation history snapshots
CREATE TABLE IF NOT EXISTS award_circulation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    award_id INTEGER NOT NULL,
    award_type TEXT NOT NULL,  -- 'honor' or 'medal'
    circulation INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    UNIQUE(award_id, award_type, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_circ_award ON award_circulation_history(award_id, award_type, snapshot_date);
