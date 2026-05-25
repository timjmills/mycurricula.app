"use client";

// lesson-template-step.tsx — onboarding wizard step 6: pick a default
// lesson-flow template.
//
// Shows all 15 built-in templates as a selectable gallery (2-column
// responsive grid). Each card shows the template name, an optional
// "Recommended" badge, the description, an ordered list of section-label
// chips, and the fit line. Clicking a card selects it and writes the id to
// onboarding state. Each card also has an expandable "Preview sections"
// panel that shows every section's label and guiding prompt.

import { useState } from "react";
import type { ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import { LESSON_TEMPLATES, type LessonTemplate } from "@/lib/lesson-templates";
import { Badge, Chip, Button } from "@/components/ui";
import styles from "./lesson-template-step.module.css";

// ── LessonTemplateStep ───────────────────────────────────────────────────

/** Onboarding step: choose the account-wide default lesson-flow template. */
export function LessonTemplateStep(): ReactNode {
  const { data, update } = useOnboarding();
  const selected = data.defaultTemplateId;

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>How do you structure a lesson?</h1>
      <p className={styles.helper}>
        Pick a default lesson flow. Every new lesson in an academic subject
        starts from it — you can change it per subject or per lesson later.
      </p>

      <div
        className={styles.gallery}
        role="radiogroup"
        aria-label="Lesson template"
      >
        {LESSON_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={selected === template.id}
            onSelect={() => update({ defaultTemplateId: template.id })}
          />
        ))}
      </div>
    </div>
  );
}

// ── TemplateCard ─────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: LessonTemplate;
  selected: boolean;
  onSelect: () => void;
}

/** A single selectable template card with an expandable section preview. */
function TemplateCard({
  template,
  selected,
  onSelect,
}: TemplateCardProps): ReactNode {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewId = `preview-${template.id}`;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    // Only activate selection when the card div itself (not a child button)
    // receives the keypress — prevents the preview-toggle button's Space/Enter
    // from bubbling up and also toggling the card's selected state.
    if (e.target !== e.currentTarget) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onSelect();
    }
  }

  function handlePreviewToggle(e: React.MouseEvent): void {
    // Stop the click from bubbling to the card's onSelect handler.
    e.stopPropagation();
    setPreviewOpen((v) => !v);
  }

  // NOTE: No separate onKeyDown is needed on the <button> — native buttons
  // fire onClick on Space/Enter, and handlePreviewToggle already stops
  // propagation, so the card's onKeyDown guard above is also sufficient.

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-label={`${template.name}${template.recommended ? " (Recommended)" : ""}`}
    >
      {/* ── Card header ─────────────────────────────────────────────── */}
      <div className={styles.cardHeader}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{template.name}</span>
          {template.recommended && (
            <Badge variant="info" size="sm">
              Recommended
            </Badge>
          )}
        </div>

        {/* Check indicator — visible when selected */}
        <div
          className={`${styles.check} ${selected ? styles.checkVisible : ""}`}
          aria-hidden="true"
        >
          <CheckIcon />
        </div>
      </div>

      {/* ── Description ─────────────────────────────────────────────── */}
      <p className={styles.description}>{template.description}</p>

      {/* ── Section chips ───────────────────────────────────────────── */}
      <div className={styles.chips} aria-label="Lesson sections">
        {template.sections.map((section, i) => (
          <Chip
            key={section.id}
            variant="default"
            className={styles.sectionChip}
          >
            {i > 0 && (
              <span className={styles.chipDot} aria-hidden="true">
                ·
              </span>
            )}
            {section.label}
          </Chip>
        ))}
      </div>

      {/* ── Fit line ────────────────────────────────────────────────── */}
      <p className={styles.fit}>{template.fit}</p>

      {/* ── Preview toggle ──────────────────────────────────────────── */}
      <Button
        variant="ghost"
        size="sm"
        className={styles.previewToggle}
        onClick={handlePreviewToggle}
        aria-expanded={previewOpen}
        aria-controls={previewId}
        leadingIcon={<ChevronIcon open={previewOpen} />}
        tooltip={
          previewOpen
            ? "Collapse the section list back to a one-line summary"
            : "Show the full list of sections this lesson template includes — see if it fits your teaching style"
        }
      >
        {previewOpen ? "Hide sections" : "Preview sections"}
      </Button>

      {/* ── Preview panel ───────────────────────────────────────────── */}
      {previewOpen && (
        <div
          id={previewId}
          className={styles.preview}
          // Stop clicks inside the preview from re-selecting the card
          // (the card's onClick is already handled; we just want to prevent
          // the section text from accidentally toggling selection again).
          onClick={(e) => e.stopPropagation()}
        >
          <ol className={styles.sectionList}>
            {template.sections.map((section, i) => (
              <li key={section.id} className={styles.sectionItem}>
                <div className={styles.sectionMeta}>
                  <span className={styles.sectionIndex} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={styles.sectionLabel}>{section.label}</span>
                </div>
                <p className={styles.sectionPrompt}>{section.prompt}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// Inline SVG, aria-hidden, consistent 18×18 grid.

function CheckIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
