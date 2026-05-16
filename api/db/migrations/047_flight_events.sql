-- FFScouter parity (Phase 0): per-player travel events.
--
-- One row per departure. `landed_at` stays NULL while the flight is in-air;
-- the partial index ix_flight_events_active makes "who is currently flying?"
-- a cheap point lookup. `ticket_class` is the four-state Torn ticket type
-- (standard / business / wlt = Wind Lines Tickets / book = Torn book travel).
-- `observed_at` is when the event was first recorded (may differ from
-- departed_at when we backfill from history). `source` is free-form so we can
-- distinguish e.g. 'torn_api' from 'companion_scrape'.
CREATE TABLE IF NOT EXISTS flight_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    departed_at INTEGER NOT NULL,
    destination TEXT NOT NULL,
    ticket_class TEXT NOT NULL CHECK (ticket_class IN ('standard', 'business', 'wlt', 'book')),
    landed_at INTEGER,
    observed_at INTEGER NOT NULL,
    source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_flight_events_player_observed ON flight_events(player_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS ix_flight_events_active ON flight_events(player_id, landed_at) WHERE landed_at IS NULL;
