-- 005_representation.sql
-- Phase 3: agents, licence tracking, managed-athlete contracts and deals.

-- ---------------------------------------------------------------- agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email CITEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notes VARCHAR(300);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS license_verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS license_verified_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ------------------------------------------------------------- contracts
-- For a player under 18 a reference to the signed guardian consent is mandatory.
ALTER TABLE managed_athletes ADD COLUMN IF NOT EXISTS guardian_consent_ref VARCHAR(120);
ALTER TABLE managed_athletes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE managed_athletes ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE managed_athletes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Compliance guard enforced by the database itself, so it holds no matter which
-- code path writes a contract:
--   * Football: the agent's licence must be 'active' and not past its expiry.
--   * The agent must be registered for the player's sport.
--   * Minors: guardian_consent_ref is required.
-- It runs when a contract is created or (re)activated, so terminating or
-- expiring a contract is never blocked by a lapsed licence.
CREATE OR REPLACE FUNCTION enforce_managed_athlete_rules() RETURNS TRIGGER AS $$
DECLARE
  p_sport_id SMALLINT; p_sport TEXT; p_minor BOOLEAN;
  a_status license_status; a_expiry DATE;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.agent_id = NEW.agent_id AND OLD.player_id = NEW.player_id THEN
    RETURN NEW; -- editing an already-active contract in place (notes, end date, commission)
  END IF;
  SELECT p.sport_id, s.name, p.is_minor INTO p_sport_id, p_sport, p_minor
    FROM players p JOIN sports s ON s.id = p.sport_id WHERE p.id = NEW.player_id;
  SELECT license_status, license_expiry INTO a_status, a_expiry FROM agents WHERE id = NEW.agent_id;
  IF NOT EXISTS (SELECT 1 FROM agent_sports WHERE agent_id = NEW.agent_id AND sport_id = p_sport_id) THEN
    RAISE EXCEPTION 'AGENT_SPORT: this agent is not registered for %', p_sport USING ERRCODE = 'P0001';
  END IF;
  IF p_sport = 'Football' AND (a_status <> 'active' OR (a_expiry IS NOT NULL AND a_expiry < CURRENT_DATE)) THEN
    RAISE EXCEPTION 'AGENT_LICENCE: football representation requires an agent with an active, unexpired licence' USING ERRCODE = 'P0001';
  END IF;
  IF p_minor AND COALESCE(btrim(NEW.guardian_consent_ref), '') = '' THEN
    RAISE EXCEPTION 'GUARDIAN_CONSENT: a guardian consent reference is required for a player under 18' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_managed_athletes_rules ON managed_athletes;
CREATE TRIGGER trg_managed_athletes_rules BEFORE INSERT OR UPDATE ON managed_athletes
  FOR EACH ROW EXECUTE FUNCTION enforce_managed_athlete_rules();

-- ----------------------------------------------------------------- deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS notes VARCHAR(300);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- Public "placements" are opt-in: a closed deal is shown on the website only after
-- staff confirm the athlete (or guardian) agreed, and only with a short summary
-- written by staff. Money amounts are never published.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS athlete_consented BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS public_summary VARCHAR(160);
ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deals_public;
ALTER TABLE deals ADD CONSTRAINT chk_deals_public CHECK (
  NOT is_public OR (status = 'closed' AND athlete_consented AND COALESCE(btrim(public_summary), '') <> ''));
ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deals_amounts;
ALTER TABLE deals ADD CONSTRAINT chk_deals_amounts CHECK (
  (value_amount IS NULL OR value_amount >= 0) AND (commission_amount IS NULL OR commission_amount >= 0));
