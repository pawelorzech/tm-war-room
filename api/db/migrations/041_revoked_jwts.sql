-- F-16: server-side JWT revocation list. Stateless JWT cannot be killed before exp;
-- this table stores jti claims of explicitly logged-out tokens. Auto-cleanup periodic.
CREATE TABLE IF NOT EXISTS revoked_jwts (
    jti TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER NOT NULL,
    player_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_revoked_jwts_expires ON revoked_jwts (expires_at);
