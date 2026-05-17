"use client";

// LessonDetail.tsx — Right pane: full lesson detail for a selected lesson.
//
// Shown when a lesson is selected in the Daily view's left pane. Displays
// title, "I Can" objective, collapsible directions, hover-revealed teacher
// notes, a resource list, and the standards block with inline descriptions.
//
// Subject color is injected via cp-subj + subjectId class so the CSS
// variable cascade (--c / --cl / --cd) flows through every token reference
// without prop drilling.

import { useState } from "react";
import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";
import { SUBJECT_BY_ID, UNITS, describeStandard } from "@/lib/mock";
import styles from "./DailyView.module.css";

// ── Small inline icon set ────────────────────────────────────────────────
// SVG micro-icons used only within this panel — no dependency on lesson-card
// icons to keep the component self-contained. Paths are simplified geometric
// forms matching the artboard's style.

function ChevronIcon({ open }: { open: boolean }): ReactNode {
  return (
    <span
      className={`${styles.chevronIcon} ${open ? styles.chevronOpen : ""}`}
      aria-hidden="true"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M3 2l4 3-4 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

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
        stroke="var(--ink-300)"
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
  const unit = UNITS[lesson.subject];

  // Collapsible directions — open by default.
  const [dirOpen, setDirOpen] = useState(true);
  // Notes hover-reveal: the teacher's private notes are blurred until hover.
  const [notesHovered, setNotesHovered] = useState(false);

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

  return (
    <div
      className={`${styles.detailRoot} cp-subj ${subj.cls}`}
      role="region"
      aria-label={`Lesson detail: ${lesson.title}`}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className={styles.detailHeader}>
        {/* Eyebrow: subject dot · subject name · unit name */}
        <div className={styles.detailEyebrow}>
          <span className={styles.detailColorDot} aria-hidden="true" />
          {subj.name}
          <span className={styles.detailSep} aria-hidden="true">
            ·
          </span>
          <span className={styles.detailUnitName}>{unit.name}</span>
          {lesson.isPersonal && (
            <>
              <span className={styles.detailSep} aria-hidden="true">
                ·
              </span>
              <span
                style={{
                  color: "var(--ink-700)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 400,
                }}
              >
                Personal
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h2 className={styles.detailTitle}>{lesson.title}</h2>

        {/* "I Can" objective block */}
        {lesson.objective && (
          <div className={styles.detailObjective}>
            <span className={styles.detailObjectiveBadge}>I can</span>
            <span className={styles.detailObjectiveText}>
              {lesson.objective.replace(/^I can\s+/i, "")}
            </span>
          </div>
        )}

        {/* Completion actions */}
        <div className={styles.detailActions}>
          <button
            className={`${styles.detailActionBtn} ${lesson.status === "done" ? styles.detailActionBtnDone : ""}`}
            onClick={cycleStatus}
            aria-label={
              lesson.status === "done" ? "Mark as not done" : "Mark as done"
            }
          >
            <StatusCheckbox status={lesson.status} size={14} />
            {lesson.status === "done" ? "Done" : "Mark done"}
          </button>
          <button className={styles.detailActionBtn} aria-label="Change status">
            {/* Dots icon */}
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
          <button className={styles.detailActionIcon} aria-label="Print lesson">
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
          <button className={styles.detailActionIcon} aria-label="More options">
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

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div className={styles.detailBody}>
        {/* Directions — collapsible */}
        <section className={styles.detailSection}>
          <button
            className={`${styles.detailSectionHead} ${styles.detailSectionHeadBtn}`}
            onClick={() => setDirOpen((o) => !o)}
            aria-expanded={dirOpen}
          >
            <ChevronIcon open={dirOpen} />
            Directions
          </button>
          {dirOpen && (
            <div className={styles.detailDirections}>{lesson.directions}</div>
          )}
        </section>

        {/* Notes — hover reveal */}
        {lesson.notes && (
          <section
            className={styles.detailSection}
            onMouseEnter={() => setNotesHovered(true)}
            onMouseLeave={() => setNotesHovered(false)}
          >
            <div className={styles.detailSectionHead}>
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
              <span
                style={{
                  color: "var(--ink-300)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 400,
                }}
              >
                (hover to reveal)
              </span>
            </div>
            <div
              className={`${styles.detailNotes} ${notesHovered ? styles.detailNotesVisible : styles.detailNotesHidden}`}
              aria-label="Teacher notes"
            >
              {lesson.notes}
            </div>
          </section>
        )}

        {/* Resources */}
        {lesson.resources.length > 0 && (
          <section className={styles.detailSection}>
            <div className={styles.detailSectionHead}>
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
            <div>
              {lesson.resources.map((r, i) => (
                <div key={i} className={styles.resourceItem} role="listitem">
                  <span
                    className={styles.resourceIcon}
                    style={{
                      background: `color-mix(in oklch, ${RESOURCE_COLORS[r.type] ?? "var(--ink-300)"} 15%, var(--ink-50))`,
                      color: RESOURCE_COLORS[r.type] ?? "var(--ink-500)",
                    }}
                    aria-hidden="true"
                  >
                    <ResourceTypeIcon type={r.type} />
                  </span>
                  <span style={{ flex: 1, fontSize: "var(--t-12)" }}>
                    {r.label}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--t-11)",
                      color: RESOURCE_COLORS[r.type] ?? "var(--ink-400)",
                      fontWeight: 500,
                    }}
                  >
                    {r.type}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Standards */}
        {lesson.standards.length > 0 && (
          <section className={styles.detailSection}>
            <div className={styles.detailSectionHead}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lesson.standards.map((code) => (
                <div
                  key={code}
                  className={`${styles.standardItem} cp-subj ${lesson.subject}`}
                >
                  <span className={`${styles.standardCode} cp-mono`}>
                    {code}
                  </span>
                  <span className={styles.standardDesc}>
                    {describeStandard(code)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
