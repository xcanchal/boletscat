CREATE TABLE IF NOT EXISTS user_access (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  entitlement_id TEXT NOT NULL DEFAULT 'boletada_pro',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'grace_period')),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_access_status_idx ON user_access(status);
CREATE INDEX IF NOT EXISTS user_access_expires_at_idx ON user_access(expires_at);
