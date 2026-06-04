"use client";

// onboarding-state.tsx — the first-run setup wizard's state.
//
// Holds the configuration the wizard collects (grade, school week,
// schedule rotation, subjects, default lesson template, standards),
// the current step, and step navigation. State is persisted to
// localStorage so a teacher who closes the tab resumes where they left
// off (the "resumable" requirement in the onboarding plan).
//
// This is a frontend prototype — there is no backend yet, so the
// collected config lives in localStorage only.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { SUBJECTS } from "@/lib/mock";
import { DEFAULT_LESSON_TEMPLATE_ID } from "@/lib/lesson-templates";

/** School-week presets offered on the school-week step. */
export type SchoolWeekPreset = "sun_thu" | "mon_fri" | "custom";

/** Weekday ids, Sunday-first. */
export type WeekdayId = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const WEEKDAY_ORDER: readonly WeekdayId[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export const WEEKDAY_LABEL: Record<WeekdayId, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** Does the timetable repeat weekly, or rotate? */
export type ScheduleRotation = "none" | "ab" | "cycle";

/** A subject as configured during onboarding. */
export interface OnboardingSubject {
  id: string;
  name: string;
  /** Subject-color swatch id (a `.cp-subj` key / palette swatch). */
  color: string;
  /**
   * Academic subjects use the lesson-flow template (structured sections);
   * non-academic blocks (lunch, recess, assembly) do not.
   */
  isAcademic: boolean;
}

/** The full configuration the wizard collects. */
export interface OnboardingData {
  teacherName: string;
  /** Grade id — "K", "1"…"12", or "multiple". */
  grade: string;
  weekPreset: SchoolWeekPreset;
  /** The active school days, in week order. */
  weekdays: WeekdayId[];
  yearStart: string;
  yearEnd: string;
  rotation: ScheduleRotation;
  /** Cycle length in days when `rotation === "cycle"`. */
  cycleLength: number;
  subjects: OnboardingSubject[];
  /** The account-wide default lesson-flow template id. */
  defaultTemplateId: string;
  /** Selected standards-framework ids (may be empty — the step is skippable). */
  standards: string[];
}

/** Weekdays implied by a preset. */
export function weekdaysForPreset(preset: SchoolWeekPreset): WeekdayId[] {
  if (preset === "mon_fri") return ["mon", "tue", "wed", "thu", "fri"];
  // sun_thu is the default; custom starts from the sun_thu set.
  return ["sun", "mon", "tue", "wed", "thu"];
}

/** The wizard's steps, in order. */
export const ONBOARDING_STEPS = [
  "welcome",
  "grade",
  "school-week",
  "rotation",
  "subjects",
  "lesson-template",
  "standards",
  "schedule",
  "summary",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

/** The default, pre-filled configuration the teacher confirms or tweaks. */
function defaultData(): OnboardingData {
  return {
    teacherName: "",
    grade: "5",
    weekPreset: "sun_thu",
    weekdays: weekdaysForPreset("sun_thu"),
    yearStart: "",
    yearEnd: "",
    rotation: "none",
    cycleLength: 4,
    // Seed the eight known subjects — every one academic by default; the
    // teacher recolors them and flips non-teaching blocks on the Subjects
    // step.
    subjects: SUBJECTS.map((sub) => ({
      id: sub.id,
      name: sub.name,
      color: sub.id,
      isAcademic: true,
    })),
    defaultTemplateId: DEFAULT_LESSON_TEMPLATE_ID,
    standards: [],
  };
}

interface OnboardingContextValue {
  /** Current step index into `ONBOARDING_STEPS`. */
  stepIndex: number;
  stepId: OnboardingStepId;
  totalSteps: number;
  data: OnboardingData;
  /** Merge a partial change into the collected data. */
  update: (patch: Partial<OnboardingData>) => void;
  next: () => void;
  back: () => void;
  goTo: (index: number) => void;
  /** True once the teacher finishes the wizard. */
  finished: boolean;
  finish: () => void;
  /**
   * True after the localStorage resume effect has run. Consumers that would
   * show a flash of default content before saved progress is restored should
   * suppress rendering until this is true.
   */
  hydrated: boolean;
  /**
   * HONEST-PERSISTENCE FLAG (audit finding #22). The wizard's collected
   * config — and the `finished` flag set by `finish()` — persist to THIS
   * browser's localStorage ONLY; nothing is written to the backend yet (see
   * the module header). Consumers (e.g. the summary step's "You're all set!"
   * recap) must use this to keep their success copy honest: setup is saved on
   * this device, not synced to the team or the server. Flips to false once
   * Phase 1B wires onboarding through Supabase. Until then it is always true.
   */
  localOnly: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/** Read the onboarding wizard state. Throws outside the provider. */
export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error(
      "useOnboarding must be used within an <OnboardingProvider>",
    );
  }
  return ctx;
}

const STORAGE_KEY = "mycurricula:onboarding";

interface PersistShape {
  stepIndex: number;
  data: OnboardingData;
  finished: boolean;
}

/** Hosts the onboarding wizard state and persists it to localStorage. */
export function OnboardingProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [finished, setFinished] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Resume from a previous session, if any. Runs once, client-side.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistShape>;
        if (saved.data) setData({ ...defaultData(), ...saved.data });
        if (typeof saved.stepIndex === "number") {
          setStepIndex(
            Math.min(Math.max(saved.stepIndex, 0), ONBOARDING_STEPS.length - 1),
          );
        }
        if (saved.finished) setFinished(true);
      }
    } catch {
      // Corrupt or unavailable storage — fall back to defaults.
    }
    setHydrated(true);
  }, []);

  // Persist on every change, but only after the initial hydration so we
  // never overwrite saved progress with the defaults.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: PersistShape = { stepIndex, data, finished };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or unavailable — progress simply isn't saved.
    }
  }, [hydrated, stepIndex, data, finished]);

  const update = useCallback((patch: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const goTo = useCallback((index: number) => {
    setStepIndex(Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1));
  }, []);
  const next = useCallback(
    () => setStepIndex((i) => Math.min(i + 1, ONBOARDING_STEPS.length - 1)),
    [],
  );
  const back = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);
  const finish = useCallback(() => setFinished(true), []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      stepIndex,
      stepId: ONBOARDING_STEPS[stepIndex],
      totalSteps: ONBOARDING_STEPS.length,
      data,
      update,
      next,
      back,
      goTo,
      finished,
      finish,
      hydrated,
      // localStorage-only today (no backend seam in this provider yet), so the
      // honest-persistence flag is constant. Promote to real state when the
      // Supabase onboarding write lands in Phase 1B.
      localOnly: true,
    }),
    [stepIndex, data, update, next, back, goTo, finished, finish, hydrated],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
