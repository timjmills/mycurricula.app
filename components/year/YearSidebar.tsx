"use client";

// YearSidebar — vertical icon+label sub-nav for the Year view.
//
// Roadmap and Progression are active and flip the in-page viewMode.
// The remaining items (Calendar, Units, Lessons, Checkpoints, Reports,
// Students, Settings, Help) are inert "coming soon" items rendered as
// non-interactive <span> elements with aria-disabled and a tooltip.
//
// Active items are <button> elements; inert items use <span> so they
// are NOT reachable by keyboard (no aria-pressed, no tab stop).

import { useAppState } from "@/lib/app-state";
import type { ViewMode } from "@/lib/app-state";
import styles from "./YearSidebar.module.css";

// ── Icons ──────────────────────────────────────────────────────────────────

const IconRoadmap = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M3 12h6l3-8 3 16 3-8h3" />
  </svg>
);

const IconProgression = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

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

const IconUsers = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="7" r="4" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8" />
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

// ── Nav items config ─────────────────────────────────────────────────────

interface ActiveNavItem {
  kind: "active";
  id: "roadmap" | "progression";
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  viewMode: ViewMode;
}

interface InertNavItem {
  kind: "inert";
  id: string;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
}

type NavItem = ActiveNavItem | InertNavItem;

const NAV_ITEMS: NavItem[] = [
  {
    kind: "active",
    id: "roadmap",
    label: "Roadmap",
    icon: IconRoadmap,
    viewMode: "grid",
  },
  {
    kind: "active",
    id: "progression",
    label: "Progression",
    icon: IconProgression,
    viewMode: "list",
  },
  { kind: "inert", id: "calendar", label: "Calendar", icon: IconCal },
  { kind: "inert", id: "units", label: "Units", icon: IconLayers },
  { kind: "inert", id: "lessons", label: "Lessons", icon: IconBook },
  { kind: "inert", id: "checkpoints", label: "Checkpoints", icon: IconFlag },
  { kind: "inert", id: "reports", label: "Reports", icon: IconBarChart },
  { kind: "inert", id: "students", label: "Students", icon: IconUsers },
  { kind: "inert", id: "settings", label: "Settings", icon: IconSettings },
  { kind: "inert", id: "help", label: "Help", icon: IconHelp },
];

// ── Component ─────────────────────────────────────────────────────────────

export function YearSidebar() {
  const { viewMode, setViewMode } = useAppState();

  return (
    <nav className={styles.sidebar} aria-label="Year view navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;

        if (item.kind === "active") {
          const isActive = viewMode === item.viewMode;
          return (
            <button
              key={item.id}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : styles.navItemIdle}`}
              onClick={() => setViewMode(item.viewMode)}
              aria-pressed={isActive}
              aria-label={item.label}
              title={item.label}
            >
              <Icon className={styles.navIcon} width={20} height={20} />
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        }

        // Inert item — rendered as a non-interactive <span>.
        // No tabIndex, no role="button", cursor:not-allowed.
        return (
          <span
            key={item.id}
            className={`${styles.navItem} ${styles.navItemInert}`}
            aria-disabled="true"
            title="Coming soon"
          >
            <Icon className={styles.navIcon} width={20} height={20} />
            <span className={styles.navLabel}>{item.label}</span>
            <span className={styles.soonBadge}>Soon</span>
          </span>
        );
      })}
    </nav>
  );
}
