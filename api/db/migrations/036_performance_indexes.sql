CREATE INDEX IF NOT EXISTS idx_spy_estimates_total ON spy_estimates(total DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_comp_ts ON armoury_deposits(competition_id, deposited_at DESC);
