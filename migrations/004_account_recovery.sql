-- 004_account_recovery.sql
-- Password reset and email verification.
--
-- Tokens are random 32-byte values emailed to the user; only a SHA-256 hash
-- is stored, so a database leak cannot be used to reset anyone's password.
-- Each token is single-use and expires (1 h for reset, 24 h for verification).
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(20) NOT NULL CHECK (kind IN ('password_reset','email_verify')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind, created_at);

-- Sessions (JWTs) issued before this moment are rejected, so changing or
-- resetting a password signs out every other device.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
