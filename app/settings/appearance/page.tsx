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
//   • Hierarchy labels               — rename the four planner concepts
//                                      (Subject / Unit / Lesson / Section)
//                                      app-wide. Reads + writes through
//                                      lib/labels (LabelsProvider).
//
// The Core subject → swatch mapping is held here so the live preview and
// the subject picker share one source of truth. The style/palette axes
// come from the app-wide ThemeProvider (lib/theme.tsx), so changing them
// re-themes the whole app, not just this page.

import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { DEFAULT_SUBJECT_MAPPING } from "@/lib/palette";
import type { SubjectMapping } from "@/lib/palette";
import {
  DEFAULT_LABELS,
  useLabels,
  useSetLabels,
  type HierarchyLabels,
} from "@/lib/labels";
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

        {/* ── Hierarchy labels ──────────────────────────────────────────
            Rename the four planner concepts. The captions follow the
            change immediately, app-wide; the underlying behavior does
            not. Persists to localStorage via the LabelsProvider. */}
        <HierarchyLabelsCard />
      </div>
    </div>
  );
}

// ── Hierarchy labels card ──────────────────────────────────────────────
// A standalone card so it can be added to (and later moved out of) the
// page without touching the other settings sections. Reads/writes go
// through `useLabels` / `useSetLabels` so the contract with consumers
// (ResourceComposer routing pickers, future breadcrumb chrome) is the
// single shared one.

function HierarchyLabelsCard(): ReactNode {
  // Bind a controlled-input draft per field. The CONTEXT is the source of
  // truth and we sync on blur (or restore-defaults) — that pattern lets
  // teachers type freely (even passing through a blank state) without
  // pushing a half-typed string into every consumer mid-keystroke, while
  // still feeling responsive locally.
  const labels = useLabels();
  const setLabels = useSetLabels();

  // Local drafts mirror the context labels but are independent during
  // typing. Re-sync whenever the context value updates (e.g. another
  // surface — or restore-defaults — wrote first).
  const [drafts, setDrafts] = useState<HierarchyLabels>(labels);
  useEffect(() => {
    setDrafts(labels);
  }, [labels]);

  const onDraft =
    (field: keyof HierarchyLabels) =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      const next = e.target.value;
      setDrafts((prev) => ({ ...prev, [field]: next }));
    };

  // Commit a single field on blur. The provider coerces empty/whitespace
  // strings back to the factory default for that field, so a teacher can
  // never blank a caption out completely — the visible caption simply
  // snaps back to the default on the next render.
  const onCommit = (field: keyof HierarchyLabels) => (): void => {
    if (drafts[field] !== labels[field]) {
      setLabels({ [field]: drafts[field] });
    }
  };

  // Restore-defaults — writes all four DEFAULTs through the provider in a
  // single call. The local draft state re-syncs via the useEffect above.
  const onRestoreDefaults = (): void => {
    setLabels(DEFAULT_LABELS);
  };

  // Are any captions currently different from the factory defaults?
  // Drives the disabled state of the Restore button so a no-op press is
  // never possible.
  const hasOverrides =
    labels.subject !== DEFAULT_LABELS.subject ||
    labels.unit !== DEFAULT_LABELS.unit ||
    labels.lesson !== DEFAULT_LABELS.lesson ||
    labels.section !== DEFAULT_LABELS.section;

  return (
    <section
      aria-label="Hierarchy labels"
      style={{
        background: "var(--paper)",
        border: "1px solid var(--ink-150)",
        borderRadius: "var(--r-12)",
        padding: "18px 18px 16px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header — matches the SettingsCard idiom used by sibling sections:
          a small uppercase eyebrow, a title, a one-line hint, and an
          optional top-right action. The action is the Restore-defaults
          affordance. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--t-11)",
              color: "var(--ink-400)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Vocabulary
          </div>
          <h2
            style={{
              margin: "4px 0 0",
              fontSize: "var(--t-16)",
              fontWeight: 700,
              color: "var(--ink-900)",
              letterSpacing: -0.2,
            }}
          >
            Hierarchy labels
          </h2>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: "var(--t-12)",
              color: "var(--ink-500)",
              lineHeight: 1.55,
            }}
          >
            Rename what your school calls each planning level. Captions update
            everywhere; behavior is unchanged.
          </p>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button
            type="button"
            onClick={onRestoreDefaults}
            disabled={!hasOverrides}
            style={{
              minHeight: 32,
              padding: "0 12px",
              fontSize: "var(--t-12)",
              fontWeight: 600,
              color: hasOverrides ? "var(--ink-700)" : "var(--ink-300)",
              background: "var(--paper)",
              border: "1px solid var(--ink-200)",
              borderRadius: "var(--r-6)",
              cursor: hasOverrides ? "pointer" : "not-allowed",
            }}
            title={
              hasOverrides
                ? "Restore the factory-default labels"
                : "Already at defaults"
            }
          >
            Restore defaults
          </button>
        </div>
      </div>

      {/* Four labeled text inputs — comfortable two-column grid that
          collapses to one column on narrower viewports. Save on blur. */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <LabelInput
          name="subject"
          legend="Subject"
          defaultLabel={DEFAULT_LABELS.subject}
          value={drafts.subject}
          onChange={onDraft("subject")}
          onBlur={onCommit("subject")}
        />
        <LabelInput
          name="unit"
          legend="Unit"
          defaultLabel={DEFAULT_LABELS.unit}
          value={drafts.unit}
          onChange={onDraft("unit")}
          onBlur={onCommit("unit")}
        />
        <LabelInput
          name="lesson"
          legend="Lesson"
          defaultLabel={DEFAULT_LABELS.lesson}
          value={drafts.lesson}
          onChange={onDraft("lesson")}
          onBlur={onCommit("lesson")}
        />
        <LabelInput
          name="section"
          legend="Section"
          defaultLabel={DEFAULT_LABELS.section}
          value={drafts.section}
          onChange={onDraft("section")}
          onBlur={onCommit("section")}
        />
      </div>
    </section>
  );
}

// ── Single labeled input ────────────────────────────────────────────────
// A small form field with a left-aligned caption-style label above the
// text input. Inputs are sized comfortably (≥44px touch target) so the
// card reads as a calm form rather than a dense table.

interface LabelInputProps {
  /** Stable form name + id seed. */
  name: keyof HierarchyLabels;
  /** Visible label above the input — the FACTORY name for this concept. */
  legend: string;
  /** Default value, shown as a placeholder hint when the field is empty. */
  defaultLabel: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

function LabelInput({
  name,
  legend,
  defaultLabel,
  value,
  onChange,
  onBlur,
}: LabelInputProps): ReactNode {
  const id = `hierarchy-label-${name}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={id}
        style={{
          fontSize: "var(--t-11)",
          fontWeight: 700,
          color: "var(--ink-500)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {legend}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        // Always show the factory caption as a placeholder so a teacher
        // who blanks the field sees what it will fall back to.
        placeholder={defaultLabel}
        spellCheck={false}
        autoComplete="off"
        style={{
          minHeight: 44,
          padding: "0 12px",
          fontSize: "var(--t-13)",
          color: "var(--ink-900)",
          background: "var(--paper)",
          border: "1px solid var(--ink-200)",
          borderRadius: "var(--r-8)",
          outline: "none",
        }}
      />
    </div>
  );
}
