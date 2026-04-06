CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_by INTEGER
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('chat_enabled_for_all', 'false', strftime('%s', 'now'));
