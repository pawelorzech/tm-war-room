-- Backfill chat_mention=true on existing push subscriptions.
--
-- Sections C/D of plan po-pierwsze-w-czacie-mutable-pelican.md add a new
-- "Chat mentions" toggle to Settings. New subscribers automatically get
-- chat_mention=true via DEFAULT_PREFERENCES, but existing rows lack the key,
-- so get_by_player_and_preference("chat_mention") would silently exclude them.
-- This UPDATE only touches rows that don't already have the key set.
UPDATE push_subscriptions
SET preferences = json_set(preferences, '$.chat_mention', json('true'))
WHERE json_extract(preferences, '$.chat_mention') IS NULL;
