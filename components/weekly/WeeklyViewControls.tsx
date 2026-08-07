"use client";

// WeeklyViewControls.tsx — the merged Weekly-view chrome control.
//
// Rendered in the page-header `actions` slot. It folds two previously-separate
// controls into one row:
//
//   • the old top-right Grid | List | Schedule layout toggle (ViewModeToggle),
//     except "Schedule" no longer navigates to /schedule — it flips the
//     view-local schedule mode so the time-blocked <ScheduleTimeline> renders
//     in place inside the grid panel; and
//   • the standalone in-grid "VIEW" bar's Lessons-only | All-events scope
//     toggle, which now appears inline beside the main toggle ONLY while
//     Schedule mode is active.
//
// State comes from two hooks the WeeklyShell already reads: useAppState()
// (viewMode/setViewMode) and useWeeklyScheduleMode() (mode/scheduleMode +
// events). Picking Grid/List sets mode back to "subject"; picking Schedule
// sets mode to "schedule" without touching the grid/list preference, so
// returning from Schedule lands on the prior Grid/List choice.
//
// The /schedule route still exists and is reachable from the left rail — this
// control intentionally does NOT route there.
//
// Both viewport gates arrive as PROPS from WeeklyShell (`isNarrow`,
// `isPhoneViewport`) and are read-only here: they decide which options the
// toggle offers and which value it reports, and never write the teacher's
// stored preference. See the note above `mainValue`.

import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import {
  useWeeklyScheduleMode,
  type WeeklyScheduleEvents,
} from "@/lib/weekly-schedule-state";
import { useWeekExpansion } from "@/lib/week-expansion";
import { Button, ToggleGroup, Tooltip } from "@/components/ui";
import styles from "./weekly-view-controls.module.css";

