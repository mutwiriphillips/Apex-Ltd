-- 003_media_and_introductions.sql
-- Athlete photo upload, direct video upload, and the private scout-contact
-- pathway.
--
-- Storage note: uploads are kept in Postgres (BYTEA) because Render's web
-- service filesystem is ephemeral. Binary data lives in its own tables so
-- list queries never load it. Size caps are enforced in the API (see
-- MAX_PHOTO_MB / MAX_VIDEO_MB). Move to object storage before volumes grow.

-- One current profile photo per player. Replacing it resets moderation.
CREATE TABLE IF NOT EXISTS player_photos (
  player_id         UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  content_type      VARCHAR(30) NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  data              BYTEA NOT NULL,
  byte_size         INTEGER NOT NULL,
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_photos_moderation ON player_photos(moderation_status);

-- Directly uploaded highlight videos. The highlight row carries the title,
-- description and moderation state; this table carries the bytes.
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'link'
  CHECK (source IN ('link','upload'));

CREATE TABLE IF NOT EXISTS highlight_videos (
  highlight_id UUID PRIMARY KEY REFERENCES highlights(id) ON DELETE CASCADE,
  content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('video/mp4','video/webm','video/quicktime')),
  data         BYTEA NOT NULL,
  byte_size    INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Private contact details for a player (or, for a minor, their guardian).
-- NEVER exposed by v_public_player_directory or any public endpoint.
CREATE TABLE IF NOT EXISTS player_contacts (
  player_id  UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  email      CITEXT,
  phone      VARCHAR(30),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scout / club / sponsor introduction requests. Requesters never see athlete
-- contact details. Staff vet each request; an approved request is shown to
-- the athlete (or guardian), who decides whether to reply.
CREATE TABLE IF NOT EXISTS introduction_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  requester_name  VARCHAR(100) NOT NULL,
  organisation    VARCHAR(120) NOT NULL,
  requester_email CITEXT NOT NULL,
  requester_phone VARCHAR(30),
  message         VARCHAR(600) NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','declined','closed')),
  staff_note      VARCHAR(300),
  handled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at      TIMESTAMPTZ,
  owner_decision  VARCHAR(10) CHECK (owner_decision IN ('accepted','declined')),
  owner_decided_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intro_player ON introduction_requests(player_id, status);
CREATE INDEX IF NOT EXISTS idx_intro_status ON introduction_requests(status, created_at);
