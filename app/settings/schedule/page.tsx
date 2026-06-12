"use client";

// Settings → Schedule — the timetable surface.
//
// Sections (top to bottom):
//   1. Schedule rotation — does the timetable repeat weekly, alternate
//                          A/B day plans, or rotate on an N-day cycle?
//                          TEAM-scoped (the whole grade-level team plans
//                          against one rotation pattern). Seeded once
//                          from the onboarding wizard's answer — this
//                          card finally makes that choice revisitable.
//   2. My time blocks    — the teacher's own per-day timetable: when
//                          each class / break / duty meets. PERSONAL-
//                          scoped (specialists and pull-outs differ per
//                          teacher; changing it never touches teammates).
//
// Persistence today is localStorage via lib/use-schedule-settings.ts
// (`mycurricula:team:schedule-rotation` + `mycurricula:user:schedule-
// blocks`); both migrate to Supabase rows in Phase 1B. Planner surfaces
// read blocks through the lib/use-my-schedule.ts seam — not yet adopted,
// so /schedule keeps rendering the sample fixture until that wave. The
// copy below says so honestly.
//
// Domain rules (CLAUDE.md §1): the day editor derives its day pills from
// useSchoolWeek() — never a hard-coded weekday set — and the rotation
// model supports cycles independent of the calendar week.
//
// Tooltip rule (CLAUDE.md §4): every interactive control carries an
// onboarding-voice tooltip. Team-scoped controls (the rotation toggle +
// its stepper) are always-on (`required` / Button-tooltip-without-id);
// personal-scoped editor controls are dismissible via stable tooltipIds.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Button,
  PageHeader,
  ToggleGroup,
  Tooltip,
  type ToggleOption,
} from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { useConsequenceToast } from "@/lib/consequence-toast";
import {
  useSchoolWeek,
  WEEKDAY_LABEL,
  WEEKDAY_LABEL_LONG,
  type Weekday,
} from "@/lib/use-school-week";
import {
  CYCLE_LENGTH_MAX,
  CYCLE_LENGTH_MIN,
  hhmmToMinutes,
  isValidHHMM,
  minutesToHHMM,
  normalizeDayBlocks,
  useScheduleBlocks,
  useScheduleRotation,
  type ScheduleRotation,
  type StoredBlock,
  type StoredBlocksByDay,
} from "@/lib/use-schedule-settings";
import { useMySchedule } from "@/lib/use-my-schedule";
import { SUBJECTS, SUBJECT_BY_ID } from "@/lib/mock";
import type { SubjectId } from "@/lib/types";
import styles from "./page.module.css";

// ── Page ────────────────────────────────────────────────────────────────────

export default function ScheduleSettingsPage(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageHeader
          eyebrow="Settings"
          title="Schedule"
          subtitle="How your team's timetable repeats — and your own daily time blocks."
        />

        <RotationSection />
        <TimeBlocksSection />
      </div>
    </div>
  );
}

// ── Section 1 — Schedule rotation ───────────────────────────────────────────
// One ToggleGroup picking the rotation pattern, plus a cycle-length
// stepper that appears only for "cycle". Team-scoped: every change fires
// a ConsequenceToast naming the blast radius, with Undo, and every
// tooltip is always-on (`tooltipRequired` — CLAUDE.md §4's team-wide-
// settings exception).

const ROTATION_NAME: Readonly<Record<ScheduleRotation, string>> = {
  none: "Same every week",
  ab: "A/B alternating",
  cycle: "Rotating cycle",
};

const ROTATION_OPTIONS: ReadonlyArray<ToggleOption<ScheduleRotation>> = [
  {
    value: "none",
    label: "Same every week",
    title:
      "One fixed weekly timetable — every week runs the same blocks. Changes the rotation for every teacher on your team.",
  },
  {
    value: "ab",
    label: "A/B alternating",
    title:
      "Two day plans (A and B) alternate every school day, independent of the calendar week. Changes the rotation for every teacher on your team.",
  },
  {
    value: "cycle",
    label: "Rotating cycle",
    title:
      "Day 1 through Day N repeat in order, independent of the calendar week — pick the cycle length below. Changes the rotation for every teacher on your team.",
  },
];

