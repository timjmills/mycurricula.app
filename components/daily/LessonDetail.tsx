"use client";

// LessonDetail.tsx — Right pane: full lesson detail for a selected lesson.
//
// LAYOUT (REVISED 2026-05-20 per docs/historical/5.20.26 Plugin Directions §1 + §2) — the daily-view
// lesson detail panel is a single rounded WHITE card. Across the top sits
// a FLAT, light subject-tinted HEADER BAND — the exact treatment used by
// the weekly-grid lesson cards. The header is no longer a dark slab; it
// is `var(--cl)` (subject-light) fill with `var(--cd)` (subject-deep)
// text, a 4px `var(--c)` left accent stripe (the weekly card's stripe),
// and a hair-thin 25% `var(--c)` bottom border to seat it against the
// white body.
//
// The band carries THREE flex regions, in order:
//
//   (A) LEFT — a tiny 2-letter subject MONOGRAM chip (e.g. "MA"), then a
//       small 16×16 mark-done checkbox glyph, then the SUBJECT NAME in
//       big uppercase with tight tracking. `flex: 0 0 auto` — sizes to
//       content.
//   (B) MIDDLE — the lesson TITLE, centered in the remaining space,
//       single-line truncating with ellipsis on overflow.
//       `flex: 1 1 auto; text-align: center`.
//   (C) RIGHT — the lesson TIME range right-justified in big tabular
//       numerals, followed by the kebab `⋮` overflow + expand `⤢`
//       icon buttons (16px glyphs in 28×28 hit targets, 4px gap, at
//       60% opacity by default, full opacity on hover/focus).
//       `flex: 0 0 auto; margin-left: auto; text-align: right`.
//
// The body below the band is now LEFT-ALIGNED (was centered):
//   • The lesson body container uses `max-width: 760px; margin: 0;
//     margin-right: auto;` — flush-left, NOT `margin: 0 auto`.
//   • 32px left gutter from the pane edge, 24px right gutter before the
//     right rail.
//   • Title, action row, planning tabs, and lesson flow all line up to
//     the same 32px left gutter.
//   • The "+ Add section" + "Edit lesson flow / template" controls live
//     inside <LessonFlow> and remain centered (the only centered
//     controls per the spec).
//
// PLANNING TABS (6.11.26 design_handoff_daily_view §6). Between the title
// block and the lesson-flow/agenda area sits <PlanningTabs> — the tabbed
// Objective / Standards / Lesson notes / Differentiation (+ Chat +
// Resources) panel. It REPLACED two body sections that used to live here:
//   • the "I CAN" objective line under the title → the Objective pane
//     (an always-editable rich-text field bound to lesson.objective);
//   • the bottom "My notes" section → the Lesson notes pane (the notes
//     state + coalesced store writes moved into PlanningTabs wholesale).
//
// Action row (spec §5 retained):
//   LEFT  → [☐ Mark done] (cycle button) + [🔖 Add status] (stub).
//   RIGHT → [📤 Lesson notes] button that ACTIVATES the planning panel's
//           Lesson-notes tab (via the PlanningTabsHandle) and focuses its
//           editor. Print + overflow are NO LONGER here — they now live
//           in the header band's right region per §1.
//
// DOUBLE-CLICK-TO-EDIT (title only). The lesson TITLE renders as static
// text and swaps to a RichTextEditor on double-click (or Enter / F2 on
// the focused text). Commits on blur, cancels on Escape via
// RichEditorWrapper — the WeeklyLessonCard pattern. The objective's
// editor moved into the planning panel's Objective pane. <LessonFlow>
// owns the section headings + bodies.
//
// The `cp-subj ${subj.cls}` wrapper is KEPT so the --c / --cl / --cd
// custom-property cascade flows into the header band, the action row,
// the section headings, and <LessonFlow>. The band uses `--cl` (light
// tint) as a flat fill and `--cd` (deep ink) for text/icons — never a
// hard-coded color. The only color introduced is per-subject through
// the cascade.
//
// STICKY RICH-TEXT TOOLBAR (6.11.26 redesign §6). ONE <RtToolbar> sits as
// the first child of the scrollable detail body (`cellRef`), sticky at
// its top edge. Every RichTextEditor in the body — the title editor,
// the planning-tab panes, and the lesson-flow phase bodies — renders
// `chromeless` and registers with the shared rich-text command bus
// while focused, so the single toolbar drives whichever editor the
// teacher is working in (components/rich-text/command-bus.ts). The
// per-editor docked toolbar is gone on /daily; other views keep their
// floating per-selection toolbar.
//
// Store wiring (planner-store):
//   sections  — managed inside <LessonFlow> via usePlanner(); never local.
//   title     — written via editLesson with coalesce.
//   objective — edited in <PlanningTabs>' Objective pane (coalesced
//               editLesson writes live there now).
//   notes     — edited in <PlanningTabs>' Lesson-notes pane (moved from
//               this file's former bottom "My notes" section).
//   completion— cycleStatus() calls onToggleComplete (never forks).
// UI-only state (titleEditing, draftTitle) stays local — not persisted.

