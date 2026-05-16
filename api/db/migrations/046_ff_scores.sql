-- FFScouter parity (Phase 0): cached fair-fight score per player.
--
-- One row per player_id. `score` is the cached FF value, `dom_stat` is the
-- dominant battle stat used to derive it ("strength" | "defense" | "speed" |
-- "dexterity" | "total"). `computed_at` / `expires_at` are unix-epoch seconds;
-- expired rows are dropped on read by purge_expired(). `source` records whether
-- the score came from a real spy estimate or a heuristic formula fallback —
-- consumers may want to label or downweight formula-derived scores.
CREATE TABLE IF NOT EXISTS ff_scores (
    player_id INTEGER PRIMARY KEY,
    score REAL NOT NULL,
    dom_stat TEXT NOT NULL,
    computed_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('spy', 'formula'))
);
CREATE INDEX IF NOT EXISTS ix_ff_scores_expires ON ff_scores(expires_at);
