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
  children: ReactNode;
}

/** White rounded panel with a consistent header — the A2 section frame.
 *  Delegates border / shadow / radius / background to <Card neutral>. */
export function SettingsCard({
  eyebrow,
  title,
  hint,
  action,
  children,
}: SettingsCardProps): ReactNode {
  const header = (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <span className={styles.eyebrow}>{eyebrow}</span>
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
