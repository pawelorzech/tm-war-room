CREATE TABLE IF NOT EXISTS spy_estimates (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT,
    strength REAL,
    defense REAL,
    speed REAL,
    dexterity REAL,
    total REAL,
    confidence TEXT,
    source TEXT,
    reported_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
