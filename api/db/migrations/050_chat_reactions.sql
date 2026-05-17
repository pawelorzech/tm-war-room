-- Emoji reactions on chat messages.
--
-- One row = one (message, player, emoji) triple. PK gives idempotency: the
-- router uses INSERT OR IGNORE, so adding the same reaction twice is a
-- no-op without raising.
--
-- player_name is denormalised here for the same reason chat_messages
-- denormalises it: we want a single SELECT to return everything the UI
-- needs (chip with count + tooltip with reactor names) without joining
-- against member_keys, which the chat repo cannot reach cleanly.
--
-- ON DELETE CASCADE so soft-deleting (chat_messages.deleted = 1) doesn't
-- leak orphan reaction rows when a message is hard-purged later.

CREATE TABLE IF NOT EXISTS chat_reactions (
    message_id  INTEGER NOT NULL,
    player_id   INTEGER NOT NULL,
    player_name TEXT    NOT NULL,
    emoji       TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (message_id, player_id, emoji),
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
