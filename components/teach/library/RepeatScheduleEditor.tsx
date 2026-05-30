"use client";

// RepeatScheduleEditor — the UI behind a board's **Repeat** action (5.31 Boards
// handoff). A *Repeat* is the owner's decision to surface ONE board in many REAL
// planner contexts: the links are live, so editing the board changes every
// occurrence (this is NOT "make independent copies" — that is Duplicate).
//
// The teacher composes a `RepeatRule[]` (from @/lib/types). Each rule binds to a
// real planner dimension:
//   • weekday(s) → 0-based indices into the CONFIGURED school week
//                  (we render Sun..Sat labels but store the index)
//   • subject    → one of the eight locked subject ids
//   • week       → a real curriculum week number
//   • lesson     → a master lesson id (entered as text here; the planner resolves
//                  it — the editor never invents the id space)
//   • daily      → every instructional day
// Every rule carries a derived human `label` (e.g. "Mon/Wed/Fri", "Every Math
// lesson", "Daily") so the card's "Repeats: X" line reads cleanly.
//
// CONTRACT: this component is pure UI. It NEVER calls the repo. It emits the
// composed `RepeatSchedule` via `onSave(repeat)`; the module (or lead) wires
// that to `teach.setBoardRepeat`. An empty rule set saves as `null` (the board
// no longer repeats).
//
// Chrome rules (CLAUDE.md §4): tokens only via the .module.css; every control is
// labelled; reduced motion respected by the stylesheet.

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RepeatRule, RepeatSchedule, SubjectId } from "@/lib/types";
import { SUBJECTS } from "@/lib/mock/subjects";
import { Button } from "@/components/ui";
import { TeachIcon } from "@/components/teach/widgets";
import styles from "./RepeatScheduleEditor.module.css";

// ── Weekday labels ───────────────────────────────────────────────────────────
// Short labels indexed 0-based. The CONFIGURED school week chooses WHICH indices
// are offered (never a hard-coded 5/7-day assumption); the label list just names
// an index. The first beta school runs Sun–Thu, the default below.

const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const DEFAULT_SCHOOL_WEEK: readonly number[] = [0, 1, 2, 3, 4]; // Sun–Thu

// ── Rule label derivation ────────────────────────────────────────────────────
// A single source of truth for the human label shown per rule + on the board
// card's "Repeats:" line. Kept here (not in lib) so this owned file is
// self-contained; mirrors the wording in the handoff ("Mon/Wed/Fri", "Daily").

function subjectName(id: SubjectId): string {
  return SUBJECTS.find((s) => s.id === id)?.name ?? id;
}

