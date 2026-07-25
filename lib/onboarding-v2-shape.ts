// onboarding-v2-shape.ts — the PURE, React-free core of the v2 onboarding
// wizard (Wave 12c).
//
// Everything here is framework-free so the automated test gate
// (tests/**/*.test.ts, node environment) can exercise the step order, the
// localStorage round-trip, and the first-run-detection matrix without
// rendering React. The React provider (lib/onboarding-v2-state.tsx) and the
// step components import from this module; nothing here imports React, Next,
// or any "use client" module.
//
// ── STORAGE-SHAPE COMPATIBILITY (HARD CONTRACT) ────────────────────────────
// The wizard persists to the SAME localStorage key as the v1 wizard —
// `mycurricula:onboarding` — as `{ stepIndex, data, finished }`, where `data`
// carries AT LEAST the v1 `OnboardingData` fields. Three live seeders read
// exactly that shape and MUST keep working when the v2 wizard runs:
//   • lib/use-schedule-settings.ts  → data.rotation / data.cycleLength
//   • lib/use-subject-settings.ts   → data.subjects[] ({id,name,color,isAcademic})
//   • lib/use-default-template.ts   → data.defaultTemplateId
// The v2 shape EXTENDS the v1 one ADDITIVELY (only `workspaceMode` is new), so
// the resume-merge stays tolerant and the seeders never see a missing field.

import type {
  OnboardingData,
  OnboardingSubject,
  ScheduleRotation,
  SchoolWeekPreset,
  WeekdayId,
} from "@/lib/onboarding-state";
import { SUBJECTS } from "@/lib/mock";
import { DEFAULT_LESSON_TEMPLATE_ID } from "@/lib/lesson-templates";

// ── Shared with lib/use-schedule-settings.ts (kept in sync, not imported —
//    that module is "use client" and would drag React into this leaf). ──────
const DEFAULT_CYCLE_LENGTH = 4;

/**
 * The v2 wizard's collected configuration. Structurally a superset of the v1
 * `OnboardingData` (so every seeder keeps reading its fields) plus the new
 * workspace-first decision.
 */
export interface OnboardingV2Data extends OnboardingData {
  /**
   * Solo-vs-team intent, chosen on the workspace step. Provisioning already
   * mints a full solo workspace at first sign-in, so "solo" IS the resting
   * state and the default — "team" only records that the teacher wants to
   * invite colleagues (the actual invite flow lives in Settings → Workspace).
   */
  workspaceMode: "solo" | "team";
}

/** The wizard's steps, in order (workspace-first — the locked product model).
 *  `schedule` folds the school week + rotation cycle; the full per-day time
 *  editor stays in Settings → Schedule (linked from the step). */
export const ONBOARDING_V2_STEPS = [
  "workspace",
  "courses",
  "schedule",
  "year",
  "appearance",
  "summary",
] as const;

export type OnboardingV2StepId = (typeof ONBOARDING_V2_STEPS)[number];

/** Steps a teacher may Skip without making a choice. Courses + workspace are
 *  load-bearing (they seed the roster and the workspace identity); the
 *  schedule / year / appearance steps all have sensible defaults, so they are
 *  skippable. The summary is the terminal step (no Skip). */
export const SKIPPABLE_V2_STEPS: ReadonlySet<OnboardingV2StepId> = new Set([
  "schedule",
  "year",
  "appearance",
]);

/** localStorage key — DELIBERATELY the same as the v1 wizard (see header). */
export const ONBOARDING_STORAGE_KEY = "mycurricula:onboarding";

// ── Where each answer actually lands ──────────────────────────────────────
//
// The wizard sets `teachers.onboarded_at` when it finishes, so it never runs
// again — on ANY device. But only some of what it collects is stored where a
// second device can see it. Before this map existed the summary said one
// blanket "saved on this device for now", which was wrong in both directions:
// it undersold the answers that DO reach the account, and it implied the rest
// were merely awaiting a sync that would pick them up.
//
// So the recap names each answer's real home. A teacher who set up on a laptop
// and opens the app on a phone can see exactly what they will need to redo,
// instead of meeting a planner that believes it is configured and is not.
//
// The device-local entries are NOT a wizard defect — the matching Settings
// surfaces (Settings → Subjects, Settings → Calendar's year/holidays, Settings
// → Schedule's rotation) write the same localStorage keys, so setting them
// "properly" in Settings is exactly as device-local. The fix is a team-settings
// backend; until it exists, disclosure is the honest interim.

