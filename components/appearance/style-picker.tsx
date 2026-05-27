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
            <Tooltip key={opt.id} content={opt.tooltip} side="right">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setStyle(opt.id)}
                title={opt.tooltip}
                className="cp-focusable"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  minHeight: 44,
                  borderRadius: 10,
                  background: selected ? "var(--ink-100)" : "var(--paper)",
                  border: selected
                    ? "1.5px solid var(--ink-900)"
                    : "1px solid var(--ink-150)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <RadioDot selected={selected} />
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
