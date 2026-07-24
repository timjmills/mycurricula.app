// onboarding-v2-remote.ts — the SUPABASE side of the v2 onboarding activation
// gate: the deployed-path "has this teacher onboarded?" read and the "mark it
// done" write. Kept OUT of the pure shape leaf (lib/onboarding-v2-shape.ts) so
// that module stays React/Supabase-free and node-unit-testable; this is the
// impure boundary the client wiring (lib/onboarding-v2-state.tsx) calls.
//
// Both functions are best-effort and fail SAFE, mirroring lib/theme-sync.ts:
//   • isOnboardedRemote() returns null ("unknown") on EVERY error / no-session /
//     no-row / missing-column path, so the first-run redirect never fires on a
//     guess — only a resolved `false` (row exists, onboarded_at is null) ever
//     sends a teacher to the wizard.
//   • markOnboardedRemote() is fire-and-forget: it resolves (never rejects) and
//     swallows-but-logs failures (mirrors saveRemotePrefs).
//
// GATE: both no-op unless the planner Supabase backend is configured
// (isPlannerSupabaseConfigured — the same NEXT_PUBLIC_PLANNER_USE_SUPABASE=1 + a
// present URL gate the planner store uses). On the mock/prototype path they
// never touch the network, so the prototype's localStorage-only onboarding
// behavior is unchanged.

import { createClient } from "@/lib/supabase/client";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";

/**
 * The server's authoritative "has this teacher completed onboarding?" answer.
 *
 *   true   → teachers.onboarded_at is set (the teacher has onboarded).
 *   false  → the row exists and onboarded_at IS NULL (never onboarded) — the
 *            only value that lets the redirect fire.
 *   null   → UNKNOWN. Sync off, no session, no row, a read error, OR the
 *            onboarded_at column does not exist yet (pre-migration prod). The
 *            redirect treats null as "do not act", so shipping this ahead of the
 *            migration is a guaranteed no-op (activation-gate invariant #1).
 *
 * Never throws — every failure path resolves to null (fail-safe).
 */
export async function isOnboardedRemote(): Promise<boolean | null> {
  return (await readFirstRunState()).onboarded;
}

/**
 * The full deployed-path first-run read: WHO is signed in and whether they
 * have onboarded. The uid exists so the session latch in
 * lib/onboarding-v2-state.tsx can be keyed PER USER — a module-global boolean
 * latch would survive a client-side sign-out/sign-in (Next.js keeps module
 * state across soft navigations) and let a brand-new teacher on a shared
 * device inherit the previous teacher's "already satisfied" state (§4a
 * round-1 High).
 */
export async function readFirstRunState(): Promise<{
  uid: string | null;
  onboarded: boolean | null;
}> {
  if (!isPlannerSupabaseConfigured()) return { uid: null, onboarded: null };
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { uid: null, onboarded: null };

    const { data, error } = await supabase
      .from("teachers")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();

    // A read error (incl. "column onboarded_at does not exist" pre-migration) or
    // a missing row is UNKNOWN, never "not onboarded" — returning false here
    // would bounce every teacher into the wizard on a transient hiccup or before
    // the migration lands.
    if (error) {
      console.debug("onboarding: remote read failed", error.message);
      return { uid: user.id, onboarded: null };
    }
    if (!data) return { uid: user.id, onboarded: null };
    return { uid: user.id, onboarded: Boolean(data.onboarded_at) };
  } catch (err) {
    // Network / client-construction / unexpected shape — best-effort.
    console.debug("onboarding: remote read error", err);
    return { uid: null, onboarded: null };
  }
}

/**
 * Stamp the signed-in teacher as onboarded via the mark_onboarded() RPC.
 *
 * Fire-and-forget: resolves regardless of outcome and swallows-but-logs any
 * error (mirrors lib/theme-sync.ts saveRemotePrefs). No-ops when the planner
 * Supabase backend is not configured or there is no session. The RPC is
 * idempotent server-side (coalesce), so calling it twice is harmless.
 *
 * WHY AN RPC, NOT A CLIENT UPDATE: migration 20260604140000 column-gates the
 * teachers UPDATE privilege to (display_name, default_view, completion_privacy),
 * so a browser `update teachers set onboarded_at` would be denied. mark_onboarded
 * is SECURITY DEFINER and keys off auth.uid() (see the migration header).
 */
export async function markOnboardedRemote(): Promise<{
  uid: string | null;
  stamped: boolean;
}> {
  if (!isPlannerSupabaseConfigured()) return { uid: null, stamped: false };
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { uid: null, stamped: false };

    // The RPC re-checks auth.uid() server-side AND rejects unless it equals
    // the uid we read above — so an account switch between our getUser() and
    // this call errors instead of stamping the new session's row on the old
    // identity's behalf (client-side TOCTOU, §4a round-2).
    const { error } = await supabase.rpc("mark_onboarded", {
      p_expected_teacher: user.id,
    });
    if (error) {
      console.debug("onboarding: mark_onboarded failed", error.message);
      // uid still returned: the finish-grace window is keyed to the FINISHER's
      // identity even when the stamp write fails (no immediate wizard bounce;
      // the server's truth reasserts on the next full session).
      return { uid: user.id, stamped: false };
    }
    // RPC success proves auth.uid() === user.id — safe to key the latch on it.
    return { uid: user.id, stamped: true };
  } catch (err) {
    console.debug("onboarding: mark_onboarded error", err);
    return { uid: null, stamped: false };
  }
}
