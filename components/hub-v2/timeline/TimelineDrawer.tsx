"use client";

// TimelineDrawer.tsx — the planning drawer under the timeline
// (`ph-drawer.jsx`, mounted at `ph-units.jsx:643-645`): Unit Library · Lesson
// Library · Needs Attention.
//
// ── COLLAPSED BY DEFAULT, AND THAT IS THE POINT ───────────────────────────
// The drawer is a place to go looking, not a permanent second half of the
// page. Open by default it would push the timeline — the surface the tab
// exists for — above the fold on every laptop.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
// The handoff's Lesson Library also carries "+New" and DRAG-TO-TIMELINE
// (README §6). Both are out of this wave for the same reason, and it is a data
// reason rather than a time one: placing a lesson on the timeline by dragging
// it needs a DAY, and day-granularity scheduling is exactly what migration
// 20260728120000 deferred (`:36-42`) — a drop would have to invent a date, and
// a create would have to invent a date and a unit. The rows here OPEN what they
// name, which is the part that can be done truthfully today.
//
// The Needs Attention body is likewise narrower than the handoff's: it cannot
// list "dateless drafts", because that shape is not storable (see the header of
// lib/plan-timeline/library.ts). It lists off-calendar lessons instead, which
// is the real adjacent problem.

import { useState, type ReactNode } from "react";
import { ToggleGroup } from "@/components/ui";
// THE shared week-range formatter (lib/planner/source.ts:unitWeeksLabel, which
// both data sources derive `Unit.weeks` through). Spelling the label inline
// here is how this row came to render "Wk 12–12" for a one-week unit whose own
// card said "Wk 12" — an inline literal has no `start === end` branch.
import { weeksLabel } from "@/lib/plan-timeline";
import type {
  AttentionItem,
  LibraryUnit,
} from "@/lib/plan-timeline/library";
import type { SubjectId } from "@/lib/types";
import styles from "./timeline.module.css";

type DrawerTab = "units" | "attention";

/**
 * A LITERAL id, not `useId()`.
 *
 * `useId` was the obvious choice and it was wrong here — the live probe caught
 * it hydrating with two different ids (`aria-controls="_R_3isl…"` server,
 * `_R_ebin…"` client) on roughly one load in three. `useId` derives from the
 * component's POSITION in the tree, so it is only stable when the server and
 * client trees match above it; inside the hub's shell they intermittently do
 * not, and React cannot patch an attribute mismatch — the button was left
 * pointing at an element that did not exist.
 *
 * A literal is safe because PlanTimeline renders exactly one drawer per page.
 * If that ever stops being true, this needs a caller-supplied id, NOT `useId`.
 */
const DRAWER_BODY_ID = "plan-timeline-library";

export interface TimelineDrawerProps {
  units: readonly LibraryUnit[];
  attention: readonly AttentionItem[];
  subjectClass: (subject: SubjectId) => string;
  subjectName: (subject: SubjectId) => string;
  onOpenLesson: (lessonId: string) => void;
  onOpenUnit: (unitId: string, subject: SubjectId) => void;
}

