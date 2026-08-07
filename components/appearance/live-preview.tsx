"use client";

// live-preview.tsx — the Appearance panel's live sample (artboard A2).
//
// Renders three sample lesson cards in the currently-selected
// style × palette. The real `LessonCard` (Task #3) reads both axes from
// `useTheme()` itself, so the cards re-theme the instant a picker
// changes — no style/palette props are passed. A nested PaletteProvider
// scopes the chosen subject mapping so swatch reassignments preview here
// before they are saved.

import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { PaletteProvider } from "@/lib/palette";
import type { SubjectMapping } from "@/lib/palette";
import { LESSON_BY_ID } from "@/lib/mock/lessons";
import { LessonCard } from "@/components/lesson-card";
import { Tooltip } from "@/components/ui";
import { SettingsCard } from "./settings-card";

// A Math / Reading / Writing trio — same lessons artboard A2 previews.
// m-12-1 is modified (dashed stripe + pill), r-12-1 is modified+moved,
// w-12-1 is moved across weeks — so the preview shows the personal-mode
// treatments, not just plain cards.
const PREVIEW_LESSON_IDS = ["m-12-1", "r-12-1", "w-12-1"] as const;

// v2 theme set (lockstep with lib/theme.tsx APP_THEMES). The full picker
// rewrite (per-theme copy for honey/off) is a later Wave-2 stage; this label
// map only needs to cover the resolved v2 themes so the caption compiles.
const THEME_LABEL: Record<string, string> = {
  clear: "Clear",
  night: "Night",
  honey: "Honey",
  blossom: "Blossom",
  mint: "Mint",
  sky: "Sky",
  off: "Off (Photo)",
};

interface LivePreviewProps {
  /** Active subject → swatch mapping so reassignments preview here. */
  mapping: SubjectMapping;
}

export function LivePreview({ mapping }: LivePreviewProps): ReactNode {
  // style/palette are no longer read: data-style never reached the v2 DOM and
  // the data-palette axis is retired (2026-08-07), so the meta line describes
  // the one axis that still moves (theme) and the preview's real subject —
  // the swatch mapping being tried below.
  const { palette, resolvedTheme } = useTheme();
  const lessons = PREVIEW_LESSON_IDS.map((id) => LESSON_BY_ID[id]);

  return (
    <SettingsCard
      eyebrow="Live preview"
      title={
        <Tooltip
          content="Sample lesson cards rendered with your current theme and subject-colour choices. Re-themes the instant you change a swatch below so you can preview before committing."
          side="bottom"
        >
          <span>How your cards look right now</span>
        </Tooltip>
      }
      action={
        <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
          Theme:{" "}
          <strong style={{ color: "var(--ink-900)" }}>
            {THEME_LABEL[resolvedTheme]}
          </strong>
        </div>
      }
    >
      {/* A nested PaletteProvider scopes the chosen mapping to the preview
          even before it has been saved to the app-wide Core mapping.
          ⚠ Known scoping caveat: the bridge's rules are UNSCOPED class
          selectors, so while a candidate mapping is being tried here it wins
          app-wide (later <style> at equal specificity), not just on these
          three cards. Pre-existing; harmless while preview == committed. */}
      <PaletteProvider type={palette} mapping={mapping}>
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} dense />
          ))}
        </div>
      </PaletteProvider>
    </SettingsCard>
  );
}
