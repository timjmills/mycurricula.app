-- ###########################################################################
-- ## Teams + invitations control plane (Phase 1B, Wave 2)
-- ###########################################################################
-- Source: docs/6.6.26 Teacher-First Individual + Invite Ultraplan.md §3 (data
-- model) + §7 (Wave 2). Turns the product teacher-first: a "team" maps 1:1 to a
-- hidden workspace (an existing `schools` row, invisible in the UI), members
-- share that workspace, and teams form by invite (≤5 seats by default).
--
-- This migration is ADDITIVE ONLY and IDEMPOTENT-FRIENDLY — safe to run on a
-- live database and safe to re-run:
--   * extension → CREATE EXTENSION IF NOT EXISTS
--   * table     → CREATE TABLE IF NOT EXISTS
--   * index     → CREATE [UNIQUE] INDEX IF NOT EXISTS
--   * trigger   → DROP TRIGGER IF EXISTS ... then CREATE TRIGGER
--   * enum value→ ALTER TYPE ... ADD VALUE IF NOT EXISTS
--
-- SCOPE GUARDRAILS (per ultraplan §3 "additive only"):
--   * NO existing table is altered (schools.school_id stays NOT NULL; no owner
--     columns are added to existing tables — that was the higher-risk path).
--   * NO RLS POLICIES are added here. RLS is ENABLED on the three new tables so
--     they are deny-all until Wave 4 adds member-read + RPC-only-write policies
--     (mirroring how audit_log writes funnel through log_audit_event).
--   * NO functions / RPCs (create / redeem / revoke / expire + the atomic seat
--     cap re-check) — those land in Wave 4.
--   * NO seed changes (the beta Grade-5 backfill is Wave 6).
--
-- Cross-reference for the schema this migration depends on:
--   M1 = 20260518102823_initial_schema.sql  (schools, teachers, grade_levels,
--        grade_role enum, audit_action enum, set_updated_at() trigger fn)
--
-- Referenced column types (verified against M1):
--   schools.id       uuid  (M1:186)
--   teachers.id      uuid  (M1:218 — IS auth.users.id)
--   grade_levels.id  uuid  (M1:203)
--   grade_role       enum  ('teacher','lead','grade_admin')  (M1:44)
--
-- ENUM-IN-TRANSACTION DECISION:
--   Supabase applies each migration file inside a single transaction. On PG 12+
--   (this project is PG 17, config.toml `major_version = 17`) `ALTER TYPE ...
--   ADD VALUE` is permitted inside a transaction block; the only restriction is
--   that a newly-added value may not be *referenced* in the SAME transaction
--   that added it. This migration only ADDS the values (it never inserts/uses
--   them — the seat ledger and audit writes that consume them are Wave 4/6), so
--   running them in-transaction is safe. `IF NOT EXISTS` keeps each ADD VALUE
--   idempotent. (M1:18 explicitly endorses `alter type ... add value` as the
--   forward-compatible enum-extension path.)
-- ###########################################################################


-- ###########################################################################
-- ## SECTION 0 — EXTENSIONS
-- ###########################################################################
-- citext powers case-insensitive `invitations.invitee_email` matching so an
-- email invite redeemed from a differently-cased address still matches. Not
-- enabled by M1 (which only needs pgcrypto for gen_random_uuid()), so add it
-- here, idempotently.
create extension if not exists citext;