function RotationSection(): ReactNode {
  const { rotation, cycleLength, setRotation, setCycleLength } =
    useScheduleRotation();
  const { showConsequence } = useConsequenceToast();
  const [savedTick, setSavedTick] = useState(0);

  const onRotationChange = (next: ScheduleRotation): void => {
    if (next === rotation) return;
    const prev = rotation;
    setRotation(next);
    setSavedTick((t) => t + 1);
    // W2-B8: name the team-wide effect + offer Undo while visible.
    showConsequence({
      message: `Schedule rotation set to “${ROTATION_NAME[next]}” — every teacher on your team now plans against this pattern.`,
      onUndo: () => setRotation(prev),
    });
  };

  const onStepCycle = (delta: number): void => {
    const next = Math.min(
      CYCLE_LENGTH_MAX,
      Math.max(CYCLE_LENGTH_MIN, cycleLength + delta),
    );
    if (next === cycleLength) return;
    const prev = cycleLength;
    setCycleLength(next);
    setSavedTick((t) => t + 1);
    showConsequence({
      message: `Rotation cycle set to ${next} days — every teacher's timetable now repeats every ${next} school days.`,
      onUndo: () => setCycleLength(prev),
    });
  };

  // Decorative repeat preview — Day A · Day B (A/B) or Day 1…Day N
  // (cycle). aria-hidden: the toggle + hint text carry the meaning.
  const previewLabels = useMemo<string[]>(() => {
    if (rotation === "ab") return ["A", "B"];
    if (rotation === "cycle") {
      return Array.from({ length: cycleLength }, (_, i) => `${i + 1}`);
    }
    return [];
  }, [rotation, cycleLength]);

  return (
    <SettingsCard
      anchorId="rotation"
      scope="team"
      eyebrow="Timetable"
      savedTick={savedTick}
      title={
        <Tooltip
          content="How your team's timetable repeats — fixed weekly, A/B alternating days, or an N-day rotating cycle independent of the calendar week. Shared with your team."
          side="bottom"
          required
        >
          <span>Schedule rotation</span>
        </Tooltip>
      }
      hint="Whether the same timetable runs every week, or your days rotate on a cycle of their own — A/B days, a 6-day rotation, anything from 2 to 10 days."
    >
      {/* ── Rotation pattern toggle ───────────────────────────────────
          Wrapped in a horizontal scroller: three descriptive labels
          don't fit a 360px viewport, and internal element scroll is the
          sanctioned escape (BUILD_STANDARD §8). */}
      <div className={styles.toggleScroller}>
        <ToggleGroup
          options={[...ROTATION_OPTIONS]}
          value={rotation}
          onChange={onRotationChange}
          ariaLabel="Schedule rotation pattern"
          size="md"
          variant="prominent"
          tooltipRequired
        />
      </div>

      {/* ── Cycle-length stepper (cycle only) ───────────────────────── */}
      {rotation === "cycle" && (
        <div
          className={styles.cycleRow}
          role="group"
          aria-label="Cycle length in school days"
        >
          <span className={styles.fieldLabel}>Cycle length</span>
          <div className={styles.stepper}>
            <Button
              variant="icon"
              size="md"
              iconAriaLabel="Shorten the cycle by one day"
              disabled={cycleLength <= CYCLE_LENGTH_MIN}
              tooltip={
                cycleLength <= CYCLE_LENGTH_MIN
                  ? `Cycles can't be shorter than ${CYCLE_LENGTH_MIN} days — a 1-day cycle is the same as “Same every week”.`
                  : "Shorten the rotation by one day — the whole team's timetable repeats sooner."
              }
              onClick={() => onStepCycle(-1)}
            >
              −
            </Button>
            <span className={styles.stepperValue} aria-live="polite">
              {cycleLength}
              <span className={styles.stepperUnit}> days</span>
            </span>
            <Button
              variant="icon"
              size="md"
              iconAriaLabel="Lengthen the cycle by one day"
              disabled={cycleLength >= CYCLE_LENGTH_MAX}
              tooltip={
                cycleLength >= CYCLE_LENGTH_MAX
                  ? `Cycles top out at ${CYCLE_LENGTH_MAX} days — longer rotations stop being plannable.`
                  : "Lengthen the rotation by one day — the whole team's timetable repeats later."
              }
              onClick={() => onStepCycle(1)}
            >
              +
            </Button>
          </div>
        </div>
      )}

      {/* ── Repeat preview ────────────────────────────────────────────
          A small visual of the repeating unit. Decorative only. */}
      {previewLabels.length > 0 && (
        <div className={styles.cyclePreview} aria-hidden="true">
          {previewLabels.map((label) => (
            <span key={label} className={styles.cycleChip}>
              Day {label}
            </span>
          ))}
          <span className={styles.cycleRepeat}>then repeats</span>
        </div>
      )}

      <p className={styles.fieldHint}>
        “Same every week” runs one fixed weekly timetable. “A/B alternating”
        swaps two day plans every school day. “Rotating cycle” runs Day&nbsp;1
        through Day&nbsp;N in order — both rotate independently of the calendar
        week, so a holiday simply pushes the next day along.
      </p>
      <p className={styles.fieldHint}>
        Planner surfaces (/schedule, Daily) start following the rotation when
        the backend wave lands — your team&rsquo;s choice is saved now so
        everyone agrees on the pattern before then.
      </p>
    </SettingsCard>
  );
}

