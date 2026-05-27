"use client";

// Settings → Curriculum — the team-shared identity & calendar surface.
//
// Sections (top to bottom):
//   1. Curriculum label   — the free-text suffix shown next to the
//                           top-bar wordmark. TEAM-scoped.
//   2. School months      — which calendar months belong to this team's
//                           academic year. TEAM-scoped.
//   3. Academic year      — the start + end calendar dates of the school
//      dates                year. TEAM-scoped. Drives Roadmap/Progression.
//   4. School week        — which weekdays the school runs. TEAM-scoped.
//   5. Holidays           — non-instruction dates (Eid, Spring Break, etc.)
//                           that hide lessons on the Year view. TEAM-scoped.
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
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ALL_SCHOOL_MONTHS,
  SCHOOL_MONTH_PRESETS,
  weeksInRange,
} from "@/lib/year-calendar";
import { useSchoolMonths } from "@/lib/use-school-months";
import {
  SCHOOL_WEEK_PRESETS,
  WEEKDAY_ORDER,
  detectSchoolWeekPreset,
  useSchoolWeek,
  type SchoolWeekPresetKey,
  type Weekday,
} from "@/lib/use-school-week";
import { useHolidays, type Holiday } from "@/lib/use-holidays";
import {
  useAcademicYear,
  academicYearDateToIso,
  academicYearIsoToDate,
} from "@/lib/use-academic-year";
import { useAppState } from "@/lib/app-state";
import { Button, PageHeader } from "@/components/ui";
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

        {/* LANE-Y-CAL-MOUNT — academic year start + end date pickers.
            Real implementation; replaces the Wave 1B placeholder. The
            Roadmap and Progression timelines derive their week range
            from this pair. */}
        <AcademicYearSection />

        {/* LANE-Y-MOUNT — school-week picker (which weekdays the
            school runs). Real implementation; replaces the Wave 1B
            placeholder. */}
        <SchoolWeekSection />

        {/* LANE-Y-HOL-MOUNT — holidays / non-instruction-day editor.
            Real implementation; replaces the Wave 1B placeholder. */}
        <HolidaysSection />
      </div>
    </div>
  );
}

// ── Weekday metadata ───────────────────────────────────────────────────────
// Parallel short + long arrays for the school-week chip row. Sun-first
// ordering matches WEEKDAY_ORDER in lib/use-school-week.ts.

const WEEKDAY_NAMES_SHORT: Readonly<Record<Weekday, string>> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

const WEEKDAY_NAMES_LONG: Readonly<Record<Weekday, string>> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

// School-week preset registry surfaced in the dropdown. "custom" is the
// implicit selection when the days don't match any named preset — the
// user can't pick it directly; it appears automatically.
type SchoolWeekDropdownKey = SchoolWeekPresetKey | "custom";

interface SchoolWeekPresetOption {
  key: SchoolWeekDropdownKey;
  label: string;
  /** Onboarding-voice description for the option's tooltip. */
  hint: string;
}

const SCHOOL_WEEK_PRESET_OPTIONS: readonly SchoolWeekPresetOption[] = [
  {
    key: "sunThu",
    label: "Sun–Thu",
    hint: "Qatar / GCC standard — school runs Sunday through Thursday.",
  },
  {
    key: "monFri",
    label: "Mon–Fri",
    hint: "US / Europe standard — school runs Monday through Friday.",
  },
  {
    key: "monSat",
    label: "Mon–Sat",
    hint: "Six-day school week — Monday through Saturday.",
  },
  {
    key: "custom",
    label: "Custom",
    hint: "Your own day selection — toggle individual weekdays below.",
  },
] as const;

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

// ── Section 3 — Academic year dates ────────────────────────────────────────
// Two native <input type="date"> controls bound to useAcademicYear().
//
// The hook persists in localStorage as ISO date strings and the setter
// validates start < end + clamps the span to 30..60 weeks before write.
// We feed each input a "YYYY-MM-DD" value (local — never the UTC string)
// and convert back on change.
//
// The live "= N weeks" readout uses `weeksInRange` so the user gets
// immediate feedback that the dates produce a sensible school year. The
// Roadmap and Progression timelines elsewhere read the same hook, so the
// number under the inputs is the same one that drives the timeline.
//
// Tooltip rule (CLAUDE.md §4): each input + label carries an
// onboarding-voice title that answers "what does this control accomplish
// in context" — i.e. it names the downstream effect (Roadmap +
// Progression alignment), not just the field's mechanical purpose.