export function TimelineDrawer({
  units,
  attention,
  subjectClass,
  subjectName,
  onOpenLesson,
  onOpenUnit,
}: TimelineDrawerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("units");

  return (
    <section
      className={styles.drawer}
      // The panel-level explanation CLAUDE.md §4 requires for a named panel,
      // reachable by hover on desktop and long-press on touch.
      title="Browse every unit, and everything in the plan that needs a second look."
    >
      <div className={styles.drawerBar}>
        <button
          type="button"
          className={styles.drawerToggle}
          aria-expanded={open}
          // Only while the body EXISTS. `aria-controls` pointing at an id that
          // is not in the document is a dangling reference — `aria-expanded`
          // already carries the collapsed state on its own.
          aria-controls={open ? DRAWER_BODY_ID : undefined}
          title={
            open
              ? "Hide the library and close the panel."
              : "Show every unit and everything that needs attention."
          }
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> Library
        </button>
        {/* The count rides on the COLLAPSED bar as well as inside, because a
            teacher who never opens the drawer should still learn that there is
            something in it. Zero renders nothing — a permanent "0" trains the
            eye to stop reading it. */}
        {attention.length > 0 && (
          <button
            type="button"
            className={styles.drawerCount}
            title={
              attention.length === 1
                ? "1 thing in your plan needs a second look. Opens the list."
                : `${attention.length} things in your plan need a second look. Opens the list.`
            }
            onClick={() => {
              setTab("attention");
              setOpen(true);
            }}
          >
            {/* Composed as ONE string rather than three JSX children.
                Interleaved expressions render as separate text nodes with
                comment markers between them in static markup, so the label a
                teacher reads as one phrase is not one phrase to anything
                reading the DOM — including a test asserting it is there. */}
            {`${attention.length} need${attention.length === 1 ? "s" : ""} attention`}
          </button>
        )}
      </div>

      {open && (
        <div className={styles.drawerBody} id={DRAWER_BODY_ID}>
          <ToggleGroup
            ariaLabel="Library section"
            value={tab}
            onChange={(v) => setTab(v as DrawerTab)}
            options={[
              {
                value: "units",
                label: "Units",
                title: "Every unit in the plan, with how much of it is planned.",
              },
              {
                value: "attention",
                label: `Needs attention${attention.length > 0 ? ` (${attention.length})` : ""}`,
                title:
                  "Lessons and units that are missed, thin, unscheduled, or dated somewhere the calendar cannot show.",
              },
            ]}
          />

          {tab === "units" ? (
            units.length === 0 ? (
              <p className={styles.drawerEmpty}>No units in this plan yet.</p>
            ) : (
              <ul className={styles.drawerList}>
                {units.map((u) => (
                  <li key={`${u.subject}\n${u.unitId}`}>
                    <button
                      type="button"
                      className={`cp-subj ${subjectClass(u.subject)} ${styles.row}`}
                      title={`${u.name} — ${u.subjectName}, ${u.total} lesson${u.total === 1 ? "" : "s"}, ${u.ready} fully planned. Opens its unit planner.`}
                      onClick={() => onOpenUnit(u.unitId, u.subject)}
                    >
                      <span className={styles.rowStripe} aria-hidden="true" />
                      <span className={styles.rowTitle}>{u.name}</span>
                      <span className={styles.rowMeta}>{u.subjectName}</span>
                      <span className={styles.rowMeta}>
                        {/* A bare "Wk 999–1000" reads as a working schedule.
                            When the range has no place in the configured year
                            the row says so — the same fact the lane label
                            already reports as "N unscheduled". */}
                        {!u.weekRange
                          ? "No weeks set"
                          : u.offAxis
                            ? `${weeksLabel(u.weekRange.start, u.weekRange.end)} · outside this year`
                            : weeksLabel(u.weekRange.start, u.weekRange.end)}
                      </span>
                      <span className={styles.rowMeta}>
                        {u.ready}/{u.total} planned
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : attention.length === 0 ? (
            // A specific, checkable claim rather than a decorative "All good!".
            <p className={styles.drawerEmpty}>
              Nothing needs a second look — every lesson has an objective, a
              resource and a standard, and every unit has its weeks.
            </p>
          ) : (
            <ul className={styles.drawerList}>
              {attention.map((item, i) => (
                <li key={`${item.kind}-${item.target.id}-${i}`}>
                  <button
                    type="button"
                    className={`cp-subj ${subjectClass(item.subject)} ${styles.row}`}
                    title={`${item.title} — ${item.detail} Opens the ${item.target.kind}.`}
                    onClick={() =>
                      item.target.kind === "lesson"
                        ? onOpenLesson(item.target.id)
                        : onOpenUnit(item.target.id, item.subject)
                    }
                  >
                    <span className={styles.rowStripe} aria-hidden="true" />
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={styles.rowMeta}>
                      {subjectName(item.subject)}
                    </span>
                    <span className={styles.rowDetail}>{item.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
