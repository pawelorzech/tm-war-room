CREATE TABLE IF NOT EXISTS stat_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    strength REAL NOT NULL,
    defense REAL NOT NULL,
    speed REAL NOT NULL,
    dexterity REAL NOT NULL,
    total REAL NOT NULL,
    level INTEGER,
    xanax_taken INTEGER,
    refills INTEGER,
    energy_drinks INTEGER,
    networth REAL,
    UNIQUE(player_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_snap_player_date ON stat_snapshots(player_id, snapshot_date);
