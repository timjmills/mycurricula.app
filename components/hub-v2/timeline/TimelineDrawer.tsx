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
// (README §6). Both are out of scope for the same reason, and it is a data
// reason rather than a time one: placing a lesson on the timeline by dragging
// it needs a DAY, and day-granularity scheduling is exactly what migration
// 20260728120000 deferred (`:36-42`) — a drop would have to invent a date, and
// a create would have to invent a date and a unit. The rows here OPEN what they
// name, which is the part that can be done truthfully today.
//
// The Needs Attention body is likewise narrower than the handoff's in one
// place: it cannot list "dateless drafts", because that shape is not storable
// (see the header of lib/plan-timeline/library.ts). It lists off-calendar
// lessons instead, which is the real adjacent problem.
//
// ── THE RESIZE GRIP, AND THE ONE PLACE IT REFUSES THE 44px CONTRACT ───────
// The grip is the handoff's (`ph-v2.css:963`, `ph-drawer.jsx:76-79,116`):
// absolute at `top:-7px`, 14px tall, `row-resize`, inverted delta so dragging
// UP makes the drawer taller, double-click to collapse. On a coarse pointer it
// grows to the handoff's 22px — NOT to 44px, and that is a considered refusal
// rather than an oversight.
//
// A 44px full-width strip at this position would have to eat 22px of the
// canvas above it and 22px of the drawer bar below it, and both of those are
// made of the surface's OWN 44px targets: the lesson dots on the bottom lane,
// and the three tab buttons. Inflating this one control to the contract would
// take two rows of controls that already meet it out of reach — a net loss for
// exactly the teacher the contract is written for. What the gesture gets
// instead is a full non-pointer path: the grip is a real focusable button, and
// ↑/↓ resize it while Enter/Space collapses it, so nothing here is reachable
// only by a precise drag.

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ToggleGroup } from "@/components/ui";
// THE shared week-range formatter (lib/planner/source.ts:unitWeeksLabel, which
// both data sources derive `Unit.weeks` through). Spelling the label inline
// here is how this row came to render "Wk 12–12" for a one-week unit whose own
// card said "Wk 12" — an inline literal has no `start === end` branch.
import { DOT_STATE_LABEL, weeksLabel } from "@/lib/plan-timeline";
import {
  ATTENTION_ACTION_HINT,
  ATTENTION_ACTION_LABEL,
  LIBRARY_STATUS_LABEL,
  filterLessons,
  groupAttention,
  groupLessons,
  sortLessons,
  type AttentionItem,
  type LibraryLesson,
  type LibraryStatusFilter,
  type LibraryUnit,
} from "@/lib/plan-timeline/library";
import type { SubjectId } from "@/lib/types";
import styles from "./timeline.module.css";

type DrawerTab = "units" | "lessons" | "attention";

/** The handoff's default drawer height (`ph-drawer.jsx:55`, `MEM.drH||246`).
 *  A CONSTANT, not a viewport fraction — it is the SSR value, and reading
 *  `window` for it would make the server's first paint and the client's differ.
 *  The viewport only ever bounds it, and only once a drag is under way. */
const DEFAULT_HEIGHT = 246;
/** `ph-drawer.jsx:77` — `Math.max(150, …)`. */
const MIN_HEIGHT = 150;
/** `ph-drawer.jsx:77` — `Math.round(window.innerHeight * 0.62)`. */
const MAX_HEIGHT_FRACTION = 0.62;
/** One press of ↑/↓ on the grip. Matches nothing in the handoff, which has no
 *  keyboard path at all; sized so a full traverse of the range is a handful of
 *  presses rather than a hundred. */
const KEY_STEP = 24;

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
  lessons: readonly LibraryLesson[];
  attention: readonly AttentionItem[];
  subjectClass: (subject: SubjectId) => string;
  subjectName: (subject: SubjectId) => string;
  onOpenLesson: (lessonId: string) => void;
  onOpenUnit: (unitId: string, subject: SubjectId) => void;
}

/** Clamp a candidate height against the handoff's floor and its viewport-
 *  relative ceiling. Called only from event handlers, never from render — see
 *  DEFAULT_HEIGHT on why `window` must not be read while rendering. */
