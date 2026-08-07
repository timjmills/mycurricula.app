"use client";

// Settings → Calendar — the team-shared time configuration surface.
//
// Sections (top to bottom — all moved verbatim from Settings → Curriculum
// when the settings hub was regrouped by domain):
//   1. School months      — which calendar months belong to this team's
//                           academic year. TEAM-scoped.
//   2. Academic year      — the start + end calendar dates of the school
//      dates                year. TEAM-scoped. Drives Roadmap/Progression.
//   3. School week        — which weekdays the school runs. TEAM-scoped.
//   4. Holidays           — non-instruction dates (Eid, Spring Break, etc.)
//                           that hide lessons on the Year view. TEAM-scoped.
//
// "Team-scoped" means every teacher on the grade-level team SHOULD see the
// same value — but only one of these four actually delivers that today:
//
//   • School week   → the DATABASE (`schools.school_week`), the column the
//                     planner derives its day columns from. Genuinely shared,
//                     genuinely team-scoped, and admin-gated by RLS. Section 3
//                     reports the write outcome because it can be refused.
//   • Months, year  → localStorage under `mycurricula:team:*`. The prefix
//     dates, holidays  records the INTENDED scope; the storage is per-browser,
//                     so nothing is shared with teammates or with the same
//                     teacher's other device. They migrate to a server row
//                     when the team-settings backend lands.
//
// Do not read a `team:` key name as evidence a value is shared.
//
// Tooltip rule (CLAUDE.md §4): every interactive control carries an
// onboarding-voice tooltip. Inputs use `title=`; Buttons use the
// `tooltip` prop on the canonical primitive.
//
// ALWAYS-ON TOOLTIPS + UNDO (audit 2026-07-31 §C1). Every control on this
// page is in CLAUDE.md §4's always-on list — §4 names "holidays, academic
// year, school week" by name as team-wide settings whose tooltips ignore
// both per-id dismissal and the global off switch. They are therefore all
// `required`, and none renders the "Turn off these tips" link. Every
// mutation additionally fires a ConsequenceToast with an Undo, because
// these controls auto-persist on click: before this pass, removing a
// holiday was a silent, unrecoverable write with no confirmation step.
//
// TOAST HONESTY. The toasts describe what OBSERVABLY happens, not what the
// `team:` key prefix implies. Only the school week actually writes for the
// team (`schools.school_week`) — and that write can be REFUSED by RLS, so
// its toast defers the outcome to SchoolWeekSaveNote rather than claiming a
// save. Months, academic-year dates and holidays persist to this browser
// only (see the scope note above), so their toasts speak about this
// teacher's views and never promise teammates will see the change.

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useConsequenceToast } from "@/lib/consequence-toast";
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
  type SchoolWeekSaveState,
  type Weekday,
} from "@/lib/use-school-week";
import { useHolidays, type Holiday } from "@/lib/use-holidays";
import { formatIsoDate, summarizeWeek } from "@/lib/settings-calendar-format";
import {
  useAcademicYear,
  academicYearDateToIso,
  academicYearIsoToDate,
} from "@/lib/use-academic-year";
import { Button, PageHeader, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import reveal from "@/components/settings/section-reveal.module.css";
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

export default function CalendarSettingsPage(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={`${styles.inner} ${reveal.reveal}`}>
        <PageHeader
          eyebrow="Settings"
          title="Calendar"
          subtitle="The school year, week, and holidays your whole team plans around."
        />

        <SchoolMonthsSection />

        {/* LANE-Y-CAL-MOUNT — academic year start + end date pickers.
            The Roadmap and Progression timelines derive their week range
            from this pair. */}
        <AcademicYearSection />

        {/* LANE-Y-MOUNT — school-week picker (which weekdays the
            school runs). */}
        <SchoolWeekSection />

        {/* LANE-Y-HOL-MOUNT — holidays / non-instruction-day editor. */}
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

// ── Section 1 — School months ──────────────────────────────────────────────
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
  const { showConsequence } = useConsequenceToast();
  const selected = useMemo(() => new Set(months), [months]);
  const activePreset = useMemo(() => detectPreset(months), [months]);

  const onPresetChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const key = e.target.value as PresetKey;
    if (key === "custom") return; // "custom" is implicit, not actionable
    const preset = SCHOOL_MONTH_PRESETS[key];
    if (!preset) return;
    // Snapshot BEFORE the write so Undo restores the exact prior selection
    // (not a re-detected preset — a custom set has no preset to detect).
    const previous = [...months];
    setMonths([...preset]);
    const label =
      PRESET_OPTIONS.find((o) => o.key === key)?.label ?? "a preset";
    // Widened to `number` deliberately: every preset today is 3–12 months
    // long, so TS narrows `preset.length` to that literal union and rejects
    // the `=== 1` pluralization check as impossible. Widening keeps the
    // sentence correct if a single-month preset is ever added, instead of
    // hard-coding "months" and quietly producing "1 months" later.
    const count: number = preset.length;
    showConsequence({
      message: `School months set to ${label} — the Year view now shows ${count} ${count === 1 ? "month" : "months"}.`,
      onUndo: () => setMonths(previous),
    });
  };

  /** Toggle a single month's membership in the selection. */
  const onToggleMonth = (monthIdx: number): void => {
    const previous = [...months];
    const long = MONTH_NAMES_LONG[monthIdx];
    const next = new Set(selected);
    const wasOn = next.has(monthIdx);
    if (wasOn) {
      next.delete(monthIdx);
    } else {
      next.add(monthIdx);
    }
    // Empty-state guard — fall back to all 12 months so the Year view
    // never has zero data to render. CLAUDE.md §1: every calendar
    // surface must derive its columns from the configured set.
    if (next.size === 0) {
      setMonths([...ALL_SCHOOL_MONTHS]);
      showConsequence({
        message: `${long} was your last school month, so the selection reset to all twelve — the Year view always needs at least one month.`,
        onUndo: () => setMonths(previous),
      });
      return;
    }
    setMonths(Array.from(next));
    showConsequence({
      message: wasOn
        ? `${long} removed from the school year — it no longer appears in the Year view.`
        : `${long} added to the school year — it now appears in the Year view.`,
      onUndo: () => setMonths(previous),
    });
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.calendar({ size: 14 })}
      scope="team"
      anchorId="school-months"
      eyebrow="Calendar"
      title={
        <Tooltip
          content="Which calendar months your school operates in — only these months show in /year. Team-scoped by design; for now it saves on this device only."
          side="bottom"
          required
        >
          <span>School months</span>
        </Tooltip>
      }
      hint="Which calendar months your team treats as the academic year. The Year view and any month-scoped filters use this."
      action={<TeamChip synced={false} />}
    >
      {/* ── Preset dropdown ─────────────────────────────────────────── */}
      <div className={styles.presetRow}>
        <label htmlFor="school-months-preset" className={styles.fieldLabel}>
          Preset
        </label>
        <Tooltip
          content="Quick-pick a common school-year shape. Picking one updates the month toggles below — on this device for now, until team sync arrives."
          side="bottom"
          required
        >
          <select
            id="school-months-preset"
            value={activePreset}
            onChange={onPresetChange}
            title="Quick-pick a common school-year shape. Picking one updates the month toggles below — on this device for now, until team sync arrives."
            className={styles.select}
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key} title={opt.hint}>
                {opt.label}
              </option>
            ))}
          </select>
        </Tooltip>
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
            const tip = `Include ${long} in this curriculum's school year. Changes apply to your views on this device for now — team sync arrives with the backend update.`;
            return (
              <Tooltip key={monthIdx} content={tip} side="top" required>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`${long} — ${isOn ? "included in" : "excluded from"} the school year`}
                  onClick={() => onToggleMonth(monthIdx)}
                  title={tip}
                  className={[
                    styles.monthChip,
                    isOn ? styles.monthChipOn : styles.monthChipOff,
                  ].join(" ")}
                >
                  {short}
                </button>
              </Tooltip>
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

