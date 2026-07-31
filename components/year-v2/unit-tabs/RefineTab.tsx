"use client";

// RefineTab.tsx — the Unit workspace's REFINE tab.
//
// The 7.21 handoff's fifth workspace tab (`ph-workspace.jsx:272` lists
// `unitplan · lessons · assessments · refine · insights`), whose body is
// `PHUnits.Table` at `source-planning-hub/ph-units.jsx:912-998`. It was assigned
// to B3 (agent_shared_log.md:2781), then excluded from B3's scope (`:3350`), and
// nobody picked it up — an exclusion from one tranche, never a product-level
// drop.
//
// WHAT IT IS, AND WHY IT IS NOT THE DRAWER. Refine is the unit's planning
// SPREADSHEET: every lesson a row, every planning field a column, edited in
// place. Assessments and Insights went to the right-hand drawer deliberately
// (the user's own ruling — "tabs→drawer = drawer, NOT new tabs"), and this tab
// does NOT reopen that question, because it is not commentary. The drawer
// REPORTS "5 of 8 lessons still to teach are missing something" and offers no
// way to act on it; Refine is where those five get fixed, without twelve round
// trips through the Lesson Planner. Diagnosis and repair are two jobs, so they
// are two surfaces (CLAUDE.md §3). The shipped Lessons tab is not a substitute
// either: it is a read-only list whose row actions (Plan / Teach / Finish) all
// LEAVE this surface.
//
// THE PASS is the whole point. A teacher picks one field — Objectives,
// Standards, Durations, Assessments — the column lights up, a counter reads
// "3 of 12 done", and Enter walks straight down it. That is the interaction the
// handoff built the table around, and the reason a table beats five visits to a
// lesson editor.
//
// WHAT IS DELIBERATELY NOT HERE (see lib/unit-refine.ts for the full reasoning):
//   • The handoff's **Flow** column and pass. It writes a `flowName` string this
//     app has no field for; the real equivalent is the lesson's SECTION list, a
//     document rather than a pickable value. A select here would write nothing
//     or silently overwrite twelve lessons' content.
//   • Fill-down on title / objective. Twelve identical objectives is never the
//     intent, and the button would sit one mis-click from the content that took
//     longest to write. Only Standards / Durations / Assessments are fillable.
//   • A `done` jsonb column. Completeness is derived (the 7.28 migration ruled
//     that column content-derived and dropped it).
//
// EVERY COLUMN PERSISTS. Each editable cell writes through `editLesson`, whose
// patch keys are all in `LESSON_CONTENT_KEYS` (lib/planner/lesson-track-b.ts) —
// so nothing here is an input that looks live and saves nothing.

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Lesson, LessonAssessment } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { useComposerOptional } from "@/components/composer";
import { StandardsTaggingPicker } from "@/components/standards/StandardsTaggingPicker";
import { PlannerEmpty, Tooltip } from "@/components/ui";
import { stripHtml } from "@/lib/html-text";
import {
  REFINE_FIELDS,
  REFINE_FILLABLE,
  REFINE_PASSES,
  refineCompleteness,
  refineFillDescriptors,
  refineFillPatch,
  refinePassProgress,
  type RefineFieldKey,
  type RefineFillableKey,
} from "@/lib/unit-refine";
import { dayShort } from "./helpers";
import styles from "./RefineTab.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface RefineTabProps {
  /** The unit's lessons, already filtered + sorted by `unitLessons()`. */
  lessons: readonly Lesson[];
  /** Section-aware resource predicate from the host (which can reach
   *  `getSections`). Without it a lesson whose resources all live on its
   *  sections reads as having none — the exact disagreement `unitGaps`
   *  documents. */
  hasResources?: (lesson: Lesson) => boolean;
  /** Open a lesson in the Lesson Planner — the escape hatch from any cell whose
   *  full editor lives there. */
  onPlan: (id: string) => void;
}

// ── Small pieces ─────────────────────────────────────────────────────────────

