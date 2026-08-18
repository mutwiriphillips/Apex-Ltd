-- 002_player_accounts.sql
-- Adds the ability for a guardian to log in and manage the minor
-- players they registered, and (implicitly, via the existing
-- players.user_id column from 001_init.sql) for an adult player to
-- manage their own profile after creating an account.

-- A guardian's user account is not the minor's account — minors do not
-- log in themselves. One guardian user can be linked to multiple
-- guardians rows (siblings), hence no UNIQUE constraint here, unlike
-- players.user_id which is one-to-one.
ALTER TABLE guardians ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_guardians_user ON guardians(user_id);

COMMENT ON COLUMN guardians.user_id IS
  'Optional link to the guardian''s own login account, set when a logged-in '
  'guardian registers a minor player (see POST /api/players). NULL for '
  'minors registered anonymously through the open registration form.';
