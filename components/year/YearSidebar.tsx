"use client";

// YearSidebar — narrow icon-only sub-nav for the Year view.
//
// The in-page Roadmap | Progression ToggleGroup is now the canonical mode
// switch — the two items have been removed from this sidebar. The rail's
// remaining items (Calendar, Units, Lessons, …) are inert "Coming soon"
// affordances rendered as <button disabled>: reachable by AT, never
// tabbable, never clickable. Each one is wrapped in a Tooltip carrying
// the label so the rail stays comprehensible at icon-only width.

import { FutureControl } from "@/components/ui";
import { useLabels, pluralize } from "@/lib/labels";
import styles from "./YearSidebar.module.css";

// ── Icons ──────────────────────────────────────────────────────────────────

const IconCal = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
);

const IconLayers = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const IconBook = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2V5z" />
    <path d="M4 21a2 2 0 0 1 2-2h13" />
  </svg>
);

const IconFlag = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
  </svg>
);

const IconBarChart = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);

const IconSettings = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconHelp = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </svg>
);

// ── Nav items ─────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "calendar", label: "Calendar", icon: IconCal },
  { id: "units", label: "Units", icon: IconLayers },
  { id: "lessons", label: "Lessons", icon: IconBook },
  { id: "checkpoints", label: "Checkpoints", icon: IconFlag },
  { id: "reports", label: "Reports", icon: IconBarChart },
  { id: "settings", label: "Settings", icon: IconSettings },
  { id: "help", label: "Help", icon: IconHelp },
];

// ── Component ─────────────────────────────────────────────────────────────

export function YearSidebar() {
  const labels = useLabels();

  // Hierarchy-term nav items carry the school's (possibly renamed) caption
  // rather than the hard-coded "Units" / "Lessons" labels.
  const labelOverrides: Record<string, string> = {
    units: pluralize(labels.unit),
    lessons: pluralize(labels.lesson),
  };

  return (
    <nav className={styles.sidebar} aria-label="Year view navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const label = labelOverrides[item.id] ?? item.label;
        return (
          <FutureControl
            key={item.id}
            variant="icon-only"
            tooltip={`${label} — coming after beta. Will switch the Year view to a ${label.toLowerCase()} focus.`}
            tooltipSide="right"
            leadingIcon={
              <Icon className={styles.navIcon} width={20} height={20} />
            }
          />
        );
      })}
    </nav>
  );
}