function AcademicYearSection(): ReactNode {
  const { start, end, setStart, setEnd } = useAcademicYear();

  const startIso = useMemo(() => academicYearDateToIso(start), [start]);
  const endIso = useMemo(() => academicYearDateToIso(end), [end]);

  // Live span readout — matches the number of week columns the Roadmap
  // and Progression views will render. `weeksInRange` is the same helper
  // those views call; keeping them aligned guarantees the number a
  // teacher sees here matches what they see on /year.
  const weeks = useMemo(() => {
    // weeksInRange currently returns `ceil(span) + 1` so a clean 36-week
    // configuration reports 37 (the trailing partial week). Display the
    // exact count to keep the math honest — overshooting by one week is
    // harmless because the timeline already renders that trailing column.
    return weeksInRange(start, end);
  }, [start, end]);

  const onStartChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = academicYearIsoToDate(e.target.value);
    if (next) setStart(next);
  };

  const onEndChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = academicYearIsoToDate(e.target.value);
    if (next) setEnd(next);
  };

  return (
    <SettingsCard
      eyebrow="Calendar"
      title="Academic year dates"
      hint="When your school year starts and ends. The Year view's Roadmap and Progression timelines line up exactly with these dates."
      action={<TeamChip />}
    >
      <div className={styles.dateRangeRow}>
        {/* Start date */}
        <div className={styles.formRow}>
          <label htmlFor="academic-year-start" className={styles.fieldLabel}>
            Start date
          </label>
          <input
            id="academic-year-start"
            name="academicYearStart"
            type="date"
            value={startIso}
            onChange={onStartChange}
            title="The first day of your school year. The Year view's Roadmap and Progression timelines start exactly here, so units pinned to early weeks land on the same calendar dates a teacher would see in their school's calendar."
            className={styles.textInput}
          />
        </div>

        {/* End date */}
        <div className={styles.formRow}>
          <label htmlFor="academic-year-end" className={styles.fieldLabel}>
            End date
          </label>
          <input
            id="academic-year-end"
            name="academicYearEnd"
            type="date"
            value={endIso}
            onChange={onEndChange}
            title="The last day of your school year. The Roadmap and Progression timelines end here — final-week units are anchored to this date, so a unit that ends two weeks before school finishes lands two weeks back from this date."
            className={styles.textInput}
          />
        </div>
      </div>

      {/* Live span readout — keeps the math visible to the teacher as
          they edit either date. The number matches the column count the
          /year view will render. */}
      <p
        className={styles.fieldHint}
        aria-live="polite"
        title="Total number of school weeks between your start and end dates. The Year view renders this many week columns."
      >
        = <strong>{weeks}</strong> {weeks === 1 ? "week" : "weeks"} of school
        year — your Roadmap and Progression timelines will use exactly this
        range.
      </p>
      <p className={styles.fieldHint}>
        Spans are clamped to a 30–60 week range. Pick a sensible school year and
        the Year view will follow.
      </p>
    </SettingsCard>
  );
}

// ── Section 4 — School week ────────────────────────────────────────────────
// Two controls in one card:
//   • Preset dropdown — quick-pick presets (Sun–Thu / Mon–Fri /
//                       Mon–Sat). "Custom" is the implicit selection
//                       when the days don't match a preset.
//   • 7 weekday chips — fine-grained per-day toggle. Wraps to two
//                       rows on narrow viewports.
//
// Empty-state guard: unchecking the last remaining day is a no-op —
// the Weekly grid needs at least one column to render and CLAUDE.md §1
// requires every calendar surface to derive columns from this set.
//
// 1:1-by-index migration (per 2026-05-25 user clarification):
// `lesson.day = 0` always means "the first day of the school week",
// regardless of which weekday that is. Switching Sun–Thu → Mon–Fri
// keeps `day = 0` lessons on the first day (was Sun, now Mon). The
// card description tells teachers so they're not surprised when their
// existing plans shift.

