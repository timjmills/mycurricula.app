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
//   • Hierarchy labels               — rename the planner concepts
//                                      (Subject / Unit / Week / Lesson / Section)
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
import {
  countDismissed,
  useTooltipDismissal,
} from "@/lib/tooltip-dismissal";
import { ThemePicker } from "@/components/appearance/theme-picker";
import { StylePicker } from "@/components/appearance/style-picker";
import { PaletteToggle } from "@/components/appearance/palette-toggle";
import { LivePreview } from "@/components/appearance/live-preview";
import { SubjectColors } from "@/components/appearance/subject-colors";
import { PaletteReference } from "@/components/appearance/palette-reference";
import { SettingsCard } from "@/components/appearance/settings-card";
import { Button, PageHeader, Tooltip } from "@/components/ui";

export default function AppearancePage(): ReactNode {
  // Team Curriculum subject → swatch mapping. Local state for this build:
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

        {/* App color theme — the canvas/ink/accent surface behind every
            view. Full-width and first so it reads as the top-level look
            choice; the style + palette axes refine it below. */}
        <ThemePicker />

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
            Rename the planner concepts. The captions follow the
            change immediately, app-wide; the underlying behavior does
            not. Persists to localStorage via the LabelsProvider. */}
        <HierarchyLabelsCard />

        {/* ── Onboarding tooltips (W2-B3) ───────────────────────────────
            Global on/off + reset for the dismissible onboarding-tooltip
            system. High-consequence tooltips (Personal/Team toggle,
            destructive actions, team-wide settings) are marked
            `required: true` at their callsites and ignore both controls. */}
        <OnboardingTooltipsCard />
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
    labels.week !== DEFAULT_LABELS.week ||
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
          content="Rename what your school calls each planning level (Subject, Unit, Week, Lesson, Section). The captions update everywhere in the app immediately — behavior is unchanged."
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
          name="week"
          legend="Week"
          defaultLabel={DEFAULT_LABELS.week}
          value={drafts.week}
          onChange={onDraft("week")}
          onBlur={onCommit("week")}
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

// ── Onboarding tooltips card (W2-B3) ────────────────────────────────────
// Two controls:
//   • Show onboarding tooltips — toggles the global off flag. Default ON.
//     When OFF, every non-required tooltip is suppressed app-wide.
//   • Reset dismissed tooltips — clears the per-id dismissal set. Disabled
//     when nothing is dismissed.
//
// High-consequence tooltips (Personal/Team toggle, destructive actions,
// team-wide settings) carry `required: true` at their callsites and ignore
// both of these controls — the safety messaging always shows.

function OnboardingTooltipsCard(): ReactNode {
  const { globalOff, setGlobalOff, resetAll } = useTooltipDismissal(undefined);

  // Count of currently-dismissed ids. SSR-safe — initial render is 0; the
  // post-mount effect reads localStorage. Bumped on each toggle so the
  // Reset button's disabled state reflects reality without taking the
  // dismissal set as a re-render dep.
  const [dismissedCount, setDismissedCount] = useState<number>(0);
  useEffect(() => {
    setDismissedCount(countDismissed());
  }, []);

  // Show-tooltips switch state is the inverse of the stored off flag.
  // Default is ON (globalOff === false).
  const tooltipsOn = !globalOff;

  const onToggleGlobal = (): void => {
    setGlobalOff(tooltipsOn); // currently on → off
  };

  const onReset = (): void => {
    resetAll();
    setDismissedCount(0);
  };

  // Tooltips on the controls themselves use `required` so the user can
  // always read the explanation — meta-tooltips that teach the dismissal
  // system must not themselves be dismissable.
  const onLabel = tooltipsOn
    ? "Hide one-time onboarding tooltips for non-critical controls (the Personal/Team toggle and destructive-action warnings stay on)"
    : "Show one-time onboarding tooltips again across the app (the Personal/Team toggle and destructive-action warnings always show regardless)";

  const resetLabel =
    dismissedCount > 0
      ? `Show again every onboarding tooltip you've individually dismissed (${dismissedCount} currently hidden)`
      : "Nothing to reset — you haven't dismissed any individual tooltips yet";

  return (
    <SettingsCard
      eyebrow="Onboarding"
      title={
        <Tooltip
          content="Onboarding tooltips teach a first-time teacher what each control does. Once you know your way around, dismiss them one-by-one or all at once. High-consequence tooltips (the Personal/Team toggle, destructive actions, team-wide settings) always show regardless of these controls."
          side="bottom"
          required
        >
          <span>Onboarding tooltips</span>
        </Tooltip>
      }
      hint="One-time tips that teach what each control does. You can turn them off once you're comfortable; the Personal/Team toggle and destructive-action warnings always show."
    >
      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Show onboarding tooltips — a labelled switch built from a plain
            button with role="switch". No Switch primitive exists yet
            (BUILD_STANDARD §7 — when one lands the markup here should
            migrate). Touch target ≥44px. */}
        <Tooltip content={onLabel} side="bottom" required>
          <button
            type="button"
            role="switch"
            aria-checked={tooltipsOn}
            onClick={onToggleGlobal}
            title={onLabel}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
              minHeight: 44,
              padding: "10px 14px",
              background: "var(--paper)",
              border: "1px solid var(--ink-200)",
              borderRadius: "var(--r-8)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-13)",
                  fontWeight: 600,
                  color: "var(--ink-900)",
                }}
              >
                Show onboarding tooltips
              </span>
              <span
                style={{
                  fontSize: "var(--t-12)",
                  color: "var(--ink-500)",
                  lineHeight: 1.45,
                }}
              >
                {tooltipsOn
                  ? "On — every non-critical control shows its tip once on hover."
                  : "Off — only critical safety tooltips (Personal/Team, destructive actions) show."}
              </span>
            </span>
            {/* Visual switch track. */}
            <span
              aria-hidden
              style={{
                position: "relative",
                flex: "0 0 auto",
                width: 36,
                height: 20,
                borderRadius: 999,
                background: tooltipsOn ? "var(--ink-900)" : "var(--ink-300)",
                transition: "background 140ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: tooltipsOn ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "var(--paper)",
                  transition: "left 140ms ease",
                }}
              />
            </span>
          </button>
        </Tooltip>

        {/* Reset dismissed tooltips — disabled when nothing is dismissed.
            Uses the canonical Button primitive's tooltip+disabled path. */}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReset}
            disabled={dismissedCount === 0}
            tooltip={resetLabel}
            tooltipSide="bottom"
          >
            Reset dismissed tooltips
            {dismissedCount > 0 ? ` (${dismissedCount})` : ""}
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}
