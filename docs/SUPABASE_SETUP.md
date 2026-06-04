# Supabase setup — turnkey runbook

How to take this repo from **mock-only** (every view reads `lib/mock/`) to a
**live Supabase backend**: auth, persisted rows, RLS, Google SSO, and the
Claude auth-bypass.

> **Status (2026-05-31):** Supabase is **not yet live** for this project.
> `.env.local` currently holds dummy placeholders, the migrations exist under
> `supabase/migrations/`, and the auth/bypass code (`lib/supabase/*`,
> `lib/claude-bypass.ts`, `middleware.ts`) is wired but unexercised. Docker
> cannot run in the build container, so the steps below are meant to be run by
> the project owner against a **Supabase Cloud** project (or a local stack on a
> machine with Docker).

Companion docs:

- `docs/5.24.26 claude-access.md` — the full Claude-bypass security model + audit
  log + Cloudflare secret rotation. Read it before changing auth/middleware.
- `docs/claude-bypass.sql` — DDL for the bypass audit table (`public.claude_access_log`).
- `.env.local.example` — every env var with a one-line purpose + safe placeholder.

---

## 0. Prerequisites

- A Supabase account → https://supabase.com
- The Supabase CLI (for the `db push` path):
  `npm i -g supabase` (or `brew install supabase/tap/supabase`).
- Node 18+ (the verification script `scripts/check-supabase.mjs` uses the
  built-in `fetch`).

---

## 1. Create (or pick) a Supabase project

1. Supabase Dashboard → **New project**. Pick a name, a strong database
   password (save it — you need it for the connection string), and a region
   close to the school (e.g. an EU/ME region for Qatar).
2. Wait for provisioning (~2 min).

### Where to find each value

Dashboard → **Project Settings → API**:

| Value                     | Dashboard label                                | Env var it fills                |
| ------------------------- | ---------------------------------------------- | ------------------------------- |
| Project URL               | **Project URL** (`https://<ref>.supabase.co`)  | `NEXT_PUBLIC_SUPABASE_URL`      |
| Anon / publishable key    | **Project API keys → `anon` `public`**         | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Service-role / secret key | **Project API keys → `service_role` `secret`** | `SUPABASE_SERVICE_ROLE_KEY`     |

> Newer Supabase projects label these **publishable** (`sb_publishable_…`) and
> **secret** (`sb_secret_…`) instead of `anon` / `service_role`. Either format
> works — they go in the same env vars.

Dashboard → **Project Settings → Database → Connection string**:

- **DB connection string** (URI form, includes your DB password) — used by
  `supabase db push` / manual `psql`. Not an app env var.

---

## 2. Environment variables

The code reads exactly these (verified by grepping `process.env.` across
`lib/`, `middleware.ts`):

| Env var                                                                                        | Used in                                                                    | Purpose                                                                                                     | Required     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                                                                     | `lib/supabase/{client,server,middleware,admin}.ts`, `lib/claude-bypass.ts` | Project REST/Auth base URL.                                                                                 | **Yes**      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                                | `lib/supabase/{client,server,middleware}.ts`, `lib/claude-bypass.ts`       | Browser/SSR client key; RLS gates access.                                                                   | **Yes**      |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                    | `lib/supabase/admin.ts`                                                    | Server-only; mints Claude-bypass sessions + writes the audit log. Bypasses RLS — never ship to the browser. | **Yes**      |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`                                                                 | browser GSI sign-in button                                                 | Google OAuth client ID (public). Matches the client ID in Supabase Auth → Google.                           | For SSO      |
| `CLAUDE_BYPASS_TOKEN`                                                                          | `lib/claude-bypass.ts`                                                     | Shared secret that short-circuits SSO for Claude. Empty = bypass disabled. ≥16 chars.                       | Optional     |
| `CLAUDE_USER_EMAIL`                                                                            | `lib/claude-bypass.ts`                                                     | The Supabase auth user Claude signs in as.                                                                  | If bypass on |
| `CLAUDE_BYPASS_PROVISION`                                                                      | `lib/claude-bypass.ts`                                                     | `"0"` disables auto-provisioning unknown emails; anything else (incl. empty) allows it.                     | Optional     |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_HOST` | `lib/r2.ts`                                                                | Cloudflare R2 resource uploads (Phase 1B). Only needed once the resource-embed slice is live.               | Optional     |

