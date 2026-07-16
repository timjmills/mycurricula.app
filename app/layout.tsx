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
  DEFAULT_STYLE,
  DEFAULT_PALETTE,
  DEFAULT_THEME,
} from "@/lib/theme";
import { ThemeInit } from "@/lib/theme-init";
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
  // data-style / data-palette / data-theme are rendered on the server with
  // the app defaults so token CSS is correct before hydration. The boot
  // script (ThemeInit, first child of <body>) then overwrites them pre-paint
  // with the teacher's PERSISTED choices to avoid a flash; ThemeProvider owns
  // subsequent changes. data-theme is always a RESOLVED value (never the
  // "system" sentinel) — DEFAULT_THEME is "paper" (concrete), so the literal
  // below stays correct; the boot script resolves a stored "system" to
  // night/paper before it ever paints.
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
      data-style={DEFAULT_STYLE}
      data-palette={DEFAULT_PALETTE}
      data-theme="paper"
      className={`${GeistSans.variable} ${GeistMono.variable} ${poppins.variable} ${dmSans.variable} ${jakarta.variable} ${quicksand.variable} ${caveat.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="cp-root flex min-h-full flex-col"
      >
        {/* ThemeInit must be the FIRST child of <body>: its inline script
            paints the persisted theme/style/palette attributes onto <html>
            before the browser's first paint, so a Night (or any non-default)
            theme does not flash the Paper default. See lib/theme-init.tsx. */}
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
