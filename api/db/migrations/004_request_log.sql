CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    player_id INTEGER,
    method TEXT,
    endpoint TEXT,
    status_code INTEGER,
    response_time_ms REAL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_rl_timestamp ON request_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_rl_player_id ON request_log(player_id);
CREATE INDEX IF NOT EXISTS idx_rl_endpoint ON request_log(endpoint);
