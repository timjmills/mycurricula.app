import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import {
  Plus_Jakarta_Sans,
  Poppins,
  DM_Sans,
  Quicksand,
  Caveat,
} from "next/font/google";
import "./globals.css";
import {
  ThemeProvider,
  DEFAULT_FRAME,
  DEFAULT_GLASS,
  DEFAULT_BG,
  DEFAULT_THEME,
  DEFAULT_DIM,
  DEFAULT_PALETTE,
} from "@/lib/theme";
import { ThemeInit } from "@/lib/theme-init";
import { DEFAULT_STAGE_PHOTO } from "@/lib/stage-photo";
import { LabelsProvider } from "@/lib/labels";
import { InstanceLabelsProvider } from "@/lib/instance-labels";

// ── v1.3 brand type system (Curricula Design System) ──────────────────────
// Display + H1 use Poppins (geometric, friendly); smaller headings, card
// titles and the wordmark use DM Sans (neutral, modern); UI/body/data use
// Plus Jakarta Sans (clean, professional). Each face exposes a CSS var that
// tokens.css maps to --font-display / --font-display-sm / --font-logo /
// --font-sans. Fonts come from Google Fonts (the official v1.3 delivery);
// `display: "swap"` keeps first paint fast.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-dm-sans",
  display: "swap",
});

// Plus Jakarta Sans is the body/UI face for the whole app (and the Teach
// widget system's default). Quicksand (Rounded) and Caveat (Marker) remain
// the widget appearance editor's optional faces. Each exposes a CSS var
// (--font-jakarta / --font-quicksand / --font-caveat) that tokens.css maps to
// --font-sans and the --wf-font-* options.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
  display: "swap",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  // Root metadata is rendered server-side and cannot read per-team
  // curriculumLabel state. Keep it generic; surface the team's label inside
  // the app chrome instead (top bar + per-page headers).
  title: "MyCurricula — Curriculum Planner",
  description: "Curriculum planning tool for teaching teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The v2 appearance axes (data-frame / data-glass / data-bg / data-theme /
  // data-dim) plus the DERIVED data-tone are rendered on the server with the app
  // defaults so token CSS is correct before hydration (LOCKSTEP surface #4 — the
  // literals below mirror the DEFAULT_* exports + theme.tsx guards). The boot
  // script (ThemeInit, first child of <body>) then overwrites them pre-paint with
  // the teacher's PERSISTED choices to avoid a flash; ThemeProvider owns
  // subsequent changes. data-theme is always a RESOLVED value (never the "system"
  // sentinel) — DEFAULT_THEME is "clear" (concrete), so the attribute below stays
  // correct; the boot script resolves a stored "system" to night/clear before it
  // ever paints. data-tone is DERIVED: its server value equals
  // deriveTone("clear", DEFAULT_BG, DEFAULT_DIM, null) === "dark" (matrix §4
  // pre-sample default for Photo+normal) and matches the boot script, so server
  // HTML == boot == first client paint; the provider reconciles the true derived
  // tone (incl. the normal→auto luminance upgrade) post-mount. data-palette is the
  // deprecated v1 compat axis, kept for the PaletteProvider bridge + v1 surfaces;
  // data-style is intentionally NOT emitted on the v2 DOM path.
  return (
    <html
      lang="en"
      // suppressHydrationWarning is scoped to <html>'s own attributes (it is
      // non-recursive — it does NOT hide mismatches in the component tree
      // below). The root element is the node browser extensions (Grammarly,
      // dark-mode/translation tools), the ThemeInit boot script, and the
      // ThemeProvider's post-mount dataset writes all mutate before/at
      // hydration, producing a benign attribute diff on <html>/<body>. This is
      // the standard Next.js theme-provider mitigation.
      suppressHydrationWarning
      data-frame={DEFAULT_FRAME}
      data-glass={DEFAULT_GLASS}
      data-bg={DEFAULT_BG}
      data-theme="clear"
      data-dim={DEFAULT_DIM}
      data-tone="dark"
      data-palette={DEFAULT_PALETTE}
      // The active stage photo (W2-4): feed the bundled, same-origin default so
      // (a) getActivePhotoUrl() in lib/theme.tsx reads it from
      // dataset.stagePhoto post-mount → the dim==="normal" AUTO tone samples the
      // photo's (the handoff default, /stage/p1.webp) luminance and upgrades the
      // pre-sample dark default to the photo's TRUE tone, and (b) themes.css
      // `[data-bg="photo"] .stage::before`
      // paints the photo on the FIRST SSR frame via --stage-photo (no
      // photo-FOUC; the inline custom property is present before hydration).
      data-stage-photo={DEFAULT_STAGE_PHOTO}
      style={
        { ["--stage-photo"]: `url(${DEFAULT_STAGE_PHOTO})` } as React.CSSProperties
      }
      className={`${GeistSans.variable} ${GeistMono.variable} ${poppins.variable} ${dmSans.variable} ${jakarta.variable} ${quicksand.variable} ${caveat.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="cp-root flex min-h-full flex-col"
      >
        {/* The v2 background stage host: a fixed, full-viewport element at
            z-index:-2 (app/themes.css `.stage`) whose ::before paints the photo
            duotone (`var(--stage-photo)`) and ::after the tone scrim. NOTHING
            rendered this before, so the whole background engine was inert (W2-4);
            rendering it here as the FIRST child of <body> lights it up. It is a
            plain server-rendered div (no client component needed) and sits behind
            everything, so it cannot affect v1 surfaces. (The CSS-MODULE-scoped
            `.stage` in notecards/Gallery is a different, unrelated class.) */}
        <div className="stage" aria-hidden="true" />
        {/* ThemeInit's inline script must run before first paint (it precedes
            all app chrome here; the static .stage div above carries no script,
            so it does not delay this one): it
            paints the persisted v2 axes (frame/glass/bg/theme/dim + a safe
            derived tone) onto <html> before the browser's first paint, so a
            Night/Paper/Wash (or any non-default) choice does not flash the
            Glass · Photo · Clear default. See lib/theme-init.tsx. */}
        <ThemeInit />
        <ThemeProvider initialTheme={DEFAULT_THEME}>
          {/* LabelsProvider hosts the renameable Subject/Unit/Lesson/Section
              captions. Mounted near the root so every surface — Settings,
              the ResourceComposer's routing pickers, future breadcrumbs —
              reads from the same source. SSR-safe: it initializes with the
              defaults and loads saved overrides post-mount so hydration
              cannot mismatch. */}
          {/* InstanceLabelsProvider hosts per-INSTANCE renames (e.g. naming a
              specific Unit "Fractions Deep Dive") with personal/team scope.
              Sibling to LabelsProvider (which renames the level TERM). Same
              SSR-safe hydration model: empty on first paint, overrides arrive
              post-mount. */}
          <LabelsProvider>
            <InstanceLabelsProvider>{children}</InstanceLabelsProvider>
          </LabelsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
