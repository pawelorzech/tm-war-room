CREATE TABLE IF NOT EXISTS version_dismissals (
    player_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(player_id, version)
);
