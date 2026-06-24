"use client";

// theme-picker.tsx — the app-wide color-theme chooser.
//
// Six color themes plus "Follow system" — each a radio-style option, mirroring
// style-picker.tsx. Selecting one calls `setTheme` from `useTheme()`, so the
// whole app re-themes immediately. The theme is the canvas/ink/accent surface
// behind every view; it is independent of the per-card `style` axis and the
// per-subject `palette` saturation axis.
//
// Each option shows a tri-chip built from that theme's STATIC swatch tokens
// (--swatch-<id>-canvas/-accent/-ink) so the preview reads correctly no matter
// which theme is currently active. The selected card echoes the ACTIVE theme
// via --theme-accent / --theme-accent-soft.

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { ThemeSetting, AppTheme } from "@/lib/theme";
import { Tooltip } from "@/components/ui";
import { SettingsCard, RadioDot } from "./settings-card";
import { useRovingRadio } from "./use-roving-radio";
import cardStyles from "./settings-card.module.css";
import styles from "./theme-picker.module.css";

interface ThemeOption {
  id: ThemeSetting;
  label: string;
  desc: string;
  tooltip: string;
}

// Descriptions + first-time-teacher tooltips. The tooltip tells a teacher what
// the choice ACCOMPLISHES (a personal look change), not just what it is named.
const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: "paper",
    label: "Paper",
    desc: "Warm cream — the classic planner look.",
    tooltip:
      "Switch the whole planner to a warm cream background — the classic, on-paper planner look. Only changes how the app looks for you.",
  },
  {
    id: "cloud",
    label: "Cloud",
    desc: "Clean white, minimal warmth.",
    tooltip:
      "Switch the whole planner to a clean white background with minimal warmth. Only changes how the app looks for you.",
  },
  {
    id: "night",
    label: "Night",
    desc: "Dark ink-violet for low-light planning.",
    tooltip:
      "Switch the whole planner to a dark color scheme — easier on the eyes in dim rooms. Only changes how the app looks for you.",
  },
  {
    id: "mint",
    label: "Mint",
    desc: "Soft green wash.",
    tooltip:
      "Switch the whole planner to a soft green wash. Only changes how the app looks for you.",
  },
  {
    id: "sky",
    label: "Sky",
    desc: "Soft blue wash.",
    tooltip:
      "Switch the whole planner to a soft blue wash. Only changes how the app looks for you.",
  },
  {
    id: "blossom",
    label: "Blossom",
    desc: "Soft pink wash.",
    tooltip:
      "Switch the whole planner to a soft pink wash. Only changes how the app looks for you.",
  },
  {
    id: "system",
    label: "Follow system",
    desc: "Matches your device — Paper by day, Night in dark mode.",
    tooltip:
      "Let the planner match your device — the Paper look in light mode, the Night look in dark mode — and follow it automatically. Only changes how the app looks for you.",
  },
] as const;

// Human-readable label for the resolved theme, used in the "Currently: …"
// caption when "Follow system" is selected. Kept local so the picker does not
// depend on a label export from another module.
const RESOLVED_LABEL: Record<AppTheme, string> = {
  paper: "Paper",
  cloud: "Cloud",
  night: "Night",
  mint: "Mint",
  sky: "Sky",
  blossom: "Blossom",
};

export function ThemePicker(): ReactNode {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const roving = useRovingRadio({
    values: THEME_OPTIONS.map((o) => o.id),
    selected: theme,
    onSelect: (v) => setTheme(v as ThemeSetting),
  });

  return (
    <SettingsCard
      eyebrow="Theme"
      title={
        <Tooltip
          content="Pick the app-wide color theme — the background, ink, and accent behind every view. Personal preference, saved on this device; your teammates can pick their own."
          side="bottom"
        >
          <span>App color theme</span>
        </Tooltip>
      }
      hint="Personal preference — saved on this device; teammates pick their own."
    >
      <div
        role="radiogroup"
        aria-label="App color theme"
        {...roving.getGroupProps()}
        style={{
          marginTop: 12,
          display: "grid",
          // 132px floor → two columns on a 360px phone, all seven options in
          // one row on desktop. The option text column carries minWidth: 0 so
          // labels wrap instead of widening the track.
          gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
          gap: 8,
        }}
      >
        {THEME_OPTIONS.map((opt) => {
          const selected = theme === opt.id;
          return (
            <Tooltip
              key={opt.id}
              content={opt.tooltip}
              side="top"
              tooltipId={`appearance-theme-${opt.id}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                {...roving.getOptionProps(opt.id)}
                onClick={() => setTheme(opt.id)}
                title={opt.tooltip}
                className={`${styles.option} ${cardStyles.pickOption} cp-focusable`}
              >
                <RadioDot selected={selected} />
                <ThemeChip id={opt.id} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                    }}
                  >
                    {opt.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: "var(--ink-500)",
                      marginTop: 2,
                      lineHeight: 1.45,
                      textWrap: "pretty",
                    }}
                  >
                    {opt.desc}
                  </span>
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* When "Follow system" is selected, surface which concrete theme is
          live right now so the choice is not opaque. */}
      {theme === "system" && (
        <p
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: "var(--ink-500)",
          }}
        >
          Currently:{" "}
          <strong style={{ color: "var(--ink-900)" }}>
            {RESOLVED_LABEL[resolvedTheme]}
          </strong>
        </p>
      )}
    </SettingsCard>
  );
}

// ── Theme chip ──────────────────────────────────────────────────────────────
// A miniature planner window built from the option's STATIC swatch tokens
// (--swatch-<id>-canvas/-surface/-accent/-ink) so it previews correctly no
// matter which theme is active: the theme's canvas, an accent bar where the
// top bar sits, and a surface card carrying an ink text line. "Follow system"
// splits the window — a Paper half and a Night half — to signal it tracks the
// device's light/dark setting. Layout lives in theme-picker.module.css; only
// the swatch colors are inline.
//
// Exported: theme-quick-switch.tsx renders the same chips in the top-bar
// More menu and the Settings sidebar, so the preview language stays
// identical everywhere a theme can be chosen.

export function ThemeChip({ id }: { id: ThemeSetting }): ReactNode {
  if (id === "system") {
    return (
      <span aria-hidden className={styles.chip}>
        <span
          className={styles.chipHalf}
          style={{ background: "var(--swatch-paper-canvas)" }}
        >
          <span
            className={styles.chipCard}
            style={{ background: "var(--swatch-paper-surface)" }}
          >
            <span
              className={styles.chipInk}
              style={{ background: "var(--swatch-paper-ink)" }}
            />
          </span>
        </span>
        <span
          className={styles.chipHalf}
          style={{ background: "var(--swatch-night-canvas)" }}
        >
          <span
            className={styles.chipCard}
            style={{ background: "var(--swatch-night-surface)" }}
          >
            <span
              className={styles.chipInk}
              style={{ background: "var(--swatch-night-ink)" }}
            />
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={styles.chip}
      style={{ background: `var(--swatch-${id}-canvas)` }}
    >
      <span
        className={styles.chipAccent}
        style={{ background: `var(--swatch-${id}-accent)` }}
      />
      <span
        className={styles.chipCard}
        style={{ background: `var(--swatch-${id}-surface)` }}
      >
        <span
          className={styles.chipInk}
          style={{ background: `var(--swatch-${id}-ink)` }}
        />
      </span>
    </span>
  );
}
