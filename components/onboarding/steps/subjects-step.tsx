"use client";

// subjects-step.tsx — the "Your subjects" onboarding step.
//
// Teachers see every subject pre-seeded from the 8 known subjects.
// Each row exposes:
//   1. Name text input
//   2. Color swatch picker — 8 swatches, one per subject-color token
//   3. Academic / non-academic segmented picker
// Plus per-row: remove and reorder (up/down) affordances, and a global
// "+ Add subject" button.
//
// All mutations rebuild the full array and call update({ subjects }).
// Non-academic rows render with a muted visual treatment so they read
// differently at a glance (lunch, recess, assembly vs. lesson-flow subjects).

import type { CSSProperties, ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import type { OnboardingSubject } from "@/lib/onboarding-state";
import { Button, ToggleGroup } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import styles from "./subjects-step.module.css";

// ── Subject-color token keys (team-wide, locked) ────────────────────────
// Mirrors the 8 canonical subjects in tokens.css. The order here is also
// the offer order in the swatch picker.

const COLOR_TOKENS = [
  "math",
  "reading",
  "writing",
  "grammar",
  "spelling",
  "ufli",
  "explorers",
  "sel",
] as const;

type ColorToken = (typeof COLOR_TOKENS)[number];

// ── Helpers ─────────────────────────────────────────────────────────────

/** Pick the next color not already used by any other subject. Falls back
 *  to the first token if all 8 are taken. */
function nextUnusedColor(subjects: OnboardingSubject[]): string {
  const used = new Set(subjects.map((s) => s.color));
  return COLOR_TOKENS.find((c) => !used.has(c)) ?? COLOR_TOKENS[0];
}

// ── Checkmark SVG (rendered over the active swatch) ─────────────────────

function CheckIcon(): ReactNode {
  return (
    <svg
      aria-hidden
      width="12"
      height="10"
      viewBox="0 0 12 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1 5l3.5 3.5L11 1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

interface SwatchPickerProps {
  value: string;
  onChange: (color: ColorToken) => void;
}

// Eight color swatches. The selected one shows a white checkmark.
// Each swatch uses `background: var(--<token>)` from tokens.css.
function SwatchPicker({ value, onChange }: SwatchPickerProps): ReactNode {
  return (
    <div className={styles.colorCol}>
      <span className={styles.colorLabel} aria-hidden>
        Color
      </span>
      <div className={styles.swatches} role="group" aria-label="Subject color">
        {COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            className={styles.swatch}
            style={{ background: `var(--${token})` } as CSSProperties}
            aria-label={`${token} color${value === token ? " (selected)" : ""}`}
            aria-pressed={value === token}
            onClick={() => onChange(token)}
            title={`Use the ${token} color for this subject — every card, stripe, and chip for this subject picks up this hue`}
          >
            {value === token && (
              <span className={styles.swatchCheck}>
                <CheckIcon />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface AcademicPickerProps {
  isAcademic: boolean;
  onChange: (isAcademic: boolean) => void;
}

// Academic-type options for the ToggleGroup.
const ACADEMIC_OPTIONS: readonly ToggleOption<"academic" | "non-academic">[] = [
  { value: "academic", label: "I plan lessons" },
  { value: "non-academic", label: "No lessons" },
] as const;

// Two-button segmented control via ToggleGroup: "I plan lessons" vs
// "No lessons". Academic subjects follow the lesson-flow template;
// non-academic blocks (lunch, recess, assembly) are title + note only.
function AcademicPicker({
  isAcademic,
  onChange,
}: AcademicPickerProps): ReactNode {
  return (
    <div className={styles.planCol}>
      <span className={styles.planLabel} aria-hidden>
        Type
      </span>
      <ToggleGroup
        options={[...ACADEMIC_OPTIONS]}
        value={isAcademic ? "academic" : "non-academic"}
        onChange={(v) => onChange(v === "academic")}
        ariaLabel="Lesson planning type"
        variant="subtle"
        size="sm"
      />
    </div>
  );
}

// ── Up / Down arrow icons ─────────────────────────────────────────────────

function ArrowUpIcon(): ReactNode {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M5 8.5V1.5M2 4.5l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowDownIcon(): ReactNode {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M5 1.5v7M2 5.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Remove icon ──────────────────────────────────────────────────────────

function RemoveIcon(): ReactNode {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 2l10 10M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Subject row ──────────────────────────────────────────────────────────

interface SubjectRowProps {
  subject: OnboardingSubject;
  index: number;
  total: number;
  onChangeName: (id: string, name: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onChangeAcademic: (id: string, isAcademic: boolean) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (id: string) => void;
}

function SubjectRow({
  subject,
  index,
  total,
  onChangeName,
  onChangeColor,
  onChangeAcademic,
  onMoveUp,
  onMoveDown,
  onRemove,
}: SubjectRowProps): ReactNode {
  const rowClass = [
    styles.row,
    !subject.isAcademic ? styles.rowNonAcademic : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      {/* Reorder arrows */}
      <div
        className={styles.reorderCol}
        aria-label={`Reorder ${subject.name || "subject"}`}
      >
        <Button
          variant="icon"
          size="sm"
          onClick={() => onMoveUp(index)}
          disabled={index === 0}
          iconAriaLabel={`Move ${subject.name || "subject"} up`}
          tooltip={`Move ${subject.name || "this subject"} earlier in the list — affects the order subjects appear in your planner grid`}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={() => onMoveDown(index)}
          disabled={index === total - 1}
          iconAriaLabel={`Move ${subject.name || "subject"} down`}
          tooltip={`Move ${subject.name || "this subject"} later in the list — affects the order subjects appear in your planner grid`}
        >
          <ArrowDownIcon />
        </Button>
      </div>

      {/* Name input */}
      <div className={styles.nameCol}>
        <input
          type="text"
          className={styles.nameInput}
          value={subject.name}
          placeholder="Subject name"
          aria-label="Subject name"
          onChange={(e) => onChangeName(subject.id, e.target.value)}
        />
      </div>

      {/* Color swatch picker */}
      <SwatchPicker
        value={subject.color}
        onChange={(color) => onChangeColor(subject.id, color)}
      />

      {/* Academic / non-academic picker */}
      <AcademicPicker
        isAcademic={subject.isAcademic}
        onChange={(val) => onChangeAcademic(subject.id, val)}
      />

      {/* Remove button */}
      <div className={styles.removeCol}>
        <Button
          variant="icon"
          size="sm"
          onClick={() => onRemove(subject.id)}
          disabled={total <= 1}
          iconAriaLabel={`Remove ${subject.name || "subject"}`}
          tooltip={`Remove ${subject.name || "this subject"} from your curriculum — you can add it back any time`}
        >
          <RemoveIcon />
        </Button>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────

export function SubjectsStep(): ReactNode {
  const { data, update } = useOnboarding();
  const subjects = data.subjects;

  // ── Mutation helpers — each rebuilds the array and calls update() ────

  function handleChangeName(id: string, name: string): void {
    update({
      subjects: subjects.map((s) => (s.id === id ? { ...s, name } : s)),
    });
  }

  function handleChangeColor(id: string, color: string): void {
    update({
      subjects: subjects.map((s) => (s.id === id ? { ...s, color } : s)),
    });
  }

  function handleChangeAcademic(id: string, isAcademic: boolean): void {
    update({
      subjects: subjects.map((s) => (s.id === id ? { ...s, isAcademic } : s)),
    });
  }

  function handleMoveUp(index: number): void {
    if (index === 0) return;
    const next = [...subjects];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    update({ subjects: next });
  }

  function handleMoveDown(index: number): void {
    if (index === subjects.length - 1) return;
    const next = [...subjects];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    update({ subjects: next });
  }

  function handleRemove(id: string): void {
    if (subjects.length <= 1) return;
    update({ subjects: subjects.filter((s) => s.id !== id) });
  }

  function handleAdd(): void {
    const newSubject: OnboardingSubject = {
      id: `subj-${Date.now()}`,
      name: "",
      color: nextUnusedColor(subjects),
      isAcademic: true,
    };
    update({ subjects: [...subjects, newSubject] });
  }

  return (
    <div>
      <h1 className={styles.heading}>Your subjects</h1>
      <p className={styles.helper}>
        These become the rows of your planner. Set a color for each, and tell us
        which ones you write lesson plans for.
      </p>

      <ul className={styles.list} aria-label="Subjects">
        {subjects.map((subject, index) => (
          <li key={subject.id} style={{ listStyle: "none", padding: 0 }}>
            <SubjectRow
              subject={subject}
              index={index}
              total={subjects.length}
              onChangeName={handleChangeName}
              onChangeColor={handleChangeColor}
              onChangeAcademic={handleChangeAcademic}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onRemove={handleRemove}
            />
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        size="md"
        onClick={handleAdd}
        className={styles.addBtn}
        leadingIcon={<span aria-hidden>+</span>}
        tooltip="Add a new subject to your curriculum — pick a name and a color; each subject becomes a row on your planner grid"
      >
        Add subject
      </Button>
    </div>
  );
}