// ── Section 2 — Academic year dates ────────────────────────────────────────
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

function AcademicYearSection(): ReactNode {
  const { start, end, setStart, setEnd, setRange } = useAcademicYear();
  const { showConsequence } = useConsequenceToast();

  const startIso = useMemo(() => academicYearDateToIso(start), [start]);
  const endIso = useMemo(() => academicYearDateToIso(end), [end]);

  // Live span readout — matches the number of week columns the Roadmap
  // and Progression views will render.
  const weeks = useMemo(() => {
    // weeksInRange currently returns `ceil(span) + 1` so a clean 36-week
    // configuration reports 37 (the trailing partial week). Display the
    // exact count to keep the math honest — overshooting by one week is
    // harmless because the timeline already renders that trailing column.
    return weeksInRange(start, end);
  }, [start, end]);

  // Undo restores the {start, end} PAIR through `setRange` — never a
  // single-endpoint setter (§4a Medium 1). The single setters normalize
  // against the OTHER CURRENT endpoint, so `setStart(x)` can legitimately
  // clamp the end too; an Undo of only one endpoint would restore the start
  // while keeping that clamped end. `setRange` on a previously-valid pair is
  // exact: normalizePair is idempotent on pairs already satisfying its
  // invariants (tests/academic-year-pair-restore.test.ts pins this).
  //
  // THE SNAPSHOT IS ANCHORED PER EDITING BURST, BY TIME — not per change
  // event and not at focus. Two live findings (2026-08-07) drove this:
  //
  //   1. A date input fires `change` PER SEGMENT during keyboard entry
  //      (month, then day, then year). A per-change snapshot captures
  //      INTERMEDIATE states, so the visible toast's Undo restored only the
  //      last segment edit, not the date the teacher started from.
  //   2. A focus-anchored snapshot was tried and ALSO restored an
  //      intermediate. On a CONTROLLED date input, every segment change
  //      re-renders and rewrites `value`, and Chrome's segment/focus state
  //      does not survive that rewrite — the anchor re-captured mid-burst
  //      (the restored value was the seeded day with an intermediate month:
  //      a mid-burst snapshot's fingerprint).
  //
  // The time anchor depends on neither: the first change after ≥1.2s of
  // quiet starts a burst and snapshots the pair; every change inside the
  // window extends it and reuses the SAME snapshot. Keyboard segments arrive
  // well inside the window, so every toast of one burst restores the same
  // pre-burst pair — whichever toast survives, its Undo is a FULL undo.
  // Known, accepted edge: a pause >1.2s mid-entry starts a new burst, so an
  // Undo then restores to that pause point rather than the very beginning —
  // a second Undo is available on the earlier toast until it expires.
  //
  // The hook clamps the span to 30–60 weeks, so the value that lands may
  // differ from the one typed — the toast therefore names the DATE THE
  // TEACHER PICKED, and the live "= N weeks" readout above shows the result.
  const BURST_MS = 1200;
  const burstRef = useRef<{
    pair: { start: Date; end: Date };
    last: number;
  } | null>(null);
  const burstSnapshot = (): { start: Date; end: Date } => {
    const now = Date.now();
    if (burstRef.current == null || now - burstRef.current.last > BURST_MS) {
      burstRef.current = { pair: { start, end }, last: now };
    } else {
      burstRef.current.last = now;
    }
    return burstRef.current.pair;
  };

  const onStartChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = academicYearIsoToDate(e.target.value);
    if (!next) return;
    const previous = burstSnapshot();
    setStart(next);
    showConsequence({
      message: `School year now starts ${formatIsoDate(e.target.value)} — the Roadmap and Progression timelines re-scale to the new range.`,
      onUndo: () => setRange(previous.start, previous.end),
    });
  };

  const onEndChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const next = academicYearIsoToDate(e.target.value);
    if (!next) return;
    const previous = burstSnapshot();
    setEnd(next);
    showConsequence({
      message: `School year now ends ${formatIsoDate(e.target.value)} — the Roadmap and Progression timelines re-scale to the new range.`,
      onUndo: () => setRange(previous.start, previous.end),
    });
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.calendar({ size: 14 })}
      scope="team"
      anchorId="academic-year"
      eyebrow="Calendar"
      title={
        <Tooltip
          content="The exact dates your academic year starts and ends — Roadmap + Progression scale to this range. Team-scoped by design; for now it saves on this device only."
          side="bottom"
          required
        >
          <span>Academic year dates</span>
        </Tooltip>
      }
      hint="When your school year starts and ends. The Year view's Roadmap and Progression timelines line up exactly with these dates."
      action={<TeamChip synced={false} />}
    >
      <div className={styles.dateRangeRow}>
        {/* Start date */}
        <div className={styles.formRow}>
          <label htmlFor="academic-year-start" className={styles.fieldLabel}>
            Start date
          </label>
          <Tooltip
            content="The first day of your school year. The Year view's Roadmap and Progression timelines start exactly here, so units pinned to early weeks land on the same calendar dates a teacher would see in their school's calendar."
            side="bottom"
            required
          >
            <input
              id="academic-year-start"
              name="academicYearStart"
              type="date"
              value={startIso}
              onChange={onStartChange}
              title="The first day of your school year. The Year view's Roadmap and Progression timelines start exactly here, so units pinned to early weeks land on the same calendar dates a teacher would see in their school's calendar."
              className={styles.textInput}
            />
          </Tooltip>
        </div>

        {/* End date */}
        <div className={styles.formRow}>
          <label htmlFor="academic-year-end" className={styles.fieldLabel}>
            End date
          </label>
          <Tooltip
            content="The last day of your school year. The Roadmap and Progression timelines end here — final-week units are anchored to this date, so a unit that ends two weeks before school finishes lands two weeks back from this date."
            side="bottom"
            required
          >
            <input
              id="academic-year-end"
              name="academicYearEnd"
              type="date"
              value={endIso}
              onChange={onEndChange}
              title="The last day of your school year. The Roadmap and Progression timelines end here — final-week units are anchored to this date, so a unit that ends two weeks before school finishes lands two weeks back from this date."
              className={styles.textInput}
            />
          </Tooltip>
        </div>
      </div>

      {/* Live span readout — keeps the math visible to the teacher as
          they edit either date. The number matches the column count the
          /year view will render. */}
      <Tooltip
        content="Total number of school weeks between your start and end dates. The Year view renders this many week columns."
        side="top"
      >
        <p
          className={styles.fieldHint}
          aria-live="polite"
          tabIndex={0}
          title="Total number of school weeks between your start and end dates. The Year view renders this many week columns."
        >
          = <strong>{weeks}</strong> {weeks === 1 ? "week" : "weeks"} of school
          year — your Roadmap and Progression timelines will use exactly this
          range.
        </p>
      </Tooltip>
      <p className={styles.fieldHint}>
        Spans are clamped to a 30–60 week range. Pick a sensible school year and
        the Year view will follow.
      </p>
    </SettingsCard>
  );
}

