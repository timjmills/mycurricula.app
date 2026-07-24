"use client";

// UnitContextDrawer.tsx — the chrome inside ExplorerShell's right `drawer` slot
// (B3). It owns a pane switcher and a close control; the panes themselves
// (Assessments · Insights · Prep) are passed in, so this file knows nothing
// about assessments or metrics and never has to change when a pane does.
//
// WHY A DRAWER AND NOT TWO MORE TABS: the shell's tab strip lists the unit's
// PARTS — Unit Plan, Lessons, Standards, Resources, Notes. Assessments and
// Insights are commentary ABOUT the unit, read alongside whichever part you are
// editing rather than instead of it. Folding them into the strip would have made
// seven tabs, and would have forced a teacher to leave the lesson list to answer
// "have I actually assessed this?". Side-by-side is the whole point.
//
// MOUNTING: only the active pane's content renders — same single-tabpanel model
// the shell uses, so an idle pane costs nothing. The DRAWER, however, stays
// mounted while closed (ExplorerShell reveals it with a class), which is what
// lets a half-scrolled pane survive a close/reopen.

import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import styles from "./UnitContextDrawer.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UnitContextDrawerPane<K extends string = string> {
  key: K;
  label: string;
  /** Rendered only while this pane is the active one. */
  content: ReactNode;
}

export interface UnitContextDrawerProps<K extends string = string> {
  panes: ReadonlyArray<UnitContextDrawerPane<K>>;
  activePane: K;
  onPaneChange: (key: K) => void;
  /** Collapses the drawer. The shell keeps the subtree mounted. */
  onClose: () => void;
  /** aria-label for the close control ("Hide unit context"). */
  closeLabel: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function UnitContextDrawer<K extends string = string>({
  panes,
  activePane,
  onPaneChange,
  onClose,
  closeLabel,
}: UnitContextDrawerProps<K>): ReactNode {
  const stripRef = useRef<HTMLDivElement>(null);

  // Arrow-key roving, mirroring ExplorerShell's tablist so both strips in the
  // same dialog behave identically under the keyboard.
  const onPaneKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (panes.length === 0) return;
      const idx = panes.findIndex((p) => p.key === activePane);
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = idx + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = panes.length - 1;
      else return;
      e.preventDefault();
      const wrapped = (next + panes.length) % panes.length;
      onPaneChange(panes[wrapped].key);
      stripRef.current
        ?.querySelector<HTMLElement>(`[data-ue-pane="${panes[wrapped].key}"]`)
        ?.focus();
    },
    [panes, activePane, onPaneChange],
  );

  const active = panes.find((p) => p.key === activePane) ?? panes[0];

  return (
    <>
      <div className={styles.head}>
        <div
          ref={stripRef}
          className={styles.panes}
          role="tablist"
          aria-label="Unit context"
          aria-orientation="horizontal"
          onKeyDown={onPaneKeyDown}
        >
          {panes.map(({ key, label }) => {
            const on = key === active?.key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                data-ue-pane={key}
                id={`ue-pane-${key}`}
                aria-selected={on}
                aria-controls="ue-drawer-panel"
                tabIndex={on ? 0 : -1}
                className={`${styles.pane} ${on ? styles.paneOn : ""}`}
                onClick={() => onPaneChange(key)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        className={styles.paneBody}
        role="tabpanel"
        id="ue-drawer-panel"
        aria-labelledby={active ? `ue-pane-${active.key}` : undefined}
      >
        {active?.content}
      </div>
    </>
  );
}
