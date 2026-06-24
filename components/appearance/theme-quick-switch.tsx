"use client";

// theme-quick-switch.tsx — compact one-row theme switcher.
//
// The full picker (theme-picker.tsx) lives on Settings → Appearance and is
// the primary affordance; this row of miniature theme chips is its
// quick-access twin for two always-near surfaces:
//   • the top-bar ⋯ More menu  (menuSemantics — role="menuitemradio")
//   • the Settings sidebar     (default — role="radiogroup"/"radio")
//
// Picking a chip applies + persists the theme instantly via useTheme();
// there is no save step, and the surface hosting the row stays open so a
// teacher can flip through themes and watch the app change live. Chips are
// the SAME miniature planner windows the Appearance picker renders
// (ThemeChip), so the preview language is identical everywhere.

import type { KeyboardEvent, ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { ThemeSetting } from "@/lib/theme";
import { Tooltip } from "@/components/ui";
import { ThemeChip } from "./theme-picker";
import { useRovingRadio } from "./use-roving-radio";
import styles from "./theme-quick-switch.module.css";

// Navigation keys the roving-radio hook consumes. Inside the top-bar More
// menu (menuSemantics) we stop these from bubbling so they drive ONLY the
// theme chips, never a future menu-level arrow handler — the correct
// behavior for a radio group nested in a menu.
const NAV_KEYS = new Set([
  "ArrowRight",
  "ArrowLeft",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

// Labels only — the full picker carries the long descriptions + tooltips;
// here each chip explains itself via aria-label/title.
const QUICK_OPTIONS: readonly { id: ThemeSetting; label: string }[] = [
  { id: "paper", label: "Paper" },
  { id: "cloud", label: "Cloud" },
  { id: "night", label: "Night" },
  { id: "mint", label: "Mint" },
  { id: "sky", label: "Sky" },
  { id: "blossom", label: "Blossom" },
  { id: "system", label: "Follow system" },
];

interface ThemeQuickSwitchProps {
  /** True when rendered inside a role="menu" (top-bar More menu): the chips
   *  become menuitemradio items per the ARIA menu pattern. Default renders
   *  a standalone radiogroup (Settings sidebar). */
  menuSemantics?: boolean;
}

export function ThemeQuickSwitch({
  menuSemantics = false,
}: ThemeQuickSwitchProps): ReactNode {
  const { theme, setTheme } = useTheme();
  const roving = useRovingRadio({
    values: QUICK_OPTIONS.map((o) => o.id),
    selected: theme,
    onSelect: (v) => setTheme(v as ThemeSetting),
  });

  // In the More menu the chips are a radio group nested in a role="menu";
  // keep their arrow/Home/End keys from bubbling to the menu so the two
  // never fight over the same keystroke. The hook's handler runs first
  // (it moves the selection + focus), then we halt propagation.
  const groupProps = roving.getGroupProps();
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    groupProps.onKeyDown(e);
    if (menuSemantics && NAV_KEYS.has(e.key)) {
      e.stopPropagation();
    }
  };

  return (
    <div
      role={menuSemantics ? "group" : "radiogroup"}
      // Distinct from the full picker's "App color theme" group — on
      // /settings/appearance BOTH render (sidebar strip + picker card), and
      // two identically-named radiogroups confuse AT users and tests alike.
      aria-label="Theme quick switch"
      className={styles.group}
      onKeyDown={onKeyDown}
    >
      {QUICK_OPTIONS.map((opt) => {
        const selected = theme === opt.id;
        const label =
          opt.id === "system"
            ? "Follow system — Paper by day, Night in dark mode"
            : `${opt.label} theme`;
        return (
          // Icon-only control → real Tooltip per CLAUDE.md §4 (hover AND
          // keyboard focus; native title alone never shows on focus). The
          // dismissible tooltipId keeps the chips inside the onboarding
          // system's global off-switch.
          <Tooltip
            key={opt.id}
            content={label}
            side="top"
            tooltipId={`appearance-quick-theme-${opt.id}`}
          >
            <button
              type="button"
              role={menuSemantics ? "menuitemradio" : "radio"}
              aria-checked={selected}
              aria-label={label}
              title={label}
              {...roving.getOptionProps(opt.id)}
              className={`${styles.chipBtn} cp-focusable`}
              onClick={() => setTheme(opt.id)}
            >
              <ThemeChip id={opt.id} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