// ── Section 3 — School week ────────────────────────────────────────────────
// Two controls in one card:
//   • Preset dropdown — quick-pick presets (Sun–Thu / Mon–Fri /
//                       Mon–Sat). "Custom" is the implicit selection
//                       when the days don't match a preset.
//   • 7 weekday chips — fine-grained per-day toggle.
//
// Empty-state guard: unchecking the last remaining day is a no-op —
// the Weekly grid needs at least one column to render and CLAUDE.md §1
// requires every calendar surface to derive columns from this set.
//
// 1:1-by-index migration (per 2026-05-25 user clarification):
// `lesson.day = 0` always means "the first day of the school week",
// regardless of which weekday that is.

function SchoolWeekSection(): ReactNode {
  const { days, setDays, saveState } = useSchoolWeek();
  const { showConsequence } = useConsequenceToast();
  const selected = useMemo(() => new Set(days), [days]);
  const activePreset = useMemo(() => detectSchoolWeekPreset(days), [days]);

  // The ONLY control on this page whose write leaves the browser
  // (`schools.school_week`) — and RLS can refuse it, because moving
  // everyone's grid is admin-only. So the toast deliberately does NOT claim
  // a team-wide save: it names the local change and points at
  // SchoolWeekSaveNote, which reports the real outcome (saving / saved /
  // local / denied / failed). Promising "every teacher now sees this" here
  // would be exactly the lie the save-note was added to prevent.
  const announceWeek = (
    previous: readonly Weekday[],
    summary: string,
  ): void => {
    showConsequence({
      message: `School week set to ${summary}. This one saves for the whole team — the note under the chips confirms whether it went through.`,
      onUndo: () => setDays([...previous]),
    });
  };

  const onPresetChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const key = e.target.value as SchoolWeekDropdownKey;
    if (key === "custom") return; // "custom" is implicit, not actionable
    const preset = SCHOOL_WEEK_PRESETS[key];
    if (!preset) return;
    const previous = [...days];
    setDays([...preset]);
    announceWeek(
      previous,
      SCHOOL_WEEK_PRESET_OPTIONS.find((o) => o.key === key)?.label ??
        summarizeWeek(preset),
    );
  };

  /** Toggle a single weekday's membership in the selection. */
  const onToggleDay = (day: Weekday): void => {
    const next = new Set(selected);
    if (next.has(day)) {
      // Empty-state guard — refuse to drop below 1 day. The hook would
      // fall back to the default anyway, but silently swapping the
      // user's selection on "delete last" feels surprising; ignoring
      // the click is clearer. No toast either: nothing changed, and a
      // toast for a no-op would train teachers to ignore them.
      if (next.size <= 1) return;
      next.delete(day);
    } else {
      next.add(day);
    }
    const previous = [...days];
    const ordered = WEEKDAY_ORDER.filter((d) => next.has(d));
    setDays(ordered);
    announceWeek(previous, summarizeWeek(ordered));
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.calendar({ size: 14 })}
      scope="team"
      anchorId="school-week"
      eyebrow="Calendar"
      title={
        <Tooltip
          content="Which weekdays your school holds lessons — Sun-Thu for Qatar, Mon-Fri for US, etc. Shared with your team."
          side="bottom"
          required
        >
          <span>School week</span>
        </Tooltip>
      }
      hint="Which weekdays your school runs. The Weekly grid, Daily list, and Schedule all use this set as their day columns. Existing lessons map by index — day 0 stays day 0 (the first day of your school week)."
      action={<TeamChip synced />}
    >
      {/* ── Preset dropdown ─────────────────────────────────────────── */}
      <div className={styles.presetRow}>
        <label htmlFor="school-week-preset" className={styles.fieldLabel}>
          Preset
        </label>
        <Tooltip
          content="Quick-pick a common school-week shape. Picking one updates the weekday toggles below for the whole team."
          side="bottom"
          required
        >
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
        </Tooltip>
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
            const tip = isOnlyOne
              ? `${long} is the only school day right now — pick another weekday first before removing it.`
              : `Include ${long} in your school week. Every teacher on the team sees the change, and every calendar view updates its day columns.`;
            return (
              <Tooltip key={day} content={tip} side="top" required>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`${long} — ${isOn ? "included in" : "excluded from"} the school week`}
                  aria-disabled={isOnlyOne}
                  onClick={() => onToggleDay(day)}
                  title={tip}
                  className={[
                    styles.monthChip,
                    isOn ? styles.monthChipOn : styles.monthChipOff,
                  ].join(" ")}
                >
                  {short}
                </button>
              </Tooltip>
            );
          })}
        </div>
        <p className={styles.fieldHint}>
          At least one weekday must stay selected — the Weekly grid needs at
          least one column to render. Existing lessons map by index: a lesson on
          day 0 stays on day 0, even if that weekday changes.
        </p>
        <SchoolWeekSaveNote state={saveState} />
      </fieldset>
    </SettingsCard>
  );
}

