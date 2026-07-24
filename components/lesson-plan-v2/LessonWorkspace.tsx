"use client";

// LessonWorkspace.tsx — the B2 single-scroll lesson editor body.
//
// Replaces PlanPage's six-tab strip with ONE scrolling workspace: a scalar
// header (title · objective · duration) followed by collapsible sections. Each
// section either REUSES an existing tab body verbatim (Standards / Resources /
// Differentiation / Notes), embeds the shared <LessonEditor> for the lesson
// FLOW (retiring the read-only FlowTab), or is one of B2's new editable
// surfaces (Assessment · Builds & prep · Framework).
//
// SAVE MODEL: every field autosaves through the planner store's existing
// `editLesson` mutator with a per-field coalesce key, so a typing burst is ONE
// undo step and the store's live save target routes the write (a Personal edit
// lazily forks; a Team-mode edit writes master — the top-bar toggle owns that
// choice, exactly as the tab bodies already do). B2 adds NO Team/Personal
// affordance here (PlanPage's original note: setSaveTarget "core" is a store
// no-op; the explicit Push-to-Team button stays in LessonModal / DayEditSplit).
//
// SIMPLE / ADVANCED (B2.4): a header toggle. In Simple mode the advanced
// surfaces (Builds & prep, Framework, and the Assessment purpose/notes fields)
// are hidden UNLESS they already hold content — nothing a teacher has written is
// ever hidden behind a mode switch.
//
// HONEST STATS: a section summary shows only what the store actually holds —
// assessment "—" when absent, "N min" only when a duration is set, a real
// standards/section count. No fabricated planned-time (the untimed-sections
// contract from FlowTab is preserved by <LessonEditor>'s own flow total).

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { RichTextEditor } from "@/components/rich-text";
import { ToggleGroup, Tooltip } from "@/components/ui";
import { LessonEditor } from "@/components/lesson-editor";
import type { LessonAssessment } from "@/lib/types";
import { isAssessmentKind } from "@/lib/types";
import { stripHtml } from "@/lib/html-text";
import { LESSON_STATUS_LABEL } from "./lesson-status";
import {
  StandardsTab,
  ResourcesTab,
  DifferentiationTab,
  NotesTab,
} from "./tabs";
import styles from "./lesson-workspace.module.css";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Strip the app-wide plain-text "I can " objective prefix for editing (mirrors
 *  OverviewTab / the weekly cards' display regex). Re-attached on commit. */
function stripICanPrefix(html: string): string {
  return html.replace(/^I can\s+/i, "");
}

/** Local-draft state for a plain text/number field: reseeds on lesson switch and
 *  on an external store change (undo/redo from another surface) — but never
 *  while the teacher is focused in the field (no clobber mid-edit). */
function useFieldDraft(
  lessonId: string,
  storeValue: string,
): {
  value: string;
  setValue: (v: string) => void;
  focusProps: { onFocus: () => void; onBlur: () => void };
} {
  const [value, setValue] = useState(storeValue);
  const focused = useRef(false);
  useEffect(() => {
    setValue(storeValue);
    focused.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focused.current) setValue(storeValue);
  }, [storeValue]);
  const focusProps = useMemo(
    () => ({
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
      },
    }),
    [],
  );
  return { value, setValue, focusProps };
}

