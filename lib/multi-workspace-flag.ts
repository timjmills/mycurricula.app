// multi-workspace-flag.ts — the single gate for the Wave 12b-2 multi-workspace
// tenancy seam (lib/workspaces/*) + the notebook-state workspace-identity rewire.
//
// ⚠ THIS MODULE IS DELIBERATELY SIDE-EFFECT-FREE, exactly like lib/v2-flag.ts:
// it exports one constant and nothing else — no throws, no validation, no
// logging. Safe to import from client components (the notebook-state provider is
// "use client").
//
// WHAT IT GATES: whether the app resolves the workspace IDENTITY (workspace name,
// workspace-admin flag, notebook list) from the REAL active workspace — via the
// lib/workspaces/* seam + lib/admin/queries.ts listWorkspaceNotebooks() — instead
// of the Phase-1A MOCK constants baked into lib/notebook-state.tsx. It does NOT
// gate tokens, chrome, or the planner data path (those have their own switches:
// NEXT_PUBLIC_V2 and NEXT_PUBLIC_PLANNER_USE_SUPABASE respectively).
//
// ── POLARITY: DEFAULT OFF — the INVERSE of NEXT_PUBLIC_V2 ──────────────────
// `RAW === "1"`. Multi-workspace is OFF unless EXACTLY "1" turns it on. This is
// the opposite default from V2 (which is on unless exactly "0"), and it is
// deliberate: the backing migration (20260724120000_multi_workspace.sql) is
// authored + vetted but NOT YET APPLIED to prod. Until it is applied AND this
// flag is flipped on in a build, the seam must behave byte-identically to today —
// the notebook-state OFF path renders the mock workspace exactly as before, and
// the server actions short-circuit to friendly/empty responses. A typo'd value
// (`"true"`, `"on"`, `"yes"`) therefore reads as OFF (fail-safe), never as a
// premature ON against an un-migrated database.
//
// Inlined by `next build` (NEXT_PUBLIC_*) and frozen into the artifact — a
// runtime env change has NO effect; a flip is redeploy-gated.
//
// GATING PARTNER: even when this flag is ON, the workspaces server actions ALSO
// require isPlannerSupabaseConfigured() (a real Supabase project +
// NEXT_PUBLIC_PLANNER_USE_SUPABASE=1). Both must hold before any RPC is called,
// so a stray flag flip without the backend still cannot hit throwaway keys.

/**
 * True when the multi-workspace tenancy seam is active — workspace identity is
 * sourced from the real active workspace rather than the Phase-1A mock.
 *
 * DEFAULT OFF (inverse of V2): only the exact string "1" enables it. Inlined by
 * `next build`; safe to import from client components (no side effects).
 */
export const MULTI_WORKSPACE: boolean =
  process.env.NEXT_PUBLIC_MULTI_WORKSPACE === "1";
