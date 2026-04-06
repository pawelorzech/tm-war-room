-- Chat/Forum system tables

-- Channels (like Discord channels)
CREATE TABLE IF NOT EXISTS chat_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'chat',
    position INTEGER DEFAULT 0,
    admin_only INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by INTEGER NOT NULL
);

-- Bot accounts (for automated posting by agents/scripts)
CREATE TABLE IF NOT EXISTS chat_bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    avatar TEXT DEFAULT 'bot',
    allowed_channels TEXT DEFAULT '*',
    created_by INTEGER NOT NULL,
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- Threads (forum topics or chat sub-threads)
CREATE TABLE IF NOT EXISTS chat_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES chat_channels(id),
    title TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_message_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_channel ON chat_threads(channel_id, last_message_at DESC);

-- Messages (chat messages + forum post bodies)
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES chat_channels(id),
    thread_id INTEGER REFERENCES chat_threads(id),
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    content TEXT NOT NULL,
    bot_id INTEGER REFERENCES chat_bots(id),
    mentions TEXT DEFAULT '[]',
    pinned INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON chat_messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id, created_at);

-- Read tracking (per-user last-read position)
CREATE TABLE IF NOT EXISTS chat_read_positions (
    player_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    thread_id INTEGER DEFAULT 0,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, channel_id, thread_id)
);

-- Muted users
CREATE TABLE IF NOT EXISTS chat_mutes (
    player_id INTEGER NOT NULL PRIMARY KEY,
    muted_by INTEGER NOT NULL,
    reason TEXT DEFAULT '',
    muted_until INTEGER,
    created_at INTEGER NOT NULL
);

-- Seed default channels
INSERT OR IGNORE INTO chat_channels (name, description, type, position, admin_only, created_at, created_by)
VALUES
    ('general', 'General faction chat', 'chat', 1, 0, strftime('%s','now'), 0),
    ('war-room', 'War coordination & strategy', 'chat', 2, 0, strftime('%s','now'), 0),
    ('trading', 'Market deals & item trading', 'chat', 3, 0, strftime('%s','now'), 0),
    ('off-topic', 'Anything goes', 'chat', 4, 0, strftime('%s','now'), 0),
    ('announcements', 'Faction announcements', 'forum', 0, 1, strftime('%s','now'), 0);
