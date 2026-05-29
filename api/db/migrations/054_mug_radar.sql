-- Mug Radar: anti-reduction cooldown log + fresh-cash trade log.
--
-- mug_log records when a member mugs a given target, so the mug-score can
-- hide that target for ~15h (mugging reduction makes re-mugging unprofitable).
-- recent_trades records when a member buys from a player's bazaar/item market,
-- which means that seller just received the member's cash (a mug opportunity).
CREATE TABLE IF NOT EXISTS mug_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_player_id INTEGER NOT NULL,
    target_player_id INTEGER NOT NULL,
    mugged_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mug_log_owner_target
    ON mug_log(owner_player_id, target_player_id, mugged_at);

CREATE TABLE IF NOT EXISTS recent_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_player_id INTEGER NOT NULL,
    seller_player_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'trade',
    source TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recent_trades_owner_seller
    ON recent_trades(owner_player_id, seller_player_id, created_at);
