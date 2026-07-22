"use client";

// schedule-step.tsx — v2 onboarding step 3: school week + rotation cycle.
//
// Two TEAM-wide schedule decisions the whole grade-level team plans against:
//   1. School week — which weekdays the school runs. Driven through the LIVE
//      useSchoolWeek() hook so the choice actually applies (writes the
//      `mycurricula:team:school-week-days` key), and mirrored into the
//      onboarding data so the summary + any v1 read stay in sync.
//   2. Rotation cycle — weekly / A-B / N-day. Written into data.rotation +
//      data.cycleLength ONLY; lib/use-schedule-settings.ts lazily seeds the
//      team rotation key from that record the first time a schedule surface
//      mounts (the one-time seed), so we deliberately don't double-write it.
//
// The detailed per-weekday TIME editor is a larger surface that already exists
// in Settings → Schedule; rather than duplicate it here we link to it. Both
// team-wide controls carry `required` tooltips (CLAUDE.md §4).

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  useSchoolWeek,
  detectSchoolWeekPreset,
  SCHOOL_WEEK_PRESETS,
  WEEKDAY_ORDER,
  WEEKDAY_LABEL_LONG,
} from "@/lib/use-school-week";
import type { Weekday } from "@/lib/use-school-week";
import {
  CYCLE_LENGTH_MIN,
  CYCLE_LENGTH_MAX,
} from "@/lib/use-schedule-settings";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import type { OnboardingV2Data } from "@/lib/onboarding-v2-shape";
import { Button, Chip, ToggleGroup, Tooltip } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import styles from "./steps-v2.module.css";

type WeekPresetChoice = "sun_thu" | "mon_fri" | "custom";
type Rotation = OnboardingV2Data["rotation"];

const WEEK_OPTIONS: readonly ToggleOption<WeekPresetChoice>[] = [
  {
    value: "sun_thu",
    label: "Sun – Thu",
    title:
      "Run the school week Sunday to Thursday — common in the Middle East. Sets the day columns across the whole planner for every teacher.",
  },
  {
    value: "mon_fri",
    label: "Mon – Fri",
    title:
      "Run the school week Monday to Friday — standard in North America and Europe. Sets the day columns across the whole planner for every teacher.",
  },
  {
    value: "custom",
    label: "Custom",
    title:
      "Pick any set of weekdays below — for a 3-day or otherwise non-standard week. Sets the day columns for every teacher.",
  },
] as const;

const ROTATION_OPTIONS: readonly ToggleOption<Rotation>[] = [
  {
    value: "none",
    label: "Weekly",
    title:
      "The same timetable every week — no rotation. The simplest setup, and the default.",
  },
  {
    value: "ab",
    label: "A / B",
    title:
      "Alternate two day plans (A, then B) on a cycle independent of the calendar week. Applies for the whole team.",
  },
  {
    value: "cycle",
    label: "Cycle",
    title:
      "Rotate over a longer run of days (a 4- or 6-day cycle, etc.) independent of the week. Applies for the whole team.",
  },
] as const;

/** Map the detected school-week preset onto the three wizard choices. */
function presetChoice(days: Weekday[]): WeekPresetChoice {
  const detected = detectSchoolWeekPreset(days);
  if (detected === "sunThu") return "sun_thu";
  if (detected === "monFri") return "mon_fri";
  return "custom";
}

