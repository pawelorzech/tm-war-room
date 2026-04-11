-- Composite index for chat message queries that filter by channel + deleted status
-- Covers the hot path: SELECT ... WHERE channel_id=? AND deleted=0 ORDER BY id DESC
CREATE INDEX IF NOT EXISTS idx_messages_channel_undeleted
ON chat_messages(channel_id, deleted, id DESC);