function SchoolWeekSection(): ReactNode {
  const { days, setDays } = useSchoolWeek();
  const selected = useMemo(() => new Set(days), [days]);
  const activePreset = useMemo(() => detectSchoolWeekPreset(days), [days]);

  const onPresetChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const key = e.target.value as SchoolWeekDropdownKey;
    if (key === "custom") return; // "custom" is implicit, not actionable
    const preset = SCHOOL_WEEK_PRESETS[key];
    if (preset) setDays([...preset]);
  };

  /** Toggle a single weekday's membership in the selection. */
  const onToggleDay = (day: Weekday): void => {
    const next = new Set(selected);
    if (next.has(day)) {
      // Empty-state guard — refuse to drop below 1 day. The hook would
      // fall back to the default anyway, but silently swapping the
      // user's selection on "delete last" feels surprising; ignoring
      // the click is clearer.
      if (next.size <= 1) return;
      next.delete(day);
    } else {
      next.add(day);
    }
    setDays(Array.from(next));
  };

  return (
    <SettingsCard
      eyebrow="Calendar"
      title="School week"
      hint="Which weekdays your school runs. The Weekly grid, Daily list, and Schedule all use this set as their day columns. Existing lessons map by index — day 0 stays day 0 (the first day of your school week)."
      action={<TeamChip />}
    >
      {/* ── Preset dropdown ─────────────────────────────────────────── */}
      <div className={styles.presetRow}>
        <label htmlFor="school-week-preset" className={styles.fieldLabel}>
          Preset
        </label>
        <select
          id="school-week-preset"
          value={activePreset}
          onChange={onPresetChange}
          title="Quick-pick a common school-week shape. Picking one updates the weekday toggles below for the whole team."
          className={styles.select}
        >
          {SCHOOL_WEEK_PRESET_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key} title={opt.hint}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── 7-weekday chip row ──────────────────────────────────────── */}
      <fieldset className={styles.monthsFieldset}>
        <legend className={styles.monthsLegend}>
          Weekdays your school runs
        </legend>
        <div className={styles.weekdaysGrid}>
          {WEEKDAY_ORDER.map((day) => {
            const isOn = selected.has(day);
            const short = WEEKDAY_NAMES_SHORT[day];
            const long = WEEKDAY_NAMES_LONG[day];
            const isOnlyOne = isOn && selected.size === 1;
            return (
              <button
                key={day}
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={`${long} — ${isOn ? "included in" : "excluded from"} the school week`}
                aria-disabled={isOnlyOne}
                onClick={() => onToggleDay(day)}
                title={
                  isOnlyOne
                    ? `${long} is the only school day right now — pick another weekday first before removing it.`
                    : `Include ${long} in your school week. Every teacher on the team sees the change, and every calendar view updates its day columns.`
                }
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
          At least one weekday must stay selected — the Weekly grid needs at
          least one column to render. Existing lessons map by index: a lesson on
          day 0 stays on day 0, even if that weekday changes.
        </p>
      </fieldset>
    </SettingsCard>
  );
}

// ── Section 5 — Holidays ───────────────────────────────────────────────────
// Add / list / remove editor for the team's non-instruction days.
//   • Add form  — date input + name input + Add button. Both fields are
//                 required to submit. The form clears after a successful
//                 add so the next holiday can be typed straight away.
//   • List      — each row shows the localized date + name + a remove
//                 button. Sorted by date ascending (handled by the hook).
//                 Empty state renders inline.
//
// Consumed by /year (see components/year/UnitBar.tsx) to render a subtle
// striped "no school" overlay on holiday weeks. Holidays are TEAM-scoped
// per the curriculum doctrine — every teacher on the grade-level team
// sees the same list.

function HolidaysSection(): ReactNode {
  const { holidays, add, remove } = useHolidays();

  // Draft form state — cleared on submit. We intentionally keep the
  // form *inline* (no modal) so a teacher adding several holidays in a
  // row doesn't have to re-open a dialog each time.
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftName, setDraftName] = useState<string>("");

  // Both fields required — `canSubmit` gates the button's disabled state
  // and the form-level submit handler so an Enter-key submit on the
  // text input can't slip an empty value through either.
  const canSubmit = draftDate.trim() !== "" && draftName.trim() !== "";

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    add({ date: draftDate, name: draftName.trim() });
    setDraftDate("");
    setDraftName("");
  };

  return (
    <SettingsCard
      eyebrow="Calendar"
      title="Holidays"
      hint="Non-instruction dates — Eid, Spring Break, in-service days, anything where lessons shouldn't run. The Year view greys out the matching week so the team can see at a glance where the school week is short."
      action={<TeamChip />}
    >
      {/* ── Add form ─────────────────────────────────────────────────── */}
      <form className={styles.holidayForm} onSubmit={onSubmit} noValidate>
        <div className={styles.holidayFormFields}>
          <div className={styles.holidayFormField}>
            <label htmlFor="holiday-date" className={styles.fieldLabel}>
              Date
            </label>
            <input
              id="holiday-date"
              name="holidayDate"
              type="date"
              required
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              title="The calendar date this holiday falls on. Pick from the picker or type YYYY-MM-DD."
              className={styles.textInput}
            />
          </div>
          <div className={styles.holidayFormField}>
            <label htmlFor="holiday-name" className={styles.fieldLabel}>
              Name
            </label>
            <input
              id="holiday-name"
              name="holidayName"
              type="text"
              required
              maxLength={60}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Eid al-Fitr, Spring Break"
              autoComplete="off"
              spellCheck={false}
              title="What this holiday is called — appears on the Year-view tooltip and in this list."
              className={styles.textInput}
            />
          </div>
          <div className={styles.holidayFormAction}>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!canSubmit}
              tooltip="Add this holiday — the Year view greys out the week it lands on for the whole team."
            >
              + Add holiday
            </Button>
          </div>
        </div>
        <p className={styles.fieldHint}>
          Both a date and a name are required. Holidays appear on every
          teacher&rsquo;s Year view — the Roadmap greys out the matching week so
          the team knows lessons there shouldn&rsquo;t be planned.
        </p>
      </form>

      {/* ── Existing-holidays list ───────────────────────────────────── */}
      <ul className={styles.holidayList}>
        {holidays.length === 0 ? (
          <li className={styles.holidayEmpty}>
            No holidays yet &mdash; add one above.
          </li>
        ) : (
          holidays.map((h) => (
            <HolidayRow key={h.id} holiday={h} onRemove={() => remove(h.id)} />
          ))
        )}
      </ul>
    </SettingsCard>
  );
}