export function ScheduleStep(): ReactNode {
  const router = useRouter();
  const { data, update } = useOnboardingV2();
  const { days, setDays } = useSchoolWeek();

  const choice = presetChoice(days);

  // Mirror the live school week into the onboarding record so the summary +
  // any v1 read stay truthful. Runs whenever the week changes (including the
  // post-mount localStorage sync). No loop: update() only touches data, and
  // this effect depends on `days`.
  useEffect(() => {
    update({ weekdays: [...days], weekPreset: presetChoice(days) });
  }, [days, update]);

  const onPreset = (value: WeekPresetChoice): void => {
    if (value === "sun_thu") setDays([...SCHOOL_WEEK_PRESETS.sunThu]);
    else if (value === "mon_fri") setDays([...SCHOOL_WEEK_PRESETS.monFri]);
    // "custom" keeps the current selection; the chips below refine it.
    else update({ weekPreset: "custom" });
  };

  const toggleDay = (day: Weekday): void => {
    if (days.includes(day)) {
      if (days.length <= 1) return; // never empty the week
      setDays(days.filter((d) => d !== day));
    } else {
      setDays([...days, day]); // useSchoolWeek re-sorts + dedupes
    }
  };

  // ASYMMETRY (chosen): the school week writes its OWN live team key via
  // setDays above, but rotation writes ONLY the onboarding record — it
  // deliberately defers to use-schedule-settings' one-time lazy seed of the
  // team rotation key, so the wizard never double-writes it.
  const rotation = data.rotation;
  const cycleLength = data.cycleLength;
  const setRotation = (r: Rotation): void => update({ rotation: r });
  const setCycleLength = (n: number): void => {
    const clamped = Math.min(
      CYCLE_LENGTH_MAX,
      Math.max(CYCLE_LENGTH_MIN, Math.round(Number.isFinite(n) ? n : CYCLE_LENGTH_MIN)),
    );
    update({ cycleLength: clamped });
  };

  return (
    <div>
      <h1 className={styles.heading}>Your schedule</h1>
      <p className={styles.helper}>
        Set the days your school runs and whether the timetable rotates. The
        whole planner derives its calendar from these choices.
      </p>

      {/* ── School week ────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>School week</span>
        <ToggleGroup
          options={[...WEEK_OPTIONS]}
          value={choice}
          onChange={onPreset}
          ariaLabel="School-week preset"
          variant="prominent"
          tooltipRequired
        />
        {choice === "custom" && (
          <div className={styles.weekdayRow} role="group" aria-label="Active school days">
            {WEEKDAY_ORDER.map((day) => (
              <Chip
                key={day}
                variant="filter"
                active={days.includes(day)}
                onClick={() => toggleDay(day)}
              >
                {WEEKDAY_LABEL_LONG[day]}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* ── Rotation ───────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Timetable rotation</span>
        <ToggleGroup
          options={[...ROTATION_OPTIONS]}
          value={rotation}
          onChange={setRotation}
          ariaLabel="Timetable rotation"
          variant="prominent"
          tooltipRequired
        />
        {rotation === "cycle" && (
          <>
            <div>
              <label htmlFor="wizard-cycle-length" className={styles.fieldLabel}>
                Cycle length (days)
              </label>
              <Tooltip
                content="How many instructional days before the timetable repeats — e.g. 4 for a four-day rotation. Applies for the whole team."
                side="bottom"
                required
              >
                <input
                  id="wizard-cycle-length"
                  type="number"
                  className={styles.numberInput}
                  min={CYCLE_LENGTH_MIN}
                  max={CYCLE_LENGTH_MAX}
                  value={cycleLength}
                  onChange={(e) => setCycleLength(Number.parseInt(e.target.value, 10))}
                  title="Number of instructional days before the timetable repeats."
                />
              </Tooltip>
            </div>
            <div className={styles.cycleChips} aria-hidden>
              {Array.from({ length: cycleLength }).map((_, i) => (
                <span key={i} className={styles.cycleChip}>
                  Day {String.fromCharCode(65 + i)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.divider} />

      {/* ── Daily times → Settings ─────────────────────────────────────── */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Daily times</span>
        <p className={styles.note}>
          Set your period times and non-teaching blocks (arrival, recess, lunch)
          in Settings &rarr; Schedule — it has the full per-day editor. You can
          do that any time; your setup progress here is saved.
        </p>
        <div>
          <Tooltip
            content="Open Settings → Schedule to lay out your daily period times. Your setup progress is saved, so you can come back to finish."
            side="top"
            tooltipId="onboarding-v2-daily-times"
          >
            <Button
              variant="secondary"
              size="md"
              onClick={() => router.push("/settings/schedule")}
              aria-label="Open schedule settings"
            >
              Set up daily times
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