/**
 * States the outcome of a school-week write.
 *
 * The week is the one team setting backed by the database
 * (`schools.school_week` — the column the planner derives its day columns
 * from), so a write can be REFUSED: only a workspace admin may change a
 * setting that moves everyone's grid. Reporting that is the point — a
 * refused write used to look identical to a successful one, which is how the
 * settings UI and the planner ended up disagreeing. `aria-live` so the
 * outcome reaches a screen reader too; there is no Save button to announce it.
 */
function SchoolWeekSaveNote({
  state,
}: {
  state: SchoolWeekSaveState;
}): ReactNode {
  if (state.status === "idle") return null;

  const isError = state.status === "denied" || state.status === "failed";
  // Sequential checks rather than a ternary chain so the compiler narrows the
  // union down to the two members that carry `message`.
  let text: string;
  if (state.status === "saving") {
    text = "Saving for the team…";
  } else if (state.status === "saved") {
    text = "Saved — every teacher on the team now plans against this week.";
  } else if (state.status === "local") {
    text = "Saved on this device.";
  } else {
    text = state.message;
  }

  return (
    <p
      className={`${styles.saveNote} ${isError ? styles.saveNoteError : ""}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </p>
  );
}

// ── Section 4 — Holidays ───────────────────────────────────────────────────
// Add / list / remove editor for the team's non-instruction days.
//   • Add form  — date input + name input + Add button. Both fields are
//                 required to submit.
//   • List      — each row shows the localized date + name + a remove
//                 button. Sorted by date ascending (handled by the hook).
//
// Consumed by /year (see components/year/UnitBar.tsx) to render a subtle
// striped "no school" overlay on holiday weeks. Holidays are TEAM-scoped
// per the curriculum doctrine.

function HolidaysSection(): ReactNode {
  const { holidays, add, remove } = useHolidays();
  const { showConsequence } = useConsequenceToast();

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
    const date = draftDate;
    const name = draftName.trim();
    // `add` returns the MINTED ID of the row it created (§4a Medium 2), so
    // Undo removes exactly that row by id — never a (date, name) lookup,
    // which could match a different identical holiday added in the meantime
    // (another tab via the storage sync, or a later manual re-add). The id is
    // stable across list changes, so the closure cannot go stale; removing an
    // already-removed id is a safe no-op inside the hook.
    const id = add({ date, name });
    if (id == null) return; // hook-level validation refused; nothing to toast
    setDraftDate("");
    setDraftName("");
    showConsequence({
      message: `“${name}” added on ${formatIsoDate(date)} — the Year view now greys out that week.`,
      onUndo: () => remove(id),
    });
  };

  /** Remove a holiday, with an Undo that re-adds it.
   *
   *  The restored row gets a FRESH id (`useHolidays.add` always mints one),
   *  which is invisible to the teacher — the id is an internal list key,
   *  never displayed and never referenced by another surface. Date and name,
   *  the only fields that carry meaning, round-trip exactly. */
  const onRemove = (holiday: Holiday): void => {
    remove(holiday.id);
    showConsequence({
      message: `“${holiday.name}” removed — the Year view no longer greys out ${formatIsoDate(holiday.date)}.`,
      onUndo: () => add({ date: holiday.date, name: holiday.name }),
    });
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.calendar({ size: 14 })}
      scope="team"
      anchorId="holidays"
      eyebrow="Calendar"
      title={
        <Tooltip
          content="Holidays + breaks during the school year — these days grey out on /year so you don't plan lessons on them. Team-scoped by design; for now it saves on this device only."
          side="bottom"
          required
        >
          <span>Holidays</span>
        </Tooltip>
      }
      hint="Non-instruction dates — Eid, Spring Break, in-service days, anything where lessons shouldn't run. The Year view greys out the matching week. Saved on this device for now — holidays reach your whole team once team sync arrives."
      action={<TeamChip synced={false} />}
    >
      {/* ── Add form ─────────────────────────────────────────────────── */}
      <form className={styles.holidayForm} onSubmit={onSubmit} noValidate>
        <div className={styles.holidayFormFields}>
          <div className={styles.holidayFormField}>
            <label htmlFor="holiday-date" className={styles.fieldLabel}>
              Date
            </label>
            <Tooltip
              content="The calendar date this holiday falls on. Pick from the picker or type YYYY-MM-DD."
              side="bottom"
              required
            >
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
            </Tooltip>
          </div>
          <div className={styles.holidayFormField}>
            <label htmlFor="holiday-name" className={styles.fieldLabel}>
              Name
            </label>
            <Tooltip
              content="What this holiday is called — appears on the Year-view tooltip and in this list."
              side="bottom"
              required
            >
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
            </Tooltip>
          </div>
          <div className={styles.holidayFormAction}>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!canSubmit}
              tooltip="Add this holiday — your Year view greys out the week it lands on. Saved on this device for now; teammates see it once team sync arrives."
              tooltipRequired
            >
              + Add holiday
            </Button>
          </div>
        </div>
        <p className={styles.fieldHint}>
          Both a date and a name are required. The Roadmap greys out the
          matching week so lessons there aren&rsquo;t planned. Holidays save on
          this device for now — they reach your whole team once team sync
          arrives.
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
            <HolidayRow key={h.id} holiday={h} onRemove={() => onRemove(h)} />
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
  // Locale-rendered date. The UTC-shift guard now lives in formatIsoDate,
  // shared with the academic-year toasts.
  const display = useMemo(() => formatIsoDate(holiday.date), [holiday.date]);

  return (
    <li className={styles.holidayItem}>
      <span className={styles.holidayDate}>{display}</span>
      <span className={styles.holidayName}>{holiday.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        tooltip={`Remove “${holiday.name}” from the holiday list on this device — your Year view will stop greying out the matching week. You can undo this from the toast.`}
        // Destructive + team-scoped: CLAUDE.md §4's always-on list on both
        // counts, so the explanation survives the global tooltip off switch.
        tooltipRequired
        aria-label={`Remove holiday ${holiday.name} on ${holiday.date}`}
      >
        Remove
      </Button>
    </li>
  );
}

// ── Team-scope chip, in two honest variants (§4a Medium 4) ─────────────────
// A cue pinned to each Card header. `synced` states what is TRUE TODAY, not
// the design intent:
//
//   • synced      — the value writes to the database (`schools.school_week` is
//                   the only one on this page) and genuinely reaches every
//                   teacher. The chip may say so.
//   • not synced  — the value is team-scoped BY DESIGN but persists to THIS
//                   BROWSER's localStorage until the team-settings backend
//                   lands. The chip must not claim teammates see it: a teacher
//                   who believes a holiday reached the team will discover the
//                   truth in front of a class. Amber dot + different label so
//                   the two states are distinguishable at a glance, not only
//                   on hover.
//
// The tooltips stay `required` in both variants: the scope explanation is the
// high-consequence content; only the false half of the old wording was the
// problem.

function TeamChip({ synced }: { synced: boolean }): ReactNode {
  const tip = synced
    ? "This setting affects every teacher on your grade-level team."
    : "A team setting by design — but right now it saves on this device only. Teammates won't see it until team sync arrives with the backend update.";
  const label = synced
    ? "Shared with your team"
    : "Team setting · this device only";
  return (
    <Tooltip content={tip} side="bottom" required>
      <span
        className={
          synced
            ? styles.teamChip
            : `${styles.teamChip} ${styles.teamChipLocal}`
        }
        tabIndex={0}
        title={tip}
        aria-label={label}
      >
        <span
          aria-hidden="true"
          className={
            synced
              ? styles.teamChipDot
              : `${styles.teamChipDot} ${styles.teamChipDotLocal}`
          }
        />
        {label}
      </span>
    </Tooltip>
  );
}