// One row in the holiday list. Extracted so the date-formatting logic
// has a clean home and so per-row keys aren't tangled with the parent's
// add-form state.
function HolidayRow({
  holiday,
  onRemove,
}: {
  holiday: Holiday;
  onRemove: () => void;
}): ReactNode {
  // Render the ISO date in the user's locale. We parse manually — passing
  // an ISO string to `new Date()` would interpret it as UTC and could
  // shift the calendar date by one day in negative-offset locales.
  const display = useMemo(() => {
    const [y, m, d] = holiday.date
      .split("-")
      .map((s) => Number.parseInt(s, 10));
    if (!y || !m || !d) return holiday.date;
    const local = new Date(y, m - 1, d);
    return local.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [holiday.date]);

  return (
    <li className={styles.holidayItem}>
      <span className={styles.holidayDate}>{display}</span>
      <span className={styles.holidayName}>{holiday.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        tooltip={`Remove “${holiday.name}” from the team's holiday list — the Year view will stop greying out the matching week.`}
        aria-label={`Remove holiday ${holiday.name} on ${holiday.date}`}
      >
        Remove
      </Button>
    </li>
  );
}

// ── Placeholder section ────────────────────────────────────────────────────
// Reserved generic Card for any future settings block. Currently no
// section uses it — all four sections above are real implementations.
// Kept so a future settings card can drop in without re-implementing the
// "italic body + TeamChip" shell.

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  body: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
