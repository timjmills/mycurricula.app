"use client";

// style-picker.tsx — the Card-style chooser (artboard A2).
//
// Three radio-style options — Quiet / Mid-Calm / Mid-Vivid — each with the
// spec description from A0/A2. Selecting one calls `setStyle` from
// `useTheme()`, so the whole app re-themes immediately.

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { ThemeStyle } from "@/lib/theme";
import { Tooltip } from "@/components/ui";
import { SettingsCard, RadioDot } from "./settings-card";
import { useRovingRadio } from "./use-roving-radio";
import cardStyles from "./settings-card.module.css";

interface StyleOption {
  id: ThemeStyle;
  label: string;
  desc: string;
}

// Descriptions lifted verbatim from artboard A2's style picker.
interface StyleOptionFull extends StyleOption {
  tooltip: string;
}

const STYLE_OPTIONS: readonly StyleOptionFull[] = [
  {
    id: "quiet",
    label: "Quiet",
    desc: "Minimal. White cards, thin subject stripe. Best for long workdays.",
    tooltip:
      "Switch every card in your planner to the Quiet style — white background with a thin colored stripe. Easiest on the eyes during a full school day.",
  },
  {
    id: "calm",
    label: "Mid-Calm",
    desc: "White cards with a friendly subject monogram tile. Warmer.",
    tooltip:
      "Switch every card to the Mid-Calm style — white background with a colored subject monogram tile. A friendlier middle-ground between Quiet and Mid-Vivid.",
  },
  {
    id: "vivid",
    label: "Mid-Vivid",
    desc: "Subject tint fills the card. Colour reads at a glance.",
    tooltip:
      "Switch every card to the Mid-Vivid style — the subject's color tints the whole card, so you can identify lessons at a glance. The app default.",
  },
] as const;

export function StylePicker(): ReactNode {
  const { style, setStyle } = useTheme();
  const roving = useRovingRadio({
    values: STYLE_OPTIONS.map((o) => o.id),
    selected: style,
    onSelect: (v) => setStyle(v as ThemeStyle),
  });

  return (
    <SettingsCard
      eyebrow="Card style"
      title={
        <Tooltip
          content="Pick the visual treatment for every lesson card in your planner. Personal preference — saved per teacher, not shared with the team."
          side="bottom"
        >
          <span>How your planner looks</span>
        </Tooltip>
      }
      hint="Personal preference — your teammates can pick a different one."
    >
      <div
        role="radiogroup"
        aria-label="Card style"
        {...roving.getGroupProps()}
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {STYLE_OPTIONS.map((opt) => {
          const selected = style === opt.id;
          return (
            <Tooltip
              key={opt.id}
              content={opt.tooltip}
              side="right"
              tooltipId={`appearance-style-${opt.id}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                {...roving.getOptionProps(opt.id)}
                onClick={() => setStyle(opt.id)}
                title={opt.tooltip}
                className={`${cardStyles.pickOption} cp-focusable`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  minHeight: 44,
                }}
              >
                <RadioDot selected={selected} />
                <StyleCardPreview id={opt.id} />
                <span style={{ flex: 1 }}>
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
    </SettingsCard>
  );
}

// ── Style card preview ──────────────────────────────────────────────────────
// A miniature lesson card rendered from LIVE tokens — wrapped in the locked
// `cp-subj math` class so --c/--cl/--cd resolve through the palette bridge —
// which means each preview repaints correctly under every theme (Night's dark
// tints included) and both palette intensities, with zero hex in here.
//   quiet → surface card + 3px subject stripe
//   calm  → + the subject monogram tile
//   vivid → + the subject tint filling the card
// The two ink bars stand in for title/preview text.

function StyleCardPreview({ id }: { id: ThemeStyle }): ReactNode {
  const showTile = id !== "quiet";
  const vivid = id === "vivid";
  return (
    <span
      aria-hidden
      className="cp-subj math"
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: 58,
        height: 40,
        padding: "0 7px 0 0",
        borderRadius: 8,
        background: vivid ? "var(--cl)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--c)",
        boxShadow: "var(--sh-xs)",
        overflow: "hidden",
      }}
    >
      {showTile && (
        <span
          style={{
            flex: "0 0 auto",
            width: 14,
            height: 14,
            marginLeft: 6,
            borderRadius: 4,
            // A step stronger than the plain tint so the tile keeps its
            // presence when the vivid card is ALSO --cl-filled.
            background: "color-mix(in srgb, var(--c) 22%, var(--cl))",
            border: "1px solid color-mix(in srgb, var(--c) 55%, transparent)",
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          marginLeft: showTile ? 0 : 7,
        }}
      >
        <span
          style={{
            display: "block",
            height: 3,
            width: "82%",
            borderRadius: 2,
            background: "var(--ink-600)",
          }}
        />
        <span
          style={{
            display: "block",
            height: 3,
            width: "55%",
            borderRadius: 2,
            background: "var(--ink-300)",
          }}
        />
      </span>
    </span>
  );
}