function clampHeight(px: number): number {
  const ceiling =
    typeof window === "undefined"
      ? Number.POSITIVE_INFINITY
      : Math.round(window.innerHeight * MAX_HEIGHT_FRACTION);
  // `Math.max` LAST so the floor wins on a very short viewport: on a 240px
  // window the ceiling computes to 149, and clamping to that would collapse the
  // drawer to less than the handoff's stated minimum every time it was touched.
  return Math.max(MIN_HEIGHT, Math.min(ceiling, px));
}

export function TimelineDrawer({
  units,
  lessons,
  attention,
  subjectClass,
  subjectName,
  onOpenLesson,
  onOpenUnit,
}: TimelineDrawerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("units");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  // The Lesson Library's own controls. Local, and deliberately NOT shared with
  // the List mode's identical-looking pair above: the drawer is where a teacher
  // goes looking for one lesson while the canvas keeps their place, and having
  // the search they ran down here silently re-group the surface they were
  // reading would be a worse surprise than two remembered settings.
  const [status, setStatus] = useState<LibraryStatusFilter>("all");
  /** Set by a completed resize drag so the `dblclick` it can synthesise does
   *  not collapse the panel that drag had just sized. A ref, not state — it
   *  must be readable by the very next event, before any re-render. */
  const draggedRef = useRef(false);

  const attentionGroups = groupAttention(attention);
  const shownLessons = groupLessons(
    sortLessons(filterLessons(lessons, status), "schedule"),
    "unit",
  );

  /** Pointer-drag resize. Delta is INVERTED (`ph-drawer.jsx:77`, `h0+(y0-y)`):
   *  the grip is on the drawer's TOP edge, so dragging it upward has to make
   *  the drawer taller, not shorter. */
  function beginResize(e: ReactPointerEvent<HTMLButtonElement>): void {
    // Left button / primary touch only — a right-click must not start a drag
    // the teacher cannot see the end of.
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = height;
    let moved = false;
    const move = (ev: PointerEvent): void => {
      // A 4px threshold, matching the band drag's: a resize is a deliberate
      // gesture, and a two-pixel twitch during a press must not count as one.
      if (Math.abs(ev.clientY - y0) > 4) moved = true;
      setHeight(clampHeight(h0 + (y0 - ev.clientY)));
    };
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      // A completed drag SWALLOWS the gesture that follows it. Two quick
      // resizes in a row generate a `dblclick` on this element, and without
      // this flag the second one would collapse the drawer the teacher was
      // in the middle of sizing — throwing away the adjustment AND the panel.
      if (moved) {
        draggedRef.current = true;
        // Cleared on the next tick rather than on the next dblclick, so a
        // genuine double-click LATER is never mistakenly suppressed by a flag
        // left standing from a drag minutes earlier.
        setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    // `pointercancel` too, which the handoff omits: a touch drag interrupted by
    // the browser's own scroll takeover fires cancel and NEVER fires up, so
    // without this the move listener outlives the gesture and the drawer
    // resizes on every later finger movement anywhere on the page.
    document.addEventListener("pointercancel", up);
  }

  return (
    <section
      className={styles.drawer}
      // The panel-level explanation CLAUDE.md §4 requires for a named panel,
      // reachable by hover on desktop and long-press on touch.
      title="Browse every unit and every lesson, and everything in the plan that needs a second look."
    >
      {/* Only while OPEN. A resize grip on a collapsed panel would offer to
          change a height nothing is showing. */}
      {open && (
        <button
          type="button"
          className={styles.drawerGrip}
          aria-label={`Drawer height, ${Math.round(height)} pixels`}
          title="Drag to make this panel taller or shorter. Double-click to close it. With it focused, ↑ and ↓ resize and Enter closes."
          onPointerDown={beginResize}
          onDoubleClick={() => {
            // Not after a drag — see `draggedRef` in `beginResize`.
            if (draggedRef.current) return;
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              setHeight((h) => clampHeight(h + (e.key === "ArrowUp" ? KEY_STEP : -KEY_STEP)));
              return;
            }
            // The keyboard equivalent of the double-click, handled EXPLICITLY
            // rather than through a general `onClick`.
            //
            // `onClick` was the first shape and it was wrong twice over: a
            // <button> fires `click` at the end of any pointer press, so every
            // completed resize drag also closed the panel it had just resized —
            // and the only thing standing between that and a broken control was
            // `preventDefault()` on pointerdown happening to suppress the
            // synthetic click, which is browser-dependent behaviour to be
            // relying on. It also made a SINGLE click collapse the drawer, when
            // the handoff's gesture is a double-click (`ph-drawer.jsx:116`) —
            // so a teacher who merely tapped the grip lost the panel.
            //
            // `preventDefault` on the key stops the native click this would
            // otherwise synthesise, so the collapse happens exactly once.
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        >
          <span className={styles.drawerGripBar} aria-hidden="true" />
        </button>
      )}
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
              : "Show every unit, every lesson, and everything that needs attention."
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
        <div
          className={styles.drawerBody}
          id={DRAWER_BODY_ID}
          // HEIGHT, not the handoff's `minHeight` (`ph-drawer.jsx:135`) — and
          // this is the one departure in this component that changes what the
          // control DOES rather than how it looks.
          //
          // MEASURED, not reasoned: with `min-height` the drag was completely
          // inert at all three widths (374→374 phone, 471→471 tablet, 414→414
          // desktop). `min-height` is only observable while the CONTENT is
          // shorter than it, and this drawer's content is 310 lesson rows and
          // 203 attention rows — the panel is pinned to its ceiling at every
          // height a teacher can drag to, so `min-height` could never be the
          // property in effect. The prototype's own drawer holds a dozen cards,
          // which is why the distinction never surfaced there.
          //
          // With `height` + the `overflow-y: auto` already on the class, the
          // panel is exactly as tall as the teacher set it and scrolls inside —
          // which is also what the redesign's own F7 asks for in as many words
          // ("bounded and internally scrolling").
          style={{ height: `${height}px` }}
        >
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
                value: "lessons",
                label: "Lessons",
                title:
                  "Every lesson in the plan, in the order it is taught — narrow it by how ready it is, and open any one to plan it.",
              },
              {
                value: "attention",
                label: `Needs attention${attention.length > 0 ? ` (${attention.length})` : ""}`,
                title:
                  "Lessons and units that are missed, running late, thin, unscheduled, or dated somewhere the calendar cannot show.",
              },
            ]}
          />

          {tab === "units" && (
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
          )}

          {tab === "lessons" && (
            <>
              <div className={styles.drawerControls}>
                <ToggleGroup
                  ariaLabel="Which lessons to show"
                  value={status}
                  onChange={(v) => setStatus(v as LibraryStatusFilter)}
                  options={(
                    ["all", "needs_work", "ready", "taught", "not_yet"] as const
                  ).map((k) => ({
                    value: k,
                    label: LIBRARY_STATUS_LABEL[k],
                    title: STATUS_HINT[k],
                  }))}
                />
              </div>
              {shownLessons.length === 0 ? (
                // Names the FILTER, because the filter is the likeliest reason
                // a plan with lessons in it is showing none — an unqualified
                // "No lessons" would read as a claim about the plan.
                <p className={styles.drawerEmpty}>
                  {lessons.length === 0
                    ? "No lessons in this plan yet."
                    : `No lessons are "${LIBRARY_STATUS_LABEL[status]}". Widen the filter to see the rest.`}
                </p>
              ) : (
                shownLessons.map((g) => (
                  <div key={g.key} className={styles.drawerGroup}>
                    <h4 className={styles.drawerGroupHead}>
                      {g.label}
                      <span className={styles.drawerGroupCount}>
                        {g.rows.length}
                      </span>
                    </h4>
                    <ul className={styles.drawerList}>
                      {g.rows.map((l) => (
                        <li key={l.lessonId}>
                          <button
                            type="button"
                            className={`cp-subj ${subjectClass(l.subject)} ${styles.row}`}
                            title={`${l.title || "Untitled lesson"} — ${l.subjectName}, ${DOT_STATE_LABEL[l.state]}. Opens the lesson.`}
                            onClick={() => onOpenLesson(l.lessonId)}
                          >
                            <span
                              className={styles.rowStripe}
                              aria-hidden="true"
                            />
                            <span className={styles.rowTitle}>
                              {l.title || "Untitled lesson"}
                            </span>
                            <span className={styles.rowMeta}>
                              {l.subjectName}
                            </span>
                            <span className={styles.rowMeta}>
                              {/* An unplaceable lesson has a stored week and
                                  day that address no column. Printing them as
                                  a working date would be the confident lie
                                  `offAxis` exists to stop. */}
                              {l.placeable ? `Wk ${l.week}` : "Off-calendar"}
                            </span>
                            <span className={styles.rowMeta}>
                              {DOT_STATE_LABEL[l.state]}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </>
          )}

          {tab === "attention" && (
            attention.length === 0 ? (
              // A specific, checkable claim rather than a decorative "All good!"
              // — and checkable means it has to match the PREDICATES. This list
              // holds a lesson at `planningGapCount >= 2` (dots.ts:47-52), so an
              // empty list never meant "every lesson has an objective, a resource
              // and a standard": a lesson missing exactly one of the three is
              // deliberately not here, and the old copy denied its existence.
              <p className={styles.drawerEmpty}>
                Nothing needs a second look — nothing is past its date and
                untaught, no unit has more lessons left than days to teach them
                in, no lesson is missing more than one of an objective, a
                resource and a standard, and every unit and lesson is dated
                somewhere this calendar can show.
              </p>
            ) : (
              attentionGroups.map((g) => (
                <div key={g.severity} className={styles.drawerGroup}>
                  <h4
                    className={styles.drawerGroupHead}
                    data-severity={g.severity}
                  >
                    {g.label}
                    <span className={styles.drawerGroupCount}>
                      {g.items.length}
                    </span>
                  </h4>
                  <ul className={styles.drawerList}>
                    {g.items.map((item, i) => (
                      <li
                        key={`${item.kind}-${item.target.id}-${i}`}
                        // The row is NOT a button and the action beside it is
                        // (`ph-drawer.jsx:225-231`). A row-sized click target
                        // could not hold a second control — a <button> inside a
                        // <button> is invalid content with unreliable focus and
                        // activation across browsers, the same constraint
                        // TimelineLaneRow's band/grip pair is built around.
                        className={`cp-subj ${subjectClass(item.subject)} ${styles.issue}`}
                      >
                        <span className={styles.rowStripe} aria-hidden="true" />
                        <span className={styles.issueText}>
                          <span className={styles.rowTitle}>
                            {item.title}
                            {/* The subject, because the same unit name can
                                exist in two lanes and the row's stripe colour
                                is the only other thing telling them apart —
                                colour alone is never the encoding (§4). */}
                            <span className={styles.issueSubject}>
                              {subjectName(item.subject)}
                            </span>
                          </span>
                          <span className={styles.rowDetail}>
                            {item.detail}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={styles.issueAction}
                          // The NAME carries the row it belongs to. Five
                          // buttons all called "Open unit" are five identical
                          // stops in a screen reader's control list; the label
                          // is what disambiguates them, and the visible text
                          // stays the short verb the handoff uses.
                          aria-label={`${ATTENTION_ACTION_LABEL[item.kind]} — ${item.title}`}
                          // A real explanation, NOT `title={is.act}`
                          // (`ph-drawer.jsx:228`), which restates the label and
                          // is exactly what CLAUDE.md §4 rules out.
                          title={ATTENTION_ACTION_HINT[item.kind]}
                          onClick={() =>
                            item.target.kind === "lesson"
                              ? onOpenLesson(item.target.id)
                              : onOpenUnit(item.target.id, item.subject)
                          }
                        >
                          {ATTENTION_ACTION_LABEL[item.kind]}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )
          )}
        </div>
      )}
    </section>
  );
}

/** What each filter ACCOMPLISHES, per CLAUDE.md §4's tooltip voice — never a
 *  restatement of the word on the chip. */
const STATUS_HINT: Readonly<Record<LibraryStatusFilter, string>> = {
  all: "Every lesson in the plan, however ready it is.",
  ready: "Only lessons that already have an objective, a resource and a standard.",
  needs_work:
    "Only lessons still missing more than one of an objective, a resource and a standard — including any whose day has already passed.",
  taught: "Only lessons you have marked taught.",
  not_yet: "Everything you have not marked taught yet, planned or otherwise.",
};
