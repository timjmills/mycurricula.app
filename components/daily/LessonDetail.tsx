"use client";

// LessonDetail.tsx — Right pane: full lesson detail for a selected lesson.
//
// LAYOUT (REVISED 2026-05-20 per Plugin Directions §1 + §2) — the daily-view
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
//   • Title, "I CAN" line, action row, lesson flow, standards, and notes
//     all line up to the same 32px left gutter.
//   • The "+ Add section" + "Edit lesson flow / template" controls live
//     inside <LessonFlow> and remain centered (the only centered
//     controls per the spec).
//
// Action row (spec §5 retained):
//   LEFT  → [☐ Mark done] (cycle button) + [🔖 Add status] (stub).
//   RIGHT → [📤 Lesson notes] button that SCROLLS the "My notes"
//           section into view. Print + overflow are NO LONGER here —
//           they now live in the header band's right region per §1.
//
// DOUBLE-CLICK-TO-EDIT (preserved). The lesson TITLE and the "I CAN"
// OBJECTIVE render as static text and swap to a RichTextEditor only on
// double-click (or Enter / F2 on the focused text). Commits on blur,
// cancels on Escape via RichEditorWrapper — the WeeklyLessonCard pattern.
// <LessonFlow> owns the section headings + bodies.
//
// The `cp-subj ${subj.cls}` wrapper is KEPT so the --c / --cl / --cd
// custom-property cascade flows into the header band, the action row,
// the section headings, and <LessonFlow>. The band uses `--cl` (light
// tint) as a flat fill and `--cd` (deep ink) for text/icons — never a
// hard-coded color. The only color introduced is per-subject through
// the cascade.
//
// DOCKED RICH-TEXT TOOLBAR (consume only). A sibling agent docks the
// RichTextEditor toolbar at bottom-center of a target element. This file
// owns the target: `cellRef` is attached to the scrollable detail body
// region (the "cell" that hosts the title, objective, action row, lesson
// flow + notes). It is passed to <LessonFlow dockTarget={cellRef} /> and
// to the notes RichTextEditor's `dockTarget` prop.
//
// Store wiring (planner-store):
//   sections  — managed inside <LessonFlow> via usePlanner(); never local.
//   title     — written via editLesson with coalesce.
//   objective — written via editLesson with coalesce; the editor edits
//               only the trailing text WITHOUT the "I can" prefix, which
//               is re-attached on commit.
//   notes     — written via editLesson with coalesce.
//   completion— cycleStatus() calls onToggleComplete (never forks).
// UI-only state (editingField, draftValue) stays local — not persisted.

