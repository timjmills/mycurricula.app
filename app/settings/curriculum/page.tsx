"use client";

// Settings → Curriculum — the team-shared identity & calendar surface.
//
// Sections (top to bottom):
//   1. Curriculum label   — the free-text suffix shown next to the
//                           top-bar wordmark. TEAM-scoped.
//   2. School months      — which calendar months belong to this team's
//                           academic year. TEAM-scoped.
//   3. School week        — PLACEHOLDER (Wave 1B — Lane Y fills).
//   4. Holidays           — PLACEHOLDER (Wave 1B — Lane Y-hol fills).
//
// "Team-scoped" means every teacher on the grade-level team sees the
// same value. The Master/Personal forking model (CLAUDE.md §2) is
// extended to Settings: team configuration on this page; per-teacher
// preferences (theme, view mode, etc.) live on Settings → Appearance and
// the upcoming Schedule page. A small "Shared with your team" chip on
// each Card header conveys the scope visually without a confirm dialog.
//
// Persistence today is localStorage under `mycurricula:team:*`; the rows
// migrate to a Supabase `team_settings` row when the backend lands.
//
// Tooltip rule (CLAUDE.md §4): every interactive control carries an
// onboarding-voice tooltip. Inputs use `title=`; Buttons use the
// `tooltip` prop on the canonical primitive.

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { ALL_SCHOOL_MONTHS, SCHOOL_MONTH_PRESETS } from "@/lib/year-calendar";
import { useSchoolMonths } from "@/lib/use-school-months";
import { useAppState } from "@/lib/app-state";
import { PageHeader } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import styles from "./page.module.css";

// ── Calendar-month metadata ────────────────────────────────────────────────
// Two parallel arrays (short + long) so the toggle row can show the
// 3-letter abbreviation on phone and the full name on desktop.

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// Preset registry surfaced in the dropdown. "custom" is the implicit
// selection when the months don't match any preset; the user can't pick
// it directly — it appears automatically.
type PresetKey = keyof typeof SCHOOL_MONTH_PRESETS | "custom";

interface PresetOption {
  key: PresetKey;
  label: string;
  /** Onboarding-voice description for the option's tooltip. */
  hint: string;
}

const PRESET_OPTIONS: readonly PresetOption[] = [
  {
    key: "allYear",
    label: "All Year",
    hint: "Use every calendar month (January through December).",
  },
  {
    key: "us",
    label: "US Aug–May",
    hint: "US K-12 standard school year — August through May.",
  },
  {
    key: "qatar",
    label: "Qatar Sep–May",
    hint: "Qatar / GCC standard school year — September through May.",
  },
  {
    key: "southern",
    label: "Southern Feb–Nov",
    hint: "Southern-hemisphere school year — February through November.",
  },
  {
    key: "summer",
    label: "Summer Jun–Aug",
    hint: "Summer-program calendar — June through August.",
  },
  {
    key: "custom",
    label: "Custom",
    hint: "Your own month selection — toggle individual months below.",
  },
] as const;

/**
 * Find the preset key whose month set matches the given selection
 * exactly. Returns "custom" if no preset matches. Order-insensitive.
 */
function detectPreset(months: number[]): PresetKey {
  const set = new Set(months);
  for (const [key, value] of Object.entries(SCHOOL_MONTH_PRESETS)) {
    if (value.length !== set.size) continue;
    if (value.every((m) => set.has(m))) {
      return key as PresetKey;
    }
  }
  return "custom";
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CurriculumSettingsPage(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageHeader
          eyebrow="Settings"
          title="Curriculum"
          subtitle="The identity and calendar your whole team shares."
        />

        <CurriculumLabelSection />
        <SchoolMonthsSection />

        {/* LANE-Y-CAL-MOUNT — Wave 1B fills this with two date pickers
            (academic year start + end). Needed so the Roadmap and
            Progression timelines start and end at the same dates the
            teacher's school year actually runs. */}
        <PlaceholderSection
          eyebrow="Calendar"
          title="Academic year dates"
          body="Coming in the next wave. You'll set when the academic year starts and ends, so the Roadmap and Progression views line up exactly with your school year."
        />

        {/* LANE-Y-MOUNT — Wave 1B fills this with the school-week
            picker (which weekdays the school runs). */}
        <PlaceholderSection
          eyebrow="Calendar"
          title="School week"
          body="Coming in the next wave. You'll choose which weekdays your school runs (e.g. Sun–Thu, Mon–Fri, or a custom set)."
        />

        {/* LANE-Y-HOL-MOUNT — Wave 1B fills this with the holidays /
            non-instruction-day editor. */}
        <PlaceholderSection
          eyebrow="Calendar"
          title="Holidays"
          body="Coming in the next wave. You'll add holidays and non-instruction days; they hide lessons on those dates everywhere."
        />
      </div>
    </div>
  );
}

// ── Section 1 — Curriculum label ────────────────────────────────────────────
// Single text input bound to the team's curriculum label. Saves on blur
// (matches the Hierarchy-labels pattern on the Appearance page). Empty
// trimmed input clears the label so the wordmark falls back to plain
// "MyCurricula".

