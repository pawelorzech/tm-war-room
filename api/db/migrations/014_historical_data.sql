-- Stock price history (sampled every ~4 min from background job)
CREATE TABLE IF NOT EXISTS stock_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    price REAL NOT NULL,
    recorded_at INTEGER NOT NULL,
    UNIQUE(stock_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_stock_history_stock_time ON stock_history(stock_id, recorded_at);

-- Member activity snapshots (daily summary)
CREATE TABLE IF NOT EXISTS member_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    total_members INTEGER DEFAULT 0,
    online_count INTEGER DEFAULT 0,
    hospital_count INTEGER DEFAULT 0,
    traveling_count INTEGER DEFAULT 0,
    recorded_at INTEGER NOT NULL,
    UNIQUE(snapshot_date)
);
