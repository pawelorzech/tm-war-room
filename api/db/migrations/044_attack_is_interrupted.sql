-- v2 faction/attacks added the is_interrupted boolean which marks whether an
-- attack was cut short (e.g. defender re-hospitalized or fled mid-attack).
-- Affects whether the hit counts toward chain respect — see Torn API docs.
-- Old rows backfill as 0 (the v1 default); future fetches propagate the real value.
ALTER TABLE attack_log ADD COLUMN is_interrupted INTEGER DEFAULT 0;