function CurriculumLabelSection(): ReactNode {
  const { currentUser, updateCurriculumLabel } = useAppState();

  // Local draft — independent during typing; re-syncs whenever the
  // context value updates (cross-tab change, login, etc.).
  const [draft, setDraft] = useState<string>(currentUser.curriculumLabel ?? "");
  useEffect(() => {
    setDraft(currentUser.curriculumLabel ?? "");
  }, [currentUser.curriculumLabel]);

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setDraft(e.target.value);
  };

  // Commit on blur — only when the trimmed value differs from the stored
  // one, so blurring without edits is a no-op.
  const onBlur = (): void => {
    const trimmed = draft.trim();
    const current = currentUser.curriculumLabel ?? "";
    if (trimmed !== current) {
      updateCurriculumLabel(trimmed);
    }
  };

  return (
    <SettingsCard
      eyebrow="Identity"
      title="Curriculum label"
      hint="The suffix shown next to the wordmark in the top bar — e.g. “Grade 5”, “K-12 Math”, “Year 7 Science”."
      action={<TeamChip />}
    >
      <div className={styles.formRow}>
        <label htmlFor="curriculum-label" className={styles.fieldLabel}>
          Label
        </label>
        <input
          id="curriculum-label"
          name="curriculumLabel"
          type="text"
          value={draft}
          onChange={onChange}
          onBlur={onBlur}
          placeholder="e.g. Grade 5, K-12 Math, Year 7 Science"
          autoComplete="off"
          spellCheck={false}
          maxLength={60}
          title="Type what your team calls this curriculum — it appears next to the MyCurricula wordmark for every teacher on the team. Saves when you click out of the field."
          className={styles.textInput}
        />
        <p className={styles.fieldHint}>
          Saves when you click out of the field. Clear it to leave just
          “MyCurricula” in the top bar.
        </p>
      </div>
    </SettingsCard>
  );
}

// ── Section 2 — School months ──────────────────────────────────────────────
// Two controls in one card:
//   • Preset dropdown — quick-pick presets. "Custom" is the implicit
//                       selection when months don't match a preset.
//   • 12 month chips  — fine-grained per-month toggle. Wraps to multiple
//                       rows on narrow viewports.
//
// Empty-state guard: unchecking the last remaining month falls back to
// ALL_SCHOOL_MONTHS on save so /year is never asked to render zero
// months.

function SchoolMonthsSection(): ReactNode {
  const [months, setMonths] = useSchoolMonths();
  const selected = useMemo(() => new Set(months), [months]);
  const activePreset = useMemo(() => detectPreset(months), [months]);

  const onPresetChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const key = e.target.value as PresetKey;
    if (key === "custom") return; // "custom" is implicit, not actionable
    const preset = SCHOOL_MONTH_PRESETS[key];
    if (preset) setMonths([...preset]);
  };

  /** Toggle a single month's membership in the selection. */
  const onToggleMonth = (monthIdx: number): void => {
    const next = new Set(selected);
    if (next.has(monthIdx)) {
      next.delete(monthIdx);
    } else {
      next.add(monthIdx);
    }
    // Empty-state guard — fall back to all 12 months so the Year view
    // never has zero data to render. CLAUDE.md §1: every calendar
    // surface must derive its columns from the configured set.
    if (next.size === 0) {
      setMonths([...ALL_SCHOOL_MONTHS]);
      return;
    }
    setMonths(Array.from(next));
  };

  return (
    <SettingsCard
      eyebrow="Calendar"
      title="School months"
      hint="Which calendar months your team treats as the academic year. The Year view and any month-scoped filters use this."
      action={<TeamChip />}
    >
      {/* ── Preset dropdown ─────────────────────────────────────────── */}
      <div className={styles.presetRow}>
        <label htmlFor="school-months-preset" className={styles.fieldLabel}>
          Preset
        </label>
        <select
          id="school-months-preset"
          value={activePreset}
          onChange={onPresetChange}
          title="Quick-pick a common school-year shape. Picking one updates the month toggles below for the whole team."
          className={styles.select}
        >
          {PRESET_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key} title={opt.hint}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── 12-month chip row ───────────────────────────────────────── */}
      <fieldset className={styles.monthsFieldset}>
        <legend className={styles.monthsLegend}>
          Months in the school year
        </legend>
        <div className={styles.monthsGrid}>
          {ALL_SCHOOL_MONTHS.map((monthIdx) => {
            const isOn = selected.has(monthIdx);
            const short = MONTH_NAMES_SHORT[monthIdx];
            const long = MONTH_NAMES_LONG[monthIdx];
            return (
              <button
                key={monthIdx}
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={`${long} — ${isOn ? "included in" : "excluded from"} the school year`}
                onClick={() => onToggleMonth(monthIdx)}
                title={`Include ${long} in this curriculum's school year. Every teacher on the team sees the change.`}
                className={[
                  styles.monthChip,
                  isOn ? styles.monthChipOn : styles.monthChipOff,
                ].join(" ")}
              >
                {short}
              </button>
            );
          })}
        </div>
        <p className={styles.fieldHint}>
          Unchecking every month resets the selection to all twelve — the Year
          view always needs at least one month to render.
        </p>
      </fieldset>
    </SettingsCard>
  );
}

// ── Placeholder section ────────────────────────────────────────────────────
// Reserved Card mounts for Wave 1B (school week + holidays). Wave 1B
// agents grep for the LANE-Y-MOUNT / LANE-Y-HOL-MOUNT comments above
// and swap the placeholder body for the real content.

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  body: string;
}

function PlaceholderSection({
  eyebrow,
  title,
  body,
}: PlaceholderProps): ReactNode {
  return (
    <SettingsCard eyebrow={eyebrow} title={title} action={<TeamChip />}>
      <p className={styles.placeholderBody}>{body}</p>
    </SettingsCard>
  );
}

// ── "Shared with your team" chip ───────────────────────────────────────────
// A subtle visual cue pinned to each Card header. The tooltip explains
// the scope to a first-time teacher; the visual is intentionally
// understated so it doesn't compete with the section header itself.

function TeamChip(): ReactNode {
  return (
    <span
      className={styles.teamChip}
      title="This setting affects every teacher on your grade-level team."
      aria-label="Shared with your team"
    >
      <span aria-hidden="true" className={styles.teamChipDot} />
      Shared with your team
    </span>
  );
}