// ── Expand-all chevron ────────────────────────────────────────────────────
// Rotates 180° when everything on screen is already open, so the glyph reads
// as the direction the press will take the week — the same treatment the v2
// handoff gives its lesson-flow expander (mockup: the `pl-flowbtn` chevron,
// `transform: rotate(180deg)` while open). The rotation is a ~200ms ease-out
// per CLAUDE.md §4's card-expand timing; `prefers-reduced-motion` drops it to
// no transition (see weekly-view-controls.module.css) rather than removing the
// rotation, so the glyph still points the right way without animating there.
function ExpandChevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${styles.expandChevron} ${open ? styles.expandChevronOpen : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Main toggle value space: the two grid/list view modes plus "schedule". */
type MainMode = "grid" | "list" | "schedule";

interface WeeklyViewControlsProps {
  /**
   * True on the narrow tier (≤900px), where WeeklyShell refuses to render the
   * in-place ScheduleTimeline (`showSchedule = !isNarrow && scheduleMode`).
   * Passed down from WeeklyShell — the single source of truth for the
   * breakpoint — rather than re-derived here, so the control and the canvas can
   * never disagree about whether Schedule renders.
   */
  isNarrow?: boolean;
  /**
   * True on the phone tier (<600px), where WeeklyShell forces the WeeklyList
   * canvas whatever the stored viewMode says (`showList = isPhoneViewport ||
   * viewMode === "list"`). Passed down for the same reason as `isNarrow`, and
   * deliberately a SECOND prop: the two gates answer different questions at
   * different widths (WeeklyShell's NARROW_MQ block), so one boolean cannot
   * stand for both.
   */
  isPhoneViewport?: boolean;
}

export function WeeklyViewControls({
  isNarrow = false,
  isPhoneViewport = false,
}: WeeklyViewControlsProps): ReactNode {
  const { viewMode, setViewMode, selectedLessonId, setSelectedLessonId } =
    useAppState();
  const { setMode, scheduleMode, events, setEvents } = useWeeklyScheduleMode();
  const { allExpanded, visibleCount, visibleIds, expandAll, collapseAll } =
    useWeekExpansion();

  // ── Collapse all releases the selection ───────────────────────────────────
  // "Collapse all" used to leave the selection ring — and WeeklyShell's
  // `?lesson=` URL mirror — on a card it had just shut. Nothing was open, yet
  // something was still ringed.
  //
  // THE RULE IS NARROWER THAN "COLLAPSING RELEASES", deliberately. Collapsing a
  // DIFFERENT card must NOT release: the selection then still sits on a card
  // that is open, so the ring and the visible body agree, and clearing it would
  // pull the ring off a lesson the teacher is reading. That case was adjudicated
  // a false positive in `a82b8e2` and is pinned by tests — do not widen this.
  // Collapsing the SELECTED card already releases at the canvas
  // (WeekA.tsx:316-320). Collapse-all is the remaining hole.
  //
  // Gated on `visibleIds`, not fired unconditionally, because `collapseAll()`
  // only collapses what the canvas is SHOWING. A lesson that a filter has hidden
  // stays expanded, so if the selection sits on one of those, collapse-all did
  // not shut it and must not drop it (nor the `?lesson=` deep link that would go
  // with it).
  const handleCollapseAll = (): void => {
    const shutTheSelected =
      selectedLessonId !== null && visibleIds.includes(selectedLessonId);
    collapseAll();
    if (shutTheSelected) setSelectedLessonId(null);
  };

  // ── The control may never claim a mode the body does not show ────────────
  // ONE rule, applied at BOTH breakpoints. WeeklyShell withholds two different
  // canvases at two different widths, and each withholding takes an option with
  // it — otherwise the header advertises a mode the canvas below is not in.
  //
  //   Schedule, ≤900px — the header would flip to Schedule and reveal the scope
  //     toggle while the canvas stayed a lesson list. The dedicated /schedule
  //     route is the phone/tablet entry, still reachable from the left rail.
  //   Grid, <600px — WeeklyShell forces WeeklyList there
  //     (`showList = isPhoneViewport || viewMode === "list"`), so a stored Grid
  //     preference carried in from a wider viewport lit the Grid segment above a
  //     list, and pressing it did nothing: ToggleGroup never fires onChange for
  //     the option that is already active, so the press was a silent no-op. A
  //     screen reader heard "Grid, checked" while List rendered. Same defect as
  //     Schedule, found live at 375px (docs/qa/2026-08-02-week.md, MAJOR 1); the
  //     reasoning below simply had not been carried across when the phone gate
  //     landed.
  //
  // In both cases the option is DROPPED rather than disabled — ToggleGroup's
  // `disabled` is group-wide, and a segment that renders greyed is still a
  // segment claiming to be part of the choice. On a phone that leaves a
  // single-option group: a "List" chip that reports the canvas honestly and
  // cannot be changed. That is deliberate — it is the accessible name for what
  // is on screen, it keeps the ≥44px hit area the tray already inflates
  // (ToggleGroup.module.css `any-pointer: coarse`), and its tooltip is where the
  // teacher is told WHY there is no Grid here. Hiding the group outright was the
  // alternative considered and rejected: it removes the state as well as the
  // choice, and the canvas is then announced by nothing at all.
  //
  // NEITHER GATE WRITES `viewMode`. Both are read-side only, so a teacher whose
  // stored choice is Grid gets the grid back the moment the viewport widens past
  // 600px — the property `68e2f5f` deliberately preserves. Report the override;
  // never persist it.
  //
  // The phone arm of `scheduleAvailable` is not redundant with the narrow one,
  // even though every phone width is inside NARROW_MQ today. That containment is
  // a fact about two constants in ANOTHER file; if NARROW_MQ ever narrows, a
  // phone would start offering a Schedule segment for a timeline WeeklyShell
  // still refuses to render. Stating both keeps this control correct on its own
  // terms rather than on the caller's arithmetic.
  const scheduleAvailable = !isNarrow && !isPhoneViewport;
  const scheduleActive = scheduleMode && scheduleAvailable;

  // The main toggle reflects what the canvas is ACTUALLY showing: forced List on
  // a phone, else Schedule when schedule mode is active and renderable, else the
  // stored grid/list view mode.
  const mainValue: MainMode = isPhoneViewport
    ? "list"
    : scheduleActive
      ? "schedule"
      : viewMode;

  return (
    <div className={styles.controls}>
      {/* ── Expand all / Collapse all ─────────────────────────────────────
          The Week has no right panel, so expanding a card in place is how a
          teacher reads a lesson without leaving the surface — and this is the
          control that does it for the whole week at once. Directed by the user
          alongside the panel removal, and shaped after the v2 handoff's
          lesson-flow expander (V2 Framework.md:425-426, "expand-all /
          collapse-all at the top"). The handoff specifies that control for the
          LESSON FLOW, not the week grid; the pattern is borrowed deliberately
          rather than cited as week-surface spec.

          ONE button, not two. It reports the state the week is in and offers
          the opposite, so the teacher never has to work out which of a pair is
          live — and `allExpanded` is computed against what the canvas actually
          renders, so a filtered week that is fully open says "Collapse all"
          honestly.

          Hidden — not disabled — when the canvas has nothing expandable:
          Schedule mode, List mode, the Edit board, and a genuinely empty week
          all publish zero visible ids. That follows the scope toggle below,
          which is hidden on the same reasoning, and it means the control can
          never be present-but-inert. The trade-off is that the header shifts
          when a week loads its first lesson; a permanently disabled button on
          every empty week reads worse. */}
      {visibleCount > 0 && (
        <Tooltip
          content={
            allExpanded
              ? "Close every lesson on this week back to its title and preview."
              : "Open every lesson on this week in place, so you can read objectives, tasks and notes without leaving the grid."
          }
          side="bottom"
          tooltipId="weekly-expand-all"
        >
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<ExpandChevron open={allExpanded} />}
            onClick={() => (allExpanded ? handleCollapseAll() : expandAll())}
            // The label already changes with the state, so aria-pressed would
            // say the same thing twice and screen readers would announce a
            // toggle that renames itself — confusing rather than helpful.
            aria-label={
              allExpanded
                ? `Collapse all ${visibleCount} lessons this week`
                : `Expand all ${visibleCount} lessons this week`
            }
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </Tooltip>
      )}
      <ToggleGroup<MainMode>
        ariaLabel="Weekly view mode"
        variant="prominent"
        size="sm"
        value={mainValue}
        onChange={(v) => {
          if (v === "schedule") {
            // Render the in-place ScheduleTimeline; the grid/list view mode is
            // left untouched so switching back returns to the prior choice.
            setMode("schedule");
            return;
          }
          setMode("subject");
          setViewMode(v);
        }}
        options={[
          // Grid is omitted on a phone, Schedule on the whole narrow tier — see
          // the "may never claim a mode the body does not show" note above.
          ...(isPhoneViewport
            ? []
            : [
                {
                  value: "grid" as const,
                  label: "Grid",
                  title: "See the week as a subject-by-day grid",
                  tooltipId: "weekly-view-grid",
                },
              ]),
          {
            value: "list",
            label: "List",
            // On a phone this is the only option, so the tooltip answers the
            // question the missing Grid segment raises — where it went, and that
            // the teacher's own choice is intact — rather than describing a
            // switch they cannot make. `required` is NOT set: this is ordinary
            // orientation, not a high-consequence control (CLAUDE.md §4).
            title: isPhoneViewport
              ? "This screen is too narrow for the day-by-day grid, so the week shows as a list. Your Grid or List choice is remembered — turn to landscape or open the week on a tablet to get it back."
              : "See the week as a scrollable list of lessons",
            // A SEPARATE dismissal id for the phone copy. The two say different
            // things, and sharing one id would let a teacher who turned off the
            // ordinary List tip on a desktop lose the phone-only explanation of
            // where the Grid option went — the one message they have not seen.
            tooltipId: isPhoneViewport
              ? "weekly-view-list-phone"
              : "weekly-view-list",
          },
          ...(scheduleAvailable
            ? [
                {
                  value: "schedule" as const,
                  label: "Schedule",
                  title: "Show the week as a time-blocked schedule",
                  tooltipId: "weekly-schedule-toggle",
                },
              ]
            : []),
        ]}
      />
      {/* Scope toggle — only meaningful when Schedule is actually rendering, so
          it's hidden otherwise (incl. the narrow tier) rather than disabled,
          keeping the header row uncluttered. */}
      {scheduleActive && (
        <ToggleGroup<WeeklyScheduleEvents>
          ariaLabel="Weekly event scope"
          variant="subtle"
          size="sm"
          value={events}
          onChange={(v) => setEvents(v)}
          options={[
            {
              value: "lessons",
              label: "Lessons only",
              title: "Show only academic lessons",
              tooltipId: "weekly-events-lessons",
            },
            {
              value: "all",
              label: "All events",
              title: "Include non-academic events (lunch, assembly, etc.)",
              tooltipId: "weekly-events-all",
            },
          ]}
        />
      )}
    </div>
  );
}
