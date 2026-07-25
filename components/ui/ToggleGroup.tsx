"use client";

// ToggleGroup.tsx — canonical segmented-toggle primitive.
//
// The single source of truth for every segmented control in the app:
//   Personal/Master, By-Unit/By-Week, Grid/List,
//   Roadmap/Progression, Year sub-nav, etc.
//
// It IS the app's segmented control: ~30 callsites across chrome, the
// planner surfaces, onboarding, settings, Teach and the unit drawer now
// render through it, so a rule added here is inherited everywhere — and
// so is a trap.
//
// ── Variants ───────────────────────────────────────────────────────────
//   subtle    — in-page contextual switches (default). Active option gets
//               a paper chip with shadow and ink-900 text. Inactive items
//               sit on an ink-100 tray with ink-500 text.
//   prominent — primary mode switches (Grid/List, Roadmap/Progression).
//               Active option gets a full ink-900 chip with paper text.
//               Tray is ink-100; heavier, more assertive.
//
// ── Keyboard ───────────────────────────────────────────────────────────
//   ArrowLeft / ArrowRight — move through the options, wrapping.
//   Enter / Space           — activate the focused option.
//   The group has role="radiogroup"; each option has role="radio".
//
//   Whether an ARROW also commits is the `selectOnFocus` axis. It defaults
//   to `true` (the ARIA radio-group default: selection follows focus) and
//   is FORCED off by a `destructive` option — see `toggle-group-keys.ts`.
//   A destructive option must never be selected in transit, while the
//   teacher is merely looking at what else is there.
//
// ── Never fires for a no-op ────────────────────────────────────────────
//   Re-selecting the ACTIVE option does not call `onChange`. Callers treat
//   every onChange as an edit — in the planner an edit lazily FORKS a Team
//   lesson (CLAUDE.md §2) — and clicking the chip that is already lit is
//   not an edit.
//
// ── Accessibility ──────────────────────────────────────────────────────
//   • ariaLabel is required on the group (e.g. "View mode").
//   • Each option can supply an ariaLabel for short/icon labels.
//   • Touch target ≥44×44 on phone/tablet via padding-trick ::before.

import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import { arrowCommits, arrowTarget, selectionOf } from "./toggle-group-keys";
import styles from "./ToggleGroup.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToggleOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Full accessible name for icon-only or abbreviated labels on phone. */
  ariaLabel?: string;
  /**
   * Onboarding tooltip — explains what the option DOES for a first-time
   * teacher (CLAUDE.md §4). Rendered as a native `title=` attribute so
   * the explanation shows on hover (desktop) AND long-press (touch).
   */
  title?: string;
  /**
   * Optional per-option dismissible tooltip id (W2-B3). When supplied the
   * wrapping <Tooltip> opts in to dismissibility — the bubble carries a
   * "Turn off these tips" mini-link, and once dismissed the tooltip is
   * suppressed by `lib/tooltip-dismissal`. Omit for always-on tooltips
   * (the legacy default). High-consequence options should set the group's
   * `tooltipRequired` instead.
   */
  tooltipId?: string;
  /**
   * Marks an option whose selection CLEARS or destroys content — a "None",
   * "Clear" or "Remove" segment, as opposed to one that merely switches
   * what is shown.
   *
   * ONE such option anywhere in the group turns off "selection follows
   * focus" for the WHOLE group: arrows then move focus only, and
   * Enter / Space (or a click) commits. Without that, the destructive
   * option is reachable IN TRANSIT — arrow navigation wraps, so it sits one
   * keypress after the last option — and a teacher stepping through the
   * group to see what is there commits it on the way past. Set it on the
   * option, not at the callsite, so a group that gains a clear/none segment
   * later inherits the protection with it.
   */
  destructive?: boolean;
}