/**
 * Does this value carry real markup a plain `<input>` would destroy?
 *
 * `Lesson.title` and `Lesson.objective` MAY CONTAIN RICH-TEXT HTML
 * (lib/types.ts:330). The title is authored through `<RichTextEditor singleLine>`
 * in components/daily/LessonDetail.tsx:671, and the objective the same way in
 * LessonWorkspace.tsx:259 and PlanningTabs.tsx:661 (which stores `I can ${html}`).
 *
 * An `<input>` cannot hold HTML. Binding `value={l.objective}` and writing
 * `e.target.value` back therefore renders a bolded objective as the literal
 * `I can <em>place</em> a fraction…` and DESTROYS the markup on the first
 * keystroke — silently, with no error and no undo prompt. So a value with a tag
 * in it is rendered read-only instead.
 *
 * WHY A TAG TEST AND NOT A ROUND-TRIP. This guard first shipped as
 * `stripHtml(value) === value.trim()`, reading the `stripHtml(escapeHtml(t)) ===
 * t.trim()` contract (lib/html-text.ts:11) backwards. `stripHtml` does two
 * things, and only the first is about markup: it strips tags AND THEN DECODES
 * ENTITIES. So the equality also failed for every value containing an entity —
 * and those are plain text:
 *
 *   • `escapeHtml` emits `&amp;` / `&#39;` / `&quot;` BY DESIGN (html-text.ts:33)
 *   • every contenteditable in the app serialises a typed "&" as `&amp;` and
 *     consecutive spaces as `&nbsp;`; `sanitizeHtml` re-serialises the same way
 *   • a bare `<` … `>` pair in prose ("if a < b > c then") is stripped as if it
 *     were a tag
 *
 * A lesson titled "Fractions &amp; decimals" was therefore locked read-only and
 * told the teacher "formatted text, read-only here" — false, and permanent.
 * A round-trip through `escapeHtml` fixes none of that: `escapeHtml(stripHtml(v))`
 * still cannot reproduce `&nbsp;` or the bare-bracket sentence.
 *
 * Detecting a TAG directly is the property actually wanted, and it is strictly
 * NARROWER than the old test (anything this matches, `stripHtml` also removed),
 * so nothing that was editable becomes locked. `<` must be followed by a letter
 * (optionally after a closing `/`) and a `>` must close it — which is what every
 * tag `sanitizeHtml` can emit looks like, and what "1 < 2" is not. The residual
 * false positive is prose like "compare <b and c>"; the cost there is a locked
 * cell with an explanation, never lost data, which is the right side to err on.
 *
 * DISPLAY NOTE. An editable cell binds the RAW stored string, so a title stored
 * as "Fractions &amp; decimals" shows its entity in the input. That is
 * deliberate: decoding on read while writing the decoded text back would turn a
 * stored `&lt;b&gt;` (the literal characters "<b>") into a real tag on the first
 * keystroke — a second, worse data-loss path in the name of cosmetics.
 */
const TAG = /<\/?[a-z][^>]*>/i;

function isPlainText(value: string): boolean {
  return !TAG.test(value);
}

/**
 * A Refine cell for a field that may carry rich text.
 *
 * Plain values — which is most lessons — stay fully editable, so the tab keeps
 * its whole point. A value carrying markup renders READ-ONLY with the stripped
 * text and a pointer to the editor that can handle it. Deliberately conservative:
 * it refuses to edit what it cannot edit losslessly rather than guessing, and it
 * never strips on write (which would lose the markup just as permanently).
 *
 * The input stays focusable and keeps its `onKeyDown`, so an Enter-driven Pass
 * still walks straight down the column past a read-only row.
 */
function RichSafeCell({
  cellRef,
  value,
  placeholder,
  ariaLabel,
  className,
  onKeyDown,
  onCommit,
}: {
  cellRef: (el: HTMLInputElement | null) => void;
  value: string;
  placeholder: string;
  ariaLabel: string;
  className: string;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onCommit: (next: string) => void;
}) {
  if (!isPlainText(value)) {
    return (
      <input
        ref={cellRef}
        className={className}
        data-rich-readonly=""
        value={stripHtml(value)}
        readOnly
        aria-readonly="true"
        aria-label={`${ariaLabel} — formatted text, read-only here`}
        title="This has formatting, which a table cell can't hold without flattening it. Open the lesson in the Lesson Planner to edit it."
        onKeyDown={onKeyDown}
      />
    );
  }
  return (
    <input
      ref={cellRef}
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onChange={(e) => onCommit(e.target.value)}
    />
  );
}

