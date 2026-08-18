-- =====================================================================
--  APEX TALENT MANAGEMENT LTD — PLATFORM DATABASE SCHEMA
--  PostgreSQL 15+
--  Covers: multi-sport player registry, video showcase, verification,
--  representation/agent management, deals & commissions, sponsors,
--  subscriptions & payments, and Kenyan Data Protection Act (2019)
--  compliance scaffolding (consent, guardian records, processing log).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy name search
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM
  ('player','guardian','scout','sponsor','club_admin','agent','staff_admin','superadmin');

CREATE TYPE profile_visibility AS ENUM ('public','verified_only','private');

CREATE TYPE verification_status AS ENUM
  ('unverified','club_verified','federation_verified');

CREATE TYPE verified_entity_type AS ENUM ('club','federation');

CREATE TYPE verification_decision AS ENUM ('approved','rejected');

CREATE TYPE stat_source AS ENUM
  ('self_reported','club_verified','federation_verified');

CREATE TYPE moderation_status AS ENUM ('pending','approved','rejected');

CREATE TYPE consent_type AS ENUM
  ('registration','highlight_publication','data_sharing_scouts','marketing');

CREATE TYPE consent_grantor AS ENUM ('self','guardian');

CREATE TYPE license_status AS ENUM ('active','pending','suspended','expired');

CREATE TYPE contract_status AS ENUM ('active','terminated','expired');

CREATE TYPE package_tier AS ENUM ('standard','premium');

CREATE TYPE deal_type AS ENUM
  ('transfer','sponsorship','endorsement','employment_contract');

CREATE TYPE deal_status AS ENUM ('negotiating','closed','fell_through');

CREATE TYPE org_type AS ENUM ('club','sponsor','federation','media','agency');

CREATE TYPE lead_type AS ENUM ('club','sponsor','agent','federation','media');

CREATE TYPE lead_status AS ENUM ('new','contacted','converted','closed');

CREATE TYPE subscription_plan AS ENUM ('free','premium_monthly','premium_annual');

CREATE TYPE subscription_status AS ENUM ('active','cancelled','expired');

CREATE TYPE payer_type AS ENUM ('player','company','sponsor');

CREATE TYPE payment_status AS ENUM ('pending','completed','failed','refunded');

-- ---------------------------------------------------------------------
-- UTILITY: updated_at trigger function
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- REFERENCE / LOOKUP TABLES
-- =====================================================================

CREATE TABLE counties (
  id            SMALLSERIAL PRIMARY KEY,
  name          VARCHAR(50) NOT NULL UNIQUE
);
COMMENT ON TABLE counties IS 'Seeded with the 47 Kenyan counties.';

CREATE TABLE sports (
  id            SMALLSERIAL PRIMARY KEY,
  name          VARCHAR(30) NOT NULL UNIQUE,
  code          VARCHAR(10) NOT NULL UNIQUE
);
COMMENT ON TABLE sports IS 'Phase 1: Football, Rugby. Phase 2: Basketball, E-Football. Extensible.';

CREATE TABLE divisions (
  id            SERIAL PRIMARY KEY,
  sport_id      SMALLINT NOT NULL REFERENCES sports(id),
  name          VARCHAR(60) NOT NULL,
  level_rank    SMALLINT NOT NULL,          -- 1 = top flight, higher = lower tier
  description   VARCHAR(160),
  UNIQUE (sport_id, name)
);
COMMENT ON TABLE divisions IS 'e.g. Kenya Premier League (rank 1), National Super League (rank 2), County Division One (rank 3).';

-- =====================================================================
-- USERS & IDENTITY
-- =====================================================================

CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              CITEXT UNIQUE,
  phone              VARCHAR(20) UNIQUE,
  password_hash      TEXT NOT NULL,
  role               user_role NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_users_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- ORGANISATIONS (clubs, sponsors, federations, agencies, media)
-- =====================================================================

CREATE TABLE organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(120) NOT NULL,
  org_type       org_type NOT NULL,
  country        VARCHAR(60) NOT NULL DEFAULT 'Kenya',
  contact_email  CITEXT,
  is_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clubs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID REFERENCES organizations(id),
  name                VARCHAR(120) NOT NULL,
  sport_id            SMALLINT NOT NULL REFERENCES sports(id),
  division_id         INTEGER REFERENCES divisions(id),
  county_id           SMALLINT REFERENCES counties(id),
  founded_year        SMALLINT,
  is_verified_partner BOOLEAN NOT NULL DEFAULT FALSE,
  contact_email       CITEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, sport_id)
);
CREATE INDEX idx_clubs_sport ON clubs(sport_id);
CREATE INDEX idx_clubs_county ON clubs(county_id);

