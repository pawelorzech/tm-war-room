CREATE TABLE IF NOT EXISTS integration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    service TEXT NOT NULL,
    endpoint TEXT,
    success INTEGER NOT NULL,
    response_time_ms REAL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_il_service ON integration_log(service);
CREATE INDEX IF NOT EXISTS idx_il_timestamp ON integration_log(timestamp);
