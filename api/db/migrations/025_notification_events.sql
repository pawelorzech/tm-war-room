CREATE TABLE IF NOT EXISTS notification_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    icon TEXT,
    target_type TEXT NOT NULL,
    target_value TEXT,
    sent_by TEXT NOT NULL,
    variables_used TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES notification_events(id),
    player_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL,
    delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_delivery_player_status ON delivery_log(player_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_event ON delivery_log(event_id);