import { useState, useEffect, useRef } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import type { Lesson } from "@/lib/types";
import { lessonTime } from "@/lib/mock";
import { instantiateSections } from "@/lib/lesson-flow";
import { LESSON_TEMPLATES } from "@/lib/lesson-templates";
import type { LessonTemplate } from "@/lib/lesson-templates";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { LessonFlow } from "@/components/lesson-flow";
import { RichTextEditor } from "@/components/rich-text";
import { usePlanner } from "@/lib/planner-store";
import { Button, Tooltip } from "@/components/ui";
import { LessonAgendaNav } from "./LessonAgendaNav";
import { PlanningTabs } from "./planning-tabs";
import type { PlanningTabsHandle } from "./planning-tabs";
import { RtToolbar } from "./rt-toolbar";
import detailStyles from "./lesson-detail.module.css";

// ── Agenda-navigator visibility persistence ──────────────────────────────
// The sticky section navigator beside the lesson flow (6.11.26 redesign)
// can be hidden per-teacher. SSR-safe: default ON for the server render;
// the saved preference loads post-mount.

const AGENDA_NAV_KEY = "mycurricula:daily-agenda-nav-on";

// ── Completion checkbox (status-aware) ───────────────────────────────────

function StatusCheckbox({
  status,
  size = 16,
}: {
  status: Lesson["status"];
  size?: number;
}): ReactNode {
  if (status === "done") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect width="14" height="14" rx="3.5" fill="var(--done)" />
        <path
          d="M3.5 7l2.5 2.5 4.5-4.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "partial") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect
          width="14"
          height="14"
          rx="3.5"
          fill="var(--important-bg)"
          stroke="var(--important)"
          strokeWidth="1.2"
        />
        <rect
          x="3.5"
          y="6"
          width="7"
          height="2"
          rx="1"
          fill="var(--important)"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.6"
        y="0.6"
        width="12.8"
        height="12.8"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

// ── Pencil icon (W3-C5) ──────────────────────────────────────────────────
// Single-stroke pencil glyph, currentColor, 14×14 viewBox — matches the
// thin-stroked visual language of components/lesson-card/icon.tsx (1.4
// stroke, round caps + joins). Used by the visible "edit" affordance on
// the lesson title + objective rows; clicking the host <button> calls the
// same `openEditor(...)` the dbl-click / Enter / F2 path uses, so this
// is a discoverability layer over an existing handler, not a new path.

function PencilIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Pencil body — slanted barrel from upper-right to lower-left, with
          the tip pointing down to the lower-left corner. A short stroke
          across the barrel marks the metal ferrule that separates the
          wood from the eraser, matching the simplified-pencil silhouette
          used in icon sets at this size. */}
      <path d="M9.5 1.5l3 3-7 7H2.5v-3l7-7z" />
      <path d="M8 3l3 3" />
    </svg>
  );
}

// ── Props ────────────────────────────────────────────────────────────────