function deriveLabel(rule: Omit<RepeatRule, "label">): string {
  switch (rule.kind) {
    case "daily":
      return "Daily";
    case "weekly":
      // A `weekly` rule carrying a `week` is a specific curriculum week; without
      // one it is the generic "once a week" repeat.
      return rule.week != null ? `Week ${rule.week}` : "Weekly";
    case "weekday": {
      const days = (rule.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((i) => WEEKDAY_SHORT[i] ?? String(i));
      return days.length > 0 ? days.join("/") : "Weekdays";
    }
    case "subject":
      return rule.subjectId
        ? `Every ${subjectName(rule.subjectId)} lesson`
        : "Every lesson of a subject";
    case "lesson":
      return rule.lessonId ? `Lesson ${rule.lessonId}` : "A specific lesson";
    case "slot":
      return rule.slotId ? `Slot ${rule.slotId}` : "A schedule slot";
    case "time":
      return "At a set time";
    default:
      return "Repeat";
  }
}

/** Build a finished rule (with its derived label) from a draft. */
function finalizeRule(draft: Omit<RepeatRule, "label">): RepeatRule {
  return { ...draft, label: deriveLabel(draft) };
}

// ── The kinds this editor can author ─────────────────────────────────────────
// UI-level draft kinds, decoupled from the wire-level `RepeatKind`. Two map
// onto `weekly`: "week" (a specific curriculum week, carries `week`) and
// "weekly" (the generic once-a-week repeat). `slot`/`time` are NOT authored
// here — per the type docs, schedule slots are per-weekday templates with no
// rotation backend yet, so a slot/time repeat would surface identically to a
// weekday one. A pre-existing slot/time rule is still rendered + removable.

type DraftKind = "weekday" | "subject" | "week" | "lesson" | "daily" | "weekly";

interface KindOption {
  kind: DraftKind;
  label: string;
}

const KIND_OPTIONS: readonly KindOption[] = [
  { kind: "weekday", label: "On weekdays" },
  { kind: "subject", label: "Every subject lesson" },
  { kind: "week", label: "A specific week" },
  { kind: "lesson", label: "A specific lesson" },
  { kind: "daily", label: "Daily" },
  { kind: "weekly", label: "Weekly" },
];

/** Compose a wire-level `RepeatRule` draft from the current UI draft state. The
 *  single source of truth for the UI-kind → `RepeatKind` mapping. */
function draftToRule(
  kind: DraftKind,
  state: {
    weekdays: ReadonlySet<number>;
    subject: SubjectId;
    week: string;
    lesson: string;
  },
): Omit<RepeatRule, "label"> {
  switch (kind) {
    case "weekday":
      return {
        kind: "weekday",
        weekdays: [...state.weekdays].sort((a, b) => a - b),
      };
    case "subject":
      return { kind: "subject", subjectId: state.subject };
    case "week":
      return {
        kind: "weekly",
        week: Number.isFinite(Number(state.week))
          ? Number(state.week)
          : undefined,
      };
    case "lesson":
      return { kind: "lesson", lessonId: state.lesson.trim() };
    case "daily":
      return { kind: "daily" };
    case "weekly":
      return { kind: "weekly" };
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface RepeatScheduleEditorProps {
  /** The board's title (header context only — no student data). */
  boardTitle: string;
  /** The board's current repeat schedule (seed the editor). */
  initial?: RepeatSchedule;
  /** The CONFIGURED school week as 0-based weekday indices. Defaults to Sun–Thu
   *  (the beta school) — never hard-coded internally; the caller passes the real
   *  set once the school-week config is wired. */
  schoolWeek?: readonly number[];
  /** Emit the composed schedule. Empty → `null` (board stops repeating). The
   *  module (or lead) wires this to `teach.setBoardRepeat`. */
  onSave: (repeat: RepeatSchedule) => void;
  /** Dismiss without saving. */
  onCancel?: () => void;
}

// ── RepeatScheduleEditor ──────────────────────────────────────────────────────

export function RepeatScheduleEditor({
  boardTitle,
  initial,
  schoolWeek = DEFAULT_SCHOOL_WEEK,
  onSave,
  onCancel,
}: RepeatScheduleEditorProps): ReactNode {
  // Working copy of the rules being composed. Seeded from `initial`.
  const [rules, setRules] = useState<RepeatRule[]>(() =>
    initial ? initial.slice() : [],
  );

  // Draft state for the "add a rule" row.
  const [draftKind, setDraftKind] = useState<DraftKind>("weekday");
  const [draftWeekdays, setDraftWeekdays] = useState<Set<number>>(
    () => new Set(),
  );
  const [draftSubject, setDraftSubject] = useState<SubjectId>("math");
  const [draftWeek, setDraftWeek] = useState<string>("1");
  const [draftLesson, setDraftLesson] = useState<string>("");

  const weekdayChoices = useMemo(
    () => schoolWeek.slice().sort((a, b) => a - b),
    [schoolWeek],
  );

  // ── Draft validity (drives the Add button) ────────────────────────────────
  const draftValid = useMemo(() => {
    switch (draftKind) {
      case "weekday":
        return draftWeekdays.size > 0;
      case "subject":
        return Boolean(draftSubject);
      case "week":
        return draftWeek.trim() !== "" && Number.isFinite(Number(draftWeek));
      case "lesson":
        return draftLesson.trim() !== "";
      case "daily":
      case "weekly":
        return true;
      default:
        return false;
    }
  }, [draftKind, draftWeekdays, draftSubject, draftWeek, draftLesson]);

  const toggleDraftWeekday = useCallback((index: number): void => {
    setDraftWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const addRule = useCallback((): void => {
    if (!draftValid) return;
    const rule = finalizeRule(
      draftToRule(draftKind, {
        weekdays: draftWeekdays,
        subject: draftSubject,
        week: draftWeek,
        lesson: draftLesson,
      }),
    );
    setRules((prev) => [...prev, rule]);
    // Reset the per-kind draft inputs so the next rule starts clean.
    setDraftWeekdays(new Set());
    setDraftLesson("");
  }, [
    draftValid,
    draftKind,
    draftWeekdays,
    draftSubject,
    draftWeek,
    draftLesson,
  ]);

  const removeRule = useCallback((index: number): void => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback((): void => {
    // Empty rule set → null (the board no longer repeats).
    onSave(rules.length > 0 ? rules : null);
  }, [onSave, rules]);

  return (
    <div
      className={styles.root}
      role="group"
      aria-label={`Repeat schedule for ${boardTitle}`}
    >
      {/* ── Explainer ─────────────────────────────────────────────────────── */}
      <p className={styles.lead}>
        <span className={styles.leadIcon} aria-hidden="true">
          <TeachIcon name="rotate" size={16} />
        </span>
        <span>
          Repeat surfaces <strong>this one board</strong> everywhere you
          schedule it. The links are live — editing the board updates every
          occurrence.
        </span>
      </p>

      {/* ── Existing rules ────────────────────────────────────────────────── */}
      {rules.length > 0 ? (
        <ul className={styles.ruleList} aria-label="Repeat rules">
          {rules.map((rule, index) => (
            <li key={`${rule.kind}-${index}`} className={styles.ruleItem}>
              <span className={styles.ruleLabel}>{rule.label}</span>
              <Button
                size="sm"
                variant="icon"
                iconAriaLabel={`Remove repeat rule: ${rule.label}`}
                onClick={() => removeRule(index)}
                tooltip={`Stop repeating on "${rule.label}"`}
              >
                <TeachIcon name="x" size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noRules}>No repeat rules yet — add one below.</p>
      )}

      {/* ── Add-a-rule builder ────────────────────────────────────────────── */}
      <div className={styles.builder}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Repeat by</span>
          <select
            className={styles.select}
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as DraftKind)}
            aria-label="How this board should repeat"
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.kind} value={opt.kind}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Per-kind input. */}
        {draftKind === "weekday" ? (
          <div
            className={styles.weekdays}
            role="group"
            aria-label="Days this board repeats on"
          >
            {weekdayChoices.map((index) => {
              const active = draftWeekdays.has(index);
              return (
                <button
                  key={index}
                  type="button"
                  className={`${styles.dayPill} ${active ? styles.dayPillActive : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleDraftWeekday(index)}
                >
                  {WEEKDAY_SHORT[index] ?? index}
                </button>
              );
            })}
          </div>
        ) : null}

        {draftKind === "subject" ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Subject</span>
            <select
              className={styles.select}
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value as SubjectId)}
              aria-label="Subject this board repeats on"
            >
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {draftKind === "week" ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Week number</span>
            <input
              type="number"
              min={1}
              className={styles.input}
              value={draftWeek}
              onChange={(e) => setDraftWeek(e.target.value)}
              aria-label="Curriculum week number this board repeats on"
            />
          </label>
        ) : null}

        {draftKind === "lesson" ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Lesson id</span>
            <input
              type="text"
              className={styles.input}
              value={draftLesson}
              onChange={(e) => setDraftLesson(e.target.value)}
              placeholder="e.g. m-12"
              aria-label="Master lesson id this board repeats on"
            />
          </label>
        ) : null}

        {/* A preview of the rule label being composed. */}
        <p className={styles.preview} aria-live="polite">
          Adds:{" "}
          <strong>
            {deriveLabel(
              draftToRule(draftKind, {
                weekdays: draftWeekdays,
                subject: draftSubject,
                week: draftWeek,
                lesson: draftLesson,
              }),
            )}
          </strong>
        </p>

        <Button
          size="sm"
          variant="secondary"
          onClick={addRule}
          disabled={!draftValid}
          tooltip="Add this repeat rule to the schedule"
        >
          <TeachIcon name="plus" size={14} /> Add rule
        </Button>
      </div>

      {/* ── Footer actions ────────────────────────────────────────────────── */}
      <div className={styles.footer}>
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button size="sm" variant="primary" onClick={handleSave}>
          Save repeat
        </Button>
      </div>
    </div>
  );
}