### Dev (`.env.local`)

```sh
cp .env.local.example .env.local
# Edit .env.local and paste the three Supabase values + Google client ID.
node scripts/check-supabase.mjs        # validate before npm run dev
```

`.env.local` is gitignored — never commit it.

### Prod (Cloudflare Pages / Worker)

Set the same vars in the Cloudflare dashboard, and store the **secret** ones
(`SUPABASE_SERVICE_ROLE_KEY`, `CLAUDE_BYPASS_TOKEN`, the R2 secrets) as
**encrypted secrets**, not plaintext env. For the Worker, the existing pattern
is `wrangler secret put <NAME>` (see `docs/5.24.26 claude-access.md` §"Cloudflare
worker — secrets management"). The `NEXT_PUBLIC_*` vars are build-time and must
be present when the Pages build runs.

> **Never** set `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_*` var. It bypasses
> RLS and must stay server-side only.

---

## 3. Apply the schema

There are two equivalent paths. Apply the migrations **in timestamp order**,
then the seed (dev only). Apply order:

1. `supabase/migrations/20260518102823_initial_schema.sql` — schools, grade
   levels, teachers, subjects, units, master/personal lesson events, lesson
   instances, completion, resources, RLS helper functions
   (`can_read_grade()`, `is_grade_lead()`, `set_updated_at()`), and base RLS.
   (`teachers.id` IS the `auth.users(id)` primary key, so RLS predicates use
   `auth.uid()` directly — there is no `current_teacher_id()` helper.)
2. `supabase/migrations/20260527120000_resources_embed_fields.sql` — resource
   embed columns, the `enforce_resource_limits()` trigger, and resource RLS.
3. `supabase/migrations/20260530090000_teach_view.sql` — Teach-view tables
   (`boards`, `widgets`, `board_templates`, `teach_workspace_layouts`,
   `board_annotations`), their enums, triggers, and RLS, plus two presentation
   columns on `resources` (`default_render_target`, `tags`).
4. `supabase/migrations/20260531120000_teach_freeform.sql` — the **5.31 redesign**
   columns (additive): `widgets.canvas` + `widgets.appearance`; and on `boards`
   `pages`, `board_theme`, `repeat`, `tags`, `background`, `whiteboard`,
   `ephemeral`, `library_visibility`, `published_by`, `source_board_id` (+ a
   library-visibility check + indexes). Required for the free-form canvas,
   multi-page boards, themes, real-link repeat, and the board library to persist.
   Verified: all four migrations apply cleanly via `supabase start`, and a board
   exercising every new column round-trips through the REST API + SQL.
5. `supabase/migrations/20260604120000_planner_scale_hardening.sql` — the
   **scale-hardening** wave (additive, **safe on a live DB with data**).
   Denormalizes a `grade_level_id uuid` tenant key onto
   `master_core_lesson_events` and `personal_core_lesson_event_copies` (+
   ordered backfill + sync trigger), adds `archived_at` on personal copies and
   `updated_at` on `daily_notes`, the `deleted_at` partial + missing FK/RLS
   indexes, rewrites the hot-path `master_events_read` / `completion_read_public`
   policies to filter the local column instead of a unit→grade join, optimizes
   `can_read_grade`, closes the `recurrence_patterns` team-write leak, and locks
   `audit_log` inserts to a SECURITY DEFINER RPC. Idempotent and
   backfill-before-policy-swap, so it applies cleanly after the four migrations
   above on a populated project without a maintenance window.
6. `supabase/seed.sql` — **dev only.** Demo school → active Grade 5 → 2025–2026
   school year → the 8 locked subjects. It does NOT seed teachers (a
   `teachers` row references `auth.users(id)`; create a test teacher via Supabase
   Auth/Studio first, then insert a matching `teachers` row keyed to that auth
   user id). It uses fixed-UUID plain `insert`s with no `on conflict` clause, so
   re-running against a non-empty DB errors on the duplicate keys rather than
   overwriting — run it only against a fresh dev database, never production.

### Path A — Supabase CLI (`db push`)

```sh
# 1. Authenticate the CLI once.
npx supabase login

# 2. Link this repo to the mycurricula cloud project (prompts for DB password).
npx supabase link --project-ref xuukfpvonsbvvbspsrsl

# 3. Push every migration in supabase/migrations/ in order (all 5, including
#    20260604120000_planner_scale_hardening — additive, safe on a live DB).
npx supabase db push

# 4. REQUIRED — load the seed graph. `db push` does NOT run seed.sql, and the
#    school / active Grade 5 / school-year / subjects rows it creates are needed
#    by both the importer AND first-login teacher provisioning. Get the
#    connection string from Dashboard → Settings → Database → Connection string.
psql "YOUR-DB-CONNECTION-STRING" -f supabase/seed.sql

# 5. Load the real lessons/units/standards (needs SUPABASE_SERVICE_ROLE_KEY in
#    .env.local). Idempotent — safe to re-run.
node scripts/import-mock-planner.mjs
```

> **seed.sql caveat:** it uses fixed-UUID plain `insert`s with NO `on conflict`,
> so it ERRORS if those rows already exist. Run it once against a fresh project.
> If your project already has a school/grade, skip the seed and instead ensure a
> school + active grade + the 8 subjects exist, then run the importer.

`supabase db reset` (local stack only) re-runs every migration **and** the seed
from scratch — handy locally, destructive against a shared DB.

### Path B — manual (SQL editor, no CLI)

Dashboard → **SQL Editor**. Paste-and-run each file **in this exact order**:

1. `supabase/migrations/20260518102823_initial_schema.sql`
2. `supabase/migrations/20260527120000_resources_embed_fields.sql`
3. `supabase/migrations/20260530090000_teach_view.sql`
4. `supabase/migrations/20260531120000_teach_freeform.sql`
5. `supabase/migrations/20260604120000_planner_scale_hardening.sql` _(additive — safe on a live DB with data)_
6. `supabase/seed.sql` _(dev only — fresh database; errors if rows already exist)_
7. `docs/claude-bypass.sql` _(only if using the Claude bypass — see §5)_

Each migration is idempotent-ish only within a fresh DB; if a run half-fails,
fix the cause and reset rather than re-running partial files.

---

## 4. Google SSO

The app gates every non-public route behind Google SSO (see `middleware.ts`),
restricted to the school's email domain.

### 4a. Google Cloud Console

1. https://console.cloud.google.com → **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID → Web application.**
3. **Authorized JavaScript origins:**
   - `http://localhost:3000` (dev)
   - `https://mycurricula.app` (prod)
4. **Authorized redirect URIs** — point at Supabase's callback, not the app:
   - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
5. Copy the **Client ID** → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Copy the
   **Client secret** for the next step (it goes in Supabase, never in env).

### 4b. Supabase Auth

1. Dashboard → **Authentication → Providers → Google** → enable.
2. Paste the **Client ID** + **Client secret** from 4a.
3. Dashboard → **Authentication → URL Configuration:**
   - **Site URL:** `https://mycurricula.app` (use `http://localhost:3000`
     while developing).
   - **Redirect URLs (allow-list):** add `https://mycurricula.app/auth/callback`
     and `http://localhost:3000/auth/callback`. The app's OAuth callback route
     is **`/auth/callback`**; the middleware treats `/auth/*` and `/login` as
     public paths.
4. **Restrict to the school domain.** Supabase has no built-in domain allow-list
   for Google; enforce it with an Auth Hook / database trigger that rejects
   sign-ups whose email domain ≠ the school's, or via the Google OAuth consent
   screen's internal-org setting if the school uses Google Workspace.

---

## 5. Claude auth-bypass

Lets AI assistants reach the SSO-gated app without a Google account. Full model
in `docs/5.24.26 claude-access.md`; summary:

- **`CLAUDE_BYPASS_TOKEN`** — shared secret. Present it as `?claude=<token>` on
  any URL, or `Authorization: Bearer <token>`. The middleware
  (`tryClaudeBypassInMiddleware`) validates it (constant-time compare, ≥16 chars,
  120 hits/min rate limit), mints a Supabase session for `CLAUDE_USER_EMAIL`
  server-side, and attaches the session cookies. Empty token = bypass disabled.
- **`CLAUDE_USER_EMAIL`** — the Supabase auth user the bypass signs in as. Must
  exist OR be provisionable.
- **`CLAUDE_BYPASS_PROVISION`** — `"0"` refuses unknown emails; anything else
  (incl. empty) auto-creates the user on first hit.

Generate a token:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> When pasting the token into a URL, URL-encode it (`+`→`%2B`, `/`→`%2F`,
> `=`→`%3D`) — see `docs/5.24.26 claude-access.md` §1.

### Audit table

Run `docs/claude-bypass.sql` once in the SQL editor to create
`public.claude_access_log`. The middleware writes one row per bypass attempt to
columns `ok, pathname, user_agent, reason, created_at`. Audit-log insert
failures are **non-fatal** — the bypass still works if the table is missing, but
you lose the trail. (If you hand-created the table earlier with `success`/`path`
columns, rename them per the contract note in `docs/5.24.26 claude-access.md`.)

---

## 6. Verification checklist

Run the preflight first; it never prints secrets (only lengths/hosts/booleans)
and exits non-zero on any failure:

```sh
node scripts/check-supabase.mjs
```

It checks: the three required vars are present + non-placeholder, the URL is a
valid `https` non-localhost host, the optional SSO/bypass vars, and pings
`${URL}/rest/v1/` with the anon key (200/404 = reachable + key accepted; 401/403
= key rejected; network error = wrong/unreachable URL).

Then verify end-to-end against a running app (`npm run dev`):

- [ ] **`check-supabase.mjs` exits 0.**
- [ ] **Login works** — visit a protected route (`/weekly`), get bounced to
      `/login`, sign in with a school Google account, land back on `/weekly`.
- [ ] **Non-school emails are rejected** (per §4b domain restriction).
- [ ] **A board persists** — open the Teach view, create a board / widget,
      reload, and confirm it survives (once `lib/teach/queries.ts` points at the
      Supabase source). Confirm a row exists in `public.boards`.
- [ ] **RLS blocks cross-user reads** — as teacher A, create a _personal_ board;
      as teacher B (different account), confirm A's personal board is NOT
      visible, while _team_ boards for the shared grade ARE. (SQL editor runs as
      service-role and bypasses RLS — test via the app or with a user JWT.)
- [ ] **Claude bypass** (if enabled) — `curl -H "Authorization: Bearer <token>"
https://…/weekly` returns the page; check `public.claude_access_log` for an
      `ok = true` row.

---

## 7. Turning the backend on in code

The Teach backend is built. The pieces:

- **`lib/teach/supabase-source.ts`** — a `TeachDataSource` backed by Supabase
  (row↔domain mapping, `ensureCanvas` on read, `BoardCapError`, structure-only
  privacy). It is **server-only** (RLS + `next/headers`), so it cannot be
  imported by a client component.
- **`lib/teach/actions.ts`** (`"use server"`) — the bridge. Client components
  reach the Supabase source through these server actions; each picks Supabase
  when configured (`isSupabaseConfigured()` in `queries.ts`), else the mock.
- **`lib/teach/queries.ts`** — the **client-safe** seam. `export const teach`
  stays the in-memory mock (so the prototype renders without a backend and the
  client bundle never pulls in `next/headers`). `isSupabaseConfigured()` is the
  single auditable switch the server layer reads.
- **Auth/session:** wired via `middleware.ts` + `lib/supabase/*`; activates the
  moment the env vars point at a real project.

**To run against a real backend (verified flow):**

1. Set the three `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` vars to a real project (or a local stack).
2. For a **local** stack at `127.0.0.1:54321`, also set `TEACH_USE_SUPABASE=1`
   (the seam treats localhost as "unconfigured" by default so CI/migration-test
   runs stay on the mock; this flag opts a real local stack in).
3. Apply all migrations + seed (§3), provision a teacher (an `auth.users` row +
   a matching `teachers` row — the Claude bypass does this automatically, §5).

**Verified local-stack quickstart** (Docker required):

```bash
supabase start -x edge-runtime   # applies all migrations + seed; edge-runtime
                                 # is optional and skipped (rlimit-sensitive)
supabase status -o env           # copy API URL + anon + service_role into .env.local
# set TEACH_USE_SUPABASE=1 in .env.local, then `npm run dev`
node scripts/check-supabase.mjs  # validates env + pings REST
```

The remaining UI step is pointing the client mutation callsites
(`components/teach/TeachWorkspace.tsx`) at the `actions.ts` server actions
instead of the mock `teach` seam — the actions are 1:1 with the
`TeachDataSource` methods the workspace already calls.

## 8. Flip the planner onto Supabase

The planner data layer (Weekly / Daily / Year / Subject) is flag-gated on
`NEXT_PUBLIC_PLANNER_USE_SUPABASE`. Flag **unset/`0`** = byte-identical mock;
`1` reads/writes the live tables under RLS. Flip only **after** §3 (all
migrations incl. `20260604120000_planner_scale_hardening` + seed + importer) and
§4 (SSO) are done and a teacher is provisioned (§5).

**Ordered flip (mirrors the ultraplan §5 owner steps):**

1. Apply `20260604120000_planner_scale_hardening.sql` (§3) — additive, safe on
   the live project with data; backfills `grade_level_id` on existing rows.
2. Re-run `node scripts/import-mock-planner.mjs` if backfilling fixtures — it now
   stamps `grade_level_id` on every master event so the hot-path RLS/index is
   correct from the first seed. Idempotent.
3. Confirm Supavisor pooling is on in **transaction mode** for the project
   (Dashboard → Database → Connection pooling).
4. Set `NEXT_PUBLIC_PLANNER_USE_SUPABASE=1` in the Cloudflare Pages env (it is a
   `NEXT_PUBLIC_*` build-time var — it must be present when the Pages build
   runs, then trigger a redeploy).

**Smoke test (do all of these against the deployed app):**

- [ ] **Sign in** → `/weekly` renders **real** lessons (from the importer/upload,
      not the mock fixtures) under RLS.
- [ ] **Round-trip every mutator** on a lesson and reload to confirm it persists:
      **edit** content, **move** day/order, **status** (mark done/undone),
      **create** a new lesson, **archive** it, and **section** add/edit/reorder.
- [ ] **RLS isolation** — as a 2nd teacher (different account), confirm you
      **cannot** see teacher 1's *personal* forks/authored lessons, while the
      shared **team** master lessons for the grade ARE visible. (SQL editor runs
      as service-role and bypasses RLS — verify via the app or a user JWT.)

If Weekly is blank or writes are rejected after the flip, the usual cause is a
missing teacher → grade assignment (the owner id / grade uuid never resolves):
re-check §5 provisioning and that the migration's `grade_level_id` backfill ran.

## 9. Deferred scale follow-ups (P2/P3 — not in the scale-hardening wave)

These are spec'd in the ultraplan (§4) but intentionally **out of scope** for
the additive `20260604120000` migration — each needs a maintenance window, an
invasive rewrite, or an operational confirmation. Track them before the user
base crosses into the thousands:

- **Partition `audit_log` by month + retention policy.** The table is
  append-only and unpartitioned; "reusable year-over-year" means it grows
  unbounded. Partitioning is an invasive table recreation — schedule a
  maintenance window. Pair it with a retention/rollup policy for old partitions.
- **jsonb size CHECKs on bloat vectors.** Add column CHECK constraints bounding
  the serialized size of `board_annotations.annotations`, `audit_log.metadata`,
  and `coverage_snapshots.per_teacher_coverage` so a runaway payload can't bloat
  a hot table.
- **Orphan GC for polymorphic owners.** `resources`, `lesson_sections`,
  `board_annotations`, and `edit_undo_stack` reference owners polymorphically;
  add a periodic sweep (or ON DELETE wiring) so rows whose owner is gone don't
  accumulate.
- **Confirm Supavisor / PgBouncer transaction-mode pooling.** Operational, not
  schema — verify the project pools in transaction mode so thousands of
  short-lived serverless connections don't exhaust Postgres backends.
- **`audit_action` enum → text + CHECK.** As the audited action set grows,
  `ALTER TYPE … ADD VALUE` can't run inside a transaction; migrating the enum to
  a `text` column with a CHECK constraint dodges that limit.

## Note: manual SQL paste limits (2026-06-01)

When applying SQL via the dashboard SQL Editor, very long pastes can be silently
truncated by some browsers/network filters, so a big multi-row INSERT may run
incomplete (or not at all) with no error. Mitigations:
- Apply migrations one file at a time; data in small chunks (≤10 rows), each
  followed by a separate `select count(*)` to confirm it landed.
- Prefer the CLI (`supabase db push`) or the node importer
  (`scripts/import-mock-planner.mjs`) for bulk data — neither has a paste limit.
- The placeholder lesson set exists ONLY to verify the pipeline; a partial load
  (e.g. 15 of 39) is sufficient to confirm login → planner → persist works. Real
  curriculum loads via the importer/upload path, never manual paste.
