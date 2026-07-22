// theme-sync.ts — best-effort cross-device sync for the persisted appearance axes.
//
// WHAT THIS IS: a thin, OPTIONAL bridge between lib/theme.tsx's local state and
// the `public.teacher_preferences` table (migration
// 20260612120000_teacher_preferences.sql). localStorage stays the source of
// IMMEDIACY — it paints pre-hydration via lib/theme-init.tsx and survives
// offline. This module only adds "the look follows you to another device": after
// the local load resolves, the provider pulls the remote row; on every change it
// debounces a write back. Every path here is best-effort — any failure (flag
// off, no session, network, RLS, malformed row) resolves to a no-op and NEVER
// disturbs local behavior. Writes are fire-and-forget; reads return null rather
// than throwing.
//
// FEATURE FLAG — OFF BY DEFAULT. Sync is dormant unless BOTH hold:
//   • NEXT_PUBLIC_THEME_SYNC === "1", AND
//   • a real Supabase project is configured (NEXT_PUBLIC_SUPABASE_URL set).
// This mirrors the planner/Teach seam convention (isPlannerSupabaseConfigured in
// lib/planner/source.ts: a NEXT_PUBLIC_<FEATURE>_USE_SUPABASE gate AND a present
// URL). Until the flag flips, the table sits empty and this module no-ops, so
// the prototype's localStorage-only behavior is byte-for-byte unchanged.
// NEXT_PUBLIC_* is inlined at build time, so reading it in this client module is
// SSR-safe and lets the bundle branch at load.
//
// SECURITY: reads/writes go through the browser Supabase client (anon key), so
// Row-Level Security is the gate. The teacher_preferences_owner policy restricts
// every row to teacher_id = auth.uid(), and teachers.id IS the auth uid — so a
// teacher can only ever touch their own preferences row. We additionally stamp
// teacher_id from the live session (never a caller-supplied id) so the upsert
// targets the caller's own row by construction.
//
// ALLOWLIST PARITY: values pulled from the DB are re-validated against the SAME
// guards lib/theme.tsx uses before they are returned. The migration's CHECK
// constraints already pin the columns to the allowlists, but re-validating here
// keeps this module honest even if a future column or a hand-edited row drifts —
// an unrecognized value is dropped, never applied.

import { createClient } from "@/lib/supabase/client";
import type {
  ThemeFrame,
  ThemeGlass,
  ThemeBg,
  ThemeDim,
  ThemeSetting,
  ThemeStyle,
  ThemePalette,
} from "./theme-values";
import {
  isThemeFrame,
  isThemeGlass,
  isThemeBg,
  isThemeDim,
  isThemeSetting,
  isThemeStyle,
  isThemePalette,
} from "./theme-values";

/**
 * The synced axes, in the shape the provider consumes — the FULL persisted
 * snapshot (W3.1b widening): the five v2 axes plus the deprecated v1 compat
 * pair (kept so a v1 rollback finds its values cross-device, and so the row
 * mirrors lib/theme-values.ts ThemeAxesSnapshot / the mc-theme-axes cookie
 * exactly). Derived/runtime state (tone, canvas) and the per-view local UI
 * keys (cc_editmode / cc_pblayout / cc_deLeftW) are EXCLUDED by design
 * (WAVE-3-PLAN C5).
 */
export interface RemoteThemePrefs {
  frame: ThemeFrame;
  glass: ThemeGlass;
  bg: ThemeBg;
  theme: ThemeSetting;
  dim: ThemeDim;
  /** @deprecated v1 compat axis — synced for rollback fidelity. */
  style: ThemeStyle;
  /** @deprecated v1 compat axis — synced for rollback fidelity. */
  palette: ThemePalette;
}

/**
 * Outcome of a remote-preferences read, DISCRIMINATED so the caller can tell
 * three states apart that a bare `null` would conflate:
 *   • `loaded`      — a row exists; apply its (validated) axes. Carries the
 *                     row's `updated_at` as epoch ms (`0` if absent/unparsable)
 *                     so the provider can LAST-WRITER-WINS against the local
 *                     write stamp — a stale row must never clobber a fresher
 *                     local change (the W3.1 ordering fix).
 *   • `empty`       — the query SUCCEEDED and the teacher has no row yet. Safe to
 *                     SEED the row from local values (their pre-sync look).
 *   • `unavailable` — sync is off, there is no session, or the read FAILED. The
 *                     caller must NOT seed: a real row may exist and a blind
 *                     write would clobber it with stale local values.
 * The distinction matters at rollout: every existing teacher has localStorage
 * prefs but no row, so "empty" is the common first-load state, and only an
 * "empty" (not an "unavailable") may trigger a seeding write.
 */
