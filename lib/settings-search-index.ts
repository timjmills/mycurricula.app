// settings-search-index.ts — the static index behind the settings search
// (components/settings/settings-search.tsx).
//
// One entry per searchable target: a whole section (no anchor) or an
// individual settings card (anchor = the SettingsCard `anchorId` on that
// page). The search filters case-insensitively over title + section +
// keywords; picking a result navigates to `route` and — when an anchor is
// present — scrolls to and briefly highlights that card.
//
// KEEP IN SYNC: when a settings page adds/renames a card, add/rename its
// entry here. Routes and group names mirror SETTINGS_GROUPS in
// app/settings/layout.tsx.

export interface SettingsSearchEntry {
  /** Sidebar group the section lives under (display breadcrumb). */
  group: string;
  /** Section (sidebar tab) display name. */
  section: string;
  /** Route of the section page. */
  route: string;
  /** Card title — or the section name again for section-level entries. */
  title: string;
  /** SettingsCard anchorId on that page; null → land at the page top. */
  anchor: string | null;
  /** Extra match words (lowercase) beyond title/section. */
  keywords: readonly string[];
}

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  // ── Planning · Curriculum ────────────────────────────────────────────
  {
    group: "Planning",
    section: "Curriculum",
    route: "/settings/curriculum",
    title: "Curriculum label",
    anchor: "curriculum-label",
    keywords: ["name", "wordmark", "suffix", "grade", "team"],
  },
  // ── Planning · Standards ─────────────────────────────────────────────
  {
    group: "Planning",
    section: "Standards",
    route: "/settings/standards",
    title: "School frameworks",
    anchor: "school-frameworks",
    keywords: [
      "standards",
      "framework",
      "ccss",
      "common core",
      "aero",
      "ngss",
      "ib",
      "cambridge",
      "curriculum",
      "default",
    ],
  },
  {
    group: "Planning",
    section: "Standards",
    route: "/settings/standards",
    title: "Your frameworks",
    anchor: "my-frameworks",
    keywords: ["standards", "framework", "my standards", "personal", "tag"],
  },
  // ── Planning · Calendar ──────────────────────────────────────────────
  {
    group: "Planning",
    section: "Calendar",
    route: "/settings/calendar",
    title: "School months",
    anchor: "school-months",
    keywords: ["academic year", "months", "semester", "term"],
  },
  {
    group: "Planning",
    section: "Calendar",
    route: "/settings/calendar",
    title: "Academic year dates",
    anchor: "academic-year",
    keywords: ["start", "end", "year", "dates", "weeks"],
  },
  {
    group: "Planning",
    section: "Calendar",
    route: "/settings/calendar",
    title: "School week",
    anchor: "school-week",
    keywords: ["weekdays", "days", "sunday", "monday", "friday", "week"],
  },
  {
    group: "Planning",
    section: "Calendar",
    route: "/settings/calendar",
    title: "Holidays",
    anchor: "holidays",
    keywords: ["break", "vacation", "eid", "non-instruction", "days off"],
  },
  // ── Planning · Schedule ──────────────────────────────────────────────
  {
    group: "Planning",
    section: "Schedule",
    route: "/settings/schedule",
    title: "Schedule rotation",
    anchor: "rotation",
    keywords: ["a/b", "ab", "cycle", "rotating", "timetable", "pattern"],
  },
  {
    group: "Planning",
    section: "Schedule",
    route: "/settings/schedule",
    title: "My time blocks",
    anchor: "time-blocks",
    keywords: ["timetable", "periods", "times", "daily schedule", "blocks"],
  },
  // ── Content · Subjects ───────────────────────────────────────────────
  {
    group: "Content",
    section: "Subjects",
    route: "/settings/subjects",
    title: "Team subjects",
    anchor: "team-subjects",
    keywords: ["rename", "academic", "color", "subject"],
  },
  {
    group: "Content",
    section: "Subjects",
    route: "/settings/subjects",
    title: "Subjects I teach",
    anchor: "subject-visibility",
    keywords: ["hide", "visibility", "show", "teach"],
  },
  {
    group: "Content",
    section: "Subjects",
    route: "/settings/subjects",
    title: "My subjects",
    anchor: "personal-subjects",
    keywords: ["personal", "add subject", "create", "custom"],
  },
  {
    group: "Content",
    section: "Subjects",
    route: "/settings/subjects",
    title: "Archived subjects",
    anchor: "archived-subjects",
    keywords: ["restore", "unarchive", "archive"],
  },
  // ── Content · Lesson templates ───────────────────────────────────────
  {
    group: "Content",
    section: "Lesson templates",
    route: "/settings/lesson-templates",
    title: "Lesson templates",
    anchor: null,
    keywords: ["flow", "template", "default", "5e", "workshop", "stations"],
  },
  // ── People · Workspace & Team ────────────────────────────────────────
  {
    group: "People",
    section: "Workspace & Team",
    route: "/settings/workspace",
    title: "Workspace",
    anchor: "workspace-name",
    keywords: ["school", "rename", "organization", "workspace name"],
  },
  {
    group: "People",
    section: "Workspace & Team",
    route: "/settings/workspace",
    title: "Notebooks",
    anchor: "notebooks",
    keywords: ["grade", "create", "archive", "rename", "notebook"],
  },
  {
    group: "People",
    section: "Workspace & Team",
    route: "/settings/workspace",
    title: "Default notebook",
    anchor: "default-notebook",
    keywords: ["startup", "open", "grade level"],
  },
  {
    group: "People",
    section: "Workspace & Team",
    route: "/settings/workspace",
    title: "Team members",
    anchor: "team-members",
    keywords: ["invite", "seats", "members", "roles", "teachers"],
  },
  // ── People · Account ─────────────────────────────────────────────────
  {
    group: "People",
    section: "Account",
    route: "/settings/account",
    title: "Display name",
    anchor: "profile",
    keywords: ["name", "avatar", "initials", "profile"],
  },
  {
    group: "People",
    section: "Account",
    route: "/settings/account",
    title: "Default view",
    anchor: "default-view",
    keywords: ["startup", "home", "weekly", "daily", "open on"],
  },
  {
    group: "People",
    section: "Account",
    route: "/settings/account",
    title: "Completion privacy",
    anchor: "completion-privacy",
    keywords: ["done", "private", "shared", "privacy", "marks"],
  },
  {
    group: "People",
    section: "Account",
    route: "/settings/account",
    title: "Sign-in & account",
    anchor: "sign-in-out",
    keywords: ["sign out", "logout", "login", "google", "auth"],
  },
  // ── Preferences · Appearance ─────────────────────────────────────────
  {
    group: "Preferences",
    section: "Appearance",
    route: "/settings/appearance",
    title: "Frame, background, theme & brightness",
    anchor: null,
    keywords: [
      "frame",
      "glass",
      "frosted",
      "calm glass",
      "bright",
      "color",
      "background",
      "photo",
      "wash",
      "brightness",
      "dim",
      "theme",
      "appearance",
    ],
  },
  {
    group: "Preferences",
    section: "Appearance",
    route: "/settings/appearance",
    title: "App color theme",
    anchor: null,
    keywords: ["paper", "night", "dark mode", "cloud", "mint", "sky", "blossom", "theme"],
  },
  {
    group: "Preferences",
    section: "Appearance",
    route: "/settings/appearance",
    title: "Style & palette",
    anchor: null,
    keywords: ["vivid", "calm", "quiet", "saturation", "highlight", "cards"],
  },
  {
    group: "Preferences",
    section: "Appearance",
    route: "/settings/appearance",
    title: "Subject colors",
    anchor: null,
    keywords: ["swatch", "color", "recolor", "subject"],
  },
  {
    group: "Preferences",
    section: "Appearance",
    route: "/settings/appearance",
    title: "Hierarchy labels",
    anchor: null,
    keywords: ["vocabulary", "rename", "unit", "lesson", "week", "labels"],
  },
  {
    group: "Preferences",
    section: "Appearance",
    route: "/settings/appearance",
    title: "Onboarding tooltips",
    anchor: null,
    keywords: ["tips", "tooltips", "hints", "reset", "dismissed"],
  },
  // ── Preferences · Catch-up ───────────────────────────────────────────
  {
    group: "Preferences",
    section: "Catch-up",
    route: "/settings/catch-up",
    title: "Catch-up cues",
    anchor: null,
    keywords: ["uncovered", "flame", "badge", "triage", "missed lessons"],
  },
] as const;

/** Case-insensitive substring filter over title + section + keywords.
 *  Returns at most `limit` entries, title matches ranked first. */
export function searchSettings(
  query: string,
  limit = 8,
): SettingsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const titleHits: SettingsSearchEntry[] = [];
  const otherHits: SettingsSearchEntry[] = [];
  for (const entry of SETTINGS_SEARCH_INDEX) {
    if (entry.title.toLowerCase().includes(q)) {
      titleHits.push(entry);
    } else if (
      entry.section.toLowerCase().includes(q) ||
      entry.keywords.some((k) => k.includes(q))
    ) {
      otherHits.push(entry);
    }
  }
  return [...titleHits, ...otherHits].slice(0, limit);
}
