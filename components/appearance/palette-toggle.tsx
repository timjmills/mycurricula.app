"use client";

// palette-toggle.tsx — the Normal / Highlight palette chooser (artboard A2).
//
// The hue per subject is locked team-wide; this toggle only flips the
// saturation a teacher views. Selecting calls `setPalette` from
// `useTheme()`. The current value reflects live `useTheme()` state — the
// dev default is Highlight, the eventual ship default is Normal.

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { ThemePalette } from "@/lib/theme";
import { SUBJECT_SWATCHES } from "@/lib/palette";
import { Tooltip } from "@/components/ui";
import { SettingsCard, RadioDot } from "./settings-card";
import { useRovingRadio } from "./use-roving-radio";
import cardStyles from "./settings-card.module.css";

interface PaletteOption {
  id: ThemePalette;
  label: string;
  desc: string;
  /** Six sample swatch hexes from the 15-color brand palette. */
  swatches: string[];
}

// First six brand swatches, one row per variant — as in artboard A2.
interface PaletteOptionFull extends PaletteOption {
  tooltip: string;
}

const PALETTE_OPTIONS: readonly PaletteOptionFull[] = [
  {
    id: "normal",
    label: "Normal",
    desc: "Confident, slightly darker. Like a school workbook.",
    swatches: SUBJECT_SWATCHES.slice(0, 6).map((s) => s.normal),
    tooltip:
      "Switch your palette to Normal — slightly muted, workbook-style colors. The hue stays exactly the same across your team; only YOUR saturation changes.",
  },
  {
    id: "highlight",
    label: "Highlight",
    desc: "Highlighter-marker bright. Electric, distinct.",
    swatches: SUBJECT_SWATCHES.slice(0, 6).map((s) => s.highlight),
    tooltip:
      "Switch your palette to Highlight — brighter, marker-style colors that pop on the grid. The hue stays the same across your team; only YOUR saturation changes.",
  },
] as const;

export function PaletteToggle(): ReactNode {
  const { palette, setPalette } = useTheme();
  const roving = useRovingRadio({
    values: PALETTE_OPTIONS.map((o) => o.id),
    selected: palette,
    onSelect: (v) => setPalette(v as ThemePalette),
  });

  return (
    <SettingsCard
      eyebrow="Palette"
      title={
        <Tooltip
          content="Pick how saturated your subject colors look. The hue is locked team-wide so every teacher identifies the same subject by the same hue — only the saturation is yours to set."
          side="bottom"
        >
          <span>Color intensity</span>
        </Tooltip>
      }
      hint="Personal preference — the hues are set team-wide; only saturation changes."
    >
      <div
        role="radiogroup"
        aria-label="Color palette"
        {...roving.getGroupProps()}
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {PALETTE_OPTIONS.map((opt) => {
          const selected = palette === opt.id;
          return (
            <Tooltip
              key={opt.id}
              content={opt.tooltip}
              side="top"
              tooltipId={`appearance-palette-${opt.id}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                {...roving.getOptionProps(opt.id)}
                onClick={() => setPalette(opt.id)}
                title={opt.tooltip}
                className={`${cardStyles.pickOption} cp-focusable`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "12px 14px",
                  minHeight: 44,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <RadioDot selected={selected} />
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                    }}
                  >
                    {opt.label}
                  </span>
                </span>
                <span aria-hidden style={{ display: "flex", gap: 3 }}>
                  {opt.swatches.map((hex, i) => (
                    <span
                      key={i}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        background: hex,
                      }}
                    />
                  ))}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-500)",
                    lineHeight: 1.45,
                    textWrap: "pretty",
                  }}
                >
                  {opt.desc}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </SettingsCard>
  );
}
