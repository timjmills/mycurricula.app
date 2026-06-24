"use client";

// appearance-controls.tsx — the shared control surface for the v2 appearance
// engine (Wave 2 · Stage 6).
//
// ONE reusable component that drives every v2 axis through the useTheme()
// setters. The §4b live-QA gate (B2) drives this directly ("Frame / Glass /
// Background / Theme / Dim"); later waves consume it from three places without
// rebuilding it — the full Settings → Appearance panel, the per-heading style
// cog popover, and the top-bar quick-switch — via the `axes` / `compact` props.
//
// CANONICAL REFERENCE: the v2 handoff appearance surface lives in
// `…/6.24.26 design_handoff_v2_site/source/settings.jsx` (the AppearanceControls
// mock) + `config.jsx` (the Setup-modal host). Labels, ordering, hints, and the
// glass-on-Frame-A dependency below are sourced from settings.jsx; the value set
// is sourced from the exported guard arrays in lib/theme.tsx (the lockstep
// origin of the frozen matrix — WAVE-2-VALUE-MATRIX.md §1). Where the two
// disagree the handoff wins for copy and the matrix wins for values.
//
// PRESENTATION-ONLY. The setters in theme.tsx already persist every axis to
// localStorage; this component owns NO persistence, NO scope ("this page /
// whole site") logic, and never reads/writes storage itself. Tone is DERIVED in
// theme.tsx — there is deliberately NO tone control here. Glass register
// (dark/light) is a distinct axis from tone; the two are never conflated.

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type {
  ThemeFrame,
  ThemeGlass,
  ThemeBg,
  ThemeSetting,
  ThemeDim,
  AppTheme,
} from "@/lib/theme";
import {
  FRAME_VALUES,
  GLASS_VALUES,
  BG_VALUES,
  APP_THEMES,
  DIM_VALUES,
} from "@/lib/theme";
import { Tooltip } from "@/components/ui";
import { SettingsCard, RadioDot } from "./settings-card";
import { useRovingRadio } from "./use-roving-radio";
import { ThemeChip } from "./theme-picker";
import cardStyles from "./settings-card.module.css";

// ── Axis identifiers ─────────────────────────────────────────────────────────
// The five renderable axis groups, in default render order (mirrors the
// settings.jsx layout: Frame → Glass → Background → Dim → Theme, with Theme
// last so the largest swatch grid anchors the bottom). A consumer picks a
// subset + ordering via the `axes` prop — e.g. the quick-switch wants only
// ["theme", "frame"].
export type AppearanceAxis = "frame" | "glass" | "background" | "dim" | "theme";

/** Default render order when no `axes` prop is passed — all five groups. */
const DEFAULT_AXES: readonly AppearanceAxis[] = [
  "frame",
  "glass",
  "background",
  "dim",
  "theme",
];

export interface AppearanceControlsProps {
  /**
   * Which axis groups to render, in order. Defaults to all five (Frame, Glass,
   * Background, Photo brightness, Theme). A compact consumer can pass a subset
   * — e.g. `["theme", "frame"]` for a quick-switch popover. Duplicate / unknown
   * entries are ignored; the Glass group still self-gates on `frame === "glass"`
   * even when explicitly requested.
   */
  axes?: readonly AppearanceAxis[];
  /**
   * Compact register for tight surfaces (the per-heading style cog, the
   * quick-switch popover). Tightens the inter-group spacing; the individual
   * radiogroups stay fully usable + ≥44px-tall. Default false (the roomy
   * full-settings-panel layout).
   */
  compact?: boolean;
  /** Extra class on the root, for callsite layout (width, margins). */
  className?: string;
}

// ── Per-axis copy (sourced from settings.jsx + the matrix §1 Notes) ──────────
// Each option carries a handoff-faithful label + a first-time-teacher tooltip.
// The tooltip voice follows CLAUDE.md §4 — what the control ACCOMPLISHES for
// this teacher, not a restatement of the value name. Everything is keyed by the
// concrete v2 value so the option lists below stay single-sourced from the
// guard arrays.

interface OptionMeta {
  label: string;
  desc: string;
  tooltip: string;
}

