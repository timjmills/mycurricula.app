"use client";

// YearA — the /year GLASS frame (Wave 6, design authority: the 7.2.26 v2
// bundle "YearA", cites [B:893-903] / [B:6048]).
//
// One lane per visible subject, laid under a decorative month scale derived
// from the school's configured academic-year window. Each lane pairs a subject
// glyph + name + % complete with a track of unit chips; every chip is a real
// <button> whose progress fill is REAL taught/total from the live planner
// store, and whose click opens the shared Unit Explorer modal (hosted by
// YearShell). Tokens only; subject color via the `.cp-subj.<cls>` cascade
// (var(--c)/--cl/--cd); tone-aware chip tints mix toward --panel-bg so Night
// holds. The app's ViewTitle chrome ("The Year") stays — this renders a slim
// context sub-line only, never a rebuilt heading.

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Tooltip } from "@/components/ui";
import { SubjGlyph } from "@/components/planner-v2";
import { useAcademicYear } from "@/lib/use-academic-year";
import { useNotebookState } from "@/lib/notebook-state";
import { weeksInRange } from "@/lib/year-calendar";
import type { SubjectId } from "@/lib/types";
import type { YearSubjectLane } from "./YearShell";
import styles from "./YearA.module.css";

/** Short month labels for the scale header (calendar order, 0 = Jan). */
const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

export interface YearAProps {
  lanes: YearSubjectLane[];
  onOpenUnit: (subjectId: SubjectId, unit: string) => void;
}

export function YearA({ lanes, onOpenUnit }: YearAProps): ReactNode {
  const { start: yearStart, end: yearEnd } = useAcademicYear();
  const { activeNotebooks, activeNotebookId } = useNotebookState();

  // Active grade label from the notebook (never hard-code "Grade 5").
  const gradeLabel =
    activeNotebooks.find((nb) => nb.gradeLevelId === activeNotebookId)?.name ??
    activeNotebooks[0]?.name ??
    "";

  // Academic-year label, e.g. "2025–2026" (en-dash), collapsed to a single
  // year when start + end share it.
  const yearLabel = useMemo(() => {
    const a = Math.min(yearStart.getFullYear(), yearEnd.getFullYear());
    const b = Math.max(yearStart.getFullYear(), yearEnd.getFullYear());
    return a === b ? String(a) : `${a}–${b}`;
  }, [yearStart, yearEnd]);

  // Month scale — walk the academic weeks from the configured start and emit a
  // label whenever the calendar month changes. This yields academic order
  // (e.g. AUG → JUN) with the real month COUNT, both derived from config (no
  // hard-coded 11-month span). Decorative: it's the ambient timeline the lanes
  // sit under, not an interactive axis.
  const months = useMemo(() => {
    const lo = Math.min(yearStart.getTime(), yearEnd.getTime());
    const anchor = new Date(lo);
    const totalWeeks = weeksInRange(yearStart, yearEnd);
    const out: string[] = [];
    let prevMonth = -1;
    for (let w = 0; w < totalWeeks; w++) {
      const d = new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + w * 7,
      );
      const m = d.getMonth();
      if (m !== prevMonth) {
        out.push(MONTH_ABBR[m]);
        prevMonth = m;
      }
    }
    return out;
  }, [yearStart, yearEnd]);

  // ?subject= deep link — scroll the named subject's lane into view + briefly
  // highlight it, so the retired /subject/[slug] redirect stays meaningful on
  // the glass frame. Applied once, when the matching lane exists (lanes may
  // hydrate async under the Supabase flag); reduced motion is respected.
  const laneEls = useRef<Map<string, HTMLElement>>(new Map());
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("subject");
    if (!param) {
      deepLinkDone.current = true;
      return;
    }
    const el = laneEls.current.get(param);
    if (!el) return; // wait for the lane to render
    deepLinkDone.current = true;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    el.setAttribute("data-deeplink-focus", "");
    // Deliberately NOT cleared on cleanup: a re-render (or StrictMode's
    // mount→cleanup→mount) within the window would otherwise clear the timer
    // while the ref-guard blocks re-arming it, leaving the highlight stuck on.
    // Removing a stale attribute from a detached node is a harmless no-op.
    setTimeout(() => el.removeAttribute("data-deeplink-focus"), 2200);
  }, [lanes]);

  return (
    <div className={styles.root} data-year-frame="glass">
      <p className={styles.vsub}>
        {yearLabel}
        {gradeLabel ? ` · ${gradeLabel}` : ""}
      </p>

      {/* Internal horizontal scroll keeps the document scroll-free at every
          tier (the wrapper holds a min-width on desktop/tablet); at phone the
          lanes stack (label over track) so no internal scroll is needed. */}
      <div className={styles.scroll}>
        <div className={styles.wrap}>
          {/* Month scale row — grid [label gutter | months]. */}
          <div className={styles.scale}>
            <div className={styles.scaleGutter} aria-hidden="true" />
            <div
              className={styles.months}
              style={
                { "--month-count": months.length } as CSSProperties
              }
              aria-hidden="true"
            >
              {months.map((m, i) => (
                <span key={`${m}-${i}`}>{m}</span>
              ))}
            </div>
          </div>

          {/* One lane per subject. */}
          {lanes.map((lane) => (
            <div
              key={lane.subject.id}
              ref={(el) => {
                if (el) laneEls.current.set(lane.subject.id, el);
                else laneEls.current.delete(lane.subject.id);
              }}
              className={`${styles.lane} cp-subj ${lane.subject.cls}`}
              data-year-lane={lane.subject.id}
            >
              <div className={styles.laneHead}>
                <SubjGlyph subject={lane.subject} size={30} radius={9} />
                <div className={styles.laneMeta}>
                  <span className={styles.laneName}>{lane.subject.name}</span>
                  <span className={styles.lanePct}>{lane.pct}% complete</span>
                </div>
              </div>

              <div className={styles.track}>
                {lane.units.length === 0 ? (
                  <span className={styles.empty}>
                    {lane.hadUnits
                      ? "No units match the current view."
                      : "No units planned yet."}
                  </span>
                ) : (
                  lane.units.map((u) => {
                    const progress = u.total > 0 ? u.done / u.total : 0;
                    const pct = Math.round(progress * 100);
                    return (
                      <Tooltip
                        key={u.id}
                        content={`Open ${u.fullName} — ${pct}% taught · ${u.done}/${u.total} lessons`}
                        tooltipId="year-a-unit-chip"
                        side="top"
                      >
                        <button
                          type="button"
                          className={styles.chip}
                          data-year-chip
                          onClick={() => onOpenUnit(lane.subject.id, u.id)}
                          title={u.fullName}
                        >
                          <span
                            className={styles.chipFill}
                            style={{ width: `${pct}%` }}
                            aria-hidden="true"
                          />
                          <span className={styles.chipLabel}>{u.label}</span>
                        </button>
                      </Tooltip>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
