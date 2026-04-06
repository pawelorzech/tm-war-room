ALTER TABLE chat_channels ADD COLUMN write_restricted INTEGER NOT NULL DEFAULT 0;

-- Announcements: everyone reads, only admins write
UPDATE chat_channels SET write_restricted = 1 WHERE name = 'announcements';
