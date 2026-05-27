"use client";

// ToggleGroup.tsx — canonical segmented-toggle primitive.
//
// The single source of truth for every segmented control in the app:
//   Personal/Master, By-Unit/By-Week, Grid/List,
//   Roadmap/Progression, Year sub-nav, etc.
//
// This primitive does NOT replace existing toggles yet — that migration
// is a separate wave. It ships the redesigned visual so every future
// toggle is consistent from day one.
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
//   ArrowLeft / ArrowRight — move selection through options.
//   Enter / Space           — activate the focused option.
//   The group has role="radiogroup"; each option has role="radio".
//
// ── Accessibility ──────────────────────────────────────────────────────
//   • ariaLabel is required on the group (e.g. "View mode").
//   • Each option can supply an ariaLabel for short/icon labels.
//   • Touch target ≥44×44 on phone/tablet via padding-trick ::before.

import { useCallback, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Tooltip } from "./Tooltip";
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
}: ToggleGroupProps<T>): ReactNode {
  const groupRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation: move selection forward/backward within the group.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = options.findIndex((o) => o.value === value);
      let nextIndex: number | null = null;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % options.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = currentIndex === 0 ? options.length - 1 : currentIndex - 1;
      }

      if (nextIndex !== null) {
        const next = options[nextIndex];
        onChange(next.value);
        // Move DOM focus to the newly-selected button so the outline
        // tracks the keyboard selection correctly.
        const buttons =
          groupRef.current?.querySelectorAll<HTMLButtonElement>(
            "[role='radio']",
          );
        buttons?.[nextIndex]?.focus();
      }
    },
    [options, value, onChange],
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
      {options.map((option) => {
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
            tabIndex={isActive ? 0 : -1}
            className={btnClasses}
            onClick={() => onChange(option.value)}
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
