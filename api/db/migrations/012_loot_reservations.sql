CREATE TABLE IF NOT EXISTS loot_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id INTEGER NOT NULL,
    npc_name TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT,
    target_level INTEGER DEFAULT 4,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(npc_id, player_id)
);
