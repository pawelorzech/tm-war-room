-- FFScouter parity (Phase 0): hit-calling claims on enemy targets.
--
-- One row per target (player_id) — `target_id` is the PK because we only want
-- a single active claim per enemy at any time. Status transitions:
--   active   → released  (claimer voluntarily lets go)
--   active   → hit       (attack landed)
--   active   → expired   (TTL elapsed without action — janitor job)
-- The partial index ix_hit_claims_active speeds up "is this target claimed?"
-- lookups, which are the hot path for the companion overlay.
-- `note` is a free-form short string ("on it", "wait for me", etc.) — UTF-8,
-- intended to render as a single line in the companion.
CREATE TABLE IF NOT EXISTS hit_claims (
    target_id INTEGER PRIMARY KEY,
    claimer_id INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'released', 'expired', 'hit')),
    note TEXT
);
CREATE INDEX IF NOT EXISTS ix_hit_claims_claimer ON hit_claims(claimer_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS ix_hit_claims_active ON hit_claims(status, expires_at) WHERE status = 'active';
