-- Per-user TornStats API keys.
--
-- The single global TORNSTATS_API_KEY in env serves the entire app — fine as
-- a baseline, but if that one key goes 403 (revoked, expired, owner banned)
-- the whole spy pipeline writes zeros for everyone. On 2026-05-17 exactly
-- that happened in prod: the global key returned 403 for ~6 days while
-- refresh_spies kept overwriting real estimates with 0/0/0/0/total=0 rows
-- on every 30-min tick.
--
-- A user-supplied TornStats key also unlocks the faction-spy entries only
-- visible to that user's TornStats account (their own faction's espionage
-- results). Pooling those keys gives /api/spy/{id} a real shot at having
-- live data for any XID a member opens — same parity TornStats userscript
-- shows in the User Information section on torn.com profiles.
--
-- Three columns on member_keys (one-to-one with the existing Torn API key):
--   tornstats_key_encrypted   — Fernet-encrypted with ENCRYPTION_KEY (same as api_key_encrypted)
--   tornstats_key_status      — "ok" (last call succeeded) | "invalid" (403/401 last seen) | NULL (never validated)
--   tornstats_key_validated_at — last time we tried this key against TornStats
ALTER TABLE member_keys ADD COLUMN tornstats_key_encrypted BLOB;
ALTER TABLE member_keys ADD COLUMN tornstats_key_status TEXT;
ALTER TABLE member_keys ADD COLUMN tornstats_key_validated_at TIMESTAMP;

-- Cleanup legacy zero-rows from when the global key was 403 but refresh_spies
-- still wrote rows. spy_reports zero rows mislead refresh_estimate into
-- picking them as "freshest"; spy_estimates zero rows mask real estimates.
-- Both are safe to delete — the next successful TornStats/YATA call rebuilds.
DELETE FROM spy_reports
  WHERE source IN ('tornstats', 'yata')
    AND (total IS NULL OR total <= 0)
    AND (strength IS NULL OR strength <= 0)
    AND (defense IS NULL OR defense <= 0)
    AND (speed IS NULL OR speed <= 0)
    AND (dexterity IS NULL OR dexterity <= 0);

DELETE FROM spy_estimates
  WHERE (total IS NULL OR total <= 0)
    AND (strength IS NULL OR strength <= 0)
    AND (defense IS NULL OR defense <= 0)
    AND (speed IS NULL OR speed <= 0)
    AND (dexterity IS NULL OR dexterity <= 0);