// Frame — settings.jsx FramePicker: Calm Glass (A→glass) · Bright (B→paper) ·
// Color (C→color), with the note line under each ("Frosted · floating" / "White
// paper" / "Subject-led").
const FRAME_META: Record<ThemeFrame, OptionMeta> = {
  glass: {
    label: "Calm Glass",
    desc: "Frosted · floating",
    tooltip:
      "Give the whole app the Calm Glass look — frosted, floating panels over the background. The default. Only changes how the app looks for you.",
  },
  paper: {
    label: "Bright",
    desc: "White paper",
    tooltip:
      "Switch the whole app to the Bright look — clean white paper surfaces. Only changes how the app looks for you.",
  },
  color: {
    label: "Color",
    desc: "Subject-led",
    tooltip:
      "Switch the whole app to the Color look — subject color leads the surfaces. Only changes how the app looks for you.",
  },
};

// Glass register — settings.jsx GlassPicker: Dark · White, each "{label} frosted".
// Only meaningful in Frame A (Calm Glass); see the gating note at the callsite.
const GLASS_META: Record<ThemeGlass, OptionMeta> = {
  dark: {
    label: "Dark",
    desc: "Dark frosted",
    tooltip:
      "Use the dark frosted register — translucent dark panels with white text. Surface only; the background is unchanged.",
  },
  light: {
    label: "White",
    desc: "White frosted",
    tooltip:
      "Use the white frosted register — translucent white panels with dark text. Surface only; the background is unchanged.",
  },
};

// Background — settings.jsx BgPicker: Photo · Wash. (The handoff's legacy
// "ambient" value is canonicalized to "wash"; matrix §1.)
const BG_META: Record<ThemeBg, OptionMeta> = {
  photo: {
    label: "Photo",
    desc: "Frosted glass over a classroom photo",
    tooltip:
      "Put a classroom photo behind the frosted glass. Only changes how the app looks for you.",
  },
  wash: {
    label: "Wash",
    desc: "Liquid glass over a soft color wash",
    tooltip:
      "Drop the photo for a soft color wash behind the glass — calmer, lower-contrast. Only changes how the app looks for you.",
  },
};

// Photo brightness (Dim) — settings.jsx "Photo light" row, hint "dark · normal
// · light", options Dark / Normal / Light → values dim / normal / bright.
// `normal` is the AUTO mode (samples the photo's luminance to derive tone —
// matrix §1 + §4). Photo-only, so the group hides under bg === "wash".
const DIM_META: Record<ThemeDim, OptionMeta> = {
  dim: {
    label: "Dark",
    desc: "Heavier scrim — white text reads on any photo.",
    tooltip:
      "Darken the photo so white text always reads on top. Only changes how the app looks for you.",
  },
  normal: {
    label: "Normal",
    desc: "Auto — matches text to the photo's brightness.",
    tooltip:
      "Let the app read the photo's brightness and pick light or dark text to match — automatically. Only changes how the app looks for you.",
  },
  bright: {
    label: "Light",
    desc: "Lighter photo — dark text on white frosted cards.",
    tooltip:
      "Lighten the photo so dark text reads on white frosted cards. Only changes how the app looks for you.",
  },
};

// Theme — settings.jsx ThemePicker labels (Clear / Honey / Blossom / Mint /
// Sky / Night / Photo). Values come from APP_THEMES (the guard array), so the
// option list stays single-sourced; only the labels/copy live here. No "system"
// auto option — config.jsx's ThemePicker does not offer one.
const THEME_META: Record<AppTheme, OptionMeta> = {
  clear: {
    label: "Clear",
    desc: "The resting theme — balanced brand wash.",
    tooltip:
      "Switch the whole planner to the Clear theme — the balanced resting look. Only changes how the app looks for you.",
  },
  night: {
    label: "Night",
    desc: "Dark ink-violet for low-light planning.",
    tooltip:
      "Switch the whole planner to a dark color scheme — easier on the eyes in dim rooms. Only changes how the app looks for you.",
  },
  honey: {
    label: "Honey",
    desc: "Warm gold, amber, and coral.",
    tooltip:
      "Switch the whole planner to a warm gold/amber wash. Only changes how the app looks for you.",
  },
  blossom: {
    label: "Blossom",
    desc: "Pink, violet, and periwinkle.",
    tooltip:
      "Switch the whole planner to a soft pink/violet wash. Only changes how the app looks for you.",
  },
  mint: {
    label: "Mint",
    desc: "Soft blue-green wash.",
    tooltip:
      "Switch the whole planner to a soft blue-green wash. Only changes how the app looks for you.",
  },
  sky: {
    label: "Sky",
    desc: "Cool blue wash.",
    tooltip:
      "Switch the whole planner to a cool blue wash. Only changes how the app looks for you.",
  },
  off: {
    label: "Photo",
    desc: "No wash — the true, ungraded photo.",
    tooltip:
      "Turn the color wash off so the original classroom photo shows through, ungraded. Only changes how the app looks for you.",
  },
};