export interface ToggleGroupProps<T extends string = string> {
  options: Array<ToggleOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  variant?: "subtle" | "prominent";
  /** Required — labels the radiogroup for screen readers. */
  ariaLabel: string;
  className?: string;
  /**
   * W2-B3 — when true, every per-option onboarding tooltip is marked
   * `required` so it ignores the dismissible-tooltip global off switch
   * and the per-id dismissal set. Use for high-consequence segmented
   * controls per CLAUDE.md §4 — namely the Personal / Team Curriculum
   * toggle. Default false.
   */
  tooltipRequired?: boolean;
  /**
   * Locks the whole group. Use when a longer operation is in flight and a
   * changed selection would race it — the group keeps rendering its current
   * value (so nothing appears to reset), it simply cannot be changed.
   * Default false.
   */
  disabled?: boolean;
  /**
   * Whether an ARROW key commits the option it lands on (`true`, the ARIA
   * radio-group default — selection follows focus) or merely moves focus,
   * leaving Enter / Space to commit (`false`).
   *
   * Default `true`: for an ordinary group, arrowing onto an option IS how a
   * keyboard user picks it, and every existing callsite relies on that.
   * Pass `false` when a commit is expensive or noisy even though no single
   * option is destructive (each arrow press fires `onChange`, and several
   * callsites persist on every one). A `destructive` option overrides this
   * to `false` regardless of what is passed.
   */
  selectOnFocus?: boolean;
}

// ── ToggleGroup ─────────────────────────────────────────────────────────────

export function ToggleGroup<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  variant = "subtle",
  ariaLabel,
  className,
  tooltipRequired = false,
  disabled = false,
  selectOnFocus = true,
}: ToggleGroupProps<T>): ReactNode {
  const groupRef = useRef<HTMLDivElement>(null);

  const activeIndex = options.findIndex((o) => o.value === value);
  const commitsOnArrow = arrowCommits(options, selectOnFocus);

  // Where the roving tab stop sits when an arrow has moved focus WITHOUT
  // committing. Null means "wherever the active option is" — which is the only
  // possibility while selection follows focus, since the two never diverge
  // there. Clamped on read: `options` can shrink under an open group.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const roving =
    !commitsOnArrow && focusIndex !== null && focusIndex < options.length
      ? focusIndex
      : activeIndex;
  // A `value` matching no option would otherwise leave every button at
  // tabIndex -1, i.e. a control the Tab key cannot reach at all.
  const tabStop = roving >= 0 ? roving : 0;

  /** The one commit path. Never fires for the option that is already active. */
  const select = useCallback(
    (next: T) => {
      const commit = selectionOf(next, value);
      if (commit !== null) onChange(commit);
    },
    [value, onChange],
  );

  // Arrow-key navigation. Moves the roving focus; whether it also COMMITS is
  // `commitsOnArrow` — off whenever the group holds a destructive option, so
  // arrowing past "None" can never clear the fields on the way past.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const nextIndex = arrowTarget(e.key, tabStop, options.length);
      if (nextIndex === null) return;
      e.preventDefault();
      setFocusIndex(nextIndex);
      if (commitsOnArrow) select(options[nextIndex].value);
      // Move DOM focus to the option the arrow landed on, so the outline
      // tracks the keyboard position. In focus-only mode that outline is the
      // sole indication of where Enter / Space would land.
      groupRef.current
        ?.querySelectorAll<HTMLButtonElement>("[role='radio']")
        ?.[nextIndex]?.focus();
    },
    [disabled, tabStop, options, commitsOnArrow, select],
  );

  const trayClasses = [
    styles.tray,
    styles[variant],
    styles[size],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={trayClasses}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isActive = option.value === value;
        const btnClasses = [
          styles.option,
          isActive ? styles.active : styles.inactive,
        ].join(" ");

        // Render the radio as a bespoke <button>. When the option carries
        // a `title` (onboarding tooltip per CLAUDE.md §4) the button is
        // wrapped in the styled <Tooltip> primitive so the bubble paints
        // with the black backdrop + light text the user explicitly
        // asked for everywhere — not the OS-default light native title.
        // The native title= attribute stays on the inner element as a
        // cross-engine fallback (touch long-press; engines that drop
        // pointer events on disabled buttons).
        const buttonEl = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.ariaLabel ?? option.label}
            title={option.title}
            tabIndex={index === tabStop ? 0 : -1}
            className={btnClasses}
            disabled={disabled}
            onClick={() => {
              // Keep the roving stop under the pointer too, so a click
              // followed by an arrow continues from where the teacher is
              // looking rather than from the last keyboard position.
              setFocusIndex(index);
              select(option.value);
            }}
          >
            {option.icon && (
              <span className={styles.optionIcon} aria-hidden="true">
                {option.icon}
              </span>
            )}
            <span className={styles.optionLabel}>{option.label}</span>
          </button>
        );

        return option.title ? (
          <Tooltip
            key={option.value}
            content={option.title}
            side="bottom"
            required={tooltipRequired}
            tooltipId={option.tooltipId}
          >
            {buttonEl}
          </Tooltip>
        ) : (
          buttonEl
        );
      })}
    </div>
  );
}