import { useState, useEffect, useRef } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import type { Lesson } from "@/lib/types";
import { SUBJECT_BY_ID, describeStandard, lessonTime } from "@/lib/mock";
import { LessonFlow } from "@/components/lesson-flow";
import { RichTextEditor } from "@/components/rich-text";
import { usePlanner } from "@/lib/planner-store";
import detailStyles from "./lesson-detail.module.css";

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
  const subj = SUBJECT_BY_ID[lesson.subject];

  // ── Store — notes editing ────────────────────────────────────────────
  // Notes are written through editLesson with coalescing so a typing burst
  // produces one history step. Sections are managed by LessonFlow directly.
  // Completion is routed through onToggleComplete → DailyView, which calls
  // setLessonStatus — keeping a single dispatch path per UI action.
  const { editLesson } = usePlanner();

  // ── Docked-toolbar target ref ────────────────────────────────────────
  // cellRef is attached to the scrollable detail body region — the "cell"
  // hosting the lesson flow + notes. The docked RichTextEditor toolbar
  // centers itself on this element and pins near its bottom edge. We
  // forward the ref to <LessonFlow dockTarget={cellRef}> and to the notes
  // RichTextEditor.
  const cellRef = useRef<HTMLDivElement | null>(null);

  // ── "My notes" scroll target ─────────────────────────────────────────
  // The action-row "Lesson notes" button scrolls this section into view
  // so a teacher reading the lesson plan can jump straight to their
  // personal notes without manually scrolling. The notes section stays
  // where it is in the document; this is a navigation affordance, not a
  // popover.
  const notesRef = useRef<HTMLDivElement | null>(null);

  function scrollToNotes(): void {
    const el = notesRef.current;
    if (!el) return;
    // smooth scroll into view — block: 'start' lines the section heading up
    // near the top of the scroll container so the editor below is visible.
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Move focus into the notes editor so a keyboard user lands ready to
    // type. The notes RichTextEditor exposes a [contenteditable] element;
    // querying inside the section is sufficient and avoids coupling refs.
    const editable = el.querySelector<HTMLElement>('[contenteditable="true"]');
    // Defer focus by a tick so the smooth-scroll animation can begin first
    // (focusing immediately would jump-scroll on some browsers).
    if (editable) {
      window.setTimeout(() => editable.focus(), 80);
    }
  }

  // ── Teacher notes — derived from store lesson; displayed in local editor.
  // notesHtml is kept in local state so the RichTextEditor can drive it
  // synchronously; on each onChange we immediately coalesce-commit to store.
  // The notes section is ALWAYS visible — there is no hover-to-reveal blur.
  const [notesHtml, setNotesHtml] = useState<string>(lesson.notes ?? "");

  // Track whether the notes editor is currently focused so external store
  // updates (undo/redo, other views) don't overwrite mid-edit content.
  const notesEditingRef = useRef(false);

  // When the selected lesson changes, seed the notes editor from the new
  // lesson's notes field. Sections are store-managed and automatically
  // reflect the new lessonId without local reset.
  useEffect(() => {
    setNotesHtml(lesson.notes ?? "");
    notesEditingRef.current = false;
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the store's notes value changes (e.g. undo/redo from another view)
  // while this lesson is still selected, reseed the editor — but only if
  // the teacher is not actively typing (guard against overwriting mid-edit).
  const storeNotes = lesson.notes ?? "";
  useEffect(() => {
    if (!notesEditingRef.current) {
      setNotesHtml(storeNotes);
    }
  }, [storeNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit notes to the store on every editor change with coalescing so a
  // continuous typing burst collapses to one undo step.
  function handleNotesChange(html: string): void {
    notesEditingRef.current = true; // teacher is actively typing
    setNotesHtml(html);
    editLesson(
      lesson.id,
      { notes: html },
      { key: `lesson:${lesson.id}:notes`, ts: Date.now() },
    );
  }

  // When the notes editor loses focus, clear the editing guard so that
  // subsequent undo/redo can reseed the editor to the authoritative store
  // value.
  function handleNotesBlur(): void {
    notesEditingRef.current = false;
  }

  // ── Double-click-to-edit: title + "I can" objective ──────────────────
  // Only ONE of the two editors can be open at a time. Pure local UI
  // state; the draft is committed to the store on blur via editLesson
  // (coalesced). Title/objective commit straight through editLesson with
  // no Personal/Master dialog — deliberate parity with the "My notes"
  // editor in the Daily view.
  type EditableField = "title" | "objective";
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");

  // The objective is stored WITH an "I can" prefix; the band label already
  // says "I CAN", so the editor edits only the trailing text. This strips
  // the prefix for editing; it is re-attached on commit.
  const objectiveBody = (lesson.objective ?? "").replace(/^I can\s+/i, "");

  // A new lesson resets any open title/objective editor so a stale draft
  // can never bleed into the freshly-selected lesson.
  useEffect(() => {
    setEditingField(null);
    setDraftValue("");
  }, [lesson.id]);

  // Open a field's editor, seeding the draft from the lesson's current
  // value. The double-click / Enter event is stopped so it never bubbles.
  function openEditor(field: EditableField, e?: SyntheticEvent): void {
    e?.stopPropagation();
    e?.preventDefault();
    setEditingField(field);
    setDraftValue(field === "title" ? lesson.title : objectiveBody);
  }

  // Commit the open editor's draft through editLesson with a coalesce key
  // (typing burst = one undo step), mirroring handleNotesChange. A no-op
  // when nothing changed. The objective re-gains its "I can " prefix so the
  // stored shape is unchanged.
  function commitEdit(): void {
    if (!editingField) return;
    const trimmed = draftValue.trim();
    if (editingField === "title") {
      if (trimmed !== (lesson.title ?? "")) {
        editLesson(
          lesson.id,
          { title: trimmed },
          { key: `lesson:${lesson.id}:title`, ts: Date.now() },
        );
      }
    } else {
      // Re-attach the "I can " prefix unless the field was cleared entirely.
      const nextObjective = trimmed ? `I can ${trimmed}` : "";
      if (nextObjective !== (lesson.objective ?? "")) {
        editLesson(
          lesson.id,
          { objective: nextObjective },
          { key: `lesson:${lesson.id}:objective`, ts: Date.now() },
        );
      }
    }
    setEditingField(null);
    setDraftValue("");
  }

  // Cancel the open editor without saving — discards the draft.
  function cancelEdit(): void {
    setEditingField(null);
    setDraftValue("");
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
        <p className={detailStyles.bandTitle} title={lesson.title}>
          {lesson.title}
        </p>

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
            <button
              type="button"
              className={detailStyles.bandIconBtn}
              aria-label="More options"
              aria-haspopup="menu"
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
            </button>
            <button
              type="button"
              className={detailStyles.bandIconBtn}
              aria-label="Expand to full screen"
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
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable body / the "cell" region (cellRef target) ────────
          cellRef is attached HERE — the element the docked rich-text
          toolbar centers itself on. It hosts the title, objective, action
          row, lesson flow, standards, and notes. The inner `.column` is
          now LEFT-ALIGNED to a 32px gutter (spec §2), not centered. */}
      <div className={detailStyles.body} ref={cellRef}>
        <div className={detailStyles.column}>
          {/* ── Title — hero ───────────────────────────────────────────
              Double-click-to-edit (or Enter / F2 on the focused text).
              Commits on blur, cancels on Escape — the WeeklyLessonCard
              pattern. The header band carries the SUBJECT hero above;
              this is the lesson NAME hero, sitting on the white body. */}
          <h2 className={detailStyles.title}>
            {editingField === "title" ? (
              <RichEditorWrapper onCommit={commitEdit} onCancel={cancelEdit}>
                <RichTextEditor
                  value={draftValue}
                  onChange={setDraftValue}
                  autoFocus
                  singleLine
                  placeholder="Lesson title…"
                  ariaLabel="Edit lesson title"
                  dockTarget={cellRef}
                />
              </RichEditorWrapper>
            ) : (
              <span
                className={detailStyles.editableText}
                tabIndex={0}
                role="button"
                aria-label="Edit lesson title"
                onDoubleClick={(e) => openEditor("title", e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "F2")
                    openEditor("title", e);
                }}
                title="Double-click or press Enter to edit"
              >
                {lesson.title}
              </span>
            )}
          </h2>

          {/* ── "I Can" objective — quiet single line, no box ──────────
              Double-click-to-edit, like the title. The editor edits only
              the trailing objective text — the "I CAN" label supplies
              the prefix, which commitEdit re-attaches. Always rendered
              (even when empty) so a teacher can add an objective to a
              lesson that lacks one. Kept per spec §5. */}
          <p className={detailStyles.objective}>
            <span className={detailStyles.objectiveLabel}>I can</span>
            {editingField === "objective" ? (
              <RichEditorWrapper onCommit={commitEdit} onCancel={cancelEdit}>
                <RichTextEditor
                  value={draftValue}
                  onChange={setDraftValue}
                  autoFocus
                  singleLine
                  placeholder="state the lesson objective…"
                  ariaLabel="Edit lesson objective"
                  dockTarget={cellRef}
                />
              </RichEditorWrapper>
            ) : (
              <span
                className={`${detailStyles.objectiveText} ${detailStyles.editableText} ${
                  objectiveBody ? "" : detailStyles.objectiveEmpty
                }`}
                tabIndex={0}
                role="button"
                aria-label="Edit lesson objective"
                onDoubleClick={(e) => openEditor("objective", e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "F2")
                    openEditor("objective", e);
                }}
                title="Double-click or press Enter to edit"
              >
                {objectiveBody || "Add a lesson objective"}
              </span>
            )}
          </p>

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
              <button
                type="button"
                className={`${detailStyles.markDone} ${
                  lesson.status === "done" ? detailStyles.markDoneDone : ""
                }`}
                onClick={cycleStatus}
                aria-label={
                  lesson.status === "done" ? "Mark as not done" : "Mark as done"
                }
              >
                <StatusCheckbox status={lesson.status} size={16} />
                {lesson.status === "done" ? "Done" : "Mark done"}
              </button>
              {/* Add status — stub for a future status submenu (urgent /
                  important / fyi / catch-up tags). */}
              <button
                type="button"
                className={detailStyles.actionBtn}
                aria-label="Add status"
                aria-haspopup="menu"
              >
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
                Add status
              </button>
            </div>
            <div className={detailStyles.actionRight}>
              {/* Lesson notes — scrolls the My-notes section into view and
                  focuses the editor. The section itself stays where it is
                  in the document; this is a jump-link, not a popover.
                  Styled as a quieter trailing link (no border) per spec
                  §5's "Lesson notes link on the far right". */}
              <button
                type="button"
                className={detailStyles.notesLink}
                onClick={scrollToNotes}
                aria-label="Jump to lesson notes"
              >
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
                Lesson notes
              </button>
            </div>
          </div>

          {/* ── Lesson Flow — structured section editor ─────────────────
              Sits directly on the white body — no bordered/shaded box,
              just normal vertical breathing room. The other agent owns
              the lesson flow internals (sections + per-section
              resources); this wrapper just gives the flow its place in
              the column. key resets dnd drag state when the selected
              lesson changes. modified drives the fork stripe (dashed
              when personally modified). dockTarget threads the docked-
              toolbar ref through to every section editor. */}
          <div className={detailStyles.flowWrap}>
            <LessonFlow
              key={lesson.id}
              lessonId={lesson.id}
              modified={lesson.modified}
              dockTarget={cellRef}
            />
          </div>

          {/* ── Standards — inline code-chip rows on white ──────────────
              The standards a lesson covers; only rendered when the
              lesson carries any. */}
          {lesson.standards.length > 0 && (
            <section className={detailStyles.section}>
              <h3 className={detailStyles.sectionHead}>
                Standards
                <span className={detailStyles.sectionCount}>
                  {lesson.standards.length}
                </span>
              </h3>
              <div className={detailStyles.standardsList}>
                {lesson.standards.map((code) => (
                  <div key={code} className={detailStyles.standardItem}>
                    <span className={`${detailStyles.standardCode} cp-mono`}>
                      {code}
                    </span>
                    <span className={detailStyles.standardDesc}>
                      {describeStandard(code)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── My notes — always-visible editable rich text ────────────
              Always rendered (not gated on lesson.notes) so teachers can
              add notes to any lesson. There is no hover-to-reveal blur.
              `notesRef` is the scroll target for the action-row "Lesson
              notes" button above. */}
          <section
            className={detailStyles.section}
            onBlurCapture={handleNotesBlur}
            ref={notesRef}
          >
            <h3 className={detailStyles.sectionHead}>My notes</h3>
            <div className={detailStyles.notesWrap}>
              <RichTextEditor
                value={notesHtml}
                onChange={handleNotesChange}
                placeholder="Add private notes for yourself…"
                ariaLabel="Teacher notes"
                dockTarget={cellRef}
              />
            </div>
          </section>
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
// The RichTextEditor's toolbar is docked (position:fixed, portaled out of
// this subtree under `.cp-root`), so a focus move INTO the toolbar would
// otherwise look like a blur "out" — the role="toolbar" containment check
// keeps the editor open while the teacher clicks a formatting button.

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