// ── Generic radio-group row ──────────────────────────────────────────────────
// One labeled WAI-ARIA radiogroup, reusing SettingsCard's RadioDot + the roving
// keyboard hook + the shared `.pickOption` chrome — the same idiom as
// style-picker.tsx. `disabled` greys the whole group and routes a single
// explanatory tooltip onto the group label (the disabled-control onboarding
// case — CLAUDE.md §4); the disabled options stop responding but stay visible
// so the dependency is legible, matching the handoff's surfacing of why a
// control is inert.

interface RadioGroupProps<V extends string> {
  /** Group eyebrow + accessible name (e.g. "Frame"). */
  eyebrow: string;
  /** One-line onboarding hint shown under the title (handoff voice). */
  hint?: string;
  /** Per-panel onboarding tooltip on the title — what this axis does. */
  titleTooltip: string;
  /** The option values, in render order (the guard array). */
  values: readonly V[];
  /** Per-value label/desc/tooltip metadata. */
  meta: Record<V, OptionMeta>;
  /** Currently-selected value. */
  selected: V;
  /** Apply a value. */
  onSelect: (value: V) => void;
  /** Stable tooltip-id prefix for the dismissible per-option tooltips. */
  idPrefix: string;
  /** When set, the group is inert + this string explains why (disabled case). */
  disabledReason?: string;
  /** Optional per-value preview node (e.g. the theme chip). */
  renderPreview?: (value: V) => ReactNode;
  compact: boolean;
  savedTick: number;
}

