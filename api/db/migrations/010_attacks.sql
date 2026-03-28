CREATE TABLE IF NOT EXISTS attack_log (
    id INTEGER PRIMARY KEY,
    attacker_id INTEGER NOT NULL,
    attacker_name TEXT,
    defender_id INTEGER NOT NULL,
    defender_name TEXT,
    defender_faction_id INTEGER,
    defender_faction_name TEXT,
    result TEXT NOT NULL,
    respect_gain REAL DEFAULT 0,
    chain INTEGER DEFAULT 0,
    is_ranked_war INTEGER DEFAULT 0,
    is_raid INTEGER DEFAULT 0,
    started INTEGER NOT NULL,
    ended INTEGER NOT NULL,
    fair_fight REAL DEFAULT 1,
    war_modifier REAL DEFAULT 1,
    chain_modifier REAL DEFAULT 1,
    UNIQUE(id)
);
CREATE INDEX IF NOT EXISTS idx_atk_attacker ON attack_log(attacker_id);
CREATE INDEX IF NOT EXISTS idx_atk_defender ON attack_log(defender_id);
CREATE INDEX IF NOT EXISTS idx_atk_started ON attack_log(started);
CREATE INDEX IF NOT EXISTS idx_atk_chain ON attack_log(chain);