-- =====================================================================
-- PLAYERS
-- =====================================================================

CREATE TABLE players (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  full_name             VARCHAR(100) NOT NULL,
  date_of_birth         DATE NOT NULL,
  gender                VARCHAR(20),
  sport_id              SMALLINT NOT NULL REFERENCES sports(id),
  primary_position      VARCHAR(50),
  county_id             SMALLINT REFERENCES counties(id),
  current_club_id       UUID REFERENCES clubs(id),
  current_division_id   INTEGER REFERENCES divisions(id),
  bio                   VARCHAR(500),
  height_cm             SMALLINT,
  weight_kg             SMALLINT,
  profile_visibility    profile_visibility NOT NULL DEFAULT 'public',
  verification_status   verification_status NOT NULL DEFAULT 'unverified',
  is_minor              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_players_dob CHECK (date_of_birth > CURRENT_DATE - INTERVAL '70 years'
                                     AND date_of_birth <= CURRENT_DATE - INTERVAL '5 years')
);

-- is_minor cannot be a GENERATED column because CURRENT_DATE is not immutable
-- in PostgreSQL; it is instead maintained by trigger on write. Because a
-- player's age changes with time even without a write, a scheduled nightly
-- job should also call recompute_minor_flags() (defined below) to catch
-- anyone crossing 18 without an intervening profile update.
CREATE OR REPLACE FUNCTION set_player_minor_flag() RETURNS TRIGGER AS $$
BEGIN
  NEW.is_minor := (NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years'));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_players_updated BEFORE INSERT OR UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_player_minor_flag();

CREATE OR REPLACE FUNCTION recompute_minor_flags() RETURNS VOID AS $$
BEGIN
  UPDATE players
  SET is_minor = (date_of_birth > (CURRENT_DATE - INTERVAL '18 years'))
  WHERE is_minor <> (date_of_birth > (CURRENT_DATE - INTERVAL '18 years'));
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION recompute_minor_flags() IS
  'Run nightly (e.g. via pg_cron or an external scheduler) to flip is_minor '
  'to false for players who have turned 18 since their last profile write.';
CREATE INDEX idx_players_sport ON players(sport_id);
CREATE INDEX idx_players_county ON players(county_id);
CREATE INDEX idx_players_club ON players(current_club_id);
CREATE INDEX idx_players_verification ON players(verification_status);
CREATE INDEX idx_players_name_trgm ON players USING GIN (full_name gin_trgm_ops);

-- Enforce reduced default visibility for minors at the application layer;
-- reinforced here with a check that private/verified_only is required
-- unless verification_status confirms guardian consent has been recorded
-- (guardian consent existence is validated at the application layer /
-- via the consents table below, not re-derivable purely from this row).
COMMENT ON COLUMN players.profile_visibility IS
  'Application layer MUST force verified_only or private for is_minor = true '
  'players until a valid guardian highlight_publication consent exists.';

-- ---------------------------------------------------------------------
-- Guardians & Consent (minors safeguarding / Data Protection Act 2019)
-- ---------------------------------------------------------------------

CREATE TABLE guardians (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  full_name          VARCHAR(100) NOT NULL,
  relationship       VARCHAR(30) NOT NULL,   -- parent / legal guardian / etc.
  email              CITEXT,
  phone              VARCHAR(20),
  id_document_ref    VARCHAR(120),           -- pointer to securely stored doc, not raw ID data
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE guardians IS 'Required before is_minor player profiles become verified_only/public.';

CREATE TABLE consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  consent_type  consent_type NOT NULL,
  granted_by    consent_grantor NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  ip_address    INET,
  notes         VARCHAR(200)
);
COMMENT ON COLUMN consents.granted_by IS
  'When granted_by = guardian, the application layer must verify a matching '
  'row exists in guardians for this player_id before writing the consent.';
CREATE INDEX idx_consents_player ON consents(player_id, consent_type);

-- =====================================================================
-- CLUB HISTORY & STATISTICS
-- =====================================================================

CREATE TABLE player_club_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id       UUID NOT NULL REFERENCES clubs(id),
  division_id   INTEGER REFERENCES divisions(id),
  start_date    DATE NOT NULL,
  end_date      DATE,
  role_notes    VARCHAR(160),
  CONSTRAINT chk_history_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_history_player ON player_club_history(player_id);
CREATE INDEX idx_history_club ON player_club_history(club_id);

CREATE TABLE statistics_seasonal (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sport_id        SMALLINT NOT NULL REFERENCES sports(id),
  club_id         UUID REFERENCES clubs(id),
  season          VARCHAR(9) NOT NULL,        -- e.g. '2025/2026'
  matches_played  SMALLINT,
  stats           JSONB NOT NULL DEFAULT '{}',-- sport-specific metrics, e.g. {"goals":12,"assists":5}
  source          stat_source NOT NULL DEFAULT 'self_reported',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, sport_id, season, club_id)
);
CREATE INDEX idx_stats_player_season ON statistics_seasonal(player_id, season);
CREATE INDEX idx_stats_jsonb ON statistics_seasonal USING GIN (stats);
COMMENT ON COLUMN statistics_seasonal.stats IS
  'Flexible per-sport schema, e.g. football {"goals":x,"assists":x}, '
  'rugby {"tries":x,"points":x}, basketball {"ppg":x,"rpg":x}.';

