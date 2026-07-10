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
import { cookies } from "next/headers";
import { ThemeProvider } from "@/lib/theme";
import {
  THEME_AXES_COOKIE,
  decodeThemeAxesCookie,
  deriveTone,
} from "@/lib/theme-values";
import { ThemeInit } from "@/lib/theme-init";
import { RouteTransitionPulse } from "@/lib/view-transition";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ── SSR no-flash axes (FRAME-FLASH-SSR-DESIGN.md) ────────────────────────
  // The mc-theme-axes cookie mirrors the teacher's persisted appearance axes.
  // Decode + allowlist-validate it (theme-values.ts codec — every emitted
  // value is a member of the frozen sets, so no unvalidated byte can reach an
  // HTML attribute) and render BOTH the <html data-*> attributes AND the
  // ThemeProvider initial props from it. Server HTML, the boot paint, and the
  // first client render then all agree on the teacher's real look — no
  // component-tree flash (WeekColumns/YearConstellation/card materials render
  // right on frame one). No/invalid cookie ⇒ the DEFAULT_* values, exactly
  // today's behavior; localStorage remains the client source of truth and the
  // boot script still repaints attrs from it (the stale-cookie self-heal).
  //
  // ⚠ CACHE-ISOLATION INVARIANT (design §3e): reading cookies() makes every
  // HTML response vary on this cookie AND opts the whole tree into dynamic
  // rendering. SSR HTML must NEVER enter a shared cache — no Cache Everything
  // rules, no `revalidate`/`force-static` anywhere under this layout — or one
  // teacher's frame would be served to another.
  const jar = await cookies();
  const axes = decodeThemeAxesCookie(jar.get(THEME_AXES_COOKIE)?.value);
  // data-theme must be a CONCRETE value. A stored "system" cannot be resolved
  // server-side (no OS-scheme signal) — fall back to "clear" exactly like the
  // pre-cookie default; the boot script's matchMedia resolves it pre-paint and
  // the provider receives the raw setting via initialTheme.
  const ssrTheme = axes.theme === "system" ? "clear" : axes.theme;
  // data-tone is DERIVED server-side with the SAME derivation the boot script
  // replicates and the provider applies (theme-values.ts deriveTone, autoTone
  // null — the async luminance upgrade reconciles post-mount).
  const ssrTone = deriveTone(ssrTheme, axes.glass, axes.bg, axes.dim, null);
  // (LOCKSTEP surface #4 — the attributes below carry theme-values.ts members
  // only. The boot script still overwrites them pre-paint from localStorage;
  // ThemeProvider owns subsequent changes.)
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
      data-frame={axes.frame}
      data-glass={axes.glass}
      data-bg={axes.bg}
      data-theme={ssrTheme}
      data-dim={axes.dim}
      data-tone={ssrTone}
      data-palette={axes.palette}
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
        {/* The whole-app theme-tint wash (app/themes.css `.theme-tint`): a
            z-index:90, mix-blend-mode:soft-light overlay whose per-theme opacity
            + gradient are keyed on `:root[data-theme="…"] .theme-tint`. The recipe
            was fully styled but NEVER mounted, so the per-theme soft-light wash
            over the whole app was dead CSS; rendering it here (sibling of .stage,
            descendant of the <html> that carries data-theme) lights it up. Plain
            server-rendered div, no client component. pointer-events:none means it
            sits over the app but cannot block any interaction. */}
        <div className="theme-tint" aria-hidden="true" />
        {/* ThemeInit's inline script must run before first paint (it precedes
            all app chrome here; the static .stage div above carries no script,
            so it does not delay this one): it
            paints the persisted v2 axes (frame/glass/bg/theme/dim + a safe
            derived tone) onto <html> before the browser's first paint, so a
            Night/Paper/Wash (or any non-default) choice does not flash the
            Glass · Photo · Clear default. See lib/theme-init.tsx. */}
        <ThemeInit />
        {/* W3.2 (D4) — resolves the in-flight view-transition promise when a
            route's DOM commits (pathname change). Render-null client leaf;
            mounted ONCE here so soft swaps work across every route group. */}
        <RouteTransitionPulse />
        <ThemeProvider
          initialFrame={axes.frame}
          initialGlass={axes.glass}
          initialBg={axes.bg}
          initialTheme={axes.theme}
          initialDim={axes.dim}
          initialStyle={axes.style}
          initialPalette={axes.palette}
        >
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
