"use client";

// template-section-editor.tsx — fully-controlled editor for an ordered list
// of lesson-flow template sections.
//
// Each section has a label (the section name, e.g. "I Do") and a prompt
// (the guiding placeholder text teachers will see inside an empty lesson
// section). The editor renders sections as numbered cards with inline inputs,
// move-up/down reorder buttons, and a remove button. A "+ Add section" button
// appends a blank section.
//
// This component is fully controlled: it never holds section data in its own
// state. Every edit calls `onChange` with a rebuilt immutable array.

import type { ReactNode } from "react";
import type { LessonTemplateSection } from "@/lib/lesson-templates";
import { newTemplateSection } from "@/lib/custom-templates";
import { Tooltip } from "@/components/ui";
import styles from "./template-section-editor.module.css";

// ── Props ────────────────────────────────────────────────────────────────

interface TemplateSectionEditorProps {
  sections: LessonTemplateSection[];
  onChange: (next: LessonTemplateSection[]) => void;
}

// ── TemplateSectionEditor ────────────────────────────────────────────────

/** Reusable ordered-list editor for the sections of a lesson-flow template. */
export function TemplateSectionEditor({
  sections,
  onChange,
}: TemplateSectionEditorProps): ReactNode {
  // ── Helpers ─────────────────────────────────────────────────────────

  /** Replace a single section's fields by index. */
  function patchSection(
    index: number,
    patch: Partial<LessonTemplateSection>,
  ): void {
    const next = sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  /** Swap the section at `index` with the one directly above it. */
  function moveUp(index: number): void {
    if (index === 0) return;
    const next = [...sections];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  /** Swap the section at `index` with the one directly below it. */
  function moveDown(index: number): void {
    if (index === sections.length - 1) return;
    const next = [...sections];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  /** Remove the section at `index`. Guard: always keep at least one section. */
  function removeSection(index: number): void {
    if (sections.length <= 1) return;
    onChange(sections.filter((_, i) => i !== index));
  }

  /** Append a fresh blank section. */
  function addSection(): void {
    onChange([...sections, newTemplateSection()]);
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      <ol className={styles.list} aria-label="Template sections">
        {sections.map((section, index) => (
          <li key={section.id} className={styles.card}>
            {/* ── Position indicator ──────────────────────────────── */}
            <div
              className={styles.index}
              aria-label={`Section ${index + 1}`}
              aria-hidden="true"
            >
              {index + 1}
            </div>

            {/* ── Fields ──────────────────────────────────────────── */}
            <div className={styles.fields}>
              {/* Label field */}
              <div className={styles.fieldRow}>
                <label
                  htmlFor={`sec-label-${section.id}`}
                  className={styles.fieldLabel}
                >
                  Section name
                </label>
                <input
                  id={`sec-label-${section.id}`}
                  type="text"
                  className={styles.input}
                  value={section.label}
                  placeholder="e.g. I Do"
                  onChange={(e) =>
                    patchSection(index, { label: e.target.value })
                  }
                />
              </div>

              {/* Prompt field */}
              <div className={styles.fieldRow}>
                <label
                  htmlFor={`sec-prompt-${section.id}`}
                  className={styles.fieldLabel}
                >
                  Guiding prompt
                </label>
                <textarea
                  id={`sec-prompt-${section.id}`}
                  className={styles.textarea}
                  value={section.prompt}
                  placeholder="The placeholder text a teacher sees inside this empty section…"
                  rows={2}
                  onChange={(e) =>
                    patchSection(index, { prompt: e.target.value })
                  }
                />
              </div>
            </div>

            {/* ── Controls: reorder + remove ──────────────────────── */}
            <div
              className={styles.controls}
              role="group"
              aria-label={`Controls for section ${index + 1}`}
            >
              <Tooltip content="Move up" side="top">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  aria-label={`Move section ${index + 1} up`}
                >
                  <ArrowUpIcon />
                </button>
              </Tooltip>
              <Tooltip content="Move down" side="top">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => moveDown(index)}
                  disabled={index === sections.length - 1}
                  aria-label={`Move section ${index + 1} down`}
                >
                  <ArrowDownIcon />
                </button>
              </Tooltip>
              <Tooltip content="Remove section" side="top">
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.removeBtn}`}
                  onClick={() => removeSection(index)}
                  disabled={sections.length <= 1}
                  aria-label={`Remove section ${index + 1}`}
                >
                  <RemoveIcon />
                </button>
              </Tooltip>
            </div>
          </li>
        ))}
      </ol>

      {/* ── Add section ─────────────────────────────────────────────── */}
      <button type="button" className={styles.addBtn} onClick={addSection}>
        <AddIcon />
        Add section
      </button>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// Inline SVG, aria-hidden, consistent 16×16 viewBox.

function ArrowUpIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ArrowDownIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RemoveIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AddIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