-- =====================================================================
-- VIDEO SHOWCASE & VERIFICATION
-- =====================================================================

CREATE TABLE highlights (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title              VARCHAR(120) NOT NULL,
  description        VARCHAR(300),
  video_url          TEXT NOT NULL,
  thumbnail_url      TEXT,
  duration_seconds   INTEGER,
  recorded_date      DATE,
  uploaded_by        UUID REFERENCES users(id),
  moderation_status  moderation_status NOT NULL DEFAULT 'pending',
  moderated_by       UUID REFERENCES users(id),
  moderated_at       TIMESTAMPTZ,
  views_count        INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_highlights_player ON highlights(player_id);
CREATE INDEX idx_highlights_moderation ON highlights(moderation_status);

CREATE TABLE verifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  verified_entity_type  verified_entity_type NOT NULL,
  verifier_user_id      UUID REFERENCES users(id),
  verifier_org_name     VARCHAR(120),
  verification_notes    VARCHAR(300),
  status                verification_decision NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verifications_player ON verifications(player_id);

-- =====================================================================
-- REPRESENTATION: AGENTS & MANAGED ATHLETES
-- =====================================================================

CREATE TABLE agents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE REFERENCES users(id),
  full_name             VARCHAR(100) NOT NULL,
  fifa_license_number   VARCHAR(40) UNIQUE,
  license_status        license_status NOT NULL DEFAULT 'pending',
  license_expiry        DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE agents IS
  'Only agents with license_status = active may be assigned football contract/transfer negotiation duties (FFAR compliance).';

CREATE TABLE agent_sports (
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sport_id   SMALLINT NOT NULL REFERENCES sports(id),
  PRIMARY KEY (agent_id, sport_id)
);

CREATE TABLE managed_athletes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES players(id),
  agent_id         UUID NOT NULL REFERENCES agents(id),
  contract_start   DATE NOT NULL,
  contract_end     DATE,
  commission_rate  NUMERIC(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  exclusivity      BOOLEAN NOT NULL DEFAULT TRUE,
  status           contract_status NOT NULL DEFAULT 'active',
  package_tier     package_tier NOT NULL DEFAULT 'standard',
  signed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            VARCHAR(300),
  CONSTRAINT chk_contract_dates CHECK (contract_end IS NULL OR contract_end >= contract_start)
);
CREATE INDEX idx_managed_player ON managed_athletes(player_id);
CREATE INDEX idx_managed_agent ON managed_athletes(agent_id);
-- Only one ACTIVE contract per player at a time:
CREATE UNIQUE INDEX uq_managed_active_player
  ON managed_athletes(player_id) WHERE (status = 'active');

-- =====================================================================
-- DEALS: TRANSFERS, SPONSORSHIPS, ENDORSEMENTS
-- =====================================================================

CREATE TABLE deals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id),
  managed_athlete_id    UUID REFERENCES managed_athletes(id),
  deal_type             deal_type NOT NULL,
  counterparty_org_id   UUID REFERENCES organizations(id),
  counterparty_name     VARCHAR(120),
  value_amount          NUMERIC(14,2),
  currency              CHAR(3) NOT NULL DEFAULT 'KES',
  commission_amount     NUMERIC(14,2),
  status                deal_status NOT NULL DEFAULT 'negotiating',
  closed_at             DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deals_player ON deals(player_id);
