-- Migration 042: persist user-pinned nav routes (favorites) cross-device
-- Replaces the localStorage-only "tmhub-pinned-hrefs" with DB-backed sync.
-- Per-player ordered list of nav hrefs. Order = position ASC.
CREATE TABLE IF NOT EXISTS user_pinned_navs (
    player_id  INTEGER NOT NULL,
    href       TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (player_id, href)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_navs_player_pos
    ON user_pinned_navs (player_id, position);
