"use client";

// overview-card.tsx — one tile on the /settings overview dashboard.
//
// A whole-card <Link> to a settings section: section name + scope chip
// on top, a live one-line summary of the section's current values below
// ("Sun–Thu · 3 holidays"), chevron pinned right. The summary is the
// dashboard's whole point — a teacher can audit their setup at a glance
// without clicking into every section.

import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./overview-card.module.css";

interface OverviewCardProps {
  href: string;
  label: string;
  scope: "personal" | "team";
  /** Live one-line summary of the section's current values. */
  summary: ReactNode;
}

export function OverviewCard({
  href,
  label,
  scope,
  summary,
}: OverviewCardProps): ReactNode {
  return (
    <Link
      href={href}
      className={styles.card}
      title={
        scope === "team"
          ? `${label} — changes affect every teacher on your team`
          : `${label} — changes only affect your view`
      }
    >
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span
          className={[
            styles.scopeChip,
            scope === "team" ? styles.scopeChipTeam : styles.scopeChipPersonal,
          ].join(" ")}
          aria-label={
            scope === "team" ? "Team Curriculum scope" : "Personal scope"
          }
        >
          {scope === "team" ? "Team" : "Personal"}
        </span>
      </div>
      <span className={styles.summary}>{summary}</span>
      <svg
        className={styles.chevron}
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 2L8.5 6L4 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