// ── Collapsible section ────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      className={`${styles.chev} ${open ? styles.chevOpen : ""}`}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Section({
  label,
  summary,
  open,
  onToggle,
  tooltip,
  children,
}: {
  label: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  tooltip: string;
  children: ReactNode;
}): ReactNode {
  const uid = useId();
  const panelId = `${uid}-panel`;
  return (
    <section className={styles.section} title={tooltip}>
      <button
        type="button"
        className={styles.secHead}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <Chevron open={open} />
        <span className={styles.secLabel}>{label}</span>
        {summary ? <span className={styles.secSummary}>{summary}</span> : null}
      </button>
      {open ? (
        <div id={panelId} className={styles.secBody}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

// ── Scalar header (title · objective · duration) ───────────────────────────────

function ScalarHeader({ lessonId }: { lessonId: string }): ReactNode {
  const { getLesson, editLesson } = usePlanner();
  const lesson = getLesson(lessonId);

  const title = useFieldDraft(lessonId, lesson?.title ?? "");
  const duration = useFieldDraft(
    lessonId,
    lesson?.durationMinutes != null ? String(lesson.durationMinutes) : "",
  );

  // Objective carries the "I can " prefix in the store; the editor holds only
  // the trailing text (OverviewTab's contract). Rich-text, so it keeps its own
  // editing guard rather than the plain-field hook.
  const [objectiveHtml, setObjectiveHtml] = useState(
    stripICanPrefix(lesson?.objective ?? ""),
  );
  const objEditing = useRef(false);
  useEffect(() => {
    setObjectiveHtml(stripICanPrefix(lesson?.objective ?? ""));
    objEditing.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps
  const storeObjective = lesson?.objective ?? "";
  useEffect(() => {
    if (!objEditing.current) setObjectiveHtml(stripICanPrefix(storeObjective));
  }, [storeObjective]);

  if (!lesson) return null;

  function commitTitle(next: string): void {
    title.setValue(next);
    editLesson(
      lessonId,
      { title: next },
      {
        key: `lesson:${lessonId}:title`,
        ts: Date.now(),
      },
    );
  }
  function handleObjective(html: string): void {
    objEditing.current = true;
    setObjectiveHtml(html);
    const trimmed = html.trim();
    editLesson(
      lessonId,
      { objective: trimmed ? `I can ${trimmed}` : "" },
      {
        key: `lesson:${lessonId}:objective`,
        ts: Date.now(),
      },
    );
  }
  function commitDuration(raw: string): void {
    duration.setValue(raw);
    // Empty clears the field (undefined); otherwise a non-negative integer.
    const trimmed = raw.trim();
    const n =
      trimmed === "" ? undefined : Math.max(0, Math.round(Number(trimmed)));
    // Reject non-numeric input (keep the draft, write nothing) so a stray
    // keystroke never persists NaN.
    if (trimmed !== "" && !Number.isFinite(n)) return;
    editLesson(
      lessonId,
      { durationMinutes: n },
      {
        key: `lesson:${lessonId}:duration`,
        ts: Date.now(),
      },
    );
  }

  return (
    <div className={styles.header}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title</span>
        <input
          type="text"
          className={styles.textInput}
          value={title.value}
          placeholder="Lesson title"
          aria-label="Lesson title"
          onChange={(e) => commitTitle(e.target.value)}
          {...title.focusProps}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          Learning target (student-facing)
        </span>
        <div
          className={styles.iCanRow}
          onBlurCapture={() => {
            objEditing.current = false;
          }}
        >
          <span className={styles.iCanLabel} aria-hidden="true">
            I can
          </span>
          <div className={styles.iCanEditor}>
            <RichTextEditor
              value={objectiveHtml}
              onChange={handleObjective}
              singleLine
              placeholder="state the lesson objective…"
              ariaLabel="Lesson objective (completes “I can …”)"
            />
          </div>
        </div>
      </div>

      <label className={`${styles.field} ${styles.fieldDuration}`}>
        <span className={styles.fieldLabel}>Duration</span>
        <Tooltip
          content="Planned length of this lesson in minutes. Leave blank if it varies."
          tooltipId="b2-lesson-duration"
        >
          <span className={styles.durationWrap}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              className={`${styles.textInput} ${styles.durationInput}`}
              value={duration.value}
              placeholder="—"
              aria-label="Lesson duration in minutes"
              onChange={(e) => commitDuration(e.target.value)}
              {...duration.focusProps}
            />
            <span className={styles.durationUnit} aria-hidden="true">
              min
            </span>
          </span>
        </Tooltip>
      </label>
    </div>
  );
}

// ── Assessment section (B2 new) ────────────────────────────────────────────────

type KindChoice = "none" | "formative" | "summative";

const KIND_OPTIONS: Array<{
  value: KindChoice;
  label: string;
  title: string;
}> = [
  {
    value: "none",
    label: "None",
    title: "This lesson has no attached assessment.",
  },
  {
    value: "formative",
    label: "Formative",
    title:
      "A check for understanding during learning (exit ticket, observation).",
  },
  {
    value: "summative",
    label: "Summative",
    title: "An end-of-learning assessment of mastery (quiz, unit test).",
  },
];

function AssessmentSection({
  lessonId,
  showAdvanced,
}: {
  lessonId: string;
  showAdvanced: boolean;
}): ReactNode {
  const { getLesson, editLesson } = usePlanner();
  const lesson = getLesson(lessonId);

  const [draft, setDraft] = useState<LessonAssessment>(
    lesson?.assessment ?? {},
  );
  const editing = useRef(false);
  useEffect(() => {
    setDraft(lesson?.assessment ?? {});
    editing.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps
  const store = lesson?.assessment;
  useEffect(() => {
    if (!editing.current) setDraft(store ?? {});
  }, [store?.kind, store?.title, store?.purpose, store?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(
    (next: LessonAssessment): void => {
      setDraft(next);
      editLesson(
        lessonId,
        { assessment: next },
        {
          key: `lesson:${lessonId}:assessment`,
          ts: Date.now(),
        },
      );
    },
    [editLesson, lessonId],
  );

  if (!lesson) return null;

  const kindChoice: KindChoice = isAssessmentKind(draft.kind)
    ? draft.kind
    : "none";

  function onKind(next: KindChoice): void {
    editing.current = true;
    // "None" = no assessment → clear ALL four fields (§4a MED). Keeping
    // title/purpose/notes with kind cleared would round-trip as a title-only
    // assessment, contradicting "None"; the write mapper then nulls all four
    // columns and the read collapses to `undefined` (no assessment).
    commit(next === "none" ? {} : { ...draft, kind: next });
  }
  function onField(field: "title" | "purpose" | "notes", value: string): void {
    editing.current = true;
    commit({ ...draft, [field]: value });
  }

  return (
    <div
      className={styles.form}
      onBlurCapture={() => {
        editing.current = false;
      }}
    >
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Kind</span>
        <ToggleGroup
          options={KIND_OPTIONS}
          value={kindChoice}
          onChange={onKind}
          ariaLabel="Assessment kind"
          size="sm"
        />
      </div>

      {/* Detail fields are hidden under "None" (§4a MED, Codex): leaving the
          title/purpose/notes inputs live while None is selected let a later
          keystroke re-send `{ assessment: { title } }` and resurrect a
          title-only assessment the toggle still calls "None". No rendered
          input → no onField → no resurrection path. */}
      {kindChoice !== "none" && (
        <>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Assessment title</span>
            <input
              type="text"
              className={styles.textInput}
              value={draft.title ?? ""}
              placeholder="e.g. Fractions exit ticket"
              aria-label="Assessment title"
              onChange={(e) => onField("title", e.target.value)}
            />
          </label>

          {showAdvanced && (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>What it checks for</span>
                <textarea
                  className={styles.textArea}
                  rows={2}
                  value={draft.purpose ?? ""}
                  placeholder="The understanding or skill this assessment measures…"
                  aria-label="Assessment purpose"
                  onChange={(e) => onField("purpose", e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Notes</span>
                <textarea
                  className={styles.textArea}
                  rows={2}
                  value={draft.notes ?? ""}
                  placeholder="Scoring, timing, accommodations…"
                  aria-label="Assessment notes"
                  onChange={(e) => onField("notes", e.target.value)}
                />
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Builds & prep section (B2 new — advanced) ──────────────────────────────────

function BuildsPrepSection({ lessonId }: { lessonId: string }): ReactNode {
  const { getLesson, editLesson } = usePlanner();
  const lesson = getLesson(lessonId);
  const builds = useFieldDraft(lessonId, lesson?.builds ?? "");
  const prep = useFieldDraft(lessonId, lesson?.prep ?? "");
  if (!lesson) return null;

  function commit(field: "builds" | "prep", value: string): void {
    (field === "builds" ? builds : prep).setValue(value);
    editLesson(
      lessonId,
      { [field]: value },
      {
        key: `lesson:${lessonId}:${field}`,
        ts: Date.now(),
      },
    );
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Builds on</span>
        <textarea
          className={styles.textArea}
          rows={2}
          value={builds.value}
          placeholder="Prior learning this lesson builds on…"
          aria-label="Builds on prior learning"
          onChange={(e) => commit("builds", e.target.value)}
          {...builds.focusProps}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Prep / materials</span>
        <textarea
          className={styles.textArea}
          rows={2}
          value={prep.value}
          placeholder="What to ready before teaching — copies, materials, setup…"
          aria-label="Prep and materials"
          onChange={(e) => commit("prep", e.target.value)}
          {...prep.focusProps}
        />
      </label>
    </div>
  );
}

// ── Framework section (B2 — plumbing + minimal render; designer deferred) ───────

function FrameworkSection({ lessonId }: { lessonId: string }): ReactNode {
  const { getLesson, editLesson } = usePlanner();
  const lesson = getLesson(lessonId);
  const fwId = useFieldDraft(lessonId, lesson?.frameworkId ?? "");
  if (!lesson) return null;

  const fwFields = lesson.frameworkData
    ? Object.keys(lesson.frameworkData).length
    : 0;

  function commit(value: string): void {
    fwId.setValue(value);
    editLesson(
      lessonId,
      { frameworkId: value },
      {
        key: `lesson:${lessonId}:framework`,
        ts: Date.now(),
      },
    );
  }

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Framework override</span>
        <input
          type="text"
          className={styles.textInput}
          value={fwId.value}
          placeholder="Leave blank to inherit from the unit"
          aria-label="Framework override for this lesson"
          onChange={(e) => commit(e.target.value)}
        />
        <span className={styles.hint}>
          Optional. Overrides the unit’s framework for this one lesson. The
          field editor for framework values is coming later
          {fwFields > 0
            ? ` — ${fwFields} value${fwFields === 1 ? "" : "s"} already set.`
            : "."}
        </span>
      </label>
    </div>
  );
}

// ── Lesson meta strip (embedded host only) ────────────────────────────────────
// Subject · unit · week · status. The MODAL host shows these in the shell's
// header/subtitle/stat strip; the EMBEDDED host (Planner hub) has no such chrome,
// and the retired OverviewTab was the only place they surfaced there — so restore
// a compact read-only strip when the workspace is embedded (§4a MED).

function MetaStrip({ lessonId }: { lessonId: string }): ReactNode {
  const { getLesson, subjectById, unitById } = usePlanner();
  const lesson = getLesson(lessonId);
  if (!lesson) return null;
  const subject = subjectById[lesson.subject];
  const unit = unitById[lesson.unit];
  return (
    <div className={styles.metaStrip}>
      <span className={styles.metaItem}>
        <span className={styles.metaDot} aria-hidden="true" />
        {subject?.name ?? lesson.subject}
      </span>
      <span className={styles.metaItem}>{unit?.name ?? "No unit"}</span>
      <span className={styles.metaItem}>Week {lesson.week}</span>
      <span className={styles.metaItem}>
        {LESSON_STATUS_LABEL[lesson.status]}
      </span>
    </div>
  );
}

// ── The workspace ──────────────────────────────────────────────────────────────

type SectionKey =
  | "flow"
  | "standards"
  | "resources"
  | "differentiation"
  | "assessment"
  | "buildsPrep"
  | "framework"
  | "notes";

const DEFAULT_OPEN: Record<SectionKey, boolean> = {
  flow: true,
  standards: false,
  resources: false,
  differentiation: false,
  assessment: true,
  buildsPrep: false,
  framework: false,
  notes: false,
};

export interface LessonWorkspaceProps {
  lessonId: string;
  /** Render the compact subject/unit/week/status strip. The embedded host
   *  passes this (it has no shell chrome); the modal host omits it (the
   *  ExplorerShell header + stat strip already carry that context). */
  showMeta?: boolean;
}

export function LessonWorkspace({
  lessonId,
  showMeta = false,
}: LessonWorkspaceProps): ReactNode {
  const { getLesson, getSections, subjectById } = usePlanner();
  const lesson = getLesson(lessonId);

  const [open, setOpen] = useState<Record<SectionKey, boolean>>(DEFAULT_OPEN);
  useEffect(() => setOpen(DEFAULT_OPEN), [lessonId]);
  const toggle = useCallback((key: SectionKey): void => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [advanced, setAdvanced] = useState(false);

  // Section summaries — real store values only (honest stats).
  const sections = getSections(lessonId);
  const stdCount = lesson?.standards.length ?? 0;
  const flowSummary = useMemo(() => {
    if (sections.length === 0) return "no sections yet";
    return sections.length === 1 ? "1 section" : `${sections.length} sections`;
  }, [sections.length]);

  if (!lesson) {
    return (
      <div className={styles.empty}>This lesson is no longer in the plan.</div>
    );
  }

  const subjectCls = subjectById[lesson.subject]?.cls ?? "";

  // Advanced surfaces show when the toggle is on OR they already hold content —
  // nothing a teacher wrote is ever hidden behind Simple mode (B2.4).
  const hasBuildsPrep = Boolean(lesson.builds || lesson.prep);
  const hasFramework = Boolean(
    lesson.frameworkId ||
    (lesson.frameworkData && Object.keys(lesson.frameworkData).length > 0),
  );
  const hasAssessmentAdvanced = Boolean(
    lesson.assessment?.purpose || lesson.assessment?.notes,
  );
  const showBuildsPrep = advanced || hasBuildsPrep;
  const showFramework = advanced || hasFramework;
  const showAssessmentAdvanced = advanced || hasAssessmentAdvanced;

  const assessmentSummary = lesson.assessment?.kind
    ? lesson.assessment.kind === "formative"
      ? "Formative"
      : "Summative"
    : lesson.assessment?.title
      ? stripHtml(lesson.assessment.title).slice(0, 40)
      : "—";

  return (
    <div className={`cp-subj ${subjectCls} ${styles.root}`}>
      <div className={styles.modeRow}>
        <ToggleGroup
          options={[
            {
              value: "simple",
              label: "Simple",
              title: "Show the everyday planning fields only.",
            },
            {
              value: "advanced",
              label: "Advanced",
              title:
                "Reveal every field — builds-on, prep, framework, and the full assessment detail.",
            },
          ]}
          value={advanced ? "advanced" : "simple"}
          onChange={(v) => setAdvanced(v === "advanced")}
          ariaLabel="Editor detail level"
          size="sm"
          variant="prominent"
        />
      </div>

      {showMeta && <MetaStrip lessonId={lessonId} />}

      <ScalarHeader lessonId={lessonId} />

      <Section
        label="Lesson flow"
        summary={flowSummary}
        open={open.flow}
        onToggle={() => toggle("flow")}
        tooltip="The sequence of this lesson — warm-up, main task, close. Drag the banners to reorder; load a preset to start fast."
      >
        <LessonEditor lessonId={lessonId} host="modal" />
      </Section>

      <Section
        label="Standards"
        summary={stdCount > 0 ? `${stdCount} tagged` : "none tagged"}
        open={open.standards}
        onToggle={() => toggle("standards")}
        tooltip="The standards this lesson covers. Tag from your frameworks (set which you use in Settings → Standards)."
      >
        <StandardsTab lessonId={lessonId} />
      </Section>

      <Section
        label="Resources"
        summary={
          lesson.resources.length > 0 ? `${lesson.resources.length}` : "none"
        }
        open={open.resources}
        onToggle={() => toggle("resources")}
        tooltip="Files, links, and notes attached to this lesson. Add with the + button or drag files in."
      >
        <ResourcesTab lessonId={lessonId} />
      </Section>

      <Section
        label="Differentiation"
        open={open.differentiation}
        onToggle={() => toggle("differentiation")}
        tooltip="How the same lesson reaches each group — Support, On level, Extension. Saves to your copy."
      >
        <DifferentiationTab lessonId={lessonId} />
      </Section>

      <Section
        label="Assessment"
        summary={assessmentSummary}
        open={open.assessment}
        onToggle={() => toggle("assessment")}
        tooltip="An assessment attached to this lesson — a check for understanding (formative) or an assessment of mastery (summative)."
      >
        <AssessmentSection
          lessonId={lessonId}
          showAdvanced={showAssessmentAdvanced}
        />
      </Section>

      {showBuildsPrep && (
        <Section
          label="Builds & prep"
          open={open.buildsPrep}
          onToggle={() => toggle("buildsPrep")}
          tooltip="The prior learning this lesson builds on, and what to ready before teaching."
        >
          <BuildsPrepSection lessonId={lessonId} />
        </Section>
      )}

      {showFramework && (
        <Section
          label="Framework"
          open={open.framework}
          onToggle={() => toggle("framework")}
          tooltip="An optional per-lesson framework override. Leave blank to inherit the unit’s framework."
        >
          <FrameworkSection lessonId={lessonId} />
        </Section>
      )}

      <Section
        label="Notes"
        open={open.notes}
        onToggle={() => toggle("notes")}
        tooltip="Private planning notes for yourself — reminders, what to watch for, what to change next time."
      >
        <NotesTab lessonId={lessonId} />
      </Section>
    </div>
  );
}
