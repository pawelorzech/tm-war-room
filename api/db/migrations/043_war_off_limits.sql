-- Migration 043: war-scoped "off-limits" tracker (med-out / dip agreements).
-- Members flag specific enemy players as "do not attack" during a war.
-- Wpis żyje w kontekście konkretnej war_id; po zakończeniu wojny przestaje być
-- pokazywany (filter w UI). Brak TTL — semantyka "do końca wojny" jest sztywna.
CREATE TABLE IF NOT EXISTS war_off_limits (
    war_id        INTEGER NOT NULL,
    player_id     INTEGER NOT NULL,
    player_name   TEXT    NOT NULL,
    set_by        INTEGER NOT NULL,
    set_by_name   TEXT    NOT NULL,
    reason        TEXT    DEFAULT '',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (war_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_war_off_limits_war ON war_off_limits(war_id);
CREATE INDEX IF NOT EXISTS idx_war_off_limits_set_by ON war_off_limits(set_by);
