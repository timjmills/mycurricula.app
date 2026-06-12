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
//   • ArrowRight / ArrowDown → next option (wrapping).
//     ArrowLeft  / ArrowUp   → previous option (wrapping).
//     Home → first, End → last.
//   • Selection follows focus — the standard radio behavior, and exactly
//     right here since these are instant-apply preferences (moving the
//     selection IS choosing it). The hook calls `onSelect(nextValue)` and
//     then moves DOM focus to that option's button so the focus ring tracks
//     the selection.
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
          nextIndex = (anchor + 1) % count;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (anchor - 1 + count) % count;
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
    [values, selected, onSelect],
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
