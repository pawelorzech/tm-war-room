-- Full-text search index over chat_messages.content (Roadmap Task #5).
--
-- We use FTS5 with the unicode61 tokenizer + diacritic stripping so a
-- search for "xanax" matches "Xánax" too. `content=` and `content_rowid=`
-- make this a "contentless-shadow" external-content index: storage lives
-- in chat_messages, FTS5 just keeps its own postings list. That keeps the
-- DB compact and avoids double-writes.
--
-- Triggers keep the index in sync. `deleted = 1` rows get removed from
-- the FTS index so soft-deletes drop out of search results.
--
-- Backfill at the bottom seeds rows that existed before this migration.
CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
    content,
    content='chat_messages',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- INSERT: index every new non-deleted message.
DROP TRIGGER IF EXISTS chat_messages_ai;
CREATE TRIGGER chat_messages_ai AFTER INSERT ON chat_messages
WHEN NEW.deleted = 0
BEGIN
    INSERT INTO chat_messages_fts(rowid, content) VALUES (NEW.id, NEW.content);
END;

-- UPDATE: re-index when content changes or when delete flag flips.
-- We use the FTS5 "delete" sentinel insert to remove the previous version.
DROP TRIGGER IF EXISTS chat_messages_au;
CREATE TRIGGER chat_messages_au AFTER UPDATE ON chat_messages
BEGIN
    INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content)
        VALUES('delete', OLD.id, OLD.content);
    INSERT INTO chat_messages_fts(rowid, content)
        SELECT NEW.id, NEW.content WHERE NEW.deleted = 0;
END;

-- DELETE: drop from the index. Soft-deletes are handled by the UPDATE
-- trigger above, but a real DELETE (e.g. manual cleanup) still needs to
-- cascade.
DROP TRIGGER IF EXISTS chat_messages_ad;
CREATE TRIGGER chat_messages_ad AFTER DELETE ON chat_messages
BEGIN
    INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content)
        VALUES('delete', OLD.id, OLD.content);
END;

-- Backfill existing rows. INSERT OR IGNORE so re-running the migration
-- is idempotent (the runner records applied migrations, but this is
-- defence in depth).
INSERT INTO chat_messages_fts(rowid, content)
    SELECT id, content FROM chat_messages
    WHERE deleted = 0
      AND id NOT IN (SELECT rowid FROM chat_messages_fts);
