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

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { ThemeSetting } from "@/lib/theme";
import { ThemeChip } from "./theme-picker";
import styles from "./theme-quick-switch.module.css";

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

  return (
    <div
      role={menuSemantics ? "group" : "radiogroup"}
      aria-label="App color theme"
      className={styles.group}
    >
      {QUICK_OPTIONS.map((opt) => {
        const selected = theme === opt.id;
        const label =
          opt.id === "system"
            ? "Follow system — Paper by day, Night in dark mode"
            : `${opt.label} theme`;
        return (
          <button
            key={opt.id}
            type="button"
            role={menuSemantics ? "menuitemradio" : "radio"}
            aria-checked={selected}
            aria-label={label}
            title={label}
            className={`${styles.chipBtn} cp-focusable`}
            onClick={() => setTheme(opt.id)}
          >
            <ThemeChip id={opt.id} />
          </button>
        );
      })}
    </div>
  );
}
