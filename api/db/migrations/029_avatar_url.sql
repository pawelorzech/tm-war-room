-- 029_avatar_url.sql
-- Add avatar tracking to member_keys
ALTER TABLE member_keys ADD COLUMN avatar_url TEXT;
ALTER TABLE member_keys ADD COLUMN avatar_fetched_at INTEGER;