// ── Section 2 — My time blocks ──────────────────────────────────────────────
// Per-day timetable editor:
//   • Day pills    — derived from useSchoolWeek().days (never hard-coded).
//                    A dot marks days that already have custom blocks.
//   • Block rows   — start/end <input type="time">, Class/Other type
//                    toggle, subject select OR free-text label, remove.
//   • Empty state  — the sample fixture day (read through the
//                    use-my-schedule seam) with a "start from sample"
//                    shortcut.
//   • Actions      — "Add block" (appends after the latest end time) and
//                    "Copy to all days" (replaces every other day's
//                    blocks; ConsequenceToast with Undo).
//
// Draft model: rows live in local state so a teacher can pass through
// transiently-invalid times (end before start, half-cleared inputs)
// without the row vanishing. Every edit persists the VALID rows
// immediately via useScheduleBlocks (settings have no Save buttons);
// invalid rows stay visible here, flagged unsaved, until fixed. The
// draft re-seeds from storage when the selected day changes or when the
// stored day changes externally (post-mount hydration, another tab) —
// its own persists echoing back are recognized by snapshot key and
// skipped so mid-edit rows survive.

/** The editor's row shape — StoredBlock with always-present, freely
 *  editable fields. `subject` and `label` are BOTH retained so toggling
 *  Class ↔ Other and back never loses what the teacher typed. */
interface DraftRow {
  id: string;
  type: "academic" | "non_academic";
  start: string;
  end: string;
  subject: SubjectId;
  label: string;
}

type RowStatus = "ok" | "incomplete" | "inverted";

const DEFAULT_SUBJECT: SubjectId = SUBJECTS[0].id;

/** Default new-block duration (minutes). */
const DEFAULT_BLOCK_MIN = 45;