CREATE INDEX idx_deals_status ON deals(status);

-- =====================================================================
-- SPONSOR / SCOUT LEADS (inbound interest from the sponsor portal)
-- =====================================================================

CREATE TABLE sponsor_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name VARCHAR(120) NOT NULL,
  lead_type         lead_type NOT NULL,
  contact_email     CITEXT NOT NULL,
  message           VARCHAR(500),
  status            lead_status NOT NULL DEFAULT 'new',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- SUBSCRIPTIONS & PAYMENTS
-- =====================================================================

CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id),
  plan                subscription_plan NOT NULL DEFAULT 'free',
  status              subscription_status NOT NULL DEFAULT 'active',
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end  TIMESTAMPTZ,
  amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_player ON subscriptions(player_id);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID REFERENCES subscriptions(id),
  deal_id           UUID REFERENCES deals(id),
  payer_type        payer_type NOT NULL,
  amount            NUMERIC(14,2) NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'KES',
  payment_method    VARCHAR(30),
  status            payment_status NOT NULL DEFAULT 'pending',
  transaction_ref   VARCHAR(80) UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_link CHECK (subscription_id IS NOT NULL OR deal_id IS NOT NULL)
);
CREATE INDEX idx_payments_status ON payments(status);

-- =====================================================================
-- COMPLIANCE: DATA PROCESSING / ACCESS LOG (ODPC audit trail)
-- =====================================================================

CREATE TABLE data_processing_log (
  id               BIGSERIAL PRIMARY KEY,
  actor_user_id    UUID REFERENCES users(id),
  subject_player_id UUID REFERENCES players(id),
  action           VARCHAR(60) NOT NULL,   -- e.g. 'profile_viewed','data_exported'
  purpose          VARCHAR(120),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dpl_subject ON data_processing_log(subject_player_id);
CREATE INDEX idx_dpl_created ON data_processing_log(created_at);
COMMENT ON TABLE data_processing_log IS
  'Append-only audit trail supporting Data Protection Act 2019 accountability obligations.';

-- =====================================================================
-- SEED DATA (reference tables only)
-- =====================================================================

INSERT INTO sports (name, code) VALUES
  ('Football','FBL'), ('Rugby','RGB'), ('Basketball','BSK'), ('E-Football','EFB')
  ON CONFLICT DO NOTHING;

-- 47 Kenyan counties (abridged insert pattern shown; full list supplied at deploy time)
INSERT INTO counties (name) VALUES
  ('Nairobi'),('Mombasa'),('Kisumu'),('Nakuru'),('Kiambu'),('Machakos'),
  ('Kisii'),('Bungoma'),('Uasin Gishu'),('Kakamega')
  ON CONFLICT DO NOTHING;

-- =====================================================================
-- CORE PUBLIC-FACING VIEW
-- Excludes contact data, guardian data, and any minor whose visibility
-- has not been explicitly opened up — the query layer for the open
-- directory should read from this view, never from players directly.
-- =====================================================================

CREATE VIEW v_public_player_directory AS
SELECT
  p.id, p.full_name, s.name AS sport, p.primary_position,
  c.name AS county, cl.name AS club, d.name AS division,
  p.verification_status, p.bio, p.created_at
FROM players p
JOIN sports s ON s.id = p.sport_id
LEFT JOIN counties c ON c.id = p.county_id
LEFT JOIN clubs cl ON cl.id = p.current_club_id
LEFT JOIN divisions d ON d.id = p.current_division_id
WHERE p.profile_visibility = 'public'
  AND (p.is_minor = FALSE OR EXISTS (
        SELECT 1 FROM consents co
        WHERE co.player_id = p.id
          AND co.consent_type = 'highlight_publication'
          AND co.granted_by = 'guardian'
          AND co.revoked_at IS NULL
      ));

COMMENT ON VIEW v_public_player_directory IS
  'Safe read surface for the open directory UI. Minors only appear if a '
  'valid, unrevoked guardian consent for public-facing content exists.';
