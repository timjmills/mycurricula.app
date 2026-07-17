"use client";

// courses-step.tsx — v2 onboarding step 2: the subjects (courses) roster.
//
// Composes the SHIPPED subjects-step semantics against the v2 state: the eight
// locked subjects are pre-seeded, each with a name, a color swatch (one of the
// 8 locked subject-color tokens — never an invented color), and an
// academic/non-academic flag. Teachers rename, recolor, reorder implicitly by
// add/remove, and flip non-teaching blocks. Every mutation rebuilds the array
// and writes data.subjects[] in the SAME shape the subject-settings seeder
// reads ({ id, name, color, isAcademic }).

import type { CSSProperties, ReactNode } from "react";
import { useLabels, pluralize } from "@/lib/labels";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import type { OnboardingV2Data } from "@/lib/onboarding-v2-shape";
import { Button, ToggleGroup, Tooltip } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import styles from "./steps-v2.module.css";

type OnboardingSubject = OnboardingV2Data["subjects"][number];

// The 8 locked subject-color tokens, in offer order (mirrors tokens.css).
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

/** Next color not already used by another subject; falls back to the first. */
function nextUnusedColor(subjects: OnboardingSubject[]): string {
  const used = new Set(subjects.map((s) => s.color));
  return COLOR_TOKENS.find((c) => !used.has(c)) ?? COLOR_TOKENS[0];
}

function CheckIcon(): ReactNode {
  return (
    <svg aria-hidden width="12" height="10" viewBox="0 0 12 10" fill="none">
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

const ACADEMIC_OPTIONS: readonly ToggleOption<"academic" | "non-academic">[] = [
  { value: "academic", label: "I plan lessons" },
  { value: "non-academic", label: "No lessons" },
] as const;

function SubjectRow({
  subject,
  total,
  labelSubject,
  onChangeName,
  onChangeColor,
  onChangeAcademic,
  onRemove,
}: {
  subject: OnboardingSubject;
  total: number;
  labelSubject: string;
  onChangeName: (id: string, name: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onChangeAcademic: (id: string, isAcademic: boolean) => void;
  onRemove: (id: string) => void;
}): ReactNode {
  const rowClass = `${styles.subjRow} ${
    subject.isAcademic ? "" : styles.subjRowNonAcademic
  }`;

  return (
    <div className={rowClass}>
      {/* Color swatches — one of the 8 locked tokens. */}
      <div
        className={styles.swatches}
        role="group"
        aria-label={`${subject.name || labelSubject} color`}
      >
        {COLOR_TOKENS.map((token) => {
          const tip = `Use the ${token} color for this subject — every card, stripe, and chip for it picks up this hue.`;
          return (
            <Tooltip
              key={token}
              content={tip}
              side="top"
              tooltipId={`onboarding-v2-swatch-${token}`}
            >
              <button
                type="button"
                className={`${styles.swatch} ${subject.color === token ? styles.swatchActive : ""}`}
                aria-label={`${token} color${subject.color === token ? " (selected)" : ""}`}
                aria-pressed={subject.color === token}
                onClick={() => onChangeColor(subject.id, token)}
                title={tip}
              >
                {/* Compact colored dot; the button around it carries the 44px
                    tap target on coarse pointers (steps-v2.module.css). */}
                <span
                  className={styles.swatchDot}
                  style={{ background: `var(--${token})` } as CSSProperties}
                >
                  {subject.color === token && (
                    <span className={styles.swatchCheck}>
                      <CheckIcon />
                    </span>
                  )}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Name */}
      <input
        type="text"
        className={styles.subjName}
        value={subject.name}
        placeholder={`${labelSubject} name`}
        aria-label={`${labelSubject} name`}
        onChange={(e) => onChangeName(subject.id, e.target.value)}
      />

      {/* Academic / non-academic */}
      <ToggleGroup
        options={[...ACADEMIC_OPTIONS]}
        value={subject.isAcademic ? "academic" : "non-academic"}
        onChange={(v) => onChangeAcademic(subject.id, v === "academic")}
        ariaLabel={`${subject.name || labelSubject} planning type`}
        variant="subtle"
        size="sm"
      />

      {/* Remove */}
      <Button
        variant="icon"
        size="sm"
        onClick={() => onRemove(subject.id)}
        disabled={total <= 1}
        iconAriaLabel={`Remove ${subject.name || labelSubject}`}
        tooltip={`Remove ${subject.name || "this subject"} from your roster — you can add it back any time.`}
      >
        <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 2l10 10M12 2L2 12"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </Button>
    </div>
  );
}

export function CoursesStep(): ReactNode {
  const { data, update } = useOnboardingV2();
  const labels = useLabels();
  const subjects = data.subjects;

  const changeName = (id: string, name: string): void =>
    update({ subjects: subjects.map((s) => (s.id === id ? { ...s, name } : s)) });
  const changeColor = (id: string, color: string): void =>
    update({ subjects: subjects.map((s) => (s.id === id ? { ...s, color } : s)) });
  const changeAcademic = (id: string, isAcademic: boolean): void =>
    update({
      subjects: subjects.map((s) => (s.id === id ? { ...s, isAcademic } : s)),
    });
  const remove = (id: string): void => {
    if (subjects.length <= 1) return;
    update({ subjects: subjects.filter((s) => s.id !== id) });
  };
  const add = (): void => {
    update({
      subjects: [
        ...subjects,
        {
          id: `subj-${Date.now()}`,
          name: "",
          color: nextUnusedColor(subjects),
          isAcademic: true,
        },
      ],
    });
  };

  return (
    <div>
      <h1 className={styles.heading}>Your {pluralize(labels.subject)}</h1>
      <p className={styles.helper}>
        These become the rows of your planner. Set a color for each and tell us
        which ones you write lesson plans for.
      </p>

      <ul className={styles.subjList} aria-label={pluralize(labels.subject)}>
        {subjects.map((subject) => (
          <li key={subject.id}>
            <SubjectRow
              subject={subject}
              total={subjects.length}
              labelSubject={labels.subject}
              onChangeName={changeName}
              onChangeColor={changeColor}
              onChangeAcademic={changeAcademic}
              onRemove={remove}
            />
          </li>
        ))}
      </ul>

      <div className={styles.addBtnRow}>
        <Button
          variant="secondary"
          size="md"
          onClick={add}
          leadingIcon={<span aria-hidden>+</span>}
          tooltip="Add a subject to your roster — pick a name and one of the locked subject colors. Each subject becomes a row on your planner."
        >
          Add {labels.subject.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
