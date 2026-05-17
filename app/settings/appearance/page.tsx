"use client";

// Settings → Appearance — recreates artboard A2 (ABSettingsAppearance).
//
// Composition, top to bottom:
//   • Style picker + Palette toggle  — side-by-side, wire to useTheme().
//   • Live preview                   — sample cards in the chosen
//                                      style × palette × mapping.
//   • Subject colors                 — per-subject swatch picker with the
//                                      Core (team) / Personal scope split.
//   • Palette reference              — the full 20-swatch table (A3).
//
// The Core subject → swatch mapping is held here so the live preview and
// the subject picker share one source of truth. The style/palette axes
// come from the app-wide ThemeProvider (lib/theme.tsx), so changing them
// re-themes the whole app, not just this page.

import { useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_SUBJECT_MAPPING } from "@/lib/palette";
import type { SubjectMapping } from "@/lib/palette";
import { StylePicker } from "@/components/appearance/style-picker";
import { PaletteToggle } from "@/components/appearance/palette-toggle";
import { LivePreview } from "@/components/appearance/live-preview";
import { SubjectColors } from "@/components/appearance/subject-colors";
import { PaletteReference } from "@/components/appearance/palette-reference";

export default function AppearancePage(): ReactNode {
  // Core Curriculum subject → swatch mapping. Local state for this build:
  // reassignments are not persisted (no backend yet).
  const [mapping, setMapping] = useState<SubjectMapping>(
    DEFAULT_SUBJECT_MAPPING,
  );

  const setSubjectSwatch = (subjectId: string, swatchId: string): void => {
    setMapping((prev) => ({ ...prev, [subjectId]: swatchId }));
  };

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Breadcrumb header */}
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-400)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Settings
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-300)" }}>/</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink-700)",
            }}
            aria-current="page"
          >
            Appearance
          </span>
        </nav>

        {/* Style + palette pickers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          <StylePicker />
          <PaletteToggle />
        </div>

        {/* Live preview, subject picker, palette reference */}
        <LivePreview mapping={mapping} />
        <SubjectColors mapping={mapping} onChange={setSubjectSwatch} />
        <PaletteReference />
      </div>
    </div>
  );
}
