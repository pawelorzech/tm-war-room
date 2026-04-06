CREATE TABLE IF NOT EXISTS custom_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES custom_groups(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    UNIQUE(group_id, player_id)
);