/** Where a collected answer is stored. `account` survives a device change. */
export type OnboardingPersistence = "account" | "device";

export interface OnboardingPersistenceNote {
  /** How the summary names this answer (matches its recap row). */
  label: string;
  where: OnboardingPersistence;
  /** Where it lands, for the recap's per-row caption. */
  detail: string;
}

/**
 * One entry per thing the wizard collects, in recap order. Keep in lockstep
 * with the rows SummaryStep renders — a row without an entry silently loses
 * its disclosure, which is the failure mode this map exists to prevent.
 *
 * A `device` caption asserts something specific: the answer really is stored on
 * this browser and really is read back. That is only true because each of the
 * four has a SEED BRIDGE from this record to the live settings key its surfaces
 * read — `use-subject-settings` (subjects), `use-schedule-settings` (rotation),
 * `use-default-template` (template), `use-academic-year` (school year).
 *
 * The last of those did not exist until it was added alongside this map: the
 * year step wrote `yearStart`/`yearEnd` here and nothing ever read them, so
 * Roadmap, Progression and every other `useAcademicYear` consumer used the
 * heuristic default no matter what the teacher typed. "This browser only" was
 * an OVER-claim for that row — the answer was not saved anywhere usable, on
 * this device or any other. Adding the bridge is what made the caption true.
 *
 * So: before moving a row to `device`, confirm a bridge actually carries it.
 * The caption is a promise about behaviour, not about intent.
 */
export const ONBOARDING_PERSISTENCE: readonly OnboardingPersistenceNote[] = [
  {
    label: "Workspace",
    where: "account",
    detail: "saved to your account",
  },
  {
    label: "Subjects",
    where: "device",
    detail: "this browser only",
  },
  {
    label: "School week",
    where: "account",
    detail: "saved for your whole team",
  },
  { label: "Rotation", where: "device", detail: "this browser only" },
  { label: "School year", where: "device", detail: "this browser only" },
  {
    label: "Lesson template",
    where: "device",
    detail: "this browser only",
  },
  { label: "Appearance", where: "account", detail: "saved to your account" },
] as const;

/** Fast lookup for the summary's per-row caption. */
export const ONBOARDING_PERSISTENCE_BY_LABEL: ReadonlyMap<
  string,
  OnboardingPersistenceNote
> = new Map(ONBOARDING_PERSISTENCE.map((note) => [note.label, note]));

/** The answers that will NOT follow a teacher to another device. */
export function deviceLocalAnswers(): OnboardingPersistenceNote[] {
  return ONBOARDING_PERSISTENCE.filter((n) => n.where === "device");
}

/** The persisted record shape. Identical to the v1 `PersistShape` so a
 *  flag-flip in either direction reads a tolerable record. */
export interface OnboardingV2Persist {
  stepIndex: number;
  data: OnboardingV2Data;
  finished: boolean;
}

/** Weekdays implied by a preset (re-implemented here rather than importing the
 *  client onboarding-state module into this leaf; identical semantics). */
export function weekdaysForV2Preset(preset: SchoolWeekPreset): WeekdayId[] {
  if (preset === "mon_fri") return ["mon", "tue", "wed", "thu", "fri"];
  // sun_thu is the default; custom starts from the sun_thu set.
  return ["sun", "mon", "tue", "wed", "thu"];
}

/** The default, pre-filled configuration the teacher confirms or tweaks. */
export function defaultV2Data(): OnboardingV2Data {
  return {
    teacherName: "",
    grade: "5",
    weekPreset: "sun_thu",
    weekdays: weekdaysForV2Preset("sun_thu"),
    yearStart: "",
    yearEnd: "",
    rotation: "none",
    cycleLength: DEFAULT_CYCLE_LENGTH,
    // Seed the eight locked subjects — every one academic by default; the
    // teacher recolors them and flips non-teaching blocks on the courses step.
    subjects: SUBJECTS.map(
      (sub): OnboardingSubject => ({
        id: sub.id,
        name: sub.name,
        color: sub.id,
        isAcademic: true,
      }),
    ),
    defaultTemplateId: DEFAULT_LESSON_TEMPLATE_ID,
    standards: [],
    workspaceMode: "solo",
  };
}

