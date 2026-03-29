CREATE TABLE IF NOT EXISTS stakeouts (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT,
    added_by INTEGER NOT NULL,
    last_status TEXT DEFAULT 'Unknown',
    last_action TEXT DEFAULT '',
    last_checked INTEGER DEFAULT 0,
    last_change INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
