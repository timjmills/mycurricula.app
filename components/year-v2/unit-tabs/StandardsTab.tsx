"use client";

// StandardsTab.tsx — the Unit Explorer's Standards tab body.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0). A plain list of the codes
// tagged across the unit's lessons, each with how many lessons tag it. The
// aggregate does NOT distinguish covered vs gap — no invented coverage.

import { type ReactNode } from "react";
import { StandardPill } from "@/components/ui";
import { unitStandards } from "@/lib/year-unit-aggregate";
import styles from "../UnitExplorer.module.css";

export function StandardsTab({
  standards,
}: {
  standards: ReturnType<typeof unitStandards>;
}): ReactNode {
  if (standards.length === 0) {
    return (
      <div className={styles.empty}>
        No standards tagged on this unit&apos;s lessons yet.
      </div>
    );
  }
  // The aggregate does NOT distinguish covered vs gap, so this is a plain list
  // — no invented coverage. StandardPill surfaces each code's full description
  // on hover / long-press (the canonical standards presentation; descriptions
  // are never printed inline per the StandardPill contract).
  return (
    <ul className={styles.aggList}>
      {standards.map((ref) => (
        <li key={ref.code} className={styles.aggRow}>
          <StandardPill code={ref.code} />
          <span className={styles.aggMeta}>
            in {ref.lessonCount} {ref.lessonCount === 1 ? "lesson" : "lessons"}
          </span>
        </li>
      ))}
    </ul>
  );
}
