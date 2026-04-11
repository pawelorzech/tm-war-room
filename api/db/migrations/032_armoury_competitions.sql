CREATE TABLE IF NOT EXISTS armoury_competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    start_ts INTEGER NOT NULL,
    end_ts INTEGER NOT NULL,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS armoury_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    deposited_at INTEGER NOT NULL,
    news_id TEXT NOT NULL UNIQUE,
    FOREIGN KEY (competition_id) REFERENCES armoury_competitions(id)
);

CREATE INDEX IF NOT EXISTS idx_deposits_comp_player
    ON armoury_deposits(competition_id, player_id);
CREATE INDEX IF NOT EXISTS idx_deposits_news_id
    ON armoury_deposits(news_id);