-- ###########################################################################
-- ## SECTION 1 — TABLES
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- teams — 1:1 with a hidden `schools` row; the seat / naming control plane
-- (ultraplan §3). The team's workspace IS that school, so every member shares
-- `teachers.school_id` = teams.school_id and the existing ~40 RLS policies
-- isolate teammates correctly with no rewrite (ultraplan §1 / §2).
-- ---------------------------------------------------------------------------
create table if not exists teams (
  id               uuid primary key default gen_random_uuid(),
  -- The hidden workspace. One team per school row (Strategy A); cascade so a
  -- workspace teardown removes its team.
  school_id        uuid not null unique references schools(id) on delete cascade,
  name             text not null,
  -- The team owner (seat #1). FK to teachers WITHOUT on-delete cascade so an
  -- owner-account deletion does not silently destroy the whole team's control
  -- plane; ownership reassignment is handled by Wave 4 RPCs.
  owner_teacher_id uuid not null references teachers(id),
  -- Seat ceiling. Default 5 (1 owner + 4 invited, ultraplan §0); bounded so a
  -- runaway value can't disable seat accounting.
  seat_cap         integer not null default 5 check (seat_cap between 1 and 50),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- team_memberships — the "active" side of the seat ledger (ultraplan §3): one
-- row per teacher currently in a team. Seat accounting (active members +
-- pending invites ≤ seat_cap) is enforced inside Wave 4 SECURITY DEFINER RPCs,
-- not raw RLS (it is a cross-row aggregate).
-- ---------------------------------------------------------------------------
create table if not exists team_memberships (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  -- Reuses the existing grade_role enum (M1:44). Owner/lead = 'lead',
  -- collaborator/viewer = 'teacher'; mapped per invite role at redeem time.
  role       grade_role not null default 'teacher',
  created_at timestamptz not null default now(),
  -- A teacher appears at most once per team.
  unique (team_id, teacher_id)
);

-- ---------------------------------------------------------------------------
-- invitations — invite lifecycle (ultraplan §3 / §5). The raw token is shown
-- to the inviter exactly once; only its sha-256 hash is stored. A pending
-- invite HOLDS a seat (counted against seat_cap in the Wave 4 redeem tx).
-- ---------------------------------------------------------------------------
create table if not exists invitations (
  id                     uuid primary key default gen_random_uuid(),
  team_id                uuid not null references teams(id) on delete cascade,
  -- The grade the invitee is granted access to on accept (drives the TGA the
  -- redeem RPC writes). No cascade: if the grade is removed the invite should
  -- surface as broken rather than silently vanish — but a grade removal is not
  -- expected for a live team, and Wave 4 validates the grade at redeem.
  target_grade_level_id  uuid not null references grade_levels(id),
  -- Granted role on accept (viewer/collaborator → 'teacher', lead → 'lead').
  role                   grade_role not null default 'teacher',
  -- sha-256(raw token). Unique so a token resolves to at most one invite.
  token_hash             text not null unique,
  -- null = open link invite (anyone with the link); set = email-bound invite
  -- (redeem must match the signed-in user's email). citext = case-insensitive.
  invitee_email          citext,
  status                 text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  inviter_teacher_id     uuid not null references teachers(id),
  expires_at             timestamptz not null,
  -- Populated by the redeem RPC on accept.
  accepted_by            uuid references teachers(id),
  accepted_at            timestamptz,
  created_at             timestamptz not null default now()
);


-- ###########################################################################
-- ## SECTION 2 — INDEXES
-- ###########################################################################

-- FK / hot-path indexes (Postgres does NOT auto-index FK columns).
create index if not exists idx_teams_owner               on teams (owner_teacher_id);
create index if not exists idx_team_memberships_team      on team_memberships (team_id);
create index if not exists idx_team_memberships_teacher   on team_memberships (teacher_id);
create index if not exists idx_invitations_team           on invitations (team_id);
create index if not exists idx_invitations_grade          on invitations (target_grade_level_id);
create index if not exists idx_invitations_inviter        on invitations (inviter_teacher_id);

-- token_hash lookup is the redeem hot path; the `unique` constraint above
-- already creates a backing unique index, so no separate index is needed here.

-- At most ONE pending email-bound invite per (team, email). Partial + the
-- lower(email) expression (belt-and-suspenders alongside citext) so a second
-- pending invite to the same address on the same team is rejected, while
-- accepted/revoked/expired history and null-email link invites are unconstrained.
create unique index if not exists invitations_one_pending_per_email
  on invitations (team_id, lower(invitee_email))
  where status = 'pending' and invitee_email is not null;

-- Hot path for "list this team's outstanding invites" + seat-cap counting.
create index if not exists invitations_pending_by_team
  on invitations (team_id)
  where status = 'pending';


-- ###########################################################################
-- ## SECTION 3 — TRIGGERS (updated_at maintenance)
-- ###########################################################################
-- Only `teams` carries updated_at (team_memberships and invitations are
-- effectively append-then-transition rows; their lifecycle columns are set by
-- Wave 4 RPCs, not a generic updated_at). Reuse the shared set_updated_at()
-- function from M1:166. DROP-then-CREATE so re-running this migration is safe.
drop trigger if exists trg_teams_updated_at on teams;
create trigger trg_teams_updated_at
  before update on teams
  for each row execute function set_updated_at();


-- ###########################################################################
-- ## SECTION 4 — ROW-LEVEL SECURITY (enable only; deny-all until Wave 4)
-- ###########################################################################
-- RLS is ENABLED on all three tables but NO policies are defined yet. With RLS
-- enabled and no policy, every non-service-role access is DENIED (fail-closed):
-- the tables are effectively deny-all for authenticated/anon callers until
-- Wave 4 adds member-read + RPC-only-write policies (members may SELECT their
-- own team's rows; ALL mutations funnel through SECURITY DEFINER RPCs, mirroring
-- how audit_log writes are locked to log_audit_event). The service-role server
-- paths bypass RLS, so backfill/admin tooling is unaffected meanwhile.
alter table teams            enable row level security;
alter table team_memberships enable row level security;
alter table invitations      enable row level security;


-- ###########################################################################
-- ## SECTION 5 — AUDIT ENUM EXTENSION
-- ###########################################################################
-- Add the invite-lifecycle actions to the existing audit_action enum (M1:107)
-- so Wave 4/6 can record invite events via log_audit_event(). See the
-- ENUM-IN-TRANSACTION note in the file header: ADD VALUE is transaction-safe on
-- PG 17 because these values are only ADDED here, never referenced in this same
-- migration. IF NOT EXISTS makes each idempotent.
alter type audit_action add value if not exists 'invite_created';
alter type audit_action add value if not exists 'invite_accepted';
alter type audit_action add value if not exists 'invite_revoked';
alter type audit_action add value if not exists 'invite_expired';
alter type audit_action add value if not exists 'invite_resent';


-- ###########################################################################
-- End of teams + invitations control plane.
-- ###########################################################################