const ROTATION_VALUES: readonly ScheduleRotation[] = ["none", "ab", "cycle"];

/**
 * Merge an arbitrary parsed record into a valid `OnboardingV2Persist`,
 * tolerating missing / unknown / future fields (the resume-merge contract).
 *   • `data` is spread over the defaults so every seeder field is present.
 *   • `workspaceMode` is coerced to "solo" | "team" (default "solo").
 *   • `rotation` is coerced to a known token; cycleLength stays whatever the
 *     data carried (the schedule seeder re-clamps it downstream).
 *   • `stepIndex` is clamped into range; `finished` is a boolean.
 */
export function normalizeV2Persist(input: unknown): OnboardingV2Persist {
  const base: OnboardingV2Persist = {
    stepIndex: 0,
    data: defaultV2Data(),
    finished: false,
  };
  if (typeof input !== "object" || input === null) return base;
  const obj = input as Record<string, unknown>;

  // data — spread saved fields over the defaults so nothing seedable goes
  // missing, then re-tighten the two fields with a constrained domain.
  const savedData =
    typeof obj.data === "object" && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : {};
  const merged: OnboardingV2Data = { ...defaultV2Data(), ...(savedData as Partial<OnboardingV2Data>) };
  merged.workspaceMode = savedData.workspaceMode === "team" ? "team" : "solo";
  merged.rotation = ROTATION_VALUES.includes(
    savedData.rotation as ScheduleRotation,
  )
    ? (savedData.rotation as ScheduleRotation)
    : "none";

  // stepIndex — clamp into [0, steps-1]; non-numbers fall back to 0.
  const rawStep = obj.stepIndex;
  const stepIndex =
    typeof rawStep === "number" && Number.isFinite(rawStep)
      ? Math.min(Math.max(Math.round(rawStep), 0), ONBOARDING_V2_STEPS.length - 1)
      : 0;

  return { stepIndex, data: merged, finished: obj.finished === true };
}

/** Read + normalize the persisted record. Returns null when unset or when
 *  storage is unavailable (private mode, SSR). */
export function readV2Persist(): OnboardingV2Persist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw == null) return null;
    return normalizeV2Persist(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the record. Storage failures are swallowed (progress simply isn't
 *  saved — the wizard still works in-memory for the session). */
export function writeV2Persist(payload: OnboardingV2Persist): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Storage full / disabled — no-op.
  }
}

/** The local "finished this wizard on this device" flag. */
export function readFinishedFlag(): boolean {
  return readV2Persist()?.finished ?? false;
}

// SERVER SEAM — the authoritative "has this teacher onboarded?" read + write
// live in lib/onboarding-v2-remote.ts (isOnboardedRemote / markOnboardedRemote),
// NOT here: they touch Supabase, and this leaf must stay React/Supabase-free so
// the node test gate can exercise it. This module owns only the PURE decision
// (`computeNeedsOnboarding`) and the per-device `finished` flag; the client
// wiring (lib/onboarding-v2-state.tsx) composes them with the async remote read.

/**
 * The first-run decision, as a pure function of the signals so it is
 * unit-testable. The remote (authoritative) answer wins when known:
 *   • remote === true  → onboarded; never redirect.
 *   • remote === false → not onboarded; redirect.
 *   • remote === null  → UNKNOWN. Fail SAFE: on the DEPLOYED path
 *     (`supabaseConfigured`) we must NOT redirect on a guess — a read hiccup or a
 *     pre-migration column would otherwise bounce a real teacher into the wizard.
 *     Only the Supabase-OFF PROTOTYPE path (no server to ask) falls back to the
 *     per-device `finished` flag.
 */
export function computeNeedsOnboarding(
  finished: boolean,
  remote: boolean | null,
  supabaseConfigured: boolean,
): boolean {
  if (remote === true) return false;
  if (remote === false) return true;
  // remote unknown:
  if (supabaseConfigured) return false; // deployed path — never redirect on a guess
  return !finished; // prototype path — the local flag governs
}
