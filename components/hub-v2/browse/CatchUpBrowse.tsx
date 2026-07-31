"use client";

// CatchUpBrowse.tsx — the Planner Hub's catch-up triage picker (Wave 8).
//
// Reuses the app's real catch-up derivation (lib/catchup-data) — lessons up to
// the current week whose effective status isn't "done" — grouped by subject.
// A row opens the lesson as a LessonDoc so the teacher can re-plan it. No
// fabricated pace metric; no dead bulk button.

import { useMemo, type ReactNode } from "react";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { deriveCatchupItems, coverageSummary } from "@/lib/catchup-data";
import type { CatchupItem } from "@/lib/catchup-data";
import { useOrderedWeekdays } from "@/lib/week-order";
import { stripHtml } from "@/lib/html-text";
import { PlannerEmpty } from "@/components/ui";
import type { LessonStatus, SubjectId } from "@/lib/types";
import type { HubBrowseProps } from "./browse-data";
import { queryMatches } from "./browse-data";
import styles from "./browse.module.css";

export function CatchUpBrowse({ query, onOpenDoc }: HubBrowseProps): ReactNode {
  const { lessons, subjects, subjectById, units } = usePlanner();
  const dataState = usePlannerDataState();
  const { week } = useAppState();
  // The configured school week + the grade's unit catalog — deriveCatchupItems
  // needs both to label a row's day and unit (see lib/catchup-data).
  // A lesson's `day` is a POSITION in this ordered week (0 = the school's first
  // instructional day), NOT a JS weekday — so it indexes `schoolWeek`, never a
  // Sun-first array.
  const schoolWeek = useOrderedWeekdays();

  const summary = useMemo(
    () => coverageSummary(lessons, { currentWeek: week }),
    [lessons, week],
  );

  const groups = useMemo(() => {
    const items = deriveCatchupItems(lessons, {
      currentWeek: week,
      schoolWeek,
      units,
    }).filter((it) =>
      queryMatches(query, it.title, it.unit, subjectById[it.subject]?.name),
    );
    return subjects
      .map((subject) => ({
        subject,
        items: items.filter((it) => it.subject === subject.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [lessons, week, subjects, subjectById, units, schoolWeek, query]);

  return (
    <>
      <div className={styles.head}>
        <div className={styles.crumb}>Planner</div>
        <h1 className={styles.title}>Catch-up</h1>
        <p className={styles.sub}>
          {dataState === "pending"
            ? "Checking your plan…"
            : dataState === "error"
              ? "Couldn’t load your plan."
              : summary.uncovered === 0
                ? "You're all caught up — every lesson through this week is covered."
                : `${summary.uncovered} of ${summary.total} lessons through week ${week} still need attention (${summary.pct}% covered).`}
        </p>
      </div>

      {groups.length === 0 ? (
        // A query-specific denial is only TRUE once the store can back it.
        // `groups` derives from usePlanner().lessons, empty for the whole
        // 11–16s Supabase hydrate — so this told a teacher who searched on
        // arrival that nothing matched, about a lesson that exists. The subhead
        // above already branched on `dataState`; the gate was in scope here and
        // simply not applied. Not settled → defer to <PlannerEmpty>, which owns
        // the pending skeleton and the failed-hydrate copy (both right with or
        // without a query). A SETTLED store still answers the query.
        dataState === "settled" && query.trim() ? (
          <p className={styles.empty}>
            {`Nothing to catch up matches “${query.trim()}”.`}
          </p>
        ) : (
          <PlannerEmpty
            size="sm"
            heading="Nothing to catch up — nicely done."
          />
        )
      ) : (
        groups.map(({ subject, items }) => (
          <div key={subject.id} className={styles.group}>
            <div className={styles.groupHead}>
              {subject.name}
              <span className={styles.groupCount}>{items.length}</span>
            </div>
            <div className={styles.list}>
              {items.map((item) => (
                <CatchupRow
                  key={item.lessonId}
                  item={item}
                  onOpen={() =>
                    onOpenDoc({
                      kind: "lesson",
                      id: item.lessonId,
                      title: stripHtml(item.title),
                      sid: item.subject,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function CatchupRow({
  item,
  onOpen,
}: {
  item: CatchupItem;
  onOpen: () => void;
}): ReactNode {
  const { subjectById } = usePlanner();
  const subj = subjectById[item.subject as SubjectId];
  return (
    <button
      type="button"
      className={`cp-subj ${subj?.cls ?? ""} ${styles.row} ${item.modified ? styles.rowStripeModified : ""}`}
      onClick={onOpen}
    >
      <span className={styles.rowTime}>{item.dayLabel}</span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{stripHtml(item.title)}</span>
        <span className={styles.rowSub}>
          <span className={styles.rowSubject}>{subj?.name}</span>
          {item.unit ? ` · ${item.unit}` : ""}
        </span>
      </span>
      <span className={styles.ckStatus}>{STATUS_WORD[item.status]}</span>
    </button>
  );
}

/** Human label for a catch-up item's status (all are non-"done"). */
const STATUS_WORD: Record<Exclude<LessonStatus, "done">, string> = {
  not_done: "Not taught",
  carried: "Carried",
  skipped: "Skipped",
  partial: "Partial",
};
