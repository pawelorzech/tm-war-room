-- 028_chat_improvements.sql
-- Fix announcements: visible to all, only admins can post
UPDATE chat_channels SET admin_only = 0, write_restricted = 1 WHERE name = 'announcements';

-- Seed traveling channel
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES ('traveling', 'Travel coordination & updates', 'chat', 5, 0, strftime('%s','now'), 0);

-- Seed leadership channel (admin-only visibility)
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES ('leadership', 'Leadership discussion', 'chat', 0, 1, strftime('%s','now'), 0);
