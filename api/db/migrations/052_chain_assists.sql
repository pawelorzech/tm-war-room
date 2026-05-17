-- Chain-assist callout state (Roadmap Task #10).
--
-- One row per chain-assist invocation. `hitters` is a JSON array of
-- {id, name} dicts — denormalised so the card render needs zero joins.
--
-- `target_status_state` tracks the last-observed Torn API state (Okay,
-- Hospital, Jail, ...). The scheduler polls active assists every 30s and
-- emits a "back up!" push when this flips Hospital → Okay.
--
-- `ended_at` non-NULL = assist closed (timer expired, leader ended it,
-- target left faction, etc.). Closed assists stay in the table for the
-- chat history card to keep rendering correctly.

CREATE TABLE IF NOT EXISTS chain_assists (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id          INTEGER NOT NULL REFERENCES chat_channels(id),
    message_id          INTEGER REFERENCES chat_messages(id),
    target_id           INTEGER NOT NULL,
    target_name         TEXT    NOT NULL DEFAULT '',
    target_status_state TEXT    NOT NULL DEFAULT '',
    started_by          INTEGER NOT NULL,
    started_by_name     TEXT    NOT NULL DEFAULT '',
    started_at          INTEGER NOT NULL,
    ended_at            INTEGER,
    hitters             TEXT    NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_chain_assists_active ON chain_assists(ended_at, channel_id);
CREATE INDEX IF NOT EXISTS idx_chain_assists_target ON chain_assists(target_id, ended_at);