interface LessonDetailProps {
  lesson: Lesson;
  onToggleComplete: (id: string, next: Lesson["status"]) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function LessonDetail({
  lesson,
  onToggleComplete,
}: LessonDetailProps): ReactNode {
  // ── Store — notes editing + subject catalog ──────────────────────────
  // Notes are written through editLesson with coalescing so a typing burst
  // produces one history step. Sections are managed by LessonFlow directly.
  // Completion is routed through onToggleComplete → DailyView, which calls
  // setLessonStatus — keeping a single dispatch path per UI action.
  // Subject metadata comes from the planner store's catalog (frozen API),
  // not lib/mock — safe here, LessonDetail only renders under the (planner)
  // /daily route (PlannerProvider present).
  const { editLesson, subjectById, getSections, setSections } = usePlanner();
  const { showConsequence } = useConsequenceToast();
  const subj = subjectById[lesson.subject];

  // ── Scroll-body ref ──────────────────────────────────────────────────
  // cellRef is attached to the scrollable detail body region — the
  // scroll context the sticky RtToolbar pins to (it renders as this
  // element's first child) and the container the agenda navigator
  // scrollspies and scrolls.
  const cellRef = useRef<HTMLDivElement | null>(null);

  // ── Narrow-workspace measurement ──────────────────────────────────────
  // The agenda navigator stacks above the flow when the detail column is
  // narrow. JS-measured (ResizeObserver on the body cell) instead of a
  // container query — container-type on the scroll container would make
  // it the containing block for the fixed-position ResourceComposer
  // rendered inside <LessonFlow>, breaking that dialog.
  const [workspaceNarrow, setWorkspaceNarrow] = useState(false);
  useEffect(() => {
    const el = cellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWorkspaceNarrow(entry.contentRect.width < 560);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Agenda navigator visibility (per-teacher, persisted) ─────────────
  const [agendaNavOn, setAgendaNavOn] = useState(true);
  useEffect(() => {
    try {
      setAgendaNavOn(window.localStorage.getItem(AGENDA_NAV_KEY) !== "0");
    } catch {
      // Storage unavailable — keep the default (on).
    }
  }, []);
  function toggleAgendaNav(): void {
    setAgendaNavOn((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(AGENDA_NAV_KEY, next ? "1" : "0");
      } catch {
        // Storage unavailable — the choice simply won't persist.
      }
      return next;
    });
  }

  // ── Templates menu (prototype .tmplBtn/.tmplMenu) ─────────────────────
  // Lists the built-in lesson-flow templates (lib/lesson-templates).
  // Applying one REPLACES this lesson's phases with the template's
  // sections — the lesson's own resources are redistributed across the
  // new phases by instantiateSections. Destructive, so the trigger
  // carries a required tooltip and the commit raises a consequence toast
  // whose Undo restores the previous phase list in one step.
  const [tmplOpen, setTmplOpen] = useState(false);
  const tmplMenuRef = useRef<HTMLDivElement | null>(null);
  const tmplBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!tmplOpen) return;
    function onPointerDown(e: PointerEvent): void {
      const t = e.target as Node;
      if (tmplMenuRef.current?.contains(t)) return;
      if (tmplBtnRef.current?.contains(t)) return;
      setTmplOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setTmplOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tmplOpen]);

  function applyTemplate(template: LessonTemplate): void {
    const previous = getSections(lesson.id);
    setSections(lesson.id, instantiateSections(template, lesson.resources));
    setTmplOpen(false);
    showConsequence({
      message: `Applied the "${template.name}" template — this lesson's phases were replaced`,
      onUndo: () => setSections(lesson.id, previous),
    });
  }

  // ── Planning tabs handle ──────────────────────────────────────────────
  // The action-row "Lesson notes" button activates the planning panel's
  // Lesson-notes tab (re-adding it if the teacher closed it), scrolls the
  // panel into view, and focuses its editor — the jump the old
  // scroll-to-notes affordance provided, now that notes live in a pane.
  const planTabsRef = useRef<PlanningTabsHandle | null>(null);

  function openLessonNotes(): void {
    planTabsRef.current?.activate("notes", { focus: true });
  }

  // ── Double-click-to-edit: title ───────────────────────────────────────
  // Pure local UI state; the draft is committed to the store on blur via
  // editLesson (coalesced). The title commits straight through editLesson
  // with no Personal/Master dialog — deliberate parity with the planning
  // panel's pane editors. (The objective's editor lives in <PlanningTabs>.)
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>("");

  // A new lesson resets any open title editor so a stale draft can never
  // bleed into the freshly-selected lesson.
  useEffect(() => {
    setTitleEditing(false);
    setDraftTitle("");
  }, [lesson.id]);