export type LoadRemoteResult =
  | { kind: "loaded"; prefs: Partial<RemoteThemePrefs>; updatedAt: number }
  | { kind: "empty" }
  | { kind: "unavailable" };

// Allowlist guards come straight from lib/theme.tsx (single source) — the
// only copies that must stay literal are the inline boot script in
// lib/theme-init.tsx and the migration's SQL CHECK constraints.

/**
 * Whether cross-device theme sync is enabled. OFF unless the opt-in flag is set
 * AND a Supabase project URL is configured — exactly the planner/Teach gate
 * shape. When false, loadRemotePrefs/saveRemotePrefs are pure no-ops.
 */
export function isThemeSyncEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.length === 0) return false;
  return process.env.NEXT_PUBLIC_THEME_SYNC === "1";
}

/**
 * Load the signed-in teacher's remote theme preferences.
 *
 * Resolves to a discriminated {@link LoadRemoteResult} (never throws — sync is
 * best-effort). `loaded` carries the validated axes; each axis is validated
 * independently, so a single malformed column is dropped (left undefined) while
 * the valid siblings still apply. `empty` means the query SUCCEEDED but no row
 * exists yet (the caller may seed). `unavailable` covers sync-off, no-session,
 * and read errors alike — states where the caller must NOT seed, because a real
 * row might exist behind a transient failure and a blind write would clobber it.
 */
export async function loadRemotePrefs(): Promise<LoadRemoteResult> {
  if (!isThemeSyncEnabled()) return { kind: "unavailable" };
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "unavailable" };

    // NOTE (deploy sequencing, W3-HANDOFF task #13): the frame/glass/bg/dim
    // columns land on prod only with the launch migration
    // (20260624120000_v2_theme_axes.sql). Against a pre-migration database this
    // SELECT errors ("column does not exist") → `unavailable` → sync no-ops,
    // which is today's expected dev-vs-prod behavior; it heals itself the
    // moment the migration applies. Never seed/write around that state.
    const { data, error } = await supabase
      .from("teacher_preferences")
      .select("frame, glass, bg, theme, dim, theme_style, theme_palette, updated_at")
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (error) {
      // A read error is NOT "no row": a row may exist but be momentarily
      // unreadable (network/RLS hiccup). Report unavailable so the caller never
      // seeds over it.
      console.debug("theme-sync: load failed", error.message);
      return { kind: "unavailable" };
    }
    if (!data) return { kind: "empty" }; // query OK, no saved row yet

    const prefs: Partial<RemoteThemePrefs> = {};
    if (isThemeFrame(data.frame)) prefs.frame = data.frame;
    if (isThemeGlass(data.glass)) prefs.glass = data.glass;
    if (isThemeBg(data.bg)) prefs.bg = data.bg;
    if (isThemeSetting(data.theme)) prefs.theme = data.theme;
    if (isThemeDim(data.dim)) prefs.dim = data.dim;
    if (isThemeStyle(data.theme_style)) prefs.style = data.theme_style;
    if (isThemePalette(data.theme_palette)) prefs.palette = data.theme_palette;
    // updated_at is trigger-maintained so it is always present in practice; an
    // absent/unparsable value degrades to 0 (epoch) — still newer than a device
    // that has never written locally, still older than any real local stamp.
    const updatedAtMs =
      typeof data.updated_at === "string" ? Date.parse(data.updated_at) : NaN;
    return {
      kind: "loaded",
      prefs,
      updatedAt: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    };
  } catch (err) {
    // Network / client-construction / unexpected shape — sync is best-effort.
    console.debug("theme-sync: load error", err);
    return { kind: "unavailable" };
  }
}

/**
 * Persist the teacher's current theme axes. Fire-and-forget: resolves (never
 * rejects) regardless of outcome, so a failed write can never affect local
 * behavior. No-ops when sync is off or there is no session.
 *
 * Upserts on the teacher_id primary key, so the first save creates the row and
 * later saves update it (updated_at is maintained by the DB trigger). The
 * teacher_id is taken from the LIVE session, never from the caller, so the write
 * targets the caller's own row by construction and the owner RLS policy can
 * never reject a well-formed call. The full snapshot is written each time
 * (debounced upstream), keeping the row a complete snapshot of the current look.
 */
export async function saveRemotePrefs(prefs: RemoteThemePrefs): Promise<void> {
  if (!isThemeSyncEnabled()) return;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("teacher_preferences").upsert(
      {
        teacher_id: user.id,
        frame: prefs.frame,
        glass: prefs.glass,
        bg: prefs.bg,
        theme: prefs.theme,
        dim: prefs.dim,
        theme_style: prefs.style,
        theme_palette: prefs.palette,
      },
      { onConflict: "teacher_id" },
    );
    if (error) {
      console.debug("theme-sync: save failed", error.message);
    }
  } catch (err) {
    console.debug("theme-sync: save error", err);
  }
}
