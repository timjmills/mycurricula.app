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
import { SettingsCard } from "@/components/appearance/settings-card";
import { Button, PageHeader, Tooltip } from "@/components/ui";

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
        {/* Page header */}
        <PageHeader
          eyebrow="Settings"
          title="Appearance"
          subtitle="Personalise how your planner looks. Changes are yours alone."
        />

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

  // Restore-defaults action pinned to the card header's top-right corner.
  const restoreAction = (
    <Tooltip
      content={
        hasOverrides
          ? "Restore the factory-default labels"
          : "Already at defaults"
      }
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={onRestoreDefaults}
        disabled={!hasOverrides}
      >
        Restore defaults
      </Button>
    </Tooltip>
  );

  return (
    <SettingsCard
      eyebrow="Vocabulary"
      title={
        <Tooltip
          content="Rename what your school calls each planning level (Subject, Unit, Lesson, Section). The captions update everywhere in the app immediately — behavior is unchanged."
          side="bottom"
        >
          <span>Hierarchy labels</span>
        </Tooltip>
      }
      hint="Rename what your school calls each planning level. Captions update everywhere; behavior is unchanged."
      action={restoreAction}
    >
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
    </SettingsCard>
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
  const tip = `Rename what your school calls a ${legend.toLowerCase()} — the caption updates everywhere in the app. Saves when you click out of the field; clear it to fall back to the default “${defaultLabel}”.`;
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
      <Tooltip content={tip} side="bottom">
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
          title={tip}
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
      </Tooltip>
    </div>
  );
}
