# Apex Talent Management — Deployable Platform

Kenya's multi-sport player registry, video showcase, and representation platform.
This is the working backend + frontend for the platform, wired to the PostgreSQL
schema from the Database Design Document, and packaged to deploy directly on
[Render](https://render.com) as a Blueprint (web service + managed Postgres).

Everything in this package has been tested end-to-end against a real
PostgreSQL 16 instance — schema migration (including upgrading an
already-deployed database), player registration (adult and
minor/guardian-consent flows), the public directory's minor-safeguarding
filter, highlight submission and admin moderation, sponsor/scout leads,
JWT authentication and role-based access control, and player/guardian
self-service accounts including cross-account attack attempts — before
being handed off.

---

## What's in this package

```
apex-talent-management/
├── render.yaml            # Render Blueprint: web service + Postgres database
├── package.json
├── server.js               # Express app entry point
├── scripts/
│   └── create-admin.js      # CLI to provision the first staff_admin account
├── src/
│   ├── db.js                 # PostgreSQL connection pool
│   ├── migrate.js            # Idempotent migration runner (auto-runs on deploy)
│   ├── auth.js                # Password hashing, JWT issuance, requireAuth/requireRole middleware
│   ├── helpers.js             # find-or-create lookups (county/club/division)
│   └── routes/
│       ├── players.js        # GET/POST /api/players
│       ├── highlights.js     # GET/POST /api/highlights
│       ├── leads.js          # POST /api/leads (sponsor/scout portal)
│       ├── stats.js          # GET /api/stats/summary (homepage scoreboard)
│       ├── auth.js            # POST /api/auth/register, /api/auth/login, /api/auth/bootstrap-admin
│       ├── admin.js           # Highlight moderation + player verification (staff-only)
│       └── account.js         # Player/guardian self-service profile & consent management
├── migrations/
│   ├── 001_init.sql          # Full schema (copy of the Database Design Document's schema.sql)
│   └── 002_player_accounts.sql  # Adds guardians.user_id for account linkage
├── public/
│   ├── index.html            # The platform frontend
│   ├── account.html          # Player / guardian self-service dashboard
│   ├── admin.html            # Staff moderation dashboard
│   ├── privacy.html          # Draft privacy policy
│   ├── terms.html            # Draft terms of use
│   └── child-safety.html     # Draft child safeguarding policy
├── .env.example
└── .gitignore
```

---

## How migrations work (and what changed if you deployed before this update)

`src/migrate.js` tracks which migration files have been applied in a
`schema_migrations` table, keyed by filename, and applies any new,
unrecorded file it finds in `/migrations` on every boot — this is what
makes it safe to add `002_player_accounts.sql` (or any future migration)
and just redeploy, rather than needing a fresh database each time.

**If you deployed an earlier version of this project** (before
`schema_migrations` existed), your database already has the schema from
`001_init.sql` applied, but no tracking record for it. The migration
runner detects this automatically — it checks whether the `players` table
already exists, and if so, records `001_init.sql` as applied *without*
re-running it (re-running would fail with "relation already exists"),
then proceeds to apply any genuinely new migration files normally. This
was tested directly: applied 001 fresh, dropped only the tracking table
and the new column to simulate a pre-upgrade database, then confirmed the
runner backfills correctly and still applies `002_player_accounts.sql`.
You don't need to do anything manually — just deploy this version and the
migration runner sorts it out on boot.

---

## Design system: dark mode & visual refresh

All three pages (`index.html`, `admin.html`, `account.html`) share a CSS
custom-property theme system with a working light/dark toggle (persisted
to `localStorage`, defaulting to the browser's `prefers-color-scheme` on
first visit). A small inline script in `<head>` sets the theme before
first paint, so there's no flash of the wrong theme on load.

The palette moved away from the original pitch-green identity to a deep
indigo/violet base with a vibrant coral-orange accent (`--pitch: #1B1B3D`,
`--gold: #FF6B35` — the variable is still named `--gold` for backward
compatibility across the stylesheet, but it no longer holds a literal gold
color). Variables are split into two intentional categories:
- **Surface colors** (`--surface`, `--paper`, `--paper-alt`, `--ink`,
  `--ink-soft`, `--line`) — these flip between light and dark mode. Cards,
  inputs, and page backgrounds use these.
- **Brand panel colors** (`--pitch`, `--pitch-deep`, `--gold`) — these stay
  a dark indigo/violet with coral accents in both themes. Nav, hero,
  footer, the scoreboard, and Managed Athlete cards intentionally look the
  same regardless of theme.

No real photographs are used anywhere in the design. An earlier version of
this redesign considered pulling sports-equipment photos from a general
web image search, but the actual search results returned branded product
marketing photography (Nike/Adidas boot photography) — clearly copyrighted
professional photography, and using it would risk implying a sponsorship
relationship with those brands that doesn't exist. Instead, the hero
background is built entirely from original assets: a multi-color gradient
mesh in the new palette, plus hand-drawn line-art SVG icons (a football,
basketball, rugby ball, and whistle) scattered at low opacity as texture.
If you have your own licensed sports-equipment photography, drop files
into `/public/images/` and swap them into the `.hero-art` section of
`index.html` — the CSS is built to support a photo backdrop underneath the
gradient mesh if you want one later.

This was verified with real rendered screenshots (via Playwright/Chromium)
in both themes, across the homepage, admin dashboard, account dashboard,
and — after initially being missed in the first pass — the three policy
pages (`privacy.html`, `terms.html`, `child-safety.html`), which still had
the old green palette hardcoded until a follow-up check caught it. All six
pages now share one consistent palette; there's no lingering green
anywhere in the codebase (verified by grepping for the old hex values).

Screenshotting caught and fixed several other real bugs along the way:
- A missing `text-decoration:none` was putting a visible underline through
  the "Register Free" button.
- The original hero background used a hard percentage split
  (`linear-gradient(..., 55%, 55%)`) between the dark and light zones,
  which depended on the hero's content landing at exactly that height.
  Real paragraph text didn't cooperate, and the split cut straight through
  the lead paragraph, making part of it unreadable. Fixed by making the
  hero a single solid color instead of a height-dependent split.
- Verification badges (`club_verified`, `federation_verified`, etc.) used
  hardcoded light-mode-only background colors, making them nearly
  unreadable in dark mode. Fixed with theme-aware, translucent
  backgrounds instead.
- The mobile nav had a `.burger` CSS class from the original build with no
  actual button or JavaScript behind it — on a phone, the nav links were
  simply unreachable below 860px width. Built a working hamburger menu
  (toggle button, slide-down panel, closes on link click) to fix this
  properly rather than leave it as dead CSS.

Also added: scroll-reveal animations (`IntersectionObserver`-based, with
a `prefers-reduced-motion` fallback that skips straight to visible), and
an eased count-up animation for the homepage scoreboard stats.

---

## Sports-equipment iconography & the interactive sport picker

A follow-up request asked for goal posts, tennis nets, marked-field lines,
and similar unbranded equipment as background texture, plus a selectable
icon-based way to choose a sport. Before building this, actual image
searches were run for generic equipment photography ("empty football goal
post field", "tennis net court lines", "basketball hoop net") — every
result was either paid stock-marketplace listings (VectorStock/iStock),
e-commerce product pages, or, in one case, green soccer-pitch photography
that would have quietly reintroduced the color this redesign explicitly
moved away from. None of it was safe to embed. So the equipment is
original line-art instead: six reusable SVG icons defined once in a
`<symbol>` library near the top of `<body>` in `index.html`
(`#icon-goal`, `#icon-posts`, `#icon-hoop`, `#icon-controller`,
`#icon-net`, `#icon-field`), referenced everywhere via
`<svg class="icon"><use href="#icon-NAME"/></svg>`. They're used as
scattered low-opacity hero background texture, as the sport labels on
directory/Managed Athlete cards (replacing the old OS-emoji icons, which
render inconsistently across platforms), and as the sport picker below.

The registration form's sport field is no longer a plain `<select>` —
it's four clickable icon tiles (`#sport-picker`), each syncing to a
visually-hidden `<select id="f-sport">` that's kept for form semantics.
Testing this caught two real bugs before shipping:
- The first test used an ambiguous CSS selector and clicked the wrong
  element, because a pre-existing directory filter chip happens to share
  the same `data-sport` attribute value as the new picker tiles. Scoping
  the selector to `#sport-picker [data-sport="..."]` fixed the test; this
  wasn't an application bug.
- A real one: the hidden `<select>` still had the native HTML `required`
  attribute. Because the element is invisible (1×1px, `opacity:0`), the
  browser's built-in form validation was silently blocking the form's
  `submit` event from firing *at all* when no sport was selected — the
  custom "Select a sport to continue" error message never ran, and
  submitting with no sport chosen failed with no feedback whatsoever.
  Fixed by removing `required` from the hidden select and relying on the
  existing custom JS validation instead (which was already there but
  unreachable). Verified directly: before the fix, submitting with no
  sport produced no toast and no registration; after the fix, it shows
  the correct message and still doesn't register.

The full real-user path — click an icon, fill the rest, submit — was
re-tested after the fix and completes correctly, including the visual
selection state correctly resetting after a successful submission.

---

## Player and guardian accounts

Anyone can still register a player profile anonymously with zero friction
— that hasn't changed. Accounts add an optional layer on top:

- **Adult players** create an account (role `player`) at `/account.html`,
  then register their profile from the dashboard. It's linked to their
  account automatically (`players.user_id`), and they can log back in
  later to edit position, club, county, division, and bio. A player
  account can only ever own one profile — trying to create a second is
  rejected with a clear error rather than silently creating a duplicate.
- **Guardians** create an account (role `guardian`), then register a
  child's profile from the dashboard. The guardian's account is linked
  to that child (`guardians.user_id`), and from their dashboard they can
  edit the profile and — importantly — **revoke or restore the consent**
  that makes the profile publicly visible, exactly as promised in the
  Privacy Policy. Revoking removes the child from the public directory
  immediately.
- The **same open registration form** on the homepage still works with no
  login at all. If someone happens to be logged in when they submit it,
  the profile links to their account automatically; if not, it behaves
  exactly as before. Nothing about the anonymous path changed.

Identity fields (name, date of birth, sport) are **not** editable through
self-service, by design — changing those goes through admin/staff, so a
player can't quietly alter their age or identity after being verified.

What's deliberately not built yet: a player who registered anonymously
*before* creating an account has no way to "claim" that existing profile
— doing that safely would need an identity-verification step (e.g. email
OTP matching a contact field) that doesn't exist yet. For now, an
anonymously-registered profile stays anonymous; only profiles created
*while logged in* get linked.

---

## Setting up your first admin account

Moderation (`/admin.html`) and player verification are restricted to
`staff_admin`/`superadmin` accounts. There is deliberately **no way to
create one through the public API** — `POST /api/auth/register` silently
downgrades any requested `staff_admin`/`superadmin` role to `player`, so
privilege can never be self-granted through normal registration.

There are two ways to create the first admin account. Which one you need
depends on whether you have shell access to your deployment.

### Option A — bootstrap endpoint (works on Render's free tier)

Render's free-tier web services don't support Shell access at all
(confirmed directly against [Render's own docs](https://render.com/docs/free):
free services don't get "Shell access via SSH or the Render Dashboard") —
so `npm run create-admin` isn't reachable unless you're on a paid plan.
`POST /api/auth/bootstrap-admin` exists specifically for this case, and is
safe to leave in the codebase permanently because it's gated two ways:

1. It requires a secret (`ADMIN_BOOTSTRAP_SECRET`) that only you can see —
   auto-generated by Render into your web service's Environment tab via
   `generateValue: true` in `render.yaml`.
2. It only works while **zero** `staff_admin`/`superadmin` accounts exist.
   The moment one is created — by this route or by `create-admin.js` — the
   route permanently refuses to do anything again, forever, even with the
   correct secret. It cannot be used to create a second admin.

**To use it:**
1. In the Render dashboard, open your web service → **Environment** tab →
   copy the value of `ADMIN_BOOTSTRAP_SECRET`.
2. From your own machine, run:
   ```bash
   curl -X POST https://<your-service>.onrender.com/api/auth/bootstrap-admin \
     -H "Content-Type: application/json" \
     -d '{"secret":"<paste the secret>","email":"admin@apextalent.co.ke","password":"a-strong-password"}'
   ```
3. Log in at `https://<your-service>.onrender.com/admin.html` with that
   email and password.

This was tested directly: wrong secret → 401; correct secret → account
created; trying again afterward, even with the correct secret → 409
(permanently refused); secret unset entirely → 404 (cleanly disabled).

### Option B — CLI script (requires shell access / paid Render plan, or local dev)

```bash
npm run create-admin -- admin@apextalent.co.ke "a-strong-password"
```

On a paid Render instance type, run the same command via the web
service's **Shell** tab in the dashboard.

Use a real password either way — this account can approve public content
and view guardian/lead data.

---

## Deploy to Render (recommended path — Blueprint)

1. **Push this folder to a new GitHub repository.**
   ```bash
   cd apex-talent-management
   git init
   git add .
   git commit -m "Initial Apex Talent Management platform"
   git branch -M main
   git remote add origin https://github.com/<your-username>/apex-talent-management.git
   git push -u origin main
   ```

2. **In the Render dashboard:** click **New → Blueprint**, and select the
   GitHub repository you just pushed. Render will read `render.yaml`
   automatically and show you a plan to create:
   - a **web service** (`apex-talent-management`, Node runtime, free plan)
   - a **PostgreSQL database** (`apex-talent-db`, free plan)
   - a securely random `JWT_SECRET`, generated automatically by Render
     (`generateValue: true` in `render.yaml`) — you never need to invent
     or copy one yourself.

3. **Click Apply.** Render provisions the database first, then builds and
   deploys the web service with `DATABASE_URL` already wired in as an
   environment variable — you don't need to copy/paste any connection string.

   > **If you had a previous, broken deploy attempt of this project** (e.g.
   > you saw an `ENOTFOUND dpg-...` error before pulling this version):
   > delete that old web service **and** database first, then Apply the
   > Blueprint fresh. Render can't move an existing resource to a new
   > region, so reusing them would carry the same mismatch forward. See
   > **Troubleshooting** below if you'd rather not delete anything.

4. **First boot runs the migration automatically.** The `npm start` script
   runs `node src/migrate.js` before starting the server (see
   `package.json`). The migration checks whether the schema already exists
   before doing anything, so it's safe on every future deploy/redeploy —
   it only actually creates tables once.

5. **Visit the URL Render gives you.** The homepage, registration form,
   directory, video showcase, managed athletes, and sponsor portal are all
   live and backed by the real database from that point on.

6. **Create your admin account** (see "Setting up your first admin
   account" above) so you can moderate highlights and verify players at
   `/admin.html`.

Render's free-tier Postgres and free-tier web service are enough to run
this end-to-end for demos and early testing. Move to a paid plan before
handling real player data at any meaningful volume — the free database
tier has a storage cap and Render's free databases expire after a period
of inactivity.

---

## Manual deploy (without the Blueprint)

If you'd rather set services up individually in the Render dashboard:

1. **New → PostgreSQL.** Name it, choose a plan and region, create it.
   Copy the **Internal Connection String** once it's provisioned.
2. **New → Web Service.** Connect the same GitHub repo.
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Add an environment variable `DATABASE_URL` = the connection string
     from step 1.
   - Add `NODE_ENV=production`.
   - Add `JWT_SECRET` = the output of `openssl rand -hex 32` run locally
     (or any long random string) — this won't be auto-generated for you
     outside the Blueprint flow.
3. Deploy. The migration runs automatically on first boot, same as above.

---

## Local development

Requires Node.js 18+ and a local PostgreSQL instance.

```bash
cp .env.example .env
# edit .env: set your local Postgres user/password/db name, and replace
# JWT_SECRET and ADMIN_BOOTSTRAP_SECRET with real random values
# (e.g. `openssl rand -hex 32` for each)

npm install
npm run migrate     # applies all files in migrations/, in order
npm run create-admin -- admin@apextalent.co.ke "a-strong-password"
npm run dev          # starts the server without re-running migrate each time
```

Visit `http://localhost:3000`, or `http://localhost:3000/admin.html` to
sign in and moderate content. The `PGSSL=disable` setting in `.env.example`
is for local Postgres only — remove or ignore it in production, where
Render's managed Postgres requires SSL (handled automatically by `src/db.js`).

### Quick API smoke test

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/api/stats/summary

curl -X POST http://localhost:3000/api/players \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Player","dateOfBirth":"2000-01-01","sport":"Football","county":"Nairobi"}'
```

---

## What's implemented vs. what's next

**Implemented and tested (Phase 1 — auth & moderation):**
- Player registration (adult and minor-with-guardian-consent flows)
- Minor safeguarding: under-18 profiles are excluded from the public
  directory unless a valid, unrevoked guardian consent exists — enforced
  by the database view, not just application code
- Public player directory with sport/search filtering
- Video highlight submission (moderation-queue status, `pending` by default)
- Sponsor/scout/club lead capture
- Live homepage scoreboard stats
- **JWT authentication** (`/api/auth/register`, `/api/auth/login`), with
  public self-registration unable to grant itself `staff_admin`/
  `superadmin` — tested directly by attempting exactly that
- **Player and guardian self-service accounts** (`/account.html`):
  authenticated players and guardians can create/edit their own profile(s),
  and guardians can revoke/restore public-visibility consent for a minor —
  tested including cross-account attack attempts (one player editing
  another's profile, one guardian managing a different guardian's child),
  all correctly blocked with 403s
- **Admin moderation dashboard** (`/admin.html`): approve/reject pending
  highlights, club/federation-verify players, view the sponsor/scout leads
  inbox — all behind `requireAuth` + `requireRole('staff_admin','superadmin')`,
  tested against player-role tokens, missing tokens, and malformed tokens
- **Rate limiting**: public POST endpoints (players, highlights, leads) and
  auth endpoints are throttled per IP; confirmed triggering correctly and
  confirmed *not* affecting normal GET/browsing traffic
- **Draft policy pages** (`/privacy.html`, `/terms.html`, `/child-safety.html`),
  linked from the site footer — clearly marked as drafts pending legal review,
  not yet final
- **Free-tier-compatible admin bootstrap** (`POST /api/auth/bootstrap-admin`):
  create the first admin account without shell/SSH access, which Render's
  free web services don't support — tested all four states (wrong secret,
  success, permanently locked out after first use, disabled when unset)
- **Dark/light theme system** across all three pages, with a working toggle,
  verified via real rendered screenshots rather than just written — this
  process caught and fixed four real bugs: a missing underline reset on
  the primary CTA, a structural hero-background bug that made text
  unreadable at certain content heights, unreadable dark-mode verification
  badges, and a completely non-functional mobile nav (dead CSS class, no
  button, no JS) that's now a working hamburger menu
- Scroll-reveal animations and an eased scoreboard count-up, both with
  `prefers-reduced-motion` fallbacks

**Not yet implemented — flagged here rather than left silently missing:**
- **Claiming a pre-existing anonymous profile.** If someone registered a
  profile before creating an account, there's no safe way yet to link the
  two — that needs an identity-verification step (e.g. email OTP) that
  doesn't exist yet. Documented above under "Player and guardian accounts".
- **Managed Athletes and deals.** The `/managed` section on the homepage
  is still static/illustrative content, not read from the `managed_athletes`
  and `deals` tables. This is Phase 3 in the build strategy — it should wait
  until agent onboarding and licence-status tracking exist.
- **File uploads.** Highlights currently accept a video *link* rather than
  a direct upload. Real video upload/hosting (e.g. S3-compatible storage)
  is a separate build step (Phase 5).
- **Payments.** No integration yet for premium subscriptions or sponsor
  access fees (Phase 4 — Paystack/Flutterwave are the practical choices
  for Kenyan payment rails, given M-Pesa support).
- **Password reset / email verification.** Login exists; account recovery
  doesn't yet.

None of these block a working demo deploy, or the admin team actually
moderating content day-to-day — they're the honest list of what's still
ahead.

---

## Troubleshooting

**`Error: getaddrinfo ENOTFOUND dpg-...` during migration/boot**

This means the web service can't resolve the database's *internal* hostname.
Render's internal hostnames (the `dpg-...` form used in the auto-injected
`DATABASE_URL`) only resolve within the same region's private network — so
this means the web service and database are in **different regions**.

Critically: **Render does not support changing a service or database's
region after it's created** ([docs.render.com/regions](https://docs.render.com/regions)).
If you already had a broken deploy before pulling this fix, simply pushing
an updated `render.yaml` will **not** retroactively move those existing
resources into the same region — Render's Blueprint sync reuses
already-created resources by name rather than recreating them. You need to
do one of the following:

**Option A — fastest, no deletion required:**
1. In the Render dashboard, open your database → **Connections** tab.
2. Copy the **External Database URL** (not the internal one).
3. Open your web service → **Environment** tab → set `DATABASE_URL` to
   that external URL, overriding the auto-injected value.
4. Redeploy. The external URL is a public hostname reachable from any
   region, so this works regardless of the region mismatch (traffic is
   still SSL-encrypted — `src/db.js` already handles this).

**Option B — proper long-term fix:**
1. In the Render dashboard, delete the existing web service **and** the
   existing database entirely.
2. Run **New → Blueprint** again against your repo. Render creates both
   resources together in one pass, in the same region (as pinned by
   `render.yaml`), so they'll share a private network from the start.

`src/migrate.js` retries the initial connection a few times before giving
up, in case a database that was *just* provisioned needs a moment for its
internal DNS to propagate — but this only helps that specific timing case.
A genuine region mismatch will fail every retry, since the hostname simply
doesn't exist in that network; when that happens, the migration log prints
this same explanation directly.

**`FATAL: JWT_SECRET is not set` on boot**

`src/auth.js` refuses to start without it, rather than silently signing
tokens with an empty/undefined secret. On Render via the Blueprint this is
generated automatically (`generateValue: true` in `render.yaml`) — if
you're seeing this on Render, check the web service's Environment tab to
confirm `JWT_SECRET` is actually present (it should be, but a manually
created service outside the Blueprint flow won't have it). Locally, set
it in `.env` — see `.env.example`.

