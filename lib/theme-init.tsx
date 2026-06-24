// theme-init.tsx — the no-FOUC theme boot script (v2 appearance engine).
//
// WHY IT EXISTS: lib/theme.tsx is a "use client" provider, so its dataset writes
// only land AFTER React hydrates — one or more frames after first paint. A
// teacher who chose Night/Paper/Wash would see a flash of the v2 defaults
// (Glass · Photo · Clear) before the provider catches up. This component paints
// the persisted v2 axes (data-frame / data-glass / data-bg / data-theme /
// data-dim) onto <html> BEFORE the browser's first paint, eliminating that
// flash-of-unstyled-content, plus a SAFE non-flashing default for the DERIVED
// data-tone.
//
// data-tone IS DERIVED (theme + bg + dim → light|dark; see theme.tsx
// deriveTone + WAVE-2-VALUE-MATRIX.md §4) and the real value is reconciled
// post-mount (the photo-luminance "normal → auto" sample is a LATER stage). The
// boot script paints a deterministic default of "light": it is the resting tone
// for the most common non-photo states (Wash, any light theme, Photo-Bright) and
// — critically — light is the LEAST-FLASHING default, because the v2 Photo-Dark
// register layers a scrim that keeps white text readable regardless, whereas a
// premature "dark" tone on a light surface would flash unreadable ink. If a
// previously-derived tone was stashed under the (non-persisted) `last-tone` key
// we honor it as a closer first guess; otherwise light. Either way the provider
// reconciles to the true derived tone within a frame.
//
// WHY A STATIC STRING: the script is a frozen string constant with ZERO
// interpolation, so there is no path for user/runtime data to reach
// `dangerouslySetInnerHTML` — it is XSS-safe by construction. The app's CSP
// (next.config.ts) already permits `script-src 'self' 'unsafe-inline'`.
//
// WHY FIRST-CHILD-OF-BODY: a <script> as the first child of <body> executes
// synchronously before any page content is parsed/painted, so the attributes are
// correct on the very first frame.
//
// COUPLING — ALLOWLIST LOCKSTEP (READ BEFORE EDITING): the literal arrays below
// MUST mirror the exported guard arrays in lib/theme.tsx (FRAME_VALUES,
// GLASS_VALUES, BG_VALUES, THEME_VALUES + the "system" sentinel, DIM_VALUES), the
// SQL CHECK constraints, the SSR attributes in app/layout.tsx, and the probe. The
// boot script cannot import the guards (it runs before any module loads), so this
// is a hand-kept literal copy. If it drifts, a value one surface accepts and
// another rejects breaks SILENTLY. This script also performs the one-time v1→v2
// localStorage migration (paper|cloud → clear; seed theme-frame from theme-style)
// so the very first boot already persists v2 keys; lib/theme.tsx repeats the same
// remap defensively on read.

import type { ReactNode } from "react";

// Inline boot script. Mirrors lib/theme.tsx's storage keys + allowlists + the
// v1→v2 migration. Kept terse but readable; any edit here needs the matching
// edit in lib/theme.tsx (see COUPLING above).
const THEME_INIT_SCRIPT = `(function () {
  try {
    var d = document.documentElement;
    var ls = localStorage;

    // ── theme (with one-time v1 paper|cloud -> clear remap + persist) ──
    var themes = ["clear","night","honey","blossom","mint","sky","off"];
    var t = ls.getItem("mycurricula:user:theme");
    if (t === "paper" || t === "cloud") { t = "clear"; try { ls.setItem("mycurricula:user:theme", t); } catch (e) {} }
    if (t === "system") t = matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "clear";
    if (themes.indexOf(t) < 0) t = "clear";
    d.dataset.theme = t;

    // ── frame (seed from deprecated theme-style when unset: calm->glass, quiet->paper, vivid->color) ──
    var frames = ["glass","paper","color"];
    var f = ls.getItem("mycurricula:user:theme-frame");
    if (frames.indexOf(f) < 0) {
      var st = ls.getItem("mycurricula:user:theme-style");
      f = st === "calm" ? "glass" : st === "quiet" ? "paper" : st === "vivid" ? "color" : "glass";
      if (frames.indexOf(f) >= 0 && st) { try { ls.setItem("mycurricula:user:theme-frame", f); } catch (e) {} }
    }
    d.dataset.frame = f;

    // ── glass register ──
    var g = ls.getItem("mycurricula:user:theme-glass");
    if (["dark","light"].indexOf(g) < 0) g = "dark";
    d.dataset.glass = g;

    // ── background ──
    var b = ls.getItem("mycurricula:user:theme-bg");
    if (["photo","wash"].indexOf(b) < 0) b = "photo";
    d.dataset.bg = b;

    // ── photo brightness ──
    var dim = ls.getItem("mycurricula:user:theme-dim");
    if (["dim","normal","bright"].indexOf(dim) < 0) dim = "normal";
    d.dataset.dim = dim;

    // ── DERIVED tone (safe non-flashing default; provider reconciles post-mount) ──
    // Night forces dark even pre-mount; otherwise honor a stashed last-tone, else
    // light (the least-flashing default — see file header).
    var tone;
    if (t === "night") tone = "dark";
    else {
      var lt = ls.getItem("mycurricula:user:theme-last-tone");
      tone = (lt === "light" || lt === "dark") ? lt : "light";
    }
    d.dataset.tone = tone;
  } catch (e) {}
})();`;

/**
 * Renders the no-FOUC boot <script>. A server component (no "use client") so the
 * script string is emitted into the initial HTML payload. Mount as the FIRST
 * child of <body>, before any provider or content — see the file header for why.
 */
export function ThemeInit(): ReactNode {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