function RadioGroup<V extends string>({
  eyebrow,
  hint,
  titleTooltip,
  values,
  meta,
  selected,
  onSelect,
  idPrefix,
  disabledReason,
  renderPreview,
  compact,
  savedTick,
}: RadioGroupProps<V>): ReactNode {
  const disabled = disabledReason !== undefined;
  const roving = useRovingRadio({
    values,
    selected,
    onSelect: (v) => {
      if (!disabled) onSelect(v as V);
    },
  });

  const groupLabel = (
    <Tooltip content={disabled ? disabledReason : titleTooltip} side="bottom">
      <span>{eyebrow}</span>
    </Tooltip>
  );

  return (
    <SettingsCard eyebrow={eyebrow} title={groupLabel} hint={hint} savedTick={savedTick}>
      <div
        role="radiogroup"
        aria-label={eyebrow}
        aria-disabled={disabled || undefined}
        {...roving.getGroupProps()}
        style={{
          marginTop: compact ? 8 : 12,
          display: "grid",
          // 132px floor → two columns on a 360px phone, every option on one row
          // on desktop. Mirrors theme-picker.tsx's responsive grid so all the
          // appearance groups lay out the same way at every tier.
          gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {values.map((value) => {
          const isSelected = value === selected;
          const m = meta[value];
          return (
            <Tooltip
              key={value}
              content={disabled ? disabledReason : m.tooltip}
              side="top"
              tooltipId={disabled ? undefined : `${idPrefix}-${value}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                {...roving.getOptionProps(value)}
                onClick={() => {
                  if (!disabled) onSelect(value);
                }}
                title={disabled ? disabledReason : m.tooltip}
                className={`${cardStyles.pickOption} cp-focusable`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: compact ? "9px 12px" : "11px 14px",
                  minHeight: 44,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <RadioDot selected={isSelected} />
                {renderPreview?.(value)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                    }}
                  >
                    {m.label}
                  </span>
                  {!compact && (
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
                      {m.desc}
                    </span>
                  )}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </SettingsCard>
  );
}

// ── AppearanceControls ───────────────────────────────────────────────────────

export function AppearanceControls({
  axes = DEFAULT_AXES,
  compact = false,
  className,
}: AppearanceControlsProps): ReactNode {
  const {
    frame,
    glass,
    bg,
    theme,
    dim,
    setFrame,
    setGlass,
    setBg,
    setTheme,
    setDim,
  } = useTheme();

  // Glass register is ONLY meaningful in Frame A (Calm Glass) — it is the
  // frosted register of the glass material. config.jsx HIDES the Glass picker
  // entirely when frame !== "glass" (it renders only under `t.version==='A'`).
  // We follow that real dependency, but disable-in-place rather than unmount so
  // the dependency stays legible and screen-reader users get the "why" via the
  // group tooltip (the disabled-control onboarding case — CLAUDE.md §4). The
  // axis itself is unaffected: switching back to Calm Glass re-enables it with
  // its persisted value intact.
  const glassDisabledReason =
    frame === "glass"
      ? undefined
      : "Available with the Calm Glass frame — the dark/white register is the frosted glass. Switch Frame to Calm Glass to choose it.";

  // Photo brightness is Photo-only — config.jsx renders the "Photo light" row
  // only when bg !== "wash". Same disable-in-place treatment as Glass.
  const dimDisabledReason =
    bg === "photo"
      ? undefined
      : "Available with the Photo background — it sets how bright the photo reads. Switch Background to Photo to choose it.";

  // De-dupe + keep caller order; ignore unknown axis ids.
  const seen = new Set<AppearanceAxis>();
  const ordered = axes.filter(
    (a) => DEFAULT_AXES.includes(a) && !seen.has(a) && seen.add(a),
  );

  const render = (axis: AppearanceAxis): ReactNode => {
    switch (axis) {
      case "frame":
        return (
          <RadioGroup<ThemeFrame>
            key="frame"
            eyebrow="Frame"
            hint="The app's layout character and material."
            titleTooltip="Pick the app's overall look and material — Calm Glass, Bright, or Color. Changes layout and material, never which theme is active. Personal preference."
            values={FRAME_VALUES}
            meta={FRAME_META}
            selected={frame}
            onSelect={setFrame}
            idPrefix="appearance-frame"
            compact={compact}
            savedTick={0}
          />
        );
      case "glass":
        return (
          <RadioGroup<ThemeGlass>
            key="glass"
            eyebrow="Frosted glass"
            hint="Surface only — the background is unchanged."
            titleTooltip="Pick the frosted-glass register for the Calm Glass frame — dark panels with white text, or white panels with dark text. Surface only; it never washes the background. Personal preference."
            values={GLASS_VALUES}
            meta={GLASS_META}
            selected={glass}
            onSelect={setGlass}
            idPrefix="appearance-glass"
            disabledReason={glassDisabledReason}
            compact={compact}
            savedTick={0}
          />
        );
      case "background":
        return (
          <RadioGroup<ThemeBg>
            key="background"
            eyebrow="Background"
            hint="What lives behind the glass."
            titleTooltip="Pick what sits behind the glass — a classroom photo, or a soft color wash. Personal preference."
            values={BG_VALUES}
            meta={BG_META}
            selected={bg}
            onSelect={setBg}
            idPrefix="appearance-bg"
            compact={compact}
            savedTick={0}
          />
        );
      case "dim":
        return (
          <RadioGroup<ThemeDim>
            key="dim"
            eyebrow="Photo brightness"
            hint="dark · normal · light — normal matches text to the photo automatically."
            titleTooltip="Set how bright the photo reads, which decides whether text is light or dark. Normal reads the photo and matches automatically. Personal preference."
            values={DIM_VALUES}
            meta={DIM_META}
            selected={dim}
            onSelect={setDim}
            idPrefix="appearance-dim"
            disabledReason={dimDisabledReason}
            compact={compact}
            savedTick={0}
          />
        );
      case "theme":
        return (
          <RadioGroup<AppTheme>
            key="theme"
            eyebrow="Theme"
            hint="The app-wide color wash. Subject and status colors never move."
            titleTooltip="Pick the app-wide color theme — the wash, ink, and accent behind every view. Subject colors stay locked. Personal preference."
            values={APP_THEMES}
            meta={THEME_META}
            // `theme` is the stored setting (could be "system" elsewhere); the
            // Theme group offers only concrete themes (no system option here,
            // matching config.jsx), so narrow to AppTheme for selection.
            selected={theme === "system" ? "clear" : (theme as AppTheme)}
            onSelect={(v) => setTheme(v as ThemeSetting)}
            idPrefix="appearance-theme"
            renderPreview={(id) => <ThemeChip id={id} />}
            compact={compact}
            savedTick={0}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 10 : 16,
      }}
    >
      {ordered.map(render)}
    </div>
  );
}
