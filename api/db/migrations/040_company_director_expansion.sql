-- Company Director expansion (feedback Steven AP 2026-04-19):
-- * tracked_companies: catalog of companies (beyond just TM) we snapshot daily for comparison
-- * company_snapshots.scope: distinguishes director-full rows from public-profile-only rows
-- * pinned_weeks: user-saved weeks to overlay in charts (e.g. "Halloween 2025")
-- * company_alert_config: which players get pinged for which company alerts (e.g. trains stagnant)
-- * company_discovery_cursor: persists sequential-ID scan position for the discover_companies job

CREATE TABLE IF NOT EXISTS tracked_companies (
    company_id INTEGER PRIMARY KEY,
    company_type INTEGER,
    rating INTEGER,
    name TEXT,
    director_id INTEGER,
    source TEXT NOT NULL,            -- 'faction' | 'manual' | 'discovered'
    first_seen_at INTEGER NOT NULL,
    last_checked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tracked_class
    ON tracked_companies(rating, company_type);
CREATE INDEX IF NOT EXISTS idx_tracked_source
    ON tracked_companies(source);

ALTER TABLE company_snapshots ADD COLUMN scope TEXT NOT NULL DEFAULT 'director';
CREATE INDEX IF NOT EXISTS idx_company_snap_scope_date
    ON company_snapshots(scope, snapshot_date);

CREATE TABLE IF NOT EXISTS pinned_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    week_start_ts INTEGER NOT NULL,  -- unix seconds, Mon 18:00 UTC (TCT)
    label TEXT NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(player_id, company_id, week_start_ts)
);
CREATE INDEX IF NOT EXISTS idx_pinned_player_company
    ON pinned_weeks(player_id, company_id);

CREATE TABLE IF NOT EXISTS company_alert_config (
    company_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,        -- 'trains_stagnant'
    target_player_id INTEGER NOT NULL,
    threshold_days INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (company_id, alert_type, target_player_id)
);

CREATE TABLE IF NOT EXISTS company_discovery_cursor (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_scanned_id INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO company_discovery_cursor (id, last_scanned_id, updated_at)
VALUES (1, 0, 0);
