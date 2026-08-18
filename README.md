# Apex Talent Management — Deployable Platform

Kenya's multi-sport player registry, video showcase, and representation platform.
This is the working backend + frontend for the platform, wired to the PostgreSQL
schema from the Database Design Document, and packaged to deploy directly on
[Render](https://render.com) as a Blueprint (web service + managed Postgres).

Everything in this package has been tested end-to-end against a real
PostgreSQL 16 instance — schema migration, player registration (adult and
minor/guardian-consent flows), the public directory's minor-safeguarding
filter, highlight submission, and sponsor/scout leads — before being handed
off.

---

## What's in this package

```
apex-talent-management/
├── render.yaml            # Render Blueprint: web service + Postgres database
├── package.json
├── server.js               # Express app entry point
├── src/
│   ├── db.js                # PostgreSQL connection pool
│   ├── migrate.js           # Idempotent migration runner (auto-runs on deploy)
│   ├── helpers.js           # find-or-create lookups (county/club/division)
│   └── routes/
│       ├── players.js       # GET/POST /api/players
│       ├── highlights.js    # GET/POST /api/highlights
│       ├── leads.js         # POST /api/leads (sponsor/scout portal)
│       └── stats.js         # GET /api/stats/summary (homepage scoreboard)
├── migrations/
│   └── 001_init.sql         # Full schema (copy of the Database Design Document's schema.sql)
├── public/
│   └── index.html           # The platform frontend, calling the API above
├── .env.example
└── .gitignore
```

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

3. **Click Apply.** Render provisions the database first, then builds and
   deploys the web service with `DATABASE_URL` already wired in as an
   environment variable — you don't need to copy/paste any connection string.

4. **First boot runs the migration automatically.** The `npm start` script
   runs `node src/migrate.js` before starting the server (see
   `package.json`). The migration checks whether the schema already exists
   before doing anything, so it's safe on every future deploy/redeploy —
   it only actually creates tables once.

5. **Visit the URL Render gives you.** The homepage, registration form,
   directory, video showcase, managed athletes, and sponsor portal are all
   live and backed by the real database from that point on.

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
3. Deploy. The migration runs automatically on first boot, same as above.

---

## Local development

Requires Node.js 18+ and a local PostgreSQL instance.

```bash
cp .env.example .env
# edit .env if your local Postgres user/password/db name differ

npm install
npm run migrate     # applies migrations/001_init.sql
npm run dev          # starts the server without re-running migrate each time
```

Visit `http://localhost:3000`. The `PGSSL=disable` setting in `.env.example`
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

**Implemented and tested:**
- Player registration (adult and minor-with-guardian-consent flows)
- Minor safeguarding: under-18 profiles are excluded from the public
  directory unless a valid, unrevoked guardian consent exists — enforced
  by the database view, not just application code
- Public player directory with sport/search filtering
- Video highlight submission (moderation-queue status, `pending` by default)
- Sponsor/scout/club lead capture
- Live homepage scoreboard stats

**Not yet implemented — flagged here rather than left silently missing:**
- **Authentication.** There is no login system yet. `users` exists in the
  schema, but no endpoint issues sessions or tokens; all API routes are
  currently open. Do not launch to real users before adding this.
- **Admin/moderation UI.** Highlights land as `pending`; there is no
  interface yet to approve/reject them or verify player statistics —
  only direct database access can do that today.
- **Managed Athletes and deals.** The `/managed` section on the homepage
  is still static/illustrative content, not read from the `managed_athletes`
  and `deals` tables. Wiring that up is a reasonable next milestone once
  agent onboarding is ready.
- **File uploads.** Highlights currently accept a video *link* rather than
  a direct upload — matching the current prototype behaviour. Real video
  upload/hosting (e.g. via S3-compatible storage) is a separate build step.
- **Rate limiting / spam protection** on public POST endpoints.

None of these block a working demo deploy — they're the honest list of
what a production launch still needs on top of this.

---

## Troubleshooting

**`Error: getaddrinfo ENOTFOUND dpg-...` during migration/boot**

This means the web service can't resolve the database's internal hostname.
On Render, internal database hostnames only resolve within the same
region's private network — so this almost always means the web service and
the database ended up in **different regions**. `render.yaml` pins both to
`frankfurt`; if you changed the region for one but not the other (or
created the database manually before applying the Blueprint), move them
back in sync in the Render dashboard (Database → Settings, or recreate it
in the matching region) and redeploy.

`src/migrate.js` also retries the initial connection several times with a
delay before giving up, since a database that was *just* provisioned can
take a few seconds for its internal DNS to propagate on the very first
deploy — if it fails after all retries with this error, region mismatch is
the most likely cause rather than a transient timing issue.

