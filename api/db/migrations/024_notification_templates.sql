CREATE TABLE IF NOT EXISTS notification_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    icon TEXT,
    url_template TEXT,
    variables TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Seed default templates
INSERT OR IGNORE INTO notification_templates (id, name, title_template, body_template, icon, url_template, variables, created_by, created_at, updated_at)
VALUES
    (1, 'War Alert', '⚔️ {{title}}', '{{message}}', NULL, '/wars', '["message", "title"]', 0, datetime('now'), datetime('now')),
    (2, 'Maintenance', '🔧 Maintenance: {{title}}', '{{message}}', NULL, '/dashboard', '["message", "title"]', 0, datetime('now'), datetime('now')),
    (3, 'Chain Alert', '🔗 {{title}}', '{{message}}', NULL, '/chain', '["message", "title"]', 0, datetime('now'), datetime('now')),
    (4, 'Custom', '{{title}}', '{{message}}', NULL, '{{url}}', '["message", "title", "url"]', 0, datetime('now'), datetime('now'));
