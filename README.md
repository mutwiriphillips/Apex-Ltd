# National Cooperative Management & Governance System — Republic of Kenya

A secure, enterprise-grade, centralized platform for the State Department for
Co-operatives to manage cooperative societies across all **47 counties of
Kenya** — coffee, tea, dairy, sugarcane, cotton, fisheries, livestock, SACCOs,
housing, and transport cooperatives, among others.

Originally scoped as a pilot for Embu County's Co-operative Development
Section (see `/docs`), then generalized to a national, multi-county platform.

## Stack

- **Frontend:** React.js + Next.js (App Router), Tailwind CSS (official Kenyan colour palette)
- **Backend:** Node.js + Express, RESTful JSON API
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** JWT-based auth with Role-Based Access Control (RBAC), county-scoped
- **File storage:** Cloud object storage (S3-compatible) with pre-signed URLs for PDFs

## Roles

- **National Admin** — cross-county oversight (State Department for Co-operatives)
- **County Director** — full access within their own county only
- **Sub-County Officer** — reviews documents, views cooperatives in their county
- **Field Officer** — plans visits, submits reports
- **Cooperative Manager** — manages their own cooperative's members/documents/committee

County scoping is enforced **server-side** — a County Director's requests are
always filtered to their own county's data regardless of what the client sends.

## Modules

1. **County Staff & Access Management (RBAC)** — staff accounts, roles, granular module permissions
2. **Field Operations & Leave Tracking** — leave requests, weekly visit planner, post-visit reports
3. **Cooperative Registry & Member Database** — cooperative profiles (16 value chains), member roll, share capital
4. **Secure Document Management System (DMS)** — encrypted PDF repository, 3-tier approval workflow
5. **Governance, Election & AGM Tracking** — committee terms, 1/3 gender rotation rule, AGM archive
6. **Financial Ledger & Credit Readiness** — contribution ledger, produce delivery tracking
   (coffee, milk, tea, etc.), payout/disbursement ledger, and a transparent credit-scoring
   engine cooperatives can use to demonstrate creditworthiness to third-party lenders.
   **This platform never disburses loans — it is a trust layer, not a lender.**
7. **Member Self-Service Portal** — a genuinely separate `MEMBER` auth tier (not a staff
   account) at `/member`. Registration is verified by matching a submitted National ID
   against the cooperative's own `Member` records — see the Module 7 section below for
   the honest scope boundary on what "verified" means here.
8. **Asset & Livestock Generalization** — one `Asset` model covers Livestock, Poultry,
   Housing, and Transport SACCO vehicles: a dairy cow, a boda boda, and a housing unit
   are all "something a member owns, with a status and a lifecycle of events." Feeds a
   7th, conditional credit-scoring factor.

## Project Structure

