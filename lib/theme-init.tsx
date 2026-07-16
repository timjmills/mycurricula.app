// theme-init.tsx — the no-FOUC theme boot script.
//
// WHY IT EXISTS: lib/theme.tsx is a "use client" provider, so its dataset
// writes only land AFTER React hydrates — one or more frames after first
// paint. A teacher who chose Night would see a flash of the Paper default
// before the provider catches up. This component paints the three persisted
// theme axes (data-theme / data-style / data-palette) onto <html> BEFORE the
// browser's first paint, eliminating that flash-of-unstyled-content.
//
// WHY A STATIC STRING: the script is a frozen string constant with ZERO
// interpolation, so there is no path for user/runtime data to reach
// `dangerouslySetInnerHTML` — it is XSS-safe by construction. The app's CSP
// (next.config.ts) already permits `script-src 'self' 'unsafe-inline'`, which
// is what lets this inline <script> run at all.
//
// WHY FIRST-CHILD-OF-BODY: the App Router gives no pre-paint <head> script
// slot we control (metadata is server-rendered, but arbitrary head scripts
// are awkward and run after the head parses). A <script> as the first child
// of <body> executes synchronously before any page content is parsed/painted,
// so the attributes are correct on the very first frame.
//
// COUPLING — READ BEFORE EDITING: the allowlists below MUST stay in lockstep
// with lib/theme.tsx (APP_THEMES, the style/palette literals, and the
// "system" → night/paper resolution). If they drift, a theme that one file
// accepts and the other rejects breaks SILENTLY — no error, just the wrong
// attribute. lib/theme.tsx's mirror effect deliberately SKIPS its first run
// so it does not clobber the attributes this script just painted; see the
// `mounted` ref there.

import type { ReactNode } from "react";

// Inline boot script. Mirrors lib/theme.tsx's storage keys + allowlists.
// "system" is resolved to a concrete theme here so a resolved value (never
// the literal "system") ever reaches the DOM. Kept terse but readable; any
// edit here needs the matching edit in lib/theme.tsx (see COUPLING above).
const THEME_INIT_SCRIPT = `(function () {
  try {
    var d = document.documentElement;
    var themes = ["paper","cloud","night","mint","sky","blossom"];
    var t = localStorage.getItem("mycurricula:user:theme");
    if (t === "system") t = matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper";
    if (themes.indexOf(t) < 0) t = "paper";
    d.dataset.theme = t;
    var s = localStorage.getItem("mycurricula:user:theme-style");
    if (["quiet","calm","vivid"].indexOf(s) >= 0) d.dataset.style = s;
    var p = localStorage.getItem("mycurricula:user:theme-palette");
    if (["normal","highlight"].indexOf(p) >= 0) d.dataset.palette = p;
  } catch (e) {}
})();`;

/**
 * Renders the no-FOUC boot <script>. A server component (no "use client") so
 * the script string is emitted into the initial HTML payload. Mount as the
 * FIRST child of <body>, before any provider or content — see the file header
 * for why placement matters.
 */
export function ThemeInit(): ReactNode {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