  // Open the title editor, seeding the draft from the lesson's current
  // value. The double-click / Enter event is stopped so it never bubbles.
  function openEditor(e?: SyntheticEvent): void {
    e?.stopPropagation();
    e?.preventDefault();
    setTitleEditing(true);
    setDraftTitle(lesson.title);
  }

  // Commit the draft through editLesson with a coalesce key (typing burst
  // = one undo step). A no-op when nothing changed.
  function commitEdit(): void {
    if (!titleEditing) return;
    const trimmed = draftTitle.trim();
    if (trimmed !== (lesson.title ?? "")) {
      editLesson(
        lesson.id,
        { title: trimmed },
        { key: `lesson:${lesson.id}:title`, ts: Date.now() },
      );
    }
    setTitleEditing(false);
    setDraftTitle("");
  }

  // Cancel the open editor without saving — discards the draft.
  function cancelEdit(): void {
    setTitleEditing(false);
    setDraftTitle("");
  }

  // Cycle: not_done → done → partial → not_done.
  // Routes through onToggleComplete → DailyView.handleToggleComplete →
  // store.setLessonStatus (one dispatch, completion never forks a lesson).
  function cycleStatus(): void {
    const next: Lesson["status"] =
      lesson.status === "not_done"
        ? "done"
        : lesson.status === "done"
          ? "partial"
          : "not_done";
    onToggleComplete(lesson.id, next);
  }

  // Time label from the mock schedule (uses lesson.time override if set).
  const timeLabel = lessonTime(lesson);

