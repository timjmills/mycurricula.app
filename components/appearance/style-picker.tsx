"use client";

// style-picker.tsx — the Card-style chooser (artboard A2).
//
// Three radio-style options — Quiet / Mid-Calm / Mid-Vivid — each with the
// spec description from A0/A2. Selecting one calls `setStyle` from
// `useTheme()`, so the whole app re-themes immediately.

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import type { ThemeStyle } from "@/lib/theme";
import { SettingsCard, RadioDot } from "./settings-card";

interface StyleOption {
  id: ThemeStyle;
  label: string;
  desc: string;
}

// Descriptions lifted verbatim from artboard A2's style picker.
const STYLE_OPTIONS: readonly StyleOption[] = [
  {
    id: "quiet",
    label: "Quiet",
    desc: "Minimal. White cards, thin subject stripe. Best for long workdays.",
  },
  {
    id: "calm",
    label: "Mid-Calm",
    desc: "White cards with a friendly subject monogram tile. Warmer.",
  },
  {
    id: "vivid",
    label: "Mid-Vivid",
    desc: "Subject tint fills the card. Colour reads at a glance.",
  },
] as const;

export function StylePicker(): ReactNode {
  const { style, setStyle } = useTheme();

  return (
    <SettingsCard
      eyebrow="Card style"
      title="How your planner looks"
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
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStyle(opt.id)}
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
          );
        })}
      </div>
    </SettingsCard>
  );
}
