CREATE TABLE IF NOT EXISTS member_keys (
    player_id INTEGER PRIMARY KEY,
    player_name TEXT NOT NULL,
    api_key_encrypted BLOB NOT NULL,
    is_faction_key INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
