CREATE TABLE IF NOT EXISTS spy_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    source TEXT NOT NULL,
    strength REAL,
    defense REAL,
    speed REAL,
    dexterity REAL,
    total REAL,
    confidence TEXT,
    reported_at DATETIME NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, source, reported_at)
);
CREATE INDEX IF NOT EXISTS idx_spy_player ON spy_reports(player_id);
CREATE INDEX IF NOT EXISTS idx_spy_fetched ON spy_reports(fetched_at);
