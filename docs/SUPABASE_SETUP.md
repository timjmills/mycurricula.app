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
4. `supabase/seed.sql` — **dev only.** Demo school → active Grade 5 → 2025–2026
   school year → the 8 locked subjects. It does NOT seed teachers (a
   `teachers` row references `auth.users(id)`; create a test teacher via Supabase
   Auth/Studio first, then insert a matching `teachers` row keyed to that auth
   user id). It uses fixed-UUID plain `insert`s with no `on conflict` clause, so
   re-running against a non-empty DB errors on the duplicate keys rather than
   overwriting — run it only against a fresh dev database, never production.

### Path A — Supabase CLI (`db push`)

```sh
# 1. Authenticate the CLI once.
supabase login

# 2. Link this repo to your project (ref = the <ref> in the Project URL).
supabase link --project-ref YOUR-PROJECT-REF

# 3. Push every migration in supabase/migrations/ in order.
supabase db push

# 4. (Dev only) load the seed graph.
psql "YOUR-DB-CONNECTION-STRING" -f supabase/seed.sql
```

`supabase db reset` (local stack only) re-runs every migration **and** the seed
from scratch — handy locally, destructive against a shared DB.

### Path B — manual (SQL editor, no CLI)

Dashboard → **SQL Editor**. Paste-and-run each file **in this exact order**:

1. `supabase/migrations/20260518102823_initial_schema.sql`
2. `supabase/migrations/20260527120000_resources_embed_fields.sql`
3. `supabase/migrations/20260530090000_teach_view.sql`
4. `supabase/seed.sql` _(dev only — fresh database; errors if rows already exist)_
5. `docs/claude-bypass.sql` _(only if using the Claude bypass — see §5)_

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

Today every view reads `lib/mock/`. The documented switch points (do these when
the schema is live and verified):

- **Teach view:** `lib/teach/queries.ts` exports
  `export const teach: TeachDataSource = mockTeachSource;`. Swapping
  `mockTeachSource` for a `supabaseTeachSource` is the one-line cutover (the
  Supabase implementation is the Phase 4 deliverable; the interface + tables are
  already aligned — see the schema/interface cross-check kept current against
  `20260530090000_teach_view.sql`).
- **Auth/session:** already wired via `middleware.ts` + `lib/supabase/*` — it
  activates the moment the env vars point at a real project.

Until those cutovers land, filling in the env vars enables **auth** (the SSO gate

- Claude bypass) while the data surfaces continue to read mock fixtures.
