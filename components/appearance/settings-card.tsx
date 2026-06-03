"use client";

// settings-card.tsx — small shared primitives for the Appearance panel.
//
//   • SettingsCard — composes <Card neutral> with the eyebrow/title/hint
//     header pattern (module CSS). Every section in artboard A2 uses this.
//   • RadioDot     — the filled-circle radio indicator shared by the
//     style picker and palette toggle.

import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import styles from "./settings-card.module.css";

interface SettingsCardProps {
  /** Small uppercase label above the title. */
  eyebrow: string;
  /** Section title. Accepts a ReactNode so the title can be wrapped in a
   *  styled <Tooltip> for the per-panel onboarding-voice tooltip (CLAUDE.md
   *  §4 — every panel has a tooltip about its function). */
  title?: ReactNode;
  /** Supporting one-liner under the title. */
  hint?: string;
  /** Optional element pinned to the top-right of the header. */
  action?: ReactNode;
  /** W2-B7 scope chip — paints "Team" (changes shared with every teacher
   *  on the team) or "Personal" (this teacher only) next to the eyebrow.
   *  Vocabulary follows Unified Audit Decision #2. */
  scope?: "personal" | "team";
  children: ReactNode;
}

/** White rounded panel with a consistent header — the A2 section frame.
 *  Delegates border / shadow / radius / background to <Card neutral>. */
export function SettingsCard({
  eyebrow,
  title,
  hint,
  action,
  scope,
  children,
}: SettingsCardProps): ReactNode {
  const header = (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          {scope && (
            <span
              className={[
                styles.scopeChip,
                scope === "team"
                  ? styles.scopeChipTeam
                  : styles.scopeChipPersonal,
              ].join(" ")}
              title={
                scope === "team"
                  ? "Team Curriculum — changes affect every teacher on your team"
                  : "Personal — changes only affect your view"
              }
              aria-label={
                scope === "team" ? "Team Curriculum scope" : "Personal scope"
              }
            >
              {scope === "team" ? "Team" : "Personal"}
            </span>
          )}
        </div>
        {title && <h2 className={styles.title}>{title}</h2>}
        {hint && <p className={styles.hint}>{hint}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );

  return <Card header={header}>{children}</Card>;
}

/** Filled-circle radio indicator. */
export function RadioDot({ selected }: { selected: boolean }): ReactNode {
  return (
    <span
      aria-hidden
      className={[styles.radioDot, selected ? styles.radioDotSelected : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {selected && <span className={styles.radioDotInner} />}
    </span>
  );
}
