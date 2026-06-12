"use client";

// settings-card.tsx — small shared primitives for the Appearance panel.
//
//   • SettingsCard — composes <Card neutral> with the eyebrow/title/hint
//     header pattern (module CSS). Every section in artboard A2 uses this.
//   • RadioDot     — the filled-circle radio indicator shared by the
//     style picker and palette toggle.

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  /** Instant-apply feedback: bump this counter after each successful
   *  persist and the header flashes a small "Saved" chip for ~1.4s.
   *  Settings have no Save buttons (changes apply immediately), so this
   *  chip is the only confirmation a change landed. */
  savedTick?: number;
  /** Stable deep-link id for the settings search (lib/settings-search-
   *  index.ts). When set, the card is wrapped in a <section id=…> the
   *  search results can scroll to and highlight. */
  anchorId?: string;
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
  savedTick,
  anchorId,
  children,
}: SettingsCardProps): ReactNode {
  // "Saved" pulse — visible while the timeout below is pending. The chip
  // appears whenever savedTick increments past its previous value (the
  // initial render never pulses, so cards mounting with savedTick=0 stay
  // quiet). Reduced-motion users get the same chip without the fade —
  // the module CSS guards the transition.
  const [showSaved, setShowSaved] = useState(false);
  const lastTickRef = useRef(savedTick ?? 0);
  useEffect(() => {
    const tick = savedTick ?? 0;
    if (tick <= lastTickRef.current) return;
    lastTickRef.current = tick;
    setShowSaved(true);
    const timer = window.setTimeout(() => setShowSaved(false), 1400);
    return () => window.clearTimeout(timer);
  }, [savedTick]);

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
      {(action || showSaved) && (
        <div className={styles.action}>
          <span
            className={[styles.saved, showSaved ? styles.savedVisible : ""]
              .filter(Boolean)
              .join(" ")}
            role="status"
            aria-live="polite"
          >
            {showSaved ? "Saved" : ""}
          </span>
          {action}
        </div>
      )}
    </div>
  );

  const card = <Card header={header}>{children}</Card>;

  // Anchor wrapper — gives the settings search a scroll target. The
  // [data-settings-anchor] hook lets the search highlight the section it
  // just navigated to without per-page CSS.
  if (anchorId) {
    return (
      <section id={anchorId} data-settings-anchor className={styles.anchor}>
        {card}
      </section>
    );
  }
  return card;
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
