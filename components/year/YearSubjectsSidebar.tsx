"use client";

// YearSubjectsSidebar — the left rail of the merged Yearly view.
//
// Lists "All subjects" (returns to the all-subjects timeline) + every subject.
// The focused subject expands to show its units; clicking a unit drills the
// scope to that unit. Active state follows the YearScope. Each subject row wears
// `.cp-subj <cls>` so its color dot + active tint pick up the palette tokens.
// Tokens only — no hex.

import type { ReactNode } from "react";
import type { SubjectId } from "@/lib/types";
import type { YearScope } from "./year-scope";
import { scopeSubjectId } from "./year-scope";
import styles from "./year-subjects-sidebar.module.css";

export interface YearSidebarUnit {
  id: string;
  /** Display label (already prefix-stripped by the caller). */
  label: string;
  /** All of the unit's lessons are done → show a check. */
  done: boolean;
}

export interface YearSidebarSubject {
  id: SubjectId;
  name: string;
  /** Palette-bridge class (`.cp-subj <cls>`). */
  cls: string;
  /** Subject glyph (same node used by the timeline rows). */
  icon: ReactNode;
  units: YearSidebarUnit[];
}

export interface YearSubjectsSidebarProps {
  subjects: YearSidebarSubject[];
  scope: YearScope;
  onPickAll: () => void;
  onPickSubject: (id: SubjectId) => void;
  onPickUnit: (subjectId: SubjectId, unitId: string) => void;
  /**
   * Slide-over open state on narrow viewports (≤1100px). On desktop the rail is
   * always inline and this is ignored. Defaults to false.
   */
  open?: boolean;
  /** Close the slide-over (narrow viewports) — the × and after a pick. */
  onClose?: () => void;
}

function IconGrid(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconCheck(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconX(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function YearSubjectsSidebar({
  subjects,
  scope,
  onPickAll,
  onPickSubject,
  onPickUnit,
  open = false,
  onClose,
}: YearSubjectsSidebarProps): ReactNode {
  const activeSubject = scopeSubjectId(scope);
  const activeUnit =
    scope.level === "unit" || scope.level === "week" ? scope.unitId : null;

  return (
    <nav
      className={`${styles.nav} ${open ? styles.navOpen : ""}`}
      aria-label="Subjects"
    >
      <div className={styles.head}>
        <span className={styles.headLabel}>Subjects</span>
        <span className={styles.count}>{subjects.length}</span>
        {/* Close — only visible in the narrow-viewport slide-over. */}
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close subjects panel"
        >
          <IconX />
        </button>
      </div>

      <button
        type="button"
        className={`${styles.allRow} ${scope.level === "all" ? styles.allOn : ""}`}
        onClick={onPickAll}
        aria-current={scope.level === "all"}
      >
        <span className={styles.allIcon} aria-hidden="true">
          <IconGrid />
        </span>
        <span className={styles.allName}>All subjects</span>
      </button>

      <ul className={styles.list}>
        {subjects.map((s) => {
          const focused = activeSubject === s.id;
          return (
            <li key={s.id} className={`cp-subj ${s.cls}`}>
              <button
                type="button"
                className={`${styles.subj} ${focused ? styles.subjOn : ""}`}
                onClick={() => onPickSubject(s.id)}
                aria-current={focused}
                aria-expanded={focused}
              >
                <span className={styles.si} aria-hidden="true">
                  {s.icon}
                </span>
                <span className={styles.smeta}>
                  <span className={styles.sn}>{s.name}</span>
                  <span className={styles.sg}>Grade 5</span>
                </span>
                <span className={styles.dot} aria-hidden="true" />
              </button>

              {focused && s.units.length > 0 ? (
                <ul className={styles.units}>
                  {s.units.map((u) => {
                    const on = activeUnit === u.id;
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          className={`${styles.uitem} ${on ? styles.uitemOn : ""}`}
                          onClick={() => onPickUnit(s.id, u.id)}
                          aria-current={on}
                        >
                          <span
                            className={`${styles.ucheck} ${u.done ? styles.ucheckOn : ""}`}
                            aria-hidden="true"
                          >
                            {u.done ? <IconCheck /> : null}
                          </span>
                          <span className={styles.ulabel}>{u.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
