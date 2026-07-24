"use client";

// AssessmentsPanel.tsx — the Unit workspace context drawer's Assessments panel
// (B3).
//
// TWO HALVES, DELIBERATELY NOT MERGED. A teacher tags assessments at two
// different levels, and they are different things:
//
//   • UNIT-OWNED (./UnitAssessments) — rows in `unit_assessments`, owned by the
//     unit itself: a pre-test, a mid-unit check, a final task. A unit owns many;
//     none belongs to a lesson. Rendered FIRST, in its own filled container,
//     with "Whole unit · <kind>" on every row.
//   • LESSON-LEVEL (this file) — the four `assessment_*` columns behind
//     `Lesson.assessment` (B2), rolled up across the unit's lessons and grouped
//     by kind. Every row names the lesson it hangs off.
//
// Merging them into one list would make "does this belong to the unit or to
// Tuesday's lesson?" unanswerable at a glance — so the two halves carry
// different containers, different row silhouettes (ring glyph vs filled dot) and
// an explicit heading each. Only the KIND colours are shared, because kind means
// the same thing on both sides.
//
// The lesson half is a unit-scoped ROLL-UP: it answers "what am I actually
// checking in this unit, and where does each check live?" — a question the lesson
// editor can only answer one lesson at a time.
//
// THREE BUCKETS, NOT TWO. `LessonAssessment.kind` is OPTIONAL and an absent
// kind ROUND-TRIPS through the DB: `assessmentFromRow` (lib/planner/
// lesson-track-b.ts) rebuilds an assessment that carries only title / purpose /
// notes, and re-validates a garbage stored kind down to `undefined`. So a
// formative|summative filter would silently HIDE real, teacher-written
// assessments. Every assessment lands in exactly one of Formative · Summative ·
// Unclassified, and the third bucket is the one that keeps the roll-up honest.
//
// ONE WRITE PATH. Every mutation here goes through the planner store's
// `editLesson(id, { assessment }, { key: "lesson:<id>:assessment", ts })` —
// byte-identical to LessonWorkspace's AssessmentSection. That means the store's
// live save target routes the write exactly as it does in the editor (a Personal
// edit lazily forks; a Team-mode edit writes master), the whole-object patch
// flows through `lessonTrackBColumns` and its `isAssessmentKind` validity gate,
// and a typing burst coalesces into ONE undo step. There is deliberately no
// second write path — no direct source call, no bespoke patch shape.
//
// REMOVE CLEARS ALL FOUR FIELDS. Removing commits `{}` — exactly what the
// editor's "None" handler sends. Nulling only `kind` would leave the title /
// purpose / notes behind, and the next read would rebuild a kind-less
// assessment that reappears in the Unclassified bucket (the prototype's bug).
// Because a locally-committed `{}` still sits on `lesson.assessment` until the
// next hydrate, `hasAssessmentContent` — not mere presence — decides what the
// list shows, so a removed assessment disappears immediately and stays gone.
//
// NARROW-FIRST. The drawer is ~320px on desktop and a full-width band below
// 900px; every row is a single column, and no control assumes a wide pane.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Lesson, LessonAssessment } from "@/lib/types";
import { isAssessmentKind } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import type { PlannerDataState } from "@/lib/planner-store";
import {
  Button,
  EmptyState,
  Skeleton,
  ToggleGroup,
  Tooltip,
} from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import { dayShort } from "../unit-tabs/helpers";
import { UnitAssessments } from "./UnitAssessments";
import styles from "./AssessmentsPanel.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface AssessmentsPanelProps {
  /**
   * The open unit — the id as it appears on `Lesson.unit`. Only the UNIT-owned
   * half needs it (the lesson roll-up derives everything from `lessons`), and it
   * is the same value the Unit Plan tab writes its team fields with.
   */
  unitId: string;
  /**
   * Whether this pane is actually on screen (`drawerOpen && pane ===
   * "assessments"`). The drawer subtree stays MOUNTED while closed — the shell
   * hides it with `display: none` — and "assessments" is the default pane, so
   * without this the unit-owned half would read `unit_assessments` on every
   * unit-explorer open, for a pane nobody opened.
   *
   * Deliberately REQUIRED, not defaulted to `true`: a future host that forgets
   * it should fail to compile rather than silently reintroduce the round-trip.
   * Only the unit half consumes it — the lesson roll-up is a pure derivation of
   * `lessons` and fetches nothing.
   */
  visible: boolean;
  /**
   * The unit's lessons — already filtered + sorted by `unitLessons()` (archived
   * excluded, week→day order). The panel derives its rows from these; it never
   * queries the store for the lesson list itself, so the drawer host owns the
   * unit scope.
   */
  lessons: readonly Lesson[];
  /**
   * Open a lesson. The host decides what "open" means (today: the Explorer's
   * in-modal switch to the Lesson Planner) — the panel only knows the id.
   */
  onOpenLesson: (lessonId: string) => void;
  /**
   * Planner data readiness, supplied by the host (`usePlannerDataState()`). The
   * panel does NOT call the hook itself, so it stays a pure body.
   *
   * It is consulted ONLY when there is nothing to show — exactly PlannerEmpty's
   * contract. An `error` that arrives after a good hydrate must not blank a list
   * the teacher is reading, so a non-empty `lessons` always renders. Omitted (or
   * "settled") means the empty list is real, not a hydrate in flight.
   */
  dataState?: PlannerDataState;
  className?: string;
}

