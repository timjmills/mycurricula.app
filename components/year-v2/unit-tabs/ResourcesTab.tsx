"use client";

// ResourcesTab.tsx — the Unit Explorer's Resources tab body.
//
// Extracted verbatim from UnitExplorer.tsx (B1.0). Lists every resource attached
// to the unit's lessons, with a safe-href guard on external links and per-row
// provenance (which day it came from).

import { type ReactNode } from "react";
import { unitResources } from "@/lib/year-unit-aggregate";
import { safeHref, dayShort } from "./helpers";
import styles from "../UnitExplorer.module.css";

export function ResourcesTab({
  resources,
}: {
  resources: ReturnType<typeof unitResources>;
}): ReactNode {
  if (resources.length === 0) {
    return (
      <div className={styles.empty}>
        No resources attached to this unit&apos;s lessons yet.
      </div>
    );
  }
  return (
    <ul className={styles.aggList}>
      {resources.map((ref, i) => {
        const isNote = ref.resource.type === "notecard";
        const href = isNote ? undefined : safeHref(ref.resource.url);
        // Resources are NOT de-duplicated across lessons (a recurring anchor
        // chart legitimately repeats), so a composite key keeps each row stable.
        return (
          <li key={`${ref.lessonId}-${i}`} className={styles.aggRow}>
            <span className={styles.aggGlyph} aria-hidden="true">
              {isNote ? "✎" : "🔗"}
            </span>
            <span className={styles.aggBody}>
              <span className={styles.aggLabel}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.aggLink}
                  >
                    {ref.resource.label}
                  </a>
                ) : (
                  ref.resource.label
                )}
              </span>
              <span className={styles.aggMeta}>
                Wk {ref.week} · {dayShort(ref.day)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
