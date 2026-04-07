-- 030_presence.sql
-- Player presence tracking for hub-wide heartbeat
CREATE TABLE IF NOT EXISTS player_presence (
    player_id  INTEGER PRIMARY KEY,
    last_seen  INTEGER NOT NULL
);