/** The row's leading marker: a check for taught, else the ordinal. Mirrors the
 *  handoff's `.num` cell, minus its "today" state (this modal is not the live
 *  day — the same reason `explorerStatus` refuses a wall-clock "now"). */
function RowMarker({
  index,
  taught,
}: {
  index: number;
  taught: boolean;
}): ReactNode {
  return (
    <span className={styles.num} data-taught={taught ? "" : undefined}>
      {taught ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        index + 1
      )}
    </span>
  );
}

/** The row's completeness cluster — one dot per planning field.
 *
 *  The dots are decorative (`aria-hidden`); the accessible reading is the
 *  adjacent text count, so a screen-reader user gets "3 of 5 planned" rather
 *  than five unlabelled shapes. Shape carries the state as well as colour (a
 *  filled dot vs a hollow ring), so the cluster is not colour-alone — the
 *  handoff's legend encodes by background colour only, which is the one thing
 *  here worth NOT copying. */
function PlannedDots({
  lesson,
  hasResources,
}: {
  lesson: Lesson;
  hasResources?: (lesson: Lesson) => boolean;
}): ReactNode {
  const c = refineCompleteness(
    lesson,
    hasResources ? { hasResources } : undefined,
  );
  const missing = REFINE_FIELDS.filter((f) => !c[f]);
  const label =
    missing.length === 0
      ? "Everything planned on this lesson"
      : `Still missing: ${missing.join(", ")}`;
  return (
    <Tooltip content={label} side="left" tooltipId="ue-refine-dots">
      <span className={styles.dots} tabIndex={0} role="note">
        <span className={styles.dotRow} aria-hidden="true">
          {REFINE_FIELDS.map((f) => (
            <span key={f} className={styles.dot} data-on={c[f] ? "" : undefined} />
          ))}
        </span>
        <span className={styles.dotCount}>
          {c.filled}/{c.total}
        </span>
      </span>
    </Tooltip>
  );
}

/** A fill-down control in a column header. Doubled class (`.fd.fd`) because
 *  `.cp-root button` (0,1,1) strips a single-class button rule. */
