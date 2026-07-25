"use client";

// use-roving-radio.ts — the WAI-ARIA radiogroup keyboard pattern, factored
// out of the four appearance pickers (theme / theme-quick-switch / style /
// palette) so they share ONE implementation instead of four copies.
//
// It generalizes the same roving-tabindex + arrow-key behavior the
// ToggleGroup primitive (components/ui/ToggleGroup.tsx) already ships, adding
// Home/End and exposing per-option `tabIndex` so each picker keeps a single
// Tab stop:
//   • Roving tabindex — the selected option is tabIndex=0, every other is -1,
//     so the group is entered with ONE Tab and arrows move within it.
//   • ArrowRight / ArrowDown → next option (wrapping by default).
//     ArrowLeft  / ArrowUp   → previous option (wrapping by default).
//     Home → first, End → last.
//   • Selection follows focus — the standard radio behavior, and exactly
//     right here since these are instant-apply preferences (moving the
//     selection IS choosing it). The hook calls `onSelect(nextValue)` and
//     then moves DOM focus to that option's button so the focus ring tracks
//     the selection.
//
// ── WHY `wrap` EXISTS (read before "simplifying" it away) ──────────────────
// Follows-focus above is deliberate and stays the default. But it composes
// badly with WRAPPING when one option CLEARS something, and one callsite has
// exactly that: settings/workspace-settings.tsx `DefaultNotebookCard` puts an
// `__auto__` sentinel at index 0 whose onSelect writes `null`, wiping the
// stored default-notebook preference.
//
// The distinction that matters, because it is easy to over-fix: arrowing LEFT
// from the first notebook onto that sentinel is an ADJACENT step onto a
// labelled radio option — normal, intended, not a bug. The bug is only the
// WRAP: ArrowRight off the LAST option circles round to index 0, so a user
// moving forward runs off the end and silently clears the preference without
// ever aiming at it.
//
// So the fix is scoped to wrapping, not to follows-focus. `wrap` defaults to
// true and the six appearance/filter callsites are unchanged; only the one
// with a clearing sentinel opts out. Do NOT "fix" this by breaking
// follows-focus for everyone — that would trade a real ARIA idiom for one
// callsite's problem.
//
// The hook is dependency-free and DOM-agnostic about styling: a consumer
// renders a container with `getGroupProps()` (onKeyDown) and each option
// button with `getOptionProps(value)` (tabIndex + a stable data attribute
// the hook uses to find the button to focus). Click handlers, aria-checked,
// roles, and visuals stay in the consumer — this hook owns keyboard only.

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";

// Each option is identified by a string value (the theme/style/palette id).
// Keeping it `string` rather than a generic avoids friction at the four
// callsites whose value unions (ThemeSetting, ThemeStyle, ThemePalette) are
// all string-based; the consumer casts back to its own union on select.
export interface RovingRadioOptions {
  /** The option values, in render/DOM order. Order drives arrow + Home/End. */
  values: readonly string[];
  /** The currently-selected value (drives which option is the Tab stop). */
  selected: string;
  /** Apply a value. Called on arrow/Home/End (selection follows focus). */
  onSelect: (value: string) => void;
  /**
   * Whether arrow keys wrap past the ends. Defaults to **true** (the ARIA
   * radiogroup norm, and what every appearance picker wants).
   *
   * Pass `false` when one option is a CLEARING sentinel — see the WRAP note in
   * the header above. Non-wrapping clamps at both ends instead: the first
   * option ignores ArrowLeft/Up, the last ignores ArrowRight/Down.
   */
  wrap?: boolean;
}

export interface RovingRadioApi {
  /** Spread onto the radiogroup container (supplies onKeyDown). */
  getGroupProps: () => {
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  };
  /** Spread onto each option button (supplies tabIndex + the lookup hook). */
  getOptionProps: (value: string) => {
    tabIndex: 0 | -1;
    "data-roving-value": string;
  };
}

const ROVING_ATTR = "data-roving-value";

export function useRovingRadio({
  values,
  selected,
  onSelect,
  wrap = true,
}: RovingRadioOptions): RovingRadioApi {
  const groupRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      // Capture the container the first time a key lands so the hook can
      // query its option buttons to move focus. currentTarget is the element
      // carrying onKeyDown — i.e. the radiogroup container.
      groupRef.current = e.currentTarget;

      const count = values.length;
      if (count === 0) return;

      const currentIndex = values.indexOf(selected);
      // If the selected value isn't in the list (shouldn't happen), treat the
      // first option as the anchor so navigation still works.
      const anchor = currentIndex === -1 ? 0 : currentIndex;
      let nextIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          // wrap=false clamps at the last option: `null` below means "no
          // movement", so the handler returns without calling onSelect at all
          // (rather than re-committing the current value).
          nextIndex =
            anchor + 1 < count ? anchor + 1 : wrap ? (anchor + 1) % count : null;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex =
            anchor - 1 >= 0
              ? anchor - 1
              : wrap
                ? (anchor - 1 + count) % count
                : null;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = count - 1;
          break;
        default:
          return;
      }

      // wrap=false at an end: swallow the key (the group still owns the arrow,
      // so the page doesn't scroll) but commit nothing and move nothing.
      if (nextIndex === null) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      const nextValue = values[nextIndex];
      onSelect(nextValue);

      // Move DOM focus to the newly-selected option so the focus-visible ring
      // tracks the selection. Scoped to THIS group's container (not the
      // document) via the data attribute, so two pickers on one page never
      // grab each other's buttons.
      const next = groupRef.current?.querySelector<HTMLElement>(
        `[${ROVING_ATTR}="${CSS.escape(nextValue)}"]`,
      );
      next?.focus();
    },
    [values, selected, onSelect, wrap],
  );

  const getGroupProps = useCallback(
    () => ({ onKeyDown: handleKeyDown }),
    [handleKeyDown],
  );

  const getOptionProps = useCallback(
    (value: string) => ({
      tabIndex: (value === selected ? 0 : -1) as 0 | -1,
      [ROVING_ATTR]: value,
    }),
    [selected],
  );

  return { getGroupProps, getOptionProps };
}
