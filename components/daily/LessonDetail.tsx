"use client";

// LessonDetail.tsx — Right pane: full lesson detail for a selected lesson.
//
// Redesigned as one cohesive tinted block — the entire surface is tinted in
// the lesson's subject color (--cl), with a stronger-tinted header band at
// the top carrying subject · time · title, the "I Can" objective just below,
// and the lesson sections (via <LessonFlow>) flowing as the body. Notes,
// resources, and standards are styled as belonging to the same tinted surface
// rather than separate floating boxes.
//
// Subject color is injected via `cp-subj ${subj.cls}` so the CSS variable
// cascade (--c / --cl / --cd) flows through every token reference without
// prop drilling.
//
// Section and notes state: per-session local state keyed by lesson.id — a
// clean slate is re-instantiated when the selected lesson changes. Persistence
// arrives with the Supabase backend.

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { SUBJECT_BY_ID, UNITS, describeStandard, lessonTime } from "@/lib/mock";
import { LessonFlow } from "@/components/lesson-flow";
import { RichTextEditor } from "@/components/rich-text";
import { instantiateSections, newLessonSection } from "@/lib/lesson-flow";
import type { LessonSectionContent } from "@/lib/lesson-flow";
import {
  LESSON_TEMPLATE_BY_ID,
  DEFAULT_LESSON_TEMPLATE_ID,
} from "@/lib/lesson-templates";
import detailStyles from "./lesson-detail.module.css";

// ── Small inline icon set ────────────────────────────────────────────────
// SVG micro-icons used only within this panel — no dependency on lesson-card
// icons to keep the component self-contained. Paths are simplified geometric
// forms matching the artboard's style.

function ResourceTypeIcon({ type }: { type: string }): ReactNode {
  // A minimal icon per resource type — enough to differentiate at a glance.
  const fill = "currentColor";
  switch (type) {
    case "slides":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill={fill}>
          <rect
            x="1"
            y="2"
            width="12"
            height="9"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
          <rect x="6" y="11" width="2" height="1.5" fill="currentColor" />
          <rect
            x="4"
            y="12.5"
            width="6"
            height="1"
            rx="0.5"
            fill="currentColor"
          />
        </svg>
      );
    case "pdf":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill={fill}>
          <rect
            x="2"
            y="1"
            width="8"
            height="12"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
          <path
            d="M8 1v3h3"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
          <rect x="4" y="6" width="5" height="1" rx="0.5" fill="currentColor" />
          <rect
            x="4"
            y="8.5"
            width="3.5"
            height="1"
            rx="0.5"
            fill="currentColor"
          />
        </svg>
      );
    case "youtube":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill={fill}>
          <rect
            x="1"
            y="2.5"
            width="12"
            height="9"
            rx="2"
            fill="currentColor"
            opacity="0.15"
          />
          <path d="M6 5.2l3.5 1.8L6 8.8V5.2z" fill="currentColor" />
        </svg>
      );
    case "doc":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill={fill}>
          <rect
            x="2"
            y="1"
            width="10"
            height="12"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
          />
          <rect x="4" y="5" width="6" height="1" rx="0.5" fill="currentColor" />
          <rect
            x="4"
            y="7"
            width="4.5"
            height="1"
            rx="0.5"
            fill="currentColor"
          />
          <rect
            x="4"
            y="9"
            width="5.5"
            height="1"
            rx="0.5"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle
            cx="7"
            cy="7"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M7 5a1.5 1.5 0 011 2.6V9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle cx="7" cy="10.5" r="0.7" fill="currentColor" />
        </svg>
      );
  }
}

// ── Resource type label colors — maps type to token color ────────────────
const RESOURCE_COLORS: Record<string, string> = {
  slides: "var(--tag-amber)",
  pdf: "var(--tag-red)",
  doc: "var(--tag-blue)",
  youtube: "var(--tag-red)",
  image: "var(--tag-green)",
  website: "var(--tag-teal)",
  link: "var(--tag-gray)",
};

// ── Completion checkbox (status-aware) ───────────────────────────────────

