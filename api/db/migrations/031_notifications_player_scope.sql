ALTER TABLE notifications ADD COLUMN player_id INTEGER;

UPDATE notifications
SET player_id = CAST(json_extract(data, '$.player_id') AS INTEGER)
WHERE player_id IS NULL
  AND json_valid(data)
  AND json_type(data, '$.player_id') IN ('integer', 'text');

DELETE FROM notifications WHERE player_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_player_read_created
    ON notifications(player_id, read, created_at);