// ── Kind bucketing ───────────────────────────────────────────────────────────

/** The three buckets an assessment can land in. `unclassified` is a REAL,
 *  persisted state (kind null, text present), not an error case. */
type KindBucket = "formative" | "summative" | "unclassified";

/**
 * Does this assessment hold anything a teacher actually wrote?
 *
 * `Lesson.assessment` is absent when the row's four columns are all null — but
 * a local Remove commits `{}`, and a cleared field can leave `{ title: "" }`
 * behind until the next hydrate. Presence alone would therefore keep an empty
 * husk in the list. Content is the test.
 */
function hasAssessmentContent(
  a: LessonAssessment | undefined,
): a is LessonAssessment {
  if (!a) return false;
  return (
    isAssessmentKind(a.kind) ||
    (a.title ?? "").trim() !== "" ||
    (a.purpose ?? "").trim() !== "" ||
    (a.notes ?? "").trim() !== ""
  );
}

/** An unvalidated or absent kind buckets as Unclassified — never dropped. */
function bucketOf(a: LessonAssessment): KindBucket {
  return isAssessmentKind(a.kind) ? a.kind : "unclassified";
}

interface AssessmentRow {
  lesson: Lesson;
  assessment: LessonAssessment;
  bucket: KindBucket;
}

const GROUPS: Array<{ key: KindBucket; label: string }> = [
  { key: "formative", label: "Formative" },
  { key: "summative", label: "Summative" },
  { key: "unclassified", label: "Unclassified" },
];

const KIND_OPTIONS: Array<ToggleOption<KindBucket>> = [
  {
    value: "unclassified",
    label: "Not set",
    ariaLabel: "Unclassified",
    title:
      "Leave the kind blank — the assessment still shows here, under Unclassified.",
    tooltipId: "b3-assess-kind-unset",
  },
  {
    value: "formative",
    label: "Formative",
    title:
      "A check for understanding during learning (exit ticket, observation).",
    tooltipId: "b3-assess-kind-formative",
  },
  {
    value: "summative",
    label: "Summative",
    title: "An end-of-learning assessment of mastery (quiz, unit test).",
    tooltipId: "b3-assess-kind-summative",
  },
];

/** The lesson's placement + planned length, from store truth only. Week/day are
 *  always present; `time` and `durationMinutes` are optional and simply drop out
 *  when unset — never a fabricated "0 min". */
function lessonMeta(lesson: Lesson): string {
  const parts: string[] = [`Wk ${lesson.week} · ${dayShort(lesson.day)}`];
  if (lesson.time) parts.push(lesson.time);
  if (typeof lesson.durationMinutes === "number") {
    parts.push(`${lesson.durationMinutes} min`);
  }
  return parts.join(" · ");
}

// ── Chevron ──────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      className={`${styles.chev} ${open ? styles.chevOpen : ""}`}
      viewBox="0 0 24 24"
      width="14"
      height="14"
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

