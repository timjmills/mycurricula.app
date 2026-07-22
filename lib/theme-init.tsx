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
// data-tone IS DERIVED (theme + glass + bg + dim → light|dark; see theme.tsx
// deriveTone + WAVE-2-VALUE-MATRIX.md §4). The boot script paints the SAME
// derivation deriveTone applies, MINUS the async photo-luminance sample (a
// boot script cannot sample a canvas synchronously): night → dark; glass=light →
// light; wash → light; photo + bright → light; photo + dim|normal → dark (the
// matrix §4 pre-sample default — a scrim keeps white text readable, and the
// provider upgrades normal → auto post-mount once luminance is sampled). This
// MUST equal deriveTone(theme, glass, bg, dim, null) and the SSR default in
// app/layout.tsx so the
// server HTML, the boot paint, and the first client render all agree (no FOUC,
// no hydration mismatch) — and so the scripts/probe-theme-wave.mjs assertion
// (expectTone === "dark" at the Photo+normal defaults) passes. The provider
// reconciles to the true derived tone (incl. the luminance upgrade) within a
// frame.
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
// MUST mirror the canonical value arrays in lib/theme-values.ts (FRAME_VALUES,
// GLASS_VALUES, BG_VALUES, THEME_VALUES + the "system" sentinel, DIM_VALUES —
// the ORIGIN; lib/theme.tsx re-exports them), the SQL CHECK constraints, the
// SSR attributes in app/layout.tsx (now cookie-fed via the same theme-values
// guards), and the probe. The boot script cannot import the guards (it runs
// before any module loads), so this is a hand-kept literal copy. If it drifts,
// a value one surface accepts and another rejects breaks SILENTLY. This script
// also performs the one-time v1→v2 localStorage migration (paper|cloud →
// clear; seed theme-frame from theme-style) so the very first boot already
// persists v2 keys; lib/theme.tsx repeats the same remap defensively on read.
//
// SSR NOTE (FRAME-FLASH-SSR-DESIGN.md): the server now pre-paints these same
// attributes from the mc-theme-axes cookie, so in the common case this
// script's repaint is an idempotent no-op. It REMAINS load-bearing: it is the
// localStorage-over-stale-cookie self-heal and the only "system" resolver.

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

    // ── DERIVED tone — replicate deriveTone(theme,glass,bg,dim,null) (see header
    // + WAVE-2-VALUE-MATRIX.md §4). MUST match theme.tsx deriveTone, the SSR
    // default in app/layout.tsx, and the probe. The async photo-luminance
    // "normal → auto" upgrade is reconciled by the provider post-mount.
    //   night → dark · glass=light → light · wash → light · photo+bright → light
    //   · photo+(dim|normal) → dark
    var tone;
    if (t === "night") tone = "dark";
    else if (g === "light") tone = "light";
    else if (b === "wash") tone = "light";
    else if (dim === "bright") tone = "light";
    else tone = "dark";
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
