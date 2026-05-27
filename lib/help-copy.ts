// help-copy.ts — route-aware Help copy registry consumed by the
// ShortcutsOverlay (the "?" help surface).
//
// Why this file exists
// ────────────────────
// W3-C8 of the 2026-05-27 Ultraplan UI/UX audit asked us to make the
// existing keyboard-shortcut overlay route-aware: when a teacher is on
// /weekly the overlay should explain what /weekly does, when they're on
// /daily it should explain /daily, etc. Decision #10 in that audit was
// "extend the existing overlay; don't build a new HelpDrawer". So this
// registry is the data; the overlay reads it via `helpForPathname()` and
// appends a new section at the bottom of SHORTCUT_GROUPS.
//
// Shape
// ─────
// The registry is a plain object keyed by a pathname *prefix*. Looking up
// help is "longest prefix wins" — so `/subject/math` falls back to the
// `/subject` entry, not to a global default. Each entry has:
//
//   • title    — heading shown in the overlay section.
//   • bullets  — copy lines explaining what this surface is FOR. Voice
//                follows CLAUDE.md §4 onboarding: tell a first-time
//                teacher what the surface accomplishes, not just what
//                it's called.
//
// Importer-friendly: the file is plain TS (no JSX, no hooks) so it can be
// imported by any consumer — overlay, future search, route-help tooltips,
// agent scripts that audit copy. Adding a new route is one entry.

export interface HelpEntry {
  /** Heading shown above the bullets. */
  title: string;
  /** One bullet per line — explain what the surface is FOR. */
  bullets: string[];
}

// Each entry is keyed by a pathname prefix; longer keys win on lookup.
// Order doesn't matter — `helpForPathname` walks all keys and picks the
// longest match. Routes with deeper sub-paths (e.g. /subject/math) inherit
// from the broader prefix unless a deeper key is added.
const HELP_COPY: Record<string, HelpEntry> = {
  "/daily": {
    title: "About the Daily view",
    bullets: [
      "See today's lessons in detail — full schedule, lesson cards, and the day's notes.",
      "Click any lesson card to expand it inline; double-click the title to edit in place.",
      "Use [ and ] to flip between days; T jumps to today.",
      "Reordering lessons by drag is personal — your teammates still see the team order.",
    ],
  },
  "/weekly": {
    title: "About the Weekly view",
    bullets: [
      "Your full week of lessons across every subject — at a glance, edit in place.",
      "Switch between Grid (subjects as columns) and List (one scrollable stream per day).",
      "Click Schedule to open the day-by-day timetable view.",
      "Use [ and ] to flip between weeks; T jumps to the current week.",
    ],
  },
  "/year": {
    title: "About the Yearly view",
    bullets: [
      "High-level roadmap of units across the year — see the whole arc at a glance.",
      "Toggle between Roadmap (units laid across months) and Progression (standards coverage).",
      "Click any unit to drop into its lessons in the Curriculum view.",
    ],
  },
  "/subject": {
    title: "About the Curriculum view",
    bullets: [
      "The full year of units and lessons per subject, with the standards each covers.",
      "Use the subject tabs on the left to switch between math, reading, writing, etc.",
      "Open a unit to see its lessons, standards, resources, and Don't-miss callouts.",
    ],
  },
  "/schedule": {
    title: "About the Schedule view",
    bullets: [
      "The daily timetable — the time blocks defining when each subject meets.",
      "Pick a day to see its full schedule; the day you choose here also drives Daily.",
      "Timetables can rotate on A/B (or longer) cycles — configured in Settings.",
    ],
  },
  "/catch-up": {
    title: "About Catch-up",
    bullets: [
      "Lessons that fell behind and need a make-up plan — your triage queue.",
      "Mark items 'covered later', 'merge into next lesson', or 'skip this year'.",
      "The flame badge in the top bar tracks the rollup across every week.",
    ],
  },
  "/settings": {
    title: "About Settings",
    bullets: [
      "Two scopes: Personal preferences (you only) and Team Curriculum (whole team).",
      "Team-scoped changes fire a toast naming the team-wide effect.",
      "Configure curriculum label, school week, academic year, holidays, lesson templates, and Catch-up rules.",
    ],
  },
};

/**
 * Look up the help entry for a given pathname. Walks all registered prefixes
 * and returns the longest match. Returns null when no prefix matches — the
 * overlay then renders no route-specific section (the keyboard shortcuts
 * still show).
 *
 * Examples:
 *   "/weekly"          → HELP_COPY["/weekly"]
 *   "/subject/math"    → HELP_COPY["/subject"]  (longest prefix)
 *   "/onboarding"      → null
 */
export function helpForPathname(pathname: string | null): HelpEntry | null {
  if (!pathname) return null;
  let bestKey: string | null = null;
  for (const key of Object.keys(HELP_COPY)) {
    if (pathname === key || pathname.startsWith(key + "/") || pathname === key) {
      if (bestKey === null || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }
  return bestKey ? HELP_COPY[bestKey] : null;
}
