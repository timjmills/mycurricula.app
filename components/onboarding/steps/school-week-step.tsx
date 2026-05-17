"use client";

// school-week-step.tsx — onboarding step 3: school-week configuration.
//
// Two preset buttons (Sunday–Thursday, Monday–Friday) set both `weekPreset`
// and `weekdays` at once via weekdaysForPreset(). A third Custom button
// reveals individual weekday toggles; toggling adds or removes a day while
// preserving WEEKDAY_ORDER order. Below the presets, two date inputs capture
// school-year start and end dates.
//
// The wizard shell owns navigation. This component owns only its controls.

import type { KeyboardEvent, ReactNode } from "react";
import {
  useOnboarding,
  WEEKDAY_ORDER,
  WEEKDAY_LABEL,
  weekdaysForPreset,
} from "@/lib/onboarding-state";
import type { WeekdayId } from "@/lib/onboarding-state";
import styles from "./steps.module.css";

// ----- Preset definitions ---------------------------------------------------

interface WeekPreset {
  id: "sun_thu" | "mon_fri";
  label: string;
  sub: string;
}

const PRESETS: readonly WeekPreset[] = [
  {
    id: "sun_thu",
    label: "Sunday – Thursday",
    sub: "Common in the Middle East and North Africa",
  },
  {
    id: "mon_fri",
    label: "Monday – Friday",
    sub: "Standard in most of North America and Europe",
  },
] as const;

// ----- Component ------------------------------------------------------------

/** Step 3 — school-week preset, optional custom weekday picker, and
 *  school-year date range. */
export function SchoolWeekStep(): ReactNode {
  const { data, update } = useOnboarding();

  // ── Preset selection ──────────────────────────────────────────────────────

  // All three preset options in display order, used for arrow-key navigation.
  const ALL_PRESETS = [...PRESETS.map((p) => p.id), "custom"] as const;

  function handlePreset(id: "sun_thu" | "mon_fri"): void {
    update({
      weekPreset: id,
      weekdays: weekdaysForPreset(id),
    });
  }

  function handleCustom(): void {
    update({ weekPreset: "custom" });
    // Keep whatever weekdays are already set so the user sees a starting
    // point if they previously picked a preset.
  }

  // Arrow-key navigation for the preset radiogroup.
  function handlePresetKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % ALL_PRESETS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + ALL_PRESETS.length) % ALL_PRESETS.length;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const nextId = ALL_PRESETS[nextIndex];
    if (nextId === "custom") {
      handleCustom();
    } else {
      handlePreset(nextId);
    }
    const group = (e.currentTarget as HTMLElement).parentElement;
    const buttons =
      group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  }

  // ── Custom weekday toggle ─────────────────────────────────────────────────

  function toggleDay(day: WeekdayId): void {
    const current = data.weekdays;
    if (current.includes(day)) {
      // Prevent emptying the week — at least one day must remain.
      if (current.length <= 1) return;
      update({ weekdays: current.filter((d) => d !== day) });
    } else {
      // Re-sort the new set into canonical WEEKDAY_ORDER order.
      update({
        weekdays: WEEKDAY_ORDER.filter((d) => d === day || current.includes(d)),
      });
    }
  }

  const isCustom = data.weekPreset === "custom";

  return (
    <section aria-labelledby="week-heading">
      <h1 id="week-heading" className={styles.heading}>
        Your school week
      </h1>
      <p className={styles.helper}>
        Pick the days your school runs. The whole planner — columns, schedules,
        and pacing — derives its calendar from this choice.
      </p>

      {/* ── Preset buttons ────────────────────────────────────────────── */}
      <div
        className={styles.presetRow}
        role="radiogroup"
        aria-label="School-week preset"
      >
        {PRESETS.map((p, i) => {
          const selected = data.weekPreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => handlePreset(p.id)}
              onKeyDown={(e) => handlePresetKeyDown(e, i)}
              className={[
                styles.presetBtn,
                selected ? styles.presetBtnSelected : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className={styles.presetLabel}>{p.label}</span>
              <span className={styles.presetSub}>{p.sub}</span>
            </button>
          );
        })}

        {/* Custom preset button */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          tabIndex={isCustom ? 0 : -1}
          onClick={handleCustom}
          onKeyDown={(e) => handlePresetKeyDown(e, PRESETS.length)}
          className={[
            styles.presetBtn,
            isCustom ? styles.presetBtnSelected : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.presetLabel}>Custom</span>
          <span className={styles.presetSub}>Pick individual days below</span>
        </button>
      </div>

      {/* ── Custom weekday toggles — revealed only when Custom is active ── */}
      {isCustom && (
        <div
          className={styles.weekdayRow}
          role="group"
          aria-label="Active school days"
        >
          {WEEKDAY_ORDER.map((day) => {
            const active = data.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDay(day)}
                className={[
                  styles.weekdayToggle,
                  active ? styles.weekdayActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {WEEKDAY_LABEL[day]}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.divider} />

      {/* ── School-year date range ────────────────────────────────────── */}
      <div className={styles.dateRow}>
        <div className={styles.dateField}>
          <label>
            <span className={styles.fieldLabel}>School year start</span>
            <input
              type="date"
              className={styles.dateInput}
              value={data.yearStart}
              onChange={(e) => update({ yearStart: e.target.value })}
              aria-label="School year start date"
            />
          </label>
        </div>
        <div className={styles.dateField}>
          <label>
            <span className={styles.fieldLabel}>School year end</span>
            <input
              type="date"
              className={styles.dateInput}
              value={data.yearEnd}
              onChange={(e) => update({ yearEnd: e.target.value })}
              aria-label="School year end date"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
