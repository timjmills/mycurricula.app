"use client";

// MonthPicker — header action that lets the teacher jump the timeline to a
// chosen calendar month.
//
// Built on native <details>/<summary> to avoid pulling a new dependency.
// The summary doubles as the trigger; clicking it toggles `open`. A
// document-level pointerdown listener mounted while open closes the
// popover on outside click.
//
// The active month is determined by the parent (typically the month that
// contains the currently scrolled-to / "today" week). Selecting any
// other month calls `onPickMonth(monthIdx)`; the parent translates that
// to a scrollToWeek(startWeekIdx) call.

import { useEffect, useRef } from "react";
import { allYearMonths } from "@/lib/year-calendar";
import { Tooltip } from "@/components/ui";
import styles from "./MonthPicker.module.css";

// ── Icons ──────────────────────────────────────────────────────────────────

const IconChev = (p: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// ── Props ──────────────────────────────────────────────────────────────────

export interface MonthPickerProps {
  /** Index into allYearMonths() of the currently-active month. */
  activeMonthIdx: number;
  /** Called with a month index when the teacher picks a different month. */
  onPickMonth: (monthIdx: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function MonthPicker({ activeMonthIdx, onPickMonth }: MonthPickerProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const months = allYearMonths();
  const activeLabel = months[activeMonthIdx]?.label ?? months[0]?.label ?? "";

  // Outside-click handler — only mounted while the popover is open.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      const el = detailsRef.current;
      if (!el || !el.open) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      el.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const handlePick = (idx: number): void => {
    onPickMonth(idx);
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details ref={detailsRef} className={styles.root}>
      <Tooltip
        content="Jump the year roadmap to any month — click to pick a month and the timeline scrolls to its first week"
        side="bottom"
      >
        <summary
          className={styles.summary}
          aria-label={`Jump to month, currently ${activeLabel}`}
          title="Jump the year roadmap to any month — click to pick a month and the timeline scrolls to its first week"
        >
          <span className={styles.label}>{activeLabel}</span>
          <IconChev width={13} height={13} className={styles.chev} />
        </summary>
      </Tooltip>

      <div className={styles.popover} role="menu">
        <ul className={styles.list}>
          {months.map((m, i) => {
            const isActive = i === activeMonthIdx;
            return (
              <li key={`${m.label}-${i}`}>
                <Tooltip
                  content={`Scroll the roadmap to ${m.label}`}
                  side="right"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => handlePick(i)}
                    title={`Scroll the roadmap to ${m.label}`}
                  >
                    {m.label}
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