function StatusCheckbox({
  status,
  size = 14,
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
        aria-label="Done"
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
        aria-label="Partial"
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
      aria-label="Not done"
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

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build the initial sections array from the default lesson-flow template.
 *  Guards the lookup so a missing or misconfigured template id never crashes
 *  the render — in that case we start with a single blank section. */
function buildInitialSections(): LessonSectionContent[] {
  const template = LESSON_TEMPLATE_BY_ID[DEFAULT_LESSON_TEMPLATE_ID];
  if (!template) {
    // Defensive fallback: template registry misconfigured — start blank.
    return [
      {
        id: `lsec-fallback-${Date.now().toString(36)}`,
        templateSectionId: null,
        heading: "Lesson plan",
        prompt: "Describe your lesson plan here…",
        body: "",
        resources: [],
      },
    ];
  }
  return instantiateSections(template) as LessonSectionContent[];
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
  // Guard the UNITS lookup so a missing entry can't crash the render.
  const unit = UNITS[lesson.subject] ?? {
    name: "—",
    id: "",
    subject: lesson.subject,
    weeks: "",
    shade: 1,
  };

  // ── Lesson-flow sections — local state, re-instantiated on lesson change.
  // Section content is per-session only; Supabase persistence comes later.
  const [sections, setSections] =
    useState<LessonSectionContent[]>(buildInitialSections);

  // ── Teacher notes — editable rich text, seeded from lesson.notes.
  const [notesHtml, setNotesHtml] = useState<string>(lesson.notes ?? "");

  // Notes hover-reveal: the editor is blurred until hover or focus enters.
  // Declared before the lesson-change effect so the setter is unambiguously
  // in scope when the effect fires.
  const [notesHovered, setNotesHovered] = useState(false);

  // Re-instantiate both section state and notes when the selected lesson
  // changes. Keying on lesson.id ensures a clean slate for each lesson.
  // Reset notesHovered so the new lesson always starts with notes hidden.
  useEffect(() => {
    setSections(buildInitialSections());
    setNotesHtml(lesson.notes ?? "");
    setNotesHovered(false);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle: not_done → done → partial → not_done
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
      {/* ── Header band ────────────────────────────────────────────────
          Stronger subject-tint strip at the top: subject · time · title.
          The "I Can" objective sits in a softer inset just below. */}
      <div className={detailStyles.headerBand}>
        {/* Eyebrow row: color chip · subject name · separator · time */}
        <div className={detailStyles.eyebrow}>
          <span className={detailStyles.eyebrowDot} aria-hidden="true" />
          <span className={detailStyles.eyebrowSubject}>{subj.name}</span>
          {lesson.isPersonal && (
            <span className={detailStyles.eyebrowPersonal}>Personal</span>
          )}
          <span className={detailStyles.eyebrowSep} aria-hidden="true">
            ·
          </span>
          {/* Clock icon */}
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            aria-hidden="true"
            className={detailStyles.eyebrowClockIcon}
          >
            <circle
              cx="5.5"
              cy="5.5"
              r="4.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M5.5 3v2.5l1.8 1.1"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={detailStyles.eyebrowTime}>{timeLabel}</span>
          <span className={detailStyles.eyebrowSep} aria-hidden="true">
            ·
          </span>
          <span className={detailStyles.eyebrowUnit}>{unit.name}</span>
        </div>

        {/* Lesson title */}
        <h2 className={detailStyles.title}>{lesson.title}</h2>

        {/* "I Can" objective — inset below the title in the header band */}
        {lesson.objective && (
          <div className={detailStyles.objective}>
            <span className={detailStyles.objectiveBadge}>I can</span>
            <span className={detailStyles.objectiveText}>
              {lesson.objective.replace(/^I can\s+/i, "")}
            </span>
          </div>
        )}

        {/* Action bar — completion controls + utility icons */}
        <div className={detailStyles.actions}>
          <button
            type="button"
            className={`${detailStyles.actionBtn} ${lesson.status === "done" ? detailStyles.actionBtnDone : ""}`}
            onClick={cycleStatus}
            aria-label={
              lesson.status === "done" ? "Mark as not done" : "Mark as done"
            }
          >
            <StatusCheckbox status={lesson.status} size={14} />
            {lesson.status === "done" ? "Done" : "Mark done"}
          </button>
          <button
            type="button"
            className={detailStyles.actionBtn}
            aria-label="Change status"
          >
            {/* Three-dots icon */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="2" cy="6" r="1.3" />
              <circle cx="6" cy="6" r="1.3" />
              <circle cx="10" cy="6" r="1.3" />
            </svg>
            Status
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className={detailStyles.actionIcon}
            aria-label="Print lesson"
          >
            {/* Printer icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="1"
                width="10"
                height="7"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <rect
                x="3.5"
                y="9"
                width="7"
                height="4"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <rect
                x="5"
                y="5.5"
                width="2"
                height="1"
                rx="0.5"
                fill="currentColor"
              />
            </svg>
          </button>
          <button
            type="button"
            className={detailStyles.actionIcon}
            aria-label="More options"
          >
            {/* Vertical three-dots icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="7" cy="2.5" r="1.3" />
              <circle cx="7" cy="7" r="1.3" />
              <circle cx="7" cy="11.5" r="1.3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────
          All sections sit on the tinted surface — no inner box borders.
          Each named section has a small uppercase label above its content. */}
      <div className={detailStyles.body}>
        {/* ── Lesson Flow — structured section editor ──────────────── */}
        {/* Sections from the default template, re-instantiated per lesson.
            The key prop ensures LessonFlow's drag state also resets. */}
        <section className={detailStyles.section} aria-label="Lesson flow">
          <div className={detailStyles.sectionHead}>
            {/* Flow icon */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="0.75"
                y="0.75"
                width="9.5"
                height="3"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="0.75"
                y="7.25"
                width="9.5"
                height="3"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <line
                x1="5.5"
                y1="3.75"
                x2="5.5"
                y2="7.25"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            Lesson Flow
          </div>
          <div className={detailStyles.flowWrap}>
            <LessonFlow
              key={lesson.id}
              sections={sections}
              onChange={setSections}
            />
          </div>
        </section>

        {/* ── Teacher Notes — editable rich text, hover-revealed ──── */}
        {/* Always rendered (not gated on lesson.notes) so teachers can
            add notes to any lesson. Blur-on-idle preserves privacy UX. */}
        <section
          className={detailStyles.section}
          onMouseEnter={() => setNotesHovered(true)}
          onMouseLeave={() => setNotesHovered(false)}
          onFocusCapture={() => setNotesHovered(true)}
          onBlurCapture={() => setNotesHovered(false)}
        >
          <div className={detailStyles.sectionHead}>
            {/* Eye icon */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              aria-hidden="true"
            >
              <ellipse
                cx="5.5"
                cy="5.5"
                rx="5"
                ry="3.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="5.5" cy="5.5" r="1.8" fill="currentColor" />
            </svg>
            My notes
            <span className={detailStyles.sectionHeadHint}>
              (hover to reveal)
            </span>
          </div>
          <div
            className={`${detailStyles.notesWrap} ${
              notesHovered
                ? detailStyles.notesVisible
                : detailStyles.notesHidden
            }`}
          >
            <RichTextEditor
              value={notesHtml}
              onChange={setNotesHtml}
              placeholder="Add private notes for yourself…"
              ariaLabel="Teacher notes"
            />
          </div>
        </section>

        {/* ── Resources ───────────────────────────────────────────── */}
        {lesson.resources.length > 0 && (
          <section className={detailStyles.section}>
            <div className={detailStyles.sectionHead}>
              {/* Paperclip icon */}
              <svg
                width="11"
                height="11"
                viewBox="0 0 11 11"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 5L5.5 8.5a2.5 2.5 0 01-3.5-3.5l4-4a1.5 1.5 0 012 2L4 6.5a.5.5 0 01-.7-.7L6.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Resources · {lesson.resources.length}
            </div>
            <div className={detailStyles.resourceList} role="list">
              {lesson.resources.map((r, i) => (
                <div
                  key={i}
                  className={detailStyles.resourceItem}
                  role="listitem"
                  tabIndex={0}
                >
                  <span
                    className={detailStyles.resourceIcon}
                    style={{
                      background: `color-mix(in oklch, ${RESOURCE_COLORS[r.type] ?? "var(--ink-300)"} 15%, var(--paper))`,
                      color: RESOURCE_COLORS[r.type] ?? "var(--ink-500)",
                    }}
                    aria-hidden="true"
                  >
                    <ResourceTypeIcon type={r.type} />
                  </span>
                  <span className={detailStyles.resourceLabel}>{r.label}</span>
                  <span
                    className={detailStyles.resourceType}
                    style={{
                      color: RESOURCE_COLORS[r.type] ?? "var(--ink-400)",
                    }}
                  >
                    {r.type}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Standards ───────────────────────────────────────────── */}
        {lesson.standards.length > 0 && (
          <section className={detailStyles.section}>
            <div className={detailStyles.sectionHead}>
              {/* Standards badge icon */}
              <svg
                width="11"
                height="11"
                viewBox="0 0 11 11"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="0.75"
                  y="0.75"
                  width="9.5"
                  height="9.5"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="2.5"
                  y="3.5"
                  width="6"
                  height="1"
                  rx="0.5"
                  fill="currentColor"
                />
                <rect
                  x="2.5"
                  y="6"
                  width="4"
                  height="1"
                  rx="0.5"
                  fill="currentColor"
                />
              </svg>
              Standards · {lesson.standards.length}
            </div>
            <div className={detailStyles.standardsList}>
              {lesson.standards.map((code) => (
                <div
                  key={code}
                  className={`${detailStyles.standardItem} cp-subj ${lesson.subject}`}
                >
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

        {/* ── Footer affordance row ────────────────────────────────── */}
        {/* Padlet-style "+ Add section" / "Edit Template" buttons live at
            the bottom of the tinted surface, visually closing the block. */}
        <div className={detailStyles.footer}>
          <button
            type="button"
            className={detailStyles.footerBtn}
            onClick={() => setSections((prev) => [...prev, newLessonSection()])}
            aria-label="Add a new lesson section"
          >
            {/* Plus icon */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              aria-hidden="true"
            >
              <line
                x1="5.5"
                y1="1"
                x2="5.5"
                y2="10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <line
                x1="1"
                y1="5.5"
                x2="10"
                y2="5.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            Add section
          </button>
          <button type="button" className={detailStyles.footerBtn}>
            {/* Template / grid icon */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="0.75"
                y="0.75"
                width="4"
                height="4"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="6.25"
                y="0.75"
                width="4"
                height="4"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="0.75"
                y="6.25"
                width="4"
                height="4"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="6.25"
                y="6.25"
                width="4"
                height="4"
                rx="0.8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            Edit Template
          </button>
        </div>
      </div>
    </div>
  );
}
