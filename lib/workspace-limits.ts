// lib/workspace-limits.ts — the single TypeScript source of truth for workspace
// seat limits.
//
// DEFAULT_SEAT_CAP mirrors the DB column default:
//   teams.seat_cap  integer not null default 5  check (seat_cap between 1 and 50)
//   (supabase/migrations/20260606120000_teams_invitations.sql:82)
//
// The DB is the RUNTIME source of truth — every seat read selects
// `teams.seat_cap`; this constant is used ONLY as the fallback for a
// solo/legacy workspace that has no `teams` row yet (or a null column). It
// exists so that fallback number lives in exactly ONE place instead of being
// copied across the roster queries (lib/admin/queries.ts) and the settings page
// (app/settings/workspace/page.tsx).
//
// NOTE — this is NOT a committed pricing/tier limit. Packaging (free-tier
// limits, invite counts) is deliberately UNDECIDED (CLAUDE.md §1/§6); when it
// settles, the cap becomes per-plan configuration and this constant either
// moves into that config or documents the default alongside it. Do not scatter
// new seat/invite magic numbers — import this instead. The DB CHECK (1–50)
// stays the authoritative bound and cannot be changed from TypeScript.

/**
 * Fallback seat ceiling when a workspace has no `teams` row or a null
 * `seat_cap`. Mirrors `teams.seat_cap`'s DB default (5) — see the module header.
 */
export const DEFAULT_SEAT_CAP = 5;