/** Cheap unique id — same idiom as lib/use-holidays.ts. */
function makeBlockId(): string {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toDraftRows(stored: readonly StoredBlock[]): DraftRow[] {
  return stored.map((b) => ({
    id: b.id,
    type: b.type,
    start: b.start,
    end: b.end,
    subject: b.subject ?? DEFAULT_SUBJECT,
    label: b.label ?? "",
  }));
}

function rowStatus(row: DraftRow): RowStatus {
  if (!isValidHHMM(row.start) || !isValidHHMM(row.end)) return "incomplete";
  if (hhmmToMinutes(row.end) <= hhmmToMinutes(row.start)) return "inverted";
  return "ok";
}

/** Project one VALID draft row to its persistable shape. Type decides
 *  which detail field ships: Class → subject, Other → label (if any). */
function draftRowToStored(row: DraftRow): StoredBlock {
  const block: StoredBlock = {
    id: row.id,
    type: row.type,
    start: row.start,
    end: row.end,
  };
  if (row.type === "academic") {
    block.subject = row.subject;
  } else if (row.label.trim() !== "") {
    block.label = row.label.trim();
  }
  return block;
}

/** Snapshot key for change detection. normalizeDayBlocks is
 *  deterministic (sorted, fixed key order), so JSON equality is exact. */
function dayKey(blocks: readonly StoredBlock[]): string {
  return JSON.stringify(blocks);
}

// Per-row type toggle options. Shared tooltipId per control class so one
// "Turn off these tips" click silences the tip on every row.
const TYPE_OPTIONS: ReadonlyArray<ToggleOption<"academic" | "non_academic">> = [
  {
    value: "academic",
    label: "Class",
    title:
      "A teaching block — pick which subject meets. It renders in that subject's color on the timetable.",
    tooltipId: "settings-schedule-block-type",
  },
  {
    value: "non_academic",
    label: "Other",
    title:
      "A non-teaching block — lunch, recess, morning meeting, duty. Give it a short label.",
    tooltipId: "settings-schedule-block-type",
  },
];

function TimeBlocksSection(): ReactNode {
  const { days } = useSchoolWeek();
  const { blocksByDay, setDayBlocks, setAllBlocks } = useScheduleBlocks();
  const { showConsequence } = useConsequenceToast();
  const [savedTick, setSavedTick] = useState(0);

  // Selected day — falls back to the first configured school day when
  // unset or when a school-week change drops the previous selection.
  const [selectedRaw, setSelectedRaw] = useState<Weekday | null>(null);
  const selectedDay: Weekday =
    selectedRaw != null && days.includes(selectedRaw) ? selectedRaw : days[0];
  const dayLong = WEEKDAY_LABEL_LONG[selectedDay];

  // The sample fixture for the selected day, read through the same seam
  // planner surfaces will adopt — the preview below shows exactly what
  // /schedule shows for this day.
  const sample = useMySchedule(selectedDay);

  // ── Draft state + re-seed bookkeeping ────────────────────────────────
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const draftDayRef = useRef<Weekday | null>(null);
  const lastPersistKeyRef = useRef<string>(dayKey([]));
  // The blocks we last persisted for the selected day. Source of truth
  // for the keep-the-stored-version rule in commitDraft below — a ref
  // (not the hook state) so rapid consecutive commits never read a
  // stale store snapshot.
  const lastPersistBlocksRef = useRef<readonly StoredBlock[]>([]);

  useEffect(() => {
    const storedBlocks = blocksByDay[selectedDay] ?? [];
    const storedKey = dayKey(storedBlocks);
    // Our own persist echoing back through the hook — keep the draft;
    // it may deliberately hold rows the store dropped (mid-edit
    // incomplete / inverted times).
    if (
      draftDayRef.current === selectedDay &&
      storedKey === lastPersistKeyRef.current
    ) {
      return;
    }
    draftDayRef.current = selectedDay;
    lastPersistKeyRef.current = storedKey;
    lastPersistBlocksRef.current = storedBlocks;
    setDraft(toDraftRows(storedBlocks));
  }, [selectedDay, blocksByDay]);

  /** Draft → persistable blocks, with the keep-the-stored-version rule:
   *  valid rows persist as edited; a row that is mid-edit INVALID keeps
   *  its last persisted version (matched by id) so transiently clearing
   *  a time can never erase a stored block — only the explicit Remove
   *  action deletes. Brand-new rows that were never valid stay
   *  draft-only. Shared by commitDraft AND copyToAllDays so the copy
   *  source can't silently drop a block the teacher is mid-editing. */
  const draftToPersistable = (rows: readonly DraftRow[]): StoredBlock[] => {
    const prevById = new Map(
      lastPersistBlocksRef.current.map((b) => [b.id, b]),
    );
    const persistable: StoredBlock[] = [];
    for (const row of rows) {
      if (rowStatus(row) === "ok") {
        persistable.push(draftRowToStored(row));
      } else {
        const prev = prevById.get(row.id);
        if (prev) persistable.push(prev);
      }
    }
    return persistable;
  };

  /** Update the draft AND persist (see draftToPersistable for the
   *  preservation rule). The "Saved" chip only fires when the persisted
   *  snapshot actually changed, so flagging an unfinished row never
   *  flashes a false confirmation. */
  const commitDraft = (rows: DraftRow[]): void => {
    setDraft(rows);
    draftDayRef.current = selectedDay;
    const nextStored = normalizeDayBlocks(draftToPersistable(rows));
    const nextKey = dayKey(nextStored);
    if (nextKey === lastPersistKeyRef.current) return;
    lastPersistKeyRef.current = nextKey;
    lastPersistBlocksRef.current = nextStored;
    setDayBlocks(selectedDay, nextStored);
    setSavedTick((t) => t + 1);
  };

  /** Patch one row and persist. Every control commits here — including
   *  label keystrokes: a blur-commit would be silently swallowed because
   *  the wrapping <Tooltip> primitive injects its own onBlur via
   *  cloneElement, so instant-apply-on-change is the robust path (and
   *  matches the no-Save-button settings doctrine). */
  const patchRow = (id: string, patch: Partial<DraftRow>): void => {
    commitDraft(draft.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string): void => {
    commitDraft(draft.filter((r) => r.id !== id));
  };

  /** Append a sensible next slot: starts where the latest block ends
   *  (default 08:00), runs DEFAULT_BLOCK_MIN minutes, clamped so the end
   *  stays a valid same-day time. */
  const addBlock = (): void => {
    let startMin = 8 * 60;
    for (const row of draft) {
      if (isValidHHMM(row.end)) {
        startMin = Math.max(startMin, hhmmToMinutes(row.end));
      }
    }
    // Leave room for at least a 1-minute block before midnight.
    startMin = Math.min(startMin, 23 * 60 + 59 - DEFAULT_BLOCK_MIN);
    const row: DraftRow = {
      id: makeBlockId(),
      type: "academic",
      start: minutesToHHMM(startMin),
      end: minutesToHHMM(startMin + DEFAULT_BLOCK_MIN),
      subject: DEFAULT_SUBJECT,
      label: "",
    };
    commitDraft([...draft, row]);
  };

  /** Seed the editor from the sample fixture day so a teacher can tweak
   *  the realistic default instead of building from scratch. */
  const startFromSample = (): void => {
    commitDraft(
      sample.blocks.map((b) => ({
        id: makeBlockId(),
        type: b.type,
        start: b.startLabel,
        end: b.endLabel,
        subject: b.subject ?? DEFAULT_SUBJECT,
        label: b.label ?? "",
      })),
    );
  };

  /** Replace every school day's blocks with this day's valid rows.
   *  Deliberately confirm-free (CLAUDE.md §2 — friction philosophy); the
   *  ConsequenceToast names the overwrite and offers Undo. */
  const copyToAllDays = (): void => {
    // Same preservation merge as commitDraft — a mid-edit invalid row
    // contributes its last persisted version instead of vanishing from
    // every copied day.
    const sourceBlocks = normalizeDayBlocks(draftToPersistable(draft));
    if (sourceBlocks.length === 0) return; // button is disabled anyway
    const prevMap = blocksByDay;
    const nextMap: StoredBlocksByDay = { ...blocksByDay };
    for (const day of days) {
      // The source day keeps its ids (so the open draft stays live);
      // every other day gets fresh ids to keep ids globally unique.
      nextMap[day] =
        day === selectedDay
          ? sourceBlocks
          : sourceBlocks.map((b) => ({ ...b, id: makeBlockId() }));
    }
    lastPersistKeyRef.current = dayKey(sourceBlocks);
    lastPersistBlocksRef.current = sourceBlocks;
    setAllBlocks(nextMap);
    setSavedTick((t) => t + 1);
    showConsequence({
      message: `Copied ${dayLong}'s ${sourceBlocks.length} ${
        sourceBlocks.length === 1 ? "block" : "blocks"
      } to all ${days.length} school days — the other days' blocks were replaced.`,
      onUndo: () => setAllBlocks(prevMap),
    });
  };

  // ── Day pills — derived from the configured school week ──────────────
  const dayOptions = useMemo<Array<ToggleOption<Weekday>>>(
    () =>
      days.map((day) => {
        const customized = (blocksByDay[day]?.length ?? 0) > 0;
        return {
          value: day,
          label: WEEKDAY_LABEL[day],
          ariaLabel: `${WEEKDAY_LABEL_LONG[day]}${
            customized ? " (customized)" : " (sample timetable)"
          }`,
          title: customized
            ? `Edit your ${WEEKDAY_LABEL_LONG[day]} blocks — this day has its own custom timetable.`
            : `Edit your ${WEEKDAY_LABEL_LONG[day]} blocks — this day still uses the sample timetable.`,
          tooltipId: "settings-schedule-day-pill",
          icon: customized ? (
            <span className={styles.dayDot} aria-hidden="true" />
          ) : undefined,
        };
      }),
    [days, blocksByDay],
  );

  const validCount = draft.filter((r) => rowStatus(r) === "ok").length;
  const unsavedCount = draft.length - validCount;

  return (
    <SettingsCard
      anchorId="time-blocks"
      scope="personal"
      eyebrow="Timetable"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Your own daily timetable — when each class and break meets, per school day. Personal: only your view uses it."
          side="bottom"
        >
          <span>My time blocks</span>
        </Tooltip>
      }
      hint="When each class and break meets on each school day. Personal — editing it never changes a teammate's timetable."
    >
      {/* ── Day pills (horizontal scroll on phone) ─────────────────── */}
      <div className={styles.dayScroller}>
        <ToggleGroup
          options={dayOptions}
          value={selectedDay}
          onChange={(d) => setSelectedRaw(d)}
          ariaLabel="School day to edit"
          size="md"
          variant="subtle"
        />
      </div>

      {draft.length === 0 ? (
        // ── Empty day — sample preview + seeding shortcuts ──────────
        <div className={styles.samplePanel}>
          <p className={styles.sampleHint}>
            {sample.blocks.length > 0 ? (
              <>
                Using the sample day — add a block to customize. /schedule
                shows this sample timetable for {dayLong}; your own blocks take
                over there when the backend wave lands.
              </>
            ) : (
              <>
                No blocks yet — add your first block to build your {dayLong}{" "}
                timetable.
              </>
            )}
          </p>
          {sample.blocks.length > 0 && (
            <ul className={styles.sampleList}>
              {sample.blocks.map((b) => (
                <li key={b.id} className={styles.sampleItem}>
                  <span className={styles.sampleTime}>
                    {b.startLabel}–{b.endLabel}
                  </span>
                  <span className={styles.sampleName}>
                    {b.subject ? SUBJECT_BY_ID[b.subject].name : b.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actionsRow}>
            <Button
              variant="primary"
              size="md"
              onClick={addBlock}
              tooltip={`Add your first ${dayLong} block — once a day has its own blocks it stops using the sample.`}
            >
              + Add block
            </Button>
            {sample.blocks.length > 0 && (
              <Button
                variant="secondary"
                size="md"
                onClick={startFromSample}
                tooltip="Copy the sample day's blocks into your own timetable so you can edit them instead of starting from scratch."
              >
                Start from this sample
              </Button>
            )}
          </div>
        </div>
      ) : (
        // ── Block editor ─────────────────────────────────────────────
        <>
          <ul className={styles.blockList}>
            {draft.map((row) => (
              <BlockRow
                key={row.id}
                row={row}
                status={rowStatus(row)}
                dayLong={dayLong}
                onPatch={(patch) => patchRow(row.id, patch)}
                onRemove={() => removeRow(row.id)}
              />
            ))}
          </ul>

          {unsavedCount > 0 && (
            <p className={styles.unsavedNote} role="status">
              Only blocks with a complete start–end range are saved —{" "}
              {unsavedCount} {unsavedCount === 1 ? "row is" : "rows are"}{" "}
              waiting for a valid time.
            </p>
          )}

          <div className={styles.actionsRow}>
            <Button
              variant="primary"
              size="md"
              onClick={addBlock}
              tooltip="Add another block — it starts where your latest block ends."
            >
              + Add block
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={validCount === 0}
              onClick={copyToAllDays}
              tooltip={
                validCount === 0
                  ? "Nothing to copy yet — finish at least one block's times first."
                  : `Copy ${dayLong}'s blocks to every school day — the other days' blocks are replaced (the toast offers Undo).`
              }
            >
              Copy to all days
            </Button>
          </div>
        </>
      )}

      <p className={styles.fieldHint}>
        Blocks save instantly and sort by start time. Days without their own
        blocks keep showing the sample timetable. Planner surfaces pick up your
        custom blocks with the backend wave — until then /schedule renders the
        sample week.
      </p>
    </SettingsCard>
  );
}

// ── One block row ───────────────────────────────────────────────────────────
// Extracted so the row grid + validation message have a clean home. All
// state lives in the parent draft; this is a controlled presentational
// row. Tooltips share per-control-class tooltipIds (dismiss once →
// silenced on every row).

interface BlockRowProps {
  row: DraftRow;
  status: RowStatus;
  /** Long weekday name for tooltip / aria context ("Monday"). */
  dayLong: string;
  /** Patch + persist immediately (times, type, subject, label). */
  onPatch: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
}

function BlockRow({
  row,
  status,
  dayLong,
  onPatch,
  onRemove,
}: BlockRowProps): ReactNode {
  const startTip = `When this block starts on ${dayLong}. 24-hour time.`;
  const endTip = `When this block ends on ${dayLong}. Must be after the start.`;
  const subjectTip =
    "Which subject meets in this block — the timetable renders it in that subject's color.";
  const labelTip =
    "What this block is — e.g. “Lunch”, “Morning meeting”, “Bus duty”.";
  const timeRange =
    isValidHHMM(row.start) && isValidHHMM(row.end)
      ? `${row.start}–${row.end}`
      : "unfinished";

  return (
    <li
      className={[
        styles.blockRow,
        status === "inverted" ? styles.blockRowInvalid : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Start – end time pair */}
      <div className={styles.timePair}>
        <Tooltip
          content={startTip}
          side="top"
          tooltipId="settings-schedule-block-start"
        >
          <input
            type="time"
            value={row.start}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onPatch({ start: e.target.value })
            }
            aria-label="Block start time"
            title={startTip}
            className={styles.timeInput}
          />
        </Tooltip>
        <span className={styles.timeDash} aria-hidden="true">
          –
        </span>
        <Tooltip
          content={endTip}
          side="top"
          tooltipId="settings-schedule-block-end"
        >
          <input
            type="time"
            value={row.end}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onPatch({ end: e.target.value })
            }
            aria-label="Block end time"
            title={endTip}
            className={styles.timeInput}
          />
        </Tooltip>
      </div>

      {/* Class / Other type toggle */}
      <div className={styles.typeCell}>
        <ToggleGroup
          options={[...TYPE_OPTIONS]}
          value={row.type}
          onChange={(t) => onPatch({ type: t })}
          ariaLabel="Block type"
          size="sm"
          variant="subtle"
        />
      </div>

      {/* Subject select (Class) OR free-text label (Other) */}
      <div className={styles.detailCell}>
        {row.type === "academic" ? (
          <Tooltip
            content={subjectTip}
            side="top"
            tooltipId="settings-schedule-block-subject"
          >
            <select
              value={row.subject}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                onPatch({ subject: e.target.value as SubjectId })
              }
              aria-label="Subject for this class block"
              title={subjectTip}
              className={styles.select}
            >
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Tooltip>
        ) : (
          <Tooltip
            content={labelTip}
            side="top"
            tooltipId="settings-schedule-block-label"
          >
            <input
              type="text"
              value={row.label}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onPatch({ label: e.target.value })
              }
              placeholder="e.g. Lunch, Morning meeting"
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              aria-label="Label for this block"
              title={labelTip}
              className={styles.labelInput}
            />
          </Tooltip>
        )}
      </div>

      {/* Remove — destructive, so the tooltip is always-on (no tooltipId) */}
      <div className={styles.removeCell}>
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel={`Remove the ${timeRange} block from ${dayLong}`}
          tooltip={`Remove this block from your ${dayLong} timetable.`}
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>

      {/* Validation line — spans the full row width */}
      {status !== "ok" && (
        <p
          className={
            status === "inverted" ? styles.rowError : styles.rowIncomplete
          }
        >
          {status === "inverted"
            ? "End time must be after the start time — this block isn't saved yet."
            : "Set a start and an end time to save this block."}
        </p>
      )}
    </li>
  );
}