function FillDown({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <Tooltip
      content={
        disabled
          ? "Nothing to copy — the first lesson in this unit has no value in this column yet."
          : label
      }
      side="bottom"
      tooltipId="ue-refine-filldown"
    >
      <button
        type="button"
        className={`${styles.fd} ${styles.fd}`}
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 4v13M6 12l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Tooltip>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function RefineTab({
  lessons,
  hasResources,
  onPlan,
}: RefineTabProps): ReactNode {
  const { editLesson, describeStandard, mergeStandards } = usePlanner();
  const composer = useComposerOptional();

  /** The active pass, or null for "No pass" (the resting state). */
  const [pass, setPass] = useState<RefineFieldKey | null>(null);
  /** Which lesson's standards picker is open. */
  const [stdFor, setStdFor] = useState<string | null>(null);

  const resOpts = useMemo(
    () => (hasResources ? { hasResources } : undefined),
    [hasResources],
  );

  // ── Enter-to-advance ──────────────────────────────────────────────────────
  // The keyboard run that makes a pass a pass. Refs are keyed
  // `${column}:${rowIndex}`; Enter focuses the SAME column one row down. When
  // there is no next row Enter is left alone — it must not swallow the key and
  // strand the teacher on the last cell with nothing having happened.
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(
    new Map(),
  );
  const registerCell = useCallback(
    (column: string, row: number) =>
      (el: HTMLInputElement | HTMLSelectElement | null): void => {
        const key = `${column}:${row}`;
        if (el) cellRefs.current.set(key, el);
        else cellRefs.current.delete(key);
      },
    [],
  );
  const advance = useCallback(
    (column: string, row: number) =>
      (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void => {
        if (e.key !== "Enter") return;
        const next = cellRefs.current.get(`${column}:${row + 1}`);
        if (!next) return;
        e.preventDefault();
        next.focus();
        if (next instanceof HTMLInputElement) next.select();
      },
    [],
  );

  // ── Writes ────────────────────────────────────────────────────────────────
  // Every edit coalesces on `lesson:<id>:<field>` so a typing burst is ONE undo
  // step (the store's 700ms window), matching every other text editor in the app.
  const edit = useCallback(
    (id: string, patch: Partial<Lesson>, field: string): void => {
      editLesson(id, patch, { key: `lesson:${id}:${field}`, ts: Date.now() });
    },
    [editLesson],
  );

  /**
   * Copy the first lesson's value down the column.
   *
   * All N writes share ONE coalesce key and one timestamp, so the store's
   * coalescing window folds them into a SINGLE undo step — otherwise undoing a
   * twelve-lesson fill would take twelve presses of ⌘Z. That invariant lives in
   * `refineFillDescriptors`, which returns the writes as DATA: a static render
   * fires no events, so it is the only way the property can be asserted at all
   * (this handler never runs in a test). It also returns nothing when the source
   * cell is empty, which is what stops a fill-down from silently CLEARING the
   * column (the handoff's version has no such guard and does exactly that).
   */
  const fillDown = useCallback(
    (field: RefineFillableKey): void => {
      // One clock reading for the whole fill: sampling Date.now() per write can
      // straddle the store's coalescing window and split the undo step.
      for (const d of refineFillDescriptors(lessons, field, Date.now()))
        editLesson(d.id, d.patch, d.coalesce);
    },
    [lessons, editLesson],
  );

  // ── Readiness ─────────────────────────────────────────────────────────────
  // The empty branch goes through <PlannerEmpty>, which consults the store's
  // hydration state before it will claim anything is empty. Without it, the
  // 11–16s Supabase hydrate — during which `lessons` is legitimately empty —
  // would tell a teacher their unit has no lessons, and a FAILED hydrate would
  // say the same thing with no hint the backend was down. That conflation is
  // what made a healthy deploy look dead in the 7.16 cutover.
  //
  // Checked only when there is nothing to show, so an `error` arriving AFTER a
  // good hydrate (a failed background refresh) cannot blank a table the teacher
  // is already editing.
  if (lessons.length === 0) {
    return (
      <div className={styles.root}>
        <PlannerEmpty
          skeletonLines={6}
          heading="No lessons in this unit yet."
          body="Refine edits a unit’s lessons side by side — add a lesson and it shows up as a row here."
        />
      </div>
    );
  }

  const progress = pass ? refinePassProgress(lessons, pass, resOpts) : null;
  const passLabel = REFINE_PASSES.find((p) => p.key === pass)?.label ?? "";
  const pickerLesson =
    stdFor === null ? null : (lessons.find((l) => l.id === stdFor) ?? null);

  return (
    <div className={styles.root}>
      {/* ── Pass picker ────────────────────────────────────────────────── */}
      <div className={styles.controls}>
        <Tooltip
          content="Pick one thing to finish across the whole unit — the column lights up and Enter walks you down it, lesson by lesson."
          side="bottom"
          tooltipId="ue-refine-pass"
        >
          <label className={styles.pick} htmlFor="ue-refine-pass">
            <span className={styles.pickLabel}>Pass</span>
            <select
              id="ue-refine-pass"
              className={styles.select}
              value={pass ?? ""}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setPass((e.target.value || null) as RefineFieldKey | null)
              }
            >
              <option value="">No pass</option>
              {REFINE_PASSES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </Tooltip>
        {progress ? (
          <p className={styles.passProgress} role="status">
            {passLabel}: {progress.done} of {progress.total} done
            {progress.done < progress.total
              ? " — Enter jumps to the next lesson"
              : ""}
          </p>
        ) : null}
      </div>

      {/* ── The table ──────────────────────────────────────────────────── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            Every lesson in this unit, one row each — edit any cell in place.
            Changes save as you type.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.cNum}>
                <span className={styles.srOnly}>Lesson number</span>
              </th>
              <th scope="col" className={styles.cTitle}>
                Lesson
              </th>
              <th
                scope="col"
                className={styles.cObj}
                data-focus={pass === "objective" ? "" : undefined}
              >
                Objective
              </th>
              <th
                scope="col"
                className={styles.cStd}
                data-focus={pass === "standards" ? "" : undefined}
              >
                <span className={styles.thText}>Standards</span>
                <FillDown
                  label={REFINE_FILLABLE[0].label}
                  disabled={refineFillPatch(lessons, "standards") === null}
                  onClick={() => fillDown("standards")}
                />
              </th>
              <th
                scope="col"
                className={styles.cDur}
                data-focus={pass === "duration" ? "" : undefined}
              >
                <span className={styles.thText}>Min</span>
                <FillDown
                  label={REFINE_FILLABLE[1].label}
                  disabled={refineFillPatch(lessons, "duration") === null}
                  onClick={() => fillDown("duration")}
                />
              </th>
              <th
                scope="col"
                className={styles.cAss}
                data-focus={pass === "assessment" ? "" : undefined}
              >
                <span className={styles.thText}>Assessment</span>
                <FillDown
                  label={REFINE_FILLABLE[2].label}
                  disabled={refineFillPatch(lessons, "assessment") === null}
                  onClick={() => fillDown("assessment")}
                />
              </th>
              <th scope="col" className={styles.cRes}>
                Res
              </th>
              <th scope="col" className={styles.cDone}>
                Planned
              </th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l, i) => {
              const taught = l.status === "done";
              return (
                <tr key={l.id} data-planner-item={`lesson:${l.id}`}>
                  <td className={styles.cNum}>
                    <RowMarker index={i} taught={taught} />
                  </td>

                  {/* Title */}
                  <td className={styles.cTitle}>
                    <RichSafeCell
                      cellRef={registerCell("title", i)}
                      className={styles.input}
                      value={l.title}
                      placeholder="Lesson title…"
                      ariaLabel={`Title, lesson ${i + 1}`}
                      onKeyDown={advance("title", i)}
                      onCommit={(next) => edit(l.id, { title: next }, "title")}
                    />
                    <span className={styles.rowMeta}>
                      Wk {l.week} · {dayShort(l.day)}
                    </span>
                  </td>

                  {/* Objective */}
                  <td
                    className={styles.cObj}
                    data-focus={pass === "objective" ? "" : undefined}
                  >
                    <RichSafeCell
                      cellRef={registerCell("objective", i)}
                      className={styles.input}
                      value={l.objective}
                      placeholder="I can…"
                      ariaLabel={`Objective, lesson ${i + 1}`}
                      onKeyDown={advance("objective", i)}
                      onCommit={(next) =>
                        edit(l.id, { objective: next }, "objective")
                      }
                    />
                  </td>

                  {/* Standards — a BUTTON, not a select.
                      The handoff picks one code from a unit-local list; this app
                      has a 174-framework catalog and stores codes ALONGSIDE
                      their index-aligned catalog uuids, because a code is unique
                      only per framework. A single-select here would drop every
                      tag past the first and lose the uuids with them. */}
                  <td
                    className={styles.cStd}
                    data-focus={pass === "standards" ? "" : undefined}
                  >
                    <Tooltip
                      content={
                        l.standards.length > 0
                          ? `Change which standards this lesson covers (${l.standards.join(", ")})`
                          : "Tag the standards this lesson covers — searches the frameworks you set in Settings → Standards"
                      }
                      side="top"
                      tooltipId="ue-refine-std"
                    >
                      <button
                        type="button"
                        className={`${styles.cellBtn} ${styles.cellBtn}`}
                        aria-haspopup="dialog"
                        aria-label={`Standards, lesson ${i + 1}`}
                        onClick={() => setStdFor(l.id)}
                      >
                        {l.standards.length > 0 ? (
                          <span className={styles.stdCodes}>
                            {l.standards[0]}
                            {l.standards.length > 1
                              ? ` +${l.standards.length - 1}`
                              : ""}
                          </span>
                        ) : (
                          <span className={styles.placeholder}>—</span>
                        )}
                      </button>
                    </Tooltip>
                  </td>

                  {/* Duration */}
                  <td
                    className={styles.cDur}
                    data-focus={pass === "duration" ? "" : undefined}
                  >
                    <input
                      ref={registerCell("duration", i)}
                      className={`${styles.input} ${styles.inputNum}`}
                      type="number"
                      min={5}
                      step={5}
                      value={l.durationMinutes ?? ""}
                      placeholder="—"
                      aria-label={`Minutes, lesson ${i + 1}`}
                      onKeyDown={advance("duration", i)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        // An empty field CLEARS the column: the patch key must
                        // still be present (as undefined) or the write path
                        // skips it and the old value survives the clear — the
                        // key-presence contract in lesson-track-b.ts.
                        edit(
                          l.id,
                          { durationMinutes: n > 0 ? n : undefined },
                          "duration",
                        );
                      }}
                    />
                  </td>

                  {/* Assessment — kind only. Title / purpose / notes are the
                      drawer's and the Lesson Planner's job; this cell sets which
                      KIND of check the lesson carries, preserving whatever text
                      is already on it. */}
                  <td
                    className={styles.cAss}
                    data-focus={pass === "assessment" ? "" : undefined}
                  >
                    <select
                      ref={registerCell("assessment", i)}
                      className={styles.select}
                      value={l.assessment?.kind ?? ""}
                      aria-label={`Assessment, lesson ${i + 1}`}
                      onKeyDown={advance("assessment", i)}
                      onChange={(e) => {
                        const kind = e.target.value as
                          | LessonAssessment["kind"]
                          | "";
                        const rest = l.assessment;
                        if (!kind) {
                          // Clearing the KIND must not silently delete a title,
                          // purpose or notes the teacher wrote in the Lesson
                          // Planner. Drop the whole object only when there is
                          // nothing else on it; otherwise keep the text and let
                          // it sit in the drawer's "unclassified" bucket, which
                          // exists for exactly this state.
                          const bare =
                            rest === undefined ||
                            (!rest.title && !rest.purpose && !rest.notes);
                          edit(
                            l.id,
                            {
                              assessment: bare
                                ? undefined
                                : { ...rest, kind: undefined },
                            },
                            "assessment",
                          );
                          return;
                        }
                        edit(l.id, { assessment: { ...rest, kind } }, "assessment");
                      }}
                    >
                      <option value="">—</option>
                      <option value="formative">Formative</option>
                      <option value="summative">Summative</option>
                    </select>
                  </td>

                  {/* Resources */}
                  <td className={styles.cRes}>
                    <Tooltip
                      content={
                        composer
                          ? "Attach a link, file, video, or doc to this lesson"
                          : "Open this lesson in the Lesson Planner to attach resources"
                      }
                      side="top"
                      tooltipId="ue-refine-res"
                    >
                      <button
                        type="button"
                        className={`${styles.cellBtn} ${styles.cellBtn}`}
                        aria-label={`Resources, lesson ${i + 1}`}
                        onClick={() =>
                          composer
                            ? composer.openComposer({
                                lesson: l,
                                mode: "resource",
                              })
                            : onPlan(l.id)
                        }
                      >
                        {l.resources.length > 0 ? (
                          l.resources.length
                        ) : (
                          <span className={styles.placeholder}>+</span>
                        )}
                      </button>
                    </Tooltip>
                  </td>

                  {/* Planned */}
                  <td className={styles.cDone}>
                    <PlannedDots lesson={l} hasResources={hasResources} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Keyed on the lesson so switching rows remounts the picker with the new
          lesson's seed rather than reusing stale selection state. */}
      {pickerLesson ? (
        <StandardsTaggingPicker
          key={pickerLesson.id}
          open
          initialCodes={pickerLesson.standards}
          initialIds={pickerLesson.standardIds}
          initialDescriptions={Object.fromEntries(
            // `describeStandard` returns the CODE itself when the catalog has no
            // wording for it — never null — so already-tagged chips read as the
            // bare code rather than blank until a search fills them in.
            pickerLesson.standards.map((c) => [c, describeStandard(c)]),
          )}
          onClose={() => setStdFor(null)}
          onApply={(codes, descriptions, ids) => {
            // Fold the picker's wording into the store FIRST, so every surface
            // that renders these codes (this cell's tooltip, the Standards tab,
            // the Insights pane) reads them with descriptions immediately
            // instead of waiting for a reload.
            mergeStandards(descriptions);
            // ids === null means some code has no known catalog uuid. The prior
            // `standardIds` is aligned to the OLD codes, so keeping it would
            // mis-identify a different catalog row — clear it and let identity
            // degrade to the safe code fallback (the same rule StandardsTab
            // documents).
            edit(
              pickerLesson.id,
              { standards: codes, standardIds: ids ?? [] },
              "standards",
            );
            setStdFor(null);
          }}
        />
      ) : null}
    </div>
  );
}