  return (
    <div
      className={`${detailStyles.root} cp-subj ${subj.cls}`}
      role="region"
      aria-label={`Lesson detail: ${lesson.title}`}
    >
      {/* ── Header band — weekly-card style, three regions ──────────────
          Flat `var(--cl)` (subject-light) fill with `var(--cd)` (subject-
          deep) text + icons, a 4px `var(--c)` left accent stripe (drawn
          via `border-left` so it occupies the band's full height), and a
          hair-thin 25% `var(--c)` bottom border. No gradient, no shadow.
          The .root's `overflow:hidden` clips the band to the rounded top
          corners.

          Three flex regions:
            (A) .bandLeft  → monogram chip + checkbox + uppercase subject.
            (B) .bandTitle → centered lesson title, truncates on overflow.
            (C) .bandRight → big tabular-numerals time + kebab + expand. */}
      <div className={detailStyles.band}>
        {/* (A) LEFT — Subject cluster: monogram + check + uppercase name.
            `subj.icon` already supplies the canonical two-letter monogram
            ("Ma", "Re", …) from lib/mock/subjects.ts; we uppercase it for
            the weekly-card style. The checkbox glyph is decoration (the
            real Mark-done lives in the body's action row). */}
        <div className={detailStyles.bandLeft}>
          <span className={detailStyles.bandMonogram} aria-hidden="true">
            {subj.icon.toUpperCase()}
          </span>
          {/* 16×16 mark-done indicator — decorative; matches the weekly
              card's leading checkbox affordance. `aria-hidden` because the
              real action is the body's Mark-done button. */}
          <span className={detailStyles.bandCheckbox} aria-hidden="true" />
          <p className={detailStyles.bandSubject}>
            {subj.name}
            {lesson.isPersonal && (
              <span className={detailStyles.bandPersonal}>Personal</span>
            )}
          </p>
        </div>

        {/* (B) MIDDLE — Lesson title. Single-line, true-centered in the
            space remaining between the left and right clusters. Truncates
            with ellipsis when squeezed (the first thing to give under
            narrow widths). The double-click-to-edit target lives below
            in the body's hero title; this is just the band tier. */}
        <Tooltip content={lesson.title} side="bottom">
          <p
            className={detailStyles.bandTitle}
            title={lesson.title}
            tabIndex={0}
          >
            {lesson.title}
          </p>
        </Tooltip>

        {/* (C) RIGHT — Time + header icon buttons.
            The time is the visual hero of the right region: big tabular-
            numerals digits in `var(--cd)`. To the right of the time, the
            kebab `⋮` and expand `⤢` icon buttons sit in a tight 4px-gap
            cluster, at 60% opacity by default. Both are stubs awaiting
            their menu / full-screen wiring; they are aria-labelled and
            keyboard-focusable. */}
        <div className={detailStyles.bandRight}>
          <p className={detailStyles.bandTime}>{timeLabel}</p>
          <div className={detailStyles.bandIcons}>
            <Button
              variant="icon"
              iconAriaLabel="More options"
              className={detailStyles.bandIconBtn}
              aria-haspopup="menu"
              tooltip="Open the lesson menu — mark status, relocate, save as template, print, archive, or fork to Team Curriculum"
            >
              {/* Vertical three-dots — kebab overflow per spec §1.2(C). */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="8" cy="3.2" r="1.4" />
                <circle cx="8" cy="8" r="1.4" />
                <circle cx="8" cy="12.8" r="1.4" />
              </svg>
            </Button>
            <Button
              variant="icon"
              iconAriaLabel="Expand to full screen"
              className={detailStyles.bandIconBtn}
              tooltip="Expand this lesson detail to full screen — fewer distractions while you read or edit"
            >
              {/* Expand / full-screen — diagonal arrows pointing outward. */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2.5 6V2.5h3.5M13.5 6V2.5h-3.5M2.5 10v3.5h3.5M13.5 10v3.5h-3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable body / the "cell" region (cellRef target) ────────
          cellRef is attached HERE — the scroll container the agenda
          navigator scrollspies, and the sticky RtToolbar's scroll
          context. The toolbar is the FIRST child so position:sticky pins
          it to this element's top edge; every RichTextEditor below it
          renders chromeless and is driven through the shared command
          bus. The inner `.column` is LEFT-ALIGNED to a 32px gutter
          (spec §2), not centered. */}
      <div className={detailStyles.body} ref={cellRef}>
        <RtToolbar />
        <div className={detailStyles.column}>
          {/* ── Title — hero ───────────────────────────────────────────
              Double-click-to-edit (or Enter / F2 on the focused text).
              Commits on blur, cancels on Escape — the WeeklyLessonCard
              pattern. The header band carries the SUBJECT hero above;
              this is the lesson NAME hero, sitting on the white body.

              W3-C5: a visible PENCIL button sits adjacent to the title
              (inside the flex row, OUTSIDE the title's `<h3>` ring so it
              doesn't fall inside any W2-B1 team-mode-edit-cue outline).
              On desktop the pencil is hover-/focus-within-revealed; on
              phone (≤480px) it is always visible. Pencil click calls
              the SAME `openEditor("title")` the dbl-click path uses. */}
          <div className={detailStyles.titleRow}>
            <h2 className={detailStyles.title}>
              {titleEditing ? (
                <RichEditorWrapper onCommit={commitEdit} onCancel={cancelEdit}>
                  <RichTextEditor
                    value={draftTitle}
                    onChange={setDraftTitle}
                    autoFocus
                    singleLine
                    placeholder="Lesson title…"
                    ariaLabel="Edit lesson title"
                    chromeless
                  />
                </RichEditorWrapper>
              ) : (
                <Tooltip
                  content="Double-click or press Enter to edit the lesson title — saved into your personal copy."
                  side="top"
                >
                  <span
                    className={detailStyles.editableText}
                    tabIndex={0}
                    role="button"
                    aria-label="Edit lesson title"
                    onDoubleClick={(e) => openEditor(e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "F2") openEditor(e);
                    }}
                    title="Double-click or press Enter to edit"
                  >
                    {lesson.title}
                  </span>
                </Tooltip>
              )}
            </h2>
            {!titleEditing && (
              <Tooltip
                content="Edit the lesson title — saved into your personal copy."
                side="top"
                tooltipId="lesson-detail-edit-title"
              >
                <button
                  type="button"
                  className={detailStyles.editPencil}
                  aria-label="Edit lesson title"
                  onClick={(e) => openEditor(e)}
                >
                  <PencilIcon />
                </button>
              </Tooltip>
            )}
          </div>

          {/* The "I CAN" objective line that used to sit here moved into
              the planning panel's Objective pane (6.11.26 handoff §6) —
              see <PlanningTabs> below the action row. */}

          {/* ── Action row ────────────────────────────────────────────
              Compact icon+label buttons (spec §5). Left cluster groups
              completion affordances ([Mark done] cycle + [Add status]
              stub). Right cluster (pushed via margin-left:auto on
              .actionRight) holds the [Lesson notes] jump button that
              scrolls the My-notes section into view. The print +
              overflow icons that used to live here have moved into the
              header band's right region per spec §1. */}
          <div className={detailStyles.actionRow}>
            <div className={detailStyles.actionLeft}>
              <Button
                variant="ghost"
                size="sm"
                className={`${detailStyles.markDone} ${
                  lesson.status === "done" ? detailStyles.markDoneDone : ""
                }`}
                onClick={cycleStatus}
                aria-label={
                  lesson.status === "done" ? "Mark as not done" : "Mark as done"
                }
                tooltip={
                  lesson.status === "done"
                    ? "Click to cycle to partial credit, then to not-done — useful when something needs to be re-taught"
                    : "Mark this lesson done — completion is personal, it never forks the Team Curriculum copy"
                }
                leadingIcon={
                  <StatusCheckbox status={lesson.status} size={16} />
                }
              >
                {lesson.status === "done" ? "Done" : "Mark done"}
              </Button>
              {/* Add status — stub for a future status submenu (urgent /
                  important / fyi / catch-up tags). */}
              <Button
                variant="ghost"
                size="sm"
                className={detailStyles.actionBtn}
                aria-label="Add status"
                aria-haspopup="menu"
                tooltip="Tag this lesson with a status (urgent, important, FYI, catch-up) — the tag colors the card so the team can see priorities at a glance"
                leadingIcon={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    {/* Bookmark / tag glyph */}
                    <path
                      d="M3.5 2h7v10l-3.5-2.2L3.5 12V2z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
              >
                Add status
              </Button>
            </div>
            <div className={detailStyles.actionRight}>
              {/* Lesson notes — activates the planning panel's Lesson-notes
                  tab (re-adding it if closed) and focuses its editor. This
                  is a jump into the panel, not a popover. Styled as a
                  quieter trailing link (no border) per spec §5's "Lesson
                  notes link on the far right". */}
              <Button
                variant="ghost"
                size="sm"
                className={detailStyles.notesLink}
                onClick={openLessonNotes}
                aria-label="Open lesson notes"
                tooltip="Open the Lesson-notes tool in the planning panel and focus its editor — fastest way to jot a private reminder for yourself"
                leadingIcon={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    {/* Page with arrow — "lesson notes" / "send to notes" */}
                    <path
                      d="M2.5 2.5h6L11 5v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V2.5z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 2.5V5h2.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
              >
                Lesson notes
              </Button>
            </div>
          </div>

          {/* ── Planning tabs — Objective / Standards / Lesson notes /
              Differentiation (+ Chat + Resources) ───────────────────────
              (6.11.26 redesign §6.) The tabbed planning panel sits between
              the title block and the lesson-flow/agenda area. It owns the
              objective + notes editing (formerly body sections here) and
              the read-only Standards + Resources surfaces; tools are
              reorderable, closable, and re-addable, and the arrangement
              persists per-teacher. planTabsRef lets the action row's
              "Lesson notes" button jump straight to the Notes pane. */}
          <PlanningTabs ref={planTabsRef} lesson={lesson} />

          {/* ── Lesson workspace — agenda navigator + lesson flow ───────
              (6.11.26 redesign §6.) The section head carries the
              "Lesson agenda" title, the Templates menu, and the
              navigator toggle. Below it, a sticky numbered phase
              navigator sits beside the flow: click to jump, scrollspy
              highlights the phase under the reading line, items
              drag-reorder and rename in place, and the toggle hides the
              rail for teachers who want full-width text. The navigator
              reads its items straight from the planner store (the same
              rows LessonFlow renders), and targets the flow's
              data-flow-section anchors for scrolling. LessonFlow: key
              resets dnd drag state when the selected lesson changes;
              modified drives the fork stripe; chromeless routes every
              phase-body editor through the sticky toolbar's command
              bus. */}
          <div className={detailStyles.agendaSectionHead}>
            <span className={detailStyles.sectionGrip} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </span>
            <span className={detailStyles.agendaSectionTitle}>
              Lesson agenda
            </span>
            <div className={detailStyles.agendaActions}>
              {/* Templates — replaces this lesson's phases with a built-in
                  lesson-flow shape. Destructive → required tooltip; the
                  consequence toast (with Undo) confirms the swap. */}
              <div className={detailStyles.tmplWrap}>
                <Tooltip
                  content="Start this lesson's phases from a template — applying one replaces the current phase list (Undo restores it)"
                  side="top"
                  required
                >
                  <button
                    type="button"
                    ref={tmplBtnRef}
                    className={detailStyles.tmplBtn}
                    aria-haspopup="menu"
                    aria-expanded={tmplOpen}
                    onClick={() => setTmplOpen((v) => !v)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
                      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
                    </svg>
                    Templates
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </Tooltip>
                {tmplOpen && (
                  <div
                    ref={tmplMenuRef}
                    className={detailStyles.tmplMenu}
                    role="menu"
                    aria-label="Lesson flow templates"
                  >
                    <div className={detailStyles.tmplMenuLabel}>
                      Lesson flow templates
                    </div>
                    {LESSON_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        role="menuitem"
                        className={detailStyles.tmplMenuItem}
                        onClick={() => applyTemplate(template)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
                          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
                        </svg>
                        {template.name}
                        <span className={detailStyles.tmShort}>
                          {template.sections.length}{" "}
                          {template.sections.length === 1 ? "phase" : "phases"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Tooltip
                content="Show or hide the section navigator — the numbered map of this lesson's flow that follows along as you scroll"
                side="top"
                tooltipId="lesson-detail-agenda-toggle"
              >
                <button
                  type="button"
                  className={detailStyles.agendaToggle}
                  aria-pressed={agendaNavOn}
                  onClick={toggleAgendaNav}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="9" y1="4" x2="9" y2="20" />
                  </svg>
                  {agendaNavOn ? "Hide navigation" : "Show navigation"}
                </button>
              </Tooltip>
            </div>
          </div>
          <div
            className={`${detailStyles.workspace} ${
              agendaNavOn ? "" : detailStyles.workspaceNavOff
            } ${workspaceNarrow ? detailStyles.workspaceNarrow : ""}`}
          >
            {agendaNavOn && (
              <LessonAgendaNav scrollRef={cellRef} lessonId={lesson.id} />
            )}
            <div className={detailStyles.flowWrap}>
              <LessonFlow
                key={lesson.id}
                lessonId={lesson.id}
                modified={lesson.modified}
                chromeless
              />
            </div>
          </div>

          {/* Standards section deliberately omitted here — the planning
              panel's Standards pane (above) is the canonical read surface
              for this lesson's tagged standards. The bottom "My notes"
              section that used to close the body moved into the panel's
              Lesson-notes pane. */}
        </div>
      </div>
    </div>
  );
}

// ── RichEditorWrapper ─────────────────────────────────────────────────────
// Thin shell hosting a RichTextEditor while the lesson title / objective is
// being edited. It owns the two gestures RichTextEditor does not expose as
// props — mirroring WeeklyLessonCard's wrapper of the same name:
//   • Escape           → cancel (discard the draft)
//   • blur out of area → commit (focusout fires when focus leaves BOTH the
//                          editor AND the docked toolbar; the relatedTarget
//                          check distinguishes the two)
//
// The formatting chrome is the sticky RtToolbar at the top of the scroll
// body — OUTSIDE this subtree — so a keyboard focus move into it would
// otherwise look like a blur "out". The role="toolbar" containment check
// keeps the editor open while the teacher operates a formatting button.
// (Pointer presses on the toolbar preventDefault their mousedown and
// never blur the editor at all.)

function RichEditorWrapper({
  onCommit,
  onCancel,
  children,
}: {
  onCommit: () => void;
  onCancel: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      className={detailStyles.richEditorWrap}
      // Commit when focus genuinely leaves this subtree. relatedTarget is the
      // element RECEIVING focus (null = page blur → commit).
      onBlur={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        // 1. Focus stayed within the wrapper subtree — leave the editor open.
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;
        // 2. Focus moved into the floating/docked rich-text toolbar
        //    (role="toolbar") — pressing a toolbar button must not commit.
        if (next?.closest('[role="toolbar"]')) return;
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}
