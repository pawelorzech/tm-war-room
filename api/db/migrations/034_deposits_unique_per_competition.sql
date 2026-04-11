-- Change unique constraint from news_id alone to (competition_id, news_id)
-- so the same deposit can be tracked across multiple competitions.
CREATE TABLE armoury_deposits_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    deposited_at INTEGER NOT NULL,
    news_id TEXT NOT NULL,
    UNIQUE(competition_id, news_id),
    FOREIGN KEY (competition_id) REFERENCES armoury_competitions(id)
);

INSERT INTO armoury_deposits_new
    (id, competition_id, player_id, player_name, item_name, quantity, deposited_at, news_id)
SELECT id, competition_id, player_id, player_name, item_name, quantity, deposited_at, news_id
FROM armoury_deposits;

DROP TABLE armoury_deposits;
ALTER TABLE armoury_deposits_new RENAME TO armoury_deposits;

CREATE INDEX IF NOT EXISTS idx_deposits_comp_player
    ON armoury_deposits(competition_id, player_id);
CREATE INDEX IF NOT EXISTS idx_deposits_news_id
    ON armoury_deposits(news_id);
