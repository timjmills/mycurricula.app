"use client";

// AddUnitDialog — the "+ Add unit" modal launched from the /year header.
//
// Eight fields per the Lane DG spec:
//   1. Unit type label   — free text, remembered per-user as the default
//                          for subsequent opens.
//   2. Unit name         — free text, required.
//   3. Subject           — dropdown over SUBJECTS.
//   4. Start date        — <input type="date">.
//   5. End date          — <input type="date">.
//   6. Weeks             — auto from (start, end), user-overridable.
//   7. Lessons           — auto from weeks × daysOfWeek.length, override.
//   8. Days of the week  — chip multi-select limited to useSchoolWeek().days
//                          (chips outside the school week render disabled
//                          so the teacher sees the full Sun-Sat scaffold
//                          but can only pick days the school operates).
//
// Persistence is via the useCustomUnits() hook (Lane DG).
//
// Accessibility (BUILD_STANDARD.md §11 + CLAUDE.md §4):
//   - role="dialog" + aria-modal="true" + aria-labelledby.
//   - Esc closes; scrim click closes; explicit Cancel + ✕ close buttons.
//   - Focus is moved to the first input on open; on close it returns to
//     the trigger via the parent's ref management.
//   - Tab / Shift+Tab cycle inside the dialog (focus trap).
//   - Body scroll is locked while open so the underlying /year roadmap
//     doesn't pan behind the modal.
//   - Every interactive element carries a Tooltip explanation
//     (onboarding-friendly per CLAUDE.md §4 + BUILD_STANDARD.md §7).
//   - Touch targets ≥44×44 on day chips + action buttons.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SUBJECTS } from "@/lib/mock";
import type { SubjectId } from "@/lib/types";
import {
  useSchoolWeek,
  WEEKDAY_ORDER,
  type Weekday,
} from "@/lib/use-school-week";
import {
  useCustomUnits,
  weeksBetween,
  type CustomUnit,
} from "@/lib/use-custom-units";
import { Tooltip } from "@/components/ui";
import styles from "./AddUnitDialog.module.css";

// ── Focusable selector for the trap ───────────────────────────────────────

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── Day-chip label registry ───────────────────────────────────────────────

const WEEKDAY_SHORT: Record<Weekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

// ── Props ─────────────────────────────────────────────────────────────────

export interface AddUnitDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional callback fired with the newly-created unit after a successful save. */
  onCreated?: (unit: CustomUnit) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Today as ISO YYYY-MM-DD in local time. Used as the default start.
 */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Add `days` to an ISO date and return the new ISO date. Used to seed the
 * default end-date 6 weeks (42 days) after start.
 */
function isoPlusDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const base = new Date(y, mo, d);
  base.setDate(base.getDate() + days);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function AddUnitDialog({
  open,
  onClose,
  onCreated,
}: AddUnitDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const { days: schoolWeek } = useSchoolWeek();
  const { add, defaultUnitTypeLabel, setDefaultUnitTypeLabel } =
    useCustomUnits();

  // ── Form state ──────────────────────────────────────────────────────
  const [typeLabel, setTypeLabel] = useState<string>(defaultUnitTypeLabel);
  const [name, setName] = useState<string>("");
  const [subjectId, setSubjectId] = useState<SubjectId>(
    SUBJECTS[0].id as SubjectId,
  );
  const [startDate, setStartDate] = useState<string>(() => todayIso());
  const [endDate, setEndDate] = useState<string>(() =>
    isoPlusDays(todayIso(), 41),
  );

  // weeks + lessons are tracked as "user has overridden" so the auto-
  // compute keeps updating until the teacher clicks into the field.
  const [weeksOverride, setWeeksOverride] = useState<number | null>(null);
  const [lessonsOverride, setLessonsOverride] = useState<number | null>(null);

  // daysOfWeek defaults to all school days (per user spec).
  const [daysOfWeek, setDaysOfWeek] = useState<Weekday[]>([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Auto-derive weeks + lessons ─────────────────────────────────────

  const autoWeeks = useMemo(
    () => weeksBetween(startDate, endDate),
    [startDate, endDate],
  );
  const weeks = weeksOverride ?? autoWeeks;

  const autoLessons = useMemo(
    () => weeks * Math.max(1, daysOfWeek.length),
    [weeks, daysOfWeek.length],
  );
  const lessons = lessonsOverride ?? autoLessons;

  // ── Reset / seed on open ────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    // Pre-fill from the remembered default + sensible scaffolding.
    setTypeLabel(defaultUnitTypeLabel);
    setName("");
    setSubjectId(SUBJECTS[0].id as SubjectId);
    const start = todayIso();
    setStartDate(start);
    setEndDate(isoPlusDays(start, 41));
    setWeeksOverride(null);
    setLessonsOverride(null);
    // Default daysOfWeek = all school-week days (per user direction
    // 2026-05-25). If the school week changes between opens, the chips
    // re-default to the new full set.
    setDaysOfWeek([...schoolWeek]);
    setErrorMsg(null);
    // Focus the first field after the dialog mounts. RAF defers until the
    // portal element is attached + the animation start frame has run.
    requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Body scroll lock while open ─────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Focus trap + Esc to close ───────────────────────────────────────

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const els = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute("aria-hidden") || el.tabIndex >= 0);
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  // ── Day-chip toggle ────────────────────────────────────────────────

  const toggleDay = (d: Weekday): void => {
    setDaysOfWeek((prev) => {
      const has = prev.includes(d);
      if (has) {
        // Refuse to drop to zero — the unit must run on at least one day.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== d);
      }
      // Sort by canonical Sunday-first order on every change so consumers
      // see a stable ordering.
      const next = [...prev, d];
      next.sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
      return next;
    });
  };

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmedName = name.trim();
      const trimmedType = typeLabel.trim();

      // Validation — surface a single error banner.
      if (!trimmedName) {
        setErrorMsg("Please enter a unit name.");
        firstFieldRef.current?.focus();
        return;
      }
      if (startDate >= endDate) {
        setErrorMsg("End date must be after the start date.");
        return;
      }
      if (daysOfWeek.length === 0) {
        setErrorMsg("Pick at least one day of the week.");
        return;
      }

      // Persist the user's preferred type-label so the next open prefills.
      if (trimmedType && trimmedType !== defaultUnitTypeLabel) {
        setDefaultUnitTypeLabel(trimmedType);
      }

      const created = add({
        subjectId,
        unitTypeLabel: trimmedType || defaultUnitTypeLabel,
        name: trimmedName,
        startDate,
        endDate,
        weeks,
        lessons,
        daysOfWeek,
      });

      onCreated?.(created);
      onClose();
    },
    [
      name,
      typeLabel,
      startDate,
      endDate,
      daysOfWeek,
      defaultUnitTypeLabel,
      setDefaultUnitTypeLabel,
      add,
      subjectId,
      weeks,
      lessons,
      onCreated,
      onClose,
    ],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isValid =
    name.trim().length > 0 && startDate < endDate && daysOfWeek.length > 0;

  // ── Portal so the modal escapes /year's overflow chrome ────────────

  return createPortal(
    <div
      className={styles.scrim}
      onClick={onClose}
      aria-hidden="true"
      data-add-unit-scrim
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-unit-dialog-title"
        aria-describedby="add-unit-dialog-subtitle"
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <h2 id="add-unit-dialog-title" className={styles.title}>
              Add a unit
            </h2>
            <p id="add-unit-dialog-subtitle" className={styles.subtitle}>
              Drop a unit onto your year roadmap. Lessons can be added later.
            </p>
          </div>
          <Tooltip
            content="Close without saving — nothing on this form will be kept"
            side="bottom"
          >
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Close add unit dialog"
              onClick={onClose}
              title="Close without saving"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </Tooltip>
        </header>

        <form
          className={styles.form}
          onSubmit={handleSubmit}
          aria-label="New unit details"
        >
          {/* Unit type label — free text, remembered as the user's default. */}
          <div className={styles.field}>
            <label htmlFor="add-unit-type" className={styles.label}>
              Unit type label
            </label>
            <Tooltip
              content="What you call your units — 'Unit of Study', 'Unit of Inquiry', 'Unit of Lesson'. We'll remember this and use it as the default next time."
              side="right"
            >
              <input
                ref={firstFieldRef}
                id="add-unit-type"
                type="text"
                className={styles.input}
                placeholder="Unit of Study"
                value={typeLabel}
                onChange={(e) => setTypeLabel(e.target.value)}
                maxLength={60}
              />
            </Tooltip>
          </div>

          {/* Unit name — required. */}
          <div className={styles.field}>
            <label htmlFor="add-unit-name" className={styles.label}>
              Unit name<span className={styles.required}>*</span>
            </label>
            <Tooltip
              content="Short, recognizable name for this unit — what teachers and students will see across the planner."
              side="right"
            >
              <input
                id="add-unit-name"
                type="text"
                className={styles.input}
                placeholder="e.g. Fractions on a Number Line"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                aria-invalid={
                  errorMsg != null && name.trim().length === 0
                    ? "true"
                    : undefined
                }
              />
            </Tooltip>
          </div>

          {/* Subject — dropdown. */}
          <div className={styles.field}>
            <label htmlFor="add-unit-subject" className={styles.label}>
              Subject<span className={styles.required}>*</span>
            </label>
            <Tooltip
              content="Which of your subjects this unit belongs to. The Year roadmap groups units by subject lane."
              side="right"
            >
              <select
                id="add-unit-subject"
                className={styles.select}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value as SubjectId)}
              >
                {SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Tooltip>
          </div>

          {/* Start / End date — two-up row. */}
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="add-unit-start" className={styles.label}>
                Start date<span className={styles.required}>*</span>
              </label>
              <Tooltip
                content="The first day this unit runs. The Year roadmap places the unit bar starting from this week."
                side="bottom"
              >
                <input
                  id="add-unit-start"
                  type="date"
                  className={styles.input}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setWeeksOverride(null); // re-engage auto-compute
                  }}
                />
              </Tooltip>
            </div>

            <div className={styles.field}>
              <label htmlFor="add-unit-end" className={styles.label}>
                End date<span className={styles.required}>*</span>
              </label>
              <Tooltip
                content="The last day this unit runs. Together with the start date this fills in the number of weeks for you."
                side="bottom"
              >
                <input
                  id="add-unit-end"
                  type="date"
                  className={styles.input}
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setWeeksOverride(null);
                  }}
                  min={startDate}
                />
              </Tooltip>
            </div>
          </div>

          {/* Weeks + Lessons — auto-computed but overridable. */}
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="add-unit-weeks" className={styles.label}>
                Weeks
                {weeksOverride == null && (
                  <span className={styles.autoBadge}>Auto</span>
                )}
              </label>
              <Tooltip
                content="Number of school weeks this unit covers. We fill this in from your start and end dates — type a different number to override."
                side="bottom"
              >
                <input
                  id="add-unit-weeks"
                  type="number"
                  className={styles.input}
                  min={1}
                  max={60}
                  value={weeks}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 1) {
                      setWeeksOverride(Math.floor(v));
                      setLessonsOverride(null);
                    }
                  }}
                />
              </Tooltip>
            </div>

            <div className={styles.field}>
              <label htmlFor="add-unit-lessons" className={styles.label}>
                Lessons
                {lessonsOverride == null && (
                  <span className={styles.autoBadge}>Auto</span>
                )}
              </label>
              <Tooltip
                content="Total lessons in this unit. By default we multiply your weeks by the days-of-the-week selected below — type a different number to override."
                side="bottom"
              >
                <input
                  id="add-unit-lessons"
                  type="number"
                  className={styles.input}
                  min={0}
                  max={500}
                  value={lessons}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) {
                      setLessonsOverride(Math.floor(v));
                    }
                  }}
                />
              </Tooltip>
            </div>
          </div>

          {/* Days of the week — chip multi-select, gated by school week. */}
          <div className={styles.field}>
            <span className={styles.label}>
              Days of the week<span className={styles.required}>*</span>
            </span>
            <Tooltip
              content="Which weekdays this unit meets. Grey chips are days your school doesn't run, so they're not selectable here. If a course only meets three days a week, pick three — the lesson count adjusts automatically."
              side="top"
            >
              <div
                className={styles.dayChips}
                role="group"
                aria-label="Days of the week"
              >
                {WEEKDAY_ORDER.map((d) => {
                  const isSchoolDay = schoolWeek.includes(d);
                  const isActive = daysOfWeek.includes(d);
                  const dayTip = !isSchoolDay
                    ? `${WEEKDAY_SHORT[d]} — not in your school week`
                    : isActive
                      ? `${WEEKDAY_SHORT[d]} — click to remove from this unit's meeting days`
                      : `${WEEKDAY_SHORT[d]} — click to add as one of this unit's meeting days`;
                  return (
                    <Tooltip key={d} content={dayTip} side="bottom">
                      <button
                        type="button"
                        className={`${styles.dayChip} ${
                          isActive ? styles.dayChipActive : ""
                        } ${!isSchoolDay ? styles.dayChipDisabled : ""}`}
                        aria-pressed={isActive}
                        aria-disabled={!isSchoolDay}
                        disabled={!isSchoolDay}
                        title={dayTip}
                        onClick={() => {
                          if (!isSchoolDay) return;
                          toggleDay(d);
                          setLessonsOverride(null); // re-engage auto-compute
                        }}
                      >
                        {WEEKDAY_SHORT[d]}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </Tooltip>
            <span className={styles.hint}>
              {daysOfWeek.length} day{daysOfWeek.length === 1 ? "" : "s"}{" "}
              selected
              {" · "}
              School week: {schoolWeek.map((d) => WEEKDAY_SHORT[d]).join(", ")}
            </span>
          </div>

          {/* Error banner — single source for validation feedback. */}
          {errorMsg && (
            <div role="alert" className={styles.errorBanner}>
              {errorMsg}
            </div>
          )}
        </form>

        <div className={styles.actions}>
          <Tooltip
            content="Close without saving — nothing on this form will be kept"
            side="top"
          >
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              title="Close without saving"
            >
              Cancel
            </button>
          </Tooltip>
          <Tooltip
            content="Add this unit to your year roadmap. You can edit it or add lessons later."
            side="top"
          >
            <button
              type="button"
              className={styles.btnSave}
              onClick={handleSubmit}
              disabled={!isValid}
              aria-disabled={!isValid}
              title="Save and add the unit"
            >
              Add unit
            </button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}