```
embu-coop-system/
├── docs/                        # Source proposal & scope documents (PDF)
├── backend/                     # Node.js/Express API + Prisma schema
│   ├── prisma/schema.prisma     # Full data model (County + all 5 modules)
│   ├── prisma/seed-counties.js  # All 47 official Kenyan counties (factual reference data)
│   ├── prisma/seed-pilot.js     # 1 National Admin, 1 County Director, 1 employee, 1 manager, 1 cooperative
│   └── src/
│       ├── config/              # DB connection
│       ├── middleware/          # JWT auth, RBAC (county-scoped), error handling
│       ├── controllers/         # Business logic per module
│       ├── routes/              # Express routers per module
│       └── utils/                # Governance/compliance logic, JWT helpers
└── frontend/                    # Next.js app
    ├── app/                      # Pages: landing, login, signup, dashboard, cooperatives, staff, field-ops, leave
    ├── components/               # Sidebar, ProtectedRoute
    ├── context/                  # Auth context
    └── lib/                      # API client
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or use the included `docker-compose.yml`)

### 1. Database

```bash
docker compose up -d db
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET
npm install
npx prisma generate
npx prisma db push        # creates tables from schema.prisma (see note in RENDER_DEPLOYMENT.md)
npm run seed:counties     # seeds all 47 counties — required before anything else
npm run seed:pilot        # seeds 1 National Admin, 1 County Director (Embu), 1 employee, 1 manager, 1 cooperative
npm run dev                # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                # http://localhost:3000
```

All pilot accounts share the password `Pilot2026!`:
- **National Admin:** admin@cooperatives.go.ke
- **County Director (Embu):** director@embu.go.ke
- **Field Officer:** employee@embu.go.ke
- **Cooperative Manager:** manager@embu.go.ke

### Pilot / Test Run on Render

See [`RENDER_DEPLOYMENT.md`](./RENDER_DEPLOYMENT.md) for a full guide to
deploying this on Render with open self-signup enabled for testers.

## Governance Logic (Module 5) — implemented rules

- Default committee term length: 3 years (configurable per value chain)
- `Term Expiring` flag: 90 days before `reelection_due_date`
- `Term Expired — Action Required` flag: day after `reelection_due_date` with no new election
- **1/3 gender rotation rule:** no single gender may hold more than 2/3 of elected
  committee seats (Chairperson, Vice Chairperson, Secretary, Treasurer, 4 board
  members). Non-elected Executive Manager is excluded. Violations block submission
  unless the Director overrides with a logged justification.

## Member Self-Service Portal (Module 7)

A completely separate identity tier from staff — `MemberAccount`, not `User`.
The two are architecturally isolated:

- **Separate JWTs.** Staff tokens carry `type: "staff"`, member tokens carry
  `type: "member"`. Each auth middleware (`authenticate` vs
  `authenticateMember` in `backend/src/middleware/auth.js`) rejects the
  other's token outright — verified with real crafted JWTs during testing,
  not assumed.
- **Separate frontend auth context, separate token storage.** `MemberAuthContext`
  and `lib/memberApi.js` never share a localStorage key with the staff
  `AuthContext`/`lib/api.js` — a staff member and a farmer could, in
  principle, be logged into both in the same browser without collision.
- **Self-scoped API.** Every `/api/member/*` route derives the member's
  identity entirely from their JWT — no route ever accepts a memberId or
  cooperativeId from the client, so one member can never query another's
  data by guessing an ID.

### Registration & "verification" — an honest scope boundary

Registration (`POST /api/member-auth/register`) matches a submitted National
ID + selected cooperative against an existing `Member` record that staff
already created via the Cooperative Registry. **This is not a government ID
check** — there is no integration with IPRS, eCitizen, or any external
registry. It verifies against the cooperative's own membership records,
which is the only ground truth this platform actually has access to. That's
a deliberate, documented boundary so the trial run behaves exactly like the
real thing would, without pretending to a capability (government ID
verification) that would need a separate formal agreement to build.

### Digital contributions — simulated, clearly labeled

`POST /api/member/contributions/initiate` lets a member record a
contribution themselves, as if an M-Pesa STK Push had already completed.
There is no real Safaricom Daraja integration wired up (needs a shortcode,
passkey, and a public callback URL this environment doesn't have) — the
response and the UI both say "simulated" so this is never mistaken for a
real payment. The `Contribution.method` and `externalRef` fields already
exist for exactly this integration; wiring real Daraja later means adding an
STK Push request plus a public webhook route, not restructuring the ledger.

### What members can and can't do

- View their own contribution, produce delivery, and payout history
- Make a (simulated) digital contribution
- View their cooperative's meeting record and current credit standing
- **Cannot** self-report produce deliveries — those stay staff-recorded
  (Cooperative Manager or Field Officer at drop-off) so the credit-scoring
  signal stays trustworthy, not self-reported

`backend/src/utils/creditScore.js` computes a 0–100 composite score across six
weighted factors — contribution consistency (20%), **produce consistency
(20%)**, governance compliance (20%, reuses the Module 5 rules above),
document compliance (15%), membership stability (15%), and share capital
trajectory (10%) — mapped to a band (AA/A/B/C/D). The full per-factor
breakdown is returned so nothing is a black box to a reviewing lender.

Produce consistency is scored independently from contribution consistency —
a cooperative can't hide declining farmer output behind healthy cash
collection, or vice versa. Both matter to a lender for different reasons.

Run the test suite directly (plain `assert`, no framework needed):
```bash
cd backend && npm run test:credit-score
```
36 unit tests cover each factor in isolation plus end-to-end scenarios (a
strong cooperative scoring AA/A, a weak one scoring D, and a check that
produce activity measurably moves the score independent of contributions).

**Scope boundary, enforced in code, not just policy:** only county staff
(National Admin / Director / Sub-County Officer) can trigger an assessment —
a Cooperative Manager can never self-certify their own cooperative's score.
Every response carries an explicit disclaimer that this is a referral signal
for a third-party lender, not a loan offer, pre-approval, or guarantee — this
platform does not disburse funds.

## Produce, Payouts & the Disbursement Trickle-Down Report

Two new ledgers, alongside the Module 6 Contribution ledger:

- **`ProduceDelivery`** — what a member physically delivers (coffee cherries,
  milk, tea leaf, etc.), with quantity, unit, quality grade, and an optional
  rate/total value. Feeds directly into the produce-consistency credit factor.
- **`Payout`** — money the cooperative pays OUT to a member, optionally
  settling specific unpaid produce deliveries. This is the other half of the
  ledger: Contribution/ProduceDelivery track what flows IN, Payout tracks
  what flows back OUT to the farmer.

The Director's **Farmer Disbursements** dashboard (`/disbursements` in the
frontend, `GET /api/reports/disbursements` in the API) is a trickle-down
report: National (all counties, National Admin only) → County → Cooperative
→ individual farmer compensation amounts, filterable by date range.

**Ownership scoping, enforced in code:** `requireCooperativeAccess`
(`backend/src/middleware/auth.js`) ensures a Cooperative Manager can only
ever touch their *own* cooperative's data — not any cooperative they happen
to guess an ID for — and county staff are always scoped to their own county.
As of this pass, this is applied to **every** cooperative-scoped route:
contributions, produce, payouts, credit-assessment, documents, governance,
and the cooperative/member-roll routes themselves. A companion
`requireStaffAccess` middleware applies the same county-matching principle
to staff management, so a Director can no longer view, edit, deactivate, or
change permissions on a staff account in another county by guessing its ID.

Both middlewares were verified with a targeted test stub that simulates real
distinguishing data (a Director in "County A" against cooperatives/staff in
both "County A" and "County B") — same-county access passes through to the
controller, cross-county access is rejected with 403, nonexistent IDs return
404. This is a materially stronger test than "does it 401 with no token,"
which is all a blanket stub can prove.

While auditing this, also found and fixed several `requireRole(...)` lists
across Documents, Governance, and Field Operations that predated the
national rollout and had never been updated to include `NATIONAL_ADMIN` —
meaning a National Admin account could previously view staff/cooperative
data everywhere via `requirePermission`'s bypass, but could not review
documents, approve documents, override governance compliance, or decide
leave/visit requests, despite the role's intended cross-county oversight.

## Asset & Livestock Generalization (Module 8)

One model — `Asset` — covers every value chain where a member's holding is a
discrete tracked thing rather than consumable produce: **Livestock, Poultry,
Housing, and Transport** SACCOs. A dairy cow, a boda boda, and a housing
unit are structurally the same fact pattern: something a member owns, with a
status (`ACTIVE`/`TRANSFERRED`/`SOLD`/`DECEASED`/`WRITTEN_OFF`) and a full
lifecycle event history (`AssetEvent`: acquired, transferred, sold, deceased,
written off, a valuation update, or a routine health check). This is the same
"shape, not chain" reduction already applied to `ProduceDelivery` for the 9
consumable-produce chains — see `learnings-and-workflow` for the original
3-shape breakdown this completes.

Recording a closing lifecycle event (sold/deceased/transferred/written-off)
automatically updates the asset's own `status` — "how many assets are
actually active right now" never depends on staff remembering to flip a
separate field. A `VALUATION_UPDATE` event refreshes `currentValue`.
Acquisition itself is logged as the first `AssetEvent` automatically, so
every asset's history is complete from day one, not just from whenever
someone got around to it.

**Staff-recorded, not self-reported** — same integrity reasoning as Produce:
a member can view their own assets and full event history at
`/api/member/assets`, but cannot create or modify them. Only a Cooperative
Manager or Field Officer for that specific cooperative can.

**Credit scoring integration — conditional, not universal.** Asset Stability
is a 7th scoring factor (12% weight) built from three signals: coverage
(what fraction of members have an active asset on record), survival (active
assets as a share of every asset ever recorded — high attrition is a real
risk signal), and recency (what fraction of active assets have any event
logged in the trailing 12 months). It only applies to the four asset-tracked
value chains — for every other cooperative, the factor is **absent from the
weights entirely**, not scored as zero, with the remaining six weights
proportionally renormalized to still sum to exactly 1.0. The breakdown
always carries an explicit `applicable: false` entry rather than silently
omitting the factor, so a lender reading the report can see the boundary,
not just its absence.

This was verified two ways: 47 unit tests (11 new for this module, in
`backend/src/utils/creditScore.test.js`) prove the renormalization math is
exactly correct, including that a coffee cooperative and an identical-data
livestock cooperative with no herd score identically on every *shared*
factor — applicability never leaks into the other six factors' own scores.
Separately, the same targeted-stub access-control method described above
was re-run specifically against the new `/assets` routes, confirming
same-county pass-through, cross-county 403, and nonexistent-ID 404 all hold
for this module too.

An exportable per-member **asset statement** (`GET
/cooperatives/:id/assets/statement?memberId=`) lists every asset and its
full event history with a running current-value total — the same kind of
document a farmer or their cooperative would hand to a lender alongside the
credit-readiness report itself.

## Open Items From Scope (to confirm with County before Phase 2)

See `docs/Embu_Coop_Engineering_Scope.pdf`, Section 6 — sub-county/ward list,
cooperative manager login model, PDF size/retention policy, offline entry
requirement, notification requirements, and hosting ownership are stubbed with
sensible defaults in this scaffold and should be finalized during Phase 1.

## License / Ownership

Per the original commercial proposal, full IP and source code transfer to Embu
County Government upon final payment milestone (M4) for the pilot engagement.
Terms for a national rollout across all 47 counties would need a separate
agreement with the State Department for Co-operatives.