// ── Detail editor ────────────────────────────────────────────────────────────

/**
 * The expanded editor for ONE selected assessment. Mounted with `key={lessonId}`
 * so switching rows remounts it — the draft always starts from store truth.
 *
 * The draft-vs-store dance mirrors LessonWorkspace's AssessmentSection: an
 * external change (undo/redo, a realtime write, an edit in the lesson editor)
 * reseeds the draft, but never while the teacher is focused inside the panel.
 */
function AssessmentDetail({
  id,
  lesson,
  assessment,
  onCommit,
  onRemove,
}: {
  id: string;
  lesson: Lesson;
  assessment: LessonAssessment;
  onCommit: (lessonId: string, next: LessonAssessment) => void;
  onRemove: (lessonId: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState<LessonAssessment>(assessment);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(assessment);
    // Individual fields, not the object identity — the store hands back a fresh
    // object on every unrelated lesson edit, which would otherwise clobber the
    // draft mid-keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.kind, assessment.title, assessment.purpose, assessment.notes]);

  const commit = useCallback(
    (next: LessonAssessment): void => {
      editing.current = true;
      setDraft(next);
      onCommit(lesson.id, next);
    },
    [lesson.id, onCommit],
  );

  const kindValue = bucketOf(draft);

  return (
    <div
      id={id}
      className={styles.detail}
      onBlurCapture={(e) => {
        // Only when focus LEAVES the editor entirely. A blur that lands on a
        // sibling field (Title → Purpose) is still an editing session, and
        // clearing the guard there would let the next external update — a
        // realtime edit, an undo, a reload of this lesson — reseed `draft` and
        // wipe whatever the teacher is part-way through typing.
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        editing.current = false;
      }}
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title</span>
        <input
          type="text"
          className={styles.textInput}
          value={draft.title ?? ""}
          placeholder="e.g. Fractions exit ticket"
          aria-label="Assessment title"
          onChange={(e) => commit({ ...draft, title: e.target.value })}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Kind</span>
        {/* The tray is inline-flex and cannot wrap; a contained, scrollbar-less
            overflow guarantees the third option is still reachable if the
            drawer is ever narrower than the three chips. */}
        <div className={styles.kindRow}>
          <ToggleGroup
            options={KIND_OPTIONS}
            value={kindValue}
            onChange={(next) =>
              commit({
                ...draft,
                kind: next === "unclassified" ? undefined : next,
              })
            }
            ariaLabel="Assessment kind"
            size="sm"
          />
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>What it checks for</span>
        <textarea
          className={styles.textArea}
          rows={2}
          value={draft.purpose ?? ""}
          placeholder="The understanding or skill this assessment measures…"
          aria-label="Assessment purpose"
          onChange={(e) => commit({ ...draft, purpose: e.target.value })}
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
          onChange={(e) => commit({ ...draft, notes: e.target.value })}
        />
      </label>

      <div className={styles.detailFoot}>
        {/* Destructive → the tooltip is `required` (CLAUDE.md §4): it ignores
            per-id dismissal AND the global off switch. */}
        <Tooltip
          required
          content="Clears this assessment from the lesson — kind, title, what it checks for, and notes all go."
          side="top"
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onRemove(lesson.id)}
          >
            Remove
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

// ── Add flow ─────────────────────────────────────────────────────────────────

/**
 * Attach a new assessment to a lesson that doesn't have one.
 *
 * The teacher picks the lesson AND the kind, because an assessment with no
 * content at all cannot exist (all four columns null reads back as "no
 * assessment"). Defaulting the kind would fabricate a classification, so the
 * two buttons ARE the commit. The write itself is the same `onCommit` the
 * detail editor uses — no second path.
 */
function AddAssessment({
  eligible,
  onAdd,
  onCancel,
}: {
  eligible: readonly Lesson[];
  onAdd: (lessonId: string, kind: "formative" | "summative") => void;
  onCancel: () => void;
}): ReactNode {
  const selectId = useId();
  const [picked, setPicked] = useState(eligible[0]?.id ?? "");
  // The eligible list can shrink under the open form (the picked lesson gets an
  // assessment from the lesson editor, or is archived elsewhere). Derive the
  // effective choice every render so the <select>'s value always matches a real
  // option and the commit can never target a stale id.
  const lessonId = eligible.some((l) => l.id === picked)
    ? picked
    : (eligible[0]?.id ?? "");
  const valid = lessonId !== "";

  return (
    <div className={styles.addForm}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={selectId}>
          Lesson
        </label>
        <select
          id={selectId}
          className={styles.select}
          value={lessonId}
          onChange={(e) => setPicked(e.target.value)}
        >
          {eligible.map((l) => (
            <option key={l.id} value={l.id}>
              {`Wk ${l.week} · ${dayShort(l.day)} — ${l.title}`}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.addHint}>
        Pick the kind to attach it. You can add the title and details next.
      </p>
      <div className={styles.addActions}>
        <Button
          variant="secondary"
          size="sm"
          disabled={!valid}
          tooltip={
            valid
              ? "Attach a formative check to this lesson — a check for understanding during learning."
              : "Pick a lesson first — every lesson in this unit already has an assessment."
          }
          onClick={() => onAdd(lessonId, "formative")}
        >
          Formative
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!valid}
          tooltip={
            valid
              ? "Attach a summative assessment to this lesson — an end-of-learning check of mastery."
              : "Pick a lesson first — every lesson in this unit already has an assessment."
          }
          onClick={() => onAdd(lessonId, "summative")}
        >
          Summative
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function AssessmentsPanel({
  unitId,
  visible,
  lessons,
  onOpenLesson,
  dataState,
  className,
}: AssessmentsPanelProps): ReactNode {
  const { editLesson } = usePlanner();
  const uid = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo<AssessmentRow[]>(
    () =>
      lessons
        .filter((l) => hasAssessmentContent(l.assessment))
        .map((l) => {
          // Narrowed by the filter above; `assessment` is defined here.
          const assessment = l.assessment as LessonAssessment;
          return { lesson: l, assessment, bucket: bucketOf(assessment) };
        }),
    [lessons],
  );

  const grouped = useMemo(() => {
    const out: Record<KindBucket, AssessmentRow[]> = {
      formative: [],
      summative: [],
      unclassified: [],
    };
    for (const row of rows) out[row.bucket].push(row);
    return out;
  }, [rows]);

  const eligible = useMemo(
    () => lessons.filter((l) => !hasAssessmentContent(l.assessment)),
    [lessons],
  );

  // THE single write path — identical to LessonWorkspace's AssessmentSection.
  const commit = useCallback(
    (lessonId: string, next: LessonAssessment): void => {
      editLesson(
        lessonId,
        { assessment: next },
        { key: `lesson:${lessonId}:assessment`, ts: Date.now() },
      );
      // Clearing the last remaining field leaves nothing to show, so the row
      // leaves the list — collapse the detail rather than strand it open over a
      // row that no longer exists.
      if (!hasAssessmentContent(next)) setSelectedId(null);
    },
    [editLesson],
  );

  // Remove = the editor's "None": clear ALL FOUR fields, never just the kind.
  const remove = useCallback(
    (lessonId: string): void => {
      commit(lessonId, {});
    },
    [commit],
  );

  const add = useCallback(
    (lessonId: string, kind: "formative" | "summative"): void => {
      commit(lessonId, { kind });
      setAdding(false);
      setSelectedId(lessonId);
    },
    [commit],
  );

  const rootClass = [styles.root, className].filter(Boolean).join(" ");

  // ── The LESSON half's body ────────────────────────────────────────────────
  // Built as a value rather than an early return, because the UNIT half above it
  // renders regardless: a unit with no lessons (or one whose plan is still
  // hydrating) can still own a pre-test, and blanking the whole pane would hide
  // it. Only this half depends on `lessons`.
  //
  // Data-readiness empty: with no lessons at all we cannot tell "this unit is
  // empty" from "the 11–16s hydrate hasn't landed" or "the hydrate threw", so
  // the host's dataState decides which of the three this is.
  let lessonBody: ReactNode;
  if (lessons.length === 0) {
    if (dataState === "pending") {
      lessonBody = <Skeleton lines={3} size="sm" label="Loading your plan…" />;
    } else if (dataState === "error") {
      lessonBody = (
        <EmptyState
          size="sm"
          heading="Couldn’t load your plan"
          body="Check your connection and reload. Your saved work is safe."
        />
      );
    } else {
      lessonBody = (
        <EmptyState
          size="sm"
          heading="No lessons in this unit yet."
          body="Lesson assessments hang off lessons — add a lesson to the unit and you can attach one here."
        />
      );
    }
  } else {
    lessonBody = (
      <>
        {rows.length === 0 ? (
          // Settled data, genuinely nothing recorded — a plain message, not a
          // loading state and not a congratulation.
          <p className={styles.note}>
            No assessments recorded on this unit’s {lessons.length} lesson
            {lessons.length === 1 ? "" : "s"} yet.
          </p>
        ) : (
          GROUPS.map(({ key, label }) => {
            const groupRows = grouped[key];
            if (groupRows.length === 0) return null;
            return (
              <section key={key} className={styles.group}>
                {/* h5 under the half's h4 — the kind groups are a level below
                    "Lesson assessments", not siblings of it. */}
                <h5 className={styles.groupHead}>
                  <span
                    className={styles.groupDot}
                    data-kind={key}
                    aria-hidden="true"
                  />
                  <span className={styles.groupLabel}>{label}</span>
                  <span className={styles.groupCount}>{groupRows.length}</span>
                </h5>
                <ul className={styles.list}>
                  {groupRows.map(({ lesson, assessment }) => {
                    const open = selectedId === lesson.id;
                    const detailId = `${uid}-${lesson.id}-detail`;
                    const title = (assessment.title ?? "").trim();
                    return (
                      <li key={lesson.id} className={styles.row}>
                        <button
                          type="button"
                          className={styles.rowMain}
                          aria-expanded={open}
                          aria-controls={detailId}
                          onClick={() => setSelectedId(open ? null : lesson.id)}
                        >
                          <span
                            className={styles.glyph}
                            data-kind={key}
                            aria-hidden="true"
                          >
                            <span className={styles.glyphDot} />
                          </span>
                          <span
                            className={
                              title
                                ? styles.rowTitle
                                : `${styles.rowTitle} ${styles.rowTitleEmpty}`
                            }
                          >
                            {title || "Untitled assessment"}
                          </span>
                          <Chevron open={open} />
                        </button>

                        <Tooltip
                          content="Open this lesson in the Lesson Planner, where the assessment is edited alongside the rest of the plan."
                          tooltipId="b3-assess-open-lesson"
                          side="bottom"
                        >
                          <button
                            type="button"
                            className={styles.rowLesson}
                            onClick={() => onOpenLesson(lesson.id)}
                          >
                            <span className={styles.rowLessonTitle}>
                              {lesson.title}
                            </span>
                            <span className={styles.rowMeta}>
                              {lessonMeta(lesson)}
                            </span>
                          </button>
                        </Tooltip>

                        {open ? (
                          <AssessmentDetail
                            key={lesson.id}
                            id={detailId}
                            lesson={lesson}
                            assessment={assessment}
                            onCommit={commit}
                            onRemove={remove}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}

        <div className={styles.addSlot}>
          {adding && eligible.length > 0 ? (
            <AddAssessment
              eligible={eligible}
              onAdd={add}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={eligible.length === 0}
              tooltip={
                eligible.length === 0
                  ? "Every lesson in this unit already has an assessment."
                  : "Attach an assessment to one of this unit’s lessons."
              }
              onClick={() => setAdding(true)}
            >
              Add assessment
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={rootClass}>
      {/* UNIT-owned first: it is the unit's own answer to "how is this unit
          assessed?", and it stays visible even when the lesson list is empty or
          still hydrating. Keyed by unit so a rail switch starts a clean read
          rather than showing the previous unit's rows against the new one. */}
      <UnitAssessments key={unitId} unitId={unitId} visible={visible} />

      <section className={styles.half}>
        <div className={styles.halfHead}>
          <h4 className={styles.halfTitle}>Lesson assessments</h4>
          <span className={styles.halfNote}>Each one belongs to a lesson</span>
        </div>
        {lessonBody}
      </section>
    </div>
  );
}
