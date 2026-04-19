-- Company Director Dashboard — daily snapshots for trend charts.
-- One row per (company, day). Populated by the collect_company_snapshots job.

CREATE TABLE IF NOT EXISTS company_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    -- From /company?selections=detailed
    company_funds INTEGER,
    company_bank INTEGER,
    advertising_budget INTEGER,
    value INTEGER,
    popularity INTEGER,
    efficiency INTEGER,
    environment INTEGER,
    trains_available INTEGER,
    -- From /company/{id}?selections=profile (public, filled when we have it)
    rating INTEGER,
    daily_income INTEGER,
    daily_customers INTEGER,
    weekly_income INTEGER,
    weekly_customers INTEGER,
    employees_hired INTEGER,
    employees_capacity INTEGER,
    recorded_at INTEGER NOT NULL,
    UNIQUE(company_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_company_snap_company_date
    ON company_snapshots(company_id, snapshot_date);

CREATE TABLE IF NOT EXISTS company_employee_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    position TEXT,
    wage INTEGER,
    days_in_company INTEGER,
    effectiveness_total INTEGER,
    effectiveness_working_stats INTEGER,
    effectiveness_addiction INTEGER,
    effectiveness_inactivity INTEGER,
    effectiveness_merits INTEGER,
    effectiveness_director_education INTEGER,
    effectiveness_settled_in INTEGER,
    recorded_at INTEGER NOT NULL,
    UNIQUE(company_id, player_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_company_emp_snap_company_date
    ON company_employee_snapshots(company_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_company_emp_snap_player_date
    ON company_employee_snapshots(player_id, snapshot_date);

CREATE TABLE IF NOT EXISTS company_stock_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    cost INTEGER,
    price INTEGER,
    rrp INTEGER,
    in_stock INTEGER,
    on_order INTEGER,
    sold_amount INTEGER,
    sold_worth INTEGER,
    recorded_at INTEGER NOT NULL,
    UNIQUE(company_id, product_name, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_company_stock_snap_company_date
    ON company_stock_snapshots(company_id, snapshot_date);
