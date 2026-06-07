"use client";

// SideNav.tsx — app-wide left navigation for the planner group (v1.3).
//
// Replaces the top-bar view tabs AND the icon rails (GlobalRail/RightIconRail)
// with a single prototype-style left sidebar: brand → primary nav → tools →
// settings → user. Mounted once in app/(planner)/layout.tsx. Teach is a
// separate route group with its own chrome; the "Teach" item links out to it.
//
// Active highlighting derives from the pathname. The wordmark + brand live
// here now (removed from the top bar).

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { NotebookSwitcher } from "@/components/nav";
import styles from "./SideNav.module.css";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Active when the pathname starts with this prefix (defaults to href). */
  match?: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Plan",
    items: [
      { label: "Daily", href: "/daily", icon: <CalendarIcon /> },
      { label: "Weekly", href: "/weekly", icon: <GridIcon /> },
      { label: "Year", href: "/year", icon: <LayersIcon /> },
      { label: "Curriculum", href: "/subject", icon: <BookIcon /> },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Catch-up", href: "/catch-up", icon: <FlagIcon /> },
      { label: "Schedule", href: "/schedule", icon: <ClockIcon /> },
      { label: "Teach", href: "/teach", icon: <PresentIcon /> },
    ],
  },
];

export function SideNav(): ReactNode {
  const pathname = usePathname();
  const { currentUser } = useAppState();

  const isActive = (item: NavItem) => {
    const base = item.match ?? item.href;
    return pathname === base || pathname.startsWith(base + "/");
  };

  return (
    <nav className={styles.sidenav} aria-label="Primary">
      {/* Brand → home (Weekly) */}
      <Link
        href="/weekly"
        className={styles.brand}
        aria-label="mycurricula.app home"
      >
        <span className={styles.glyph} aria-hidden="true">
          <BookGlyph />
        </span>
        <span>
          <span className={styles.brandText}>
            mycurricula<span className={styles.tld}>.app</span>
          </span>
          {currentUser.curriculumLabel && (
            <span className={styles.brandSub}>
              {currentUser.curriculumLabel}
            </span>
          )}
        </span>
      </Link>

      {/* W-E: workspace + notebook switcher (below the brand block).
          Recedes to a quiet label when there is only one active notebook;
          becomes an interactive dropdown when ≥2 notebooks exist.
          Hides at ≤900px (icon-only SideNav) — no room in the 64px rail. */}
      <NotebookSwitcher />

      {SECTIONS.map((section) => (
        <div key={section.label ?? "main"}>
          {section.label && (
            <div className={styles.navsec}>{section.label}</div>
          )}
          {section.items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
                aria-current={active ? "page" : undefined}
                title={item.label}
              >
                {item.icon}
                <span className={styles.label}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <span className={styles.spacer} />

      {/* Settings */}
      <Link
        href="/settings"
        className={`${styles.item} ${
          pathname.startsWith("/settings") ? styles.itemActive : ""
        }`}
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        title="Settings"
      >
        <GearIcon />
        <span className={styles.label}>Settings</span>
      </Link>

      {/* User → settings */}
      <div className={styles.userdiv} aria-hidden="true" />
      <Link
        href="/settings"
        className={styles.user}
        aria-label={`Settings (${currentUser.name})`}
        title={`Settings (${currentUser.name})`}
      >
        <span className={styles.avatar}>
          {currentUser.avatarUrl ? (
            <Image
              src={currentUser.avatarUrl}
              alt=""
              width={34}
              height={34}
              className={styles.avatarImg}
            />
          ) : (
            currentUser.initials
          )}
        </span>
        <span className={styles.userMeta}>
          <span className={styles.userName}>{currentUser.name}</span>
          <span className={styles.userRole}>
            {currentUser.curriculumLabel ?? "Teacher"}
          </span>
        </span>
      </Link>
    </nav>
  );
}

// ── Icons (Lucide-family line icons, 24×24) ───────────────────────────────
function svgProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}
function GridIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v16" />
    </svg>
  );
}
function CalendarIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}
function LayersIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <path d="M12 3 4 7l8 4 8-4-8-4Z" />
      <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
    </svg>
  );
}
function BookIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  );
}
function FlagIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <path d="M4 21V4h11l-1.5 4L15 12H4" />
    </svg>
  );
}
function ClockIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
function PresentIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 16v4M8 20h8" />
    </svg>
  );
}
function GearIcon(): ReactNode {
  return (
    <svg {...svgProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  );
}
// Open-book brand glyph, white on the honey tile.
function BookGlyph(): ReactNode {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5V5.5Z"
        fill="#fff"
      />
      <path
        d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13V4Z"
        fill="#3A2A05"
        opacity=".5"
      />
    </svg>
  );
}
