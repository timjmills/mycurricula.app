"use client";

// Settings → Curriculum — the team-shared curriculum identity surface.
//
// Sections (top to bottom):
//   1. Curriculum label   — the free-text suffix shown next to the
//                           top-bar wordmark. TEAM-scoped.
//
// The calendar sections that used to live here (school months, academic
// year dates, school week, holidays) moved to Settings → Calendar when
// the settings hub was regrouped by domain — see
// app/settings/calendar/page.tsx. This page stays the home for
// curriculum identity and the future standards / unit-import
// configuration (Phase 1B+).
//
// "Team-scoped" means every teacher on the grade-level team sees the
// same value. Persistence today is localStorage under `mycurricula:team:*`;
// the rows migrate to a Supabase `team_settings` row when the backend
// lands.
//
// Tooltip rule (CLAUDE.md §4): every interactive control carries an
// onboarding-voice tooltip. Inputs use `title=`; Buttons use the
// `tooltip` prop on the canonical primitive.

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { PageHeader, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import reveal from "@/components/settings/section-reveal.module.css";
import styles from "./page.module.css";

// ── Page ────────────────────────────────────────────────────────────────────

export default function CurriculumSettingsPage(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={`${styles.inner} ${reveal.reveal}`}>
        <PageHeader
          eyebrow="Settings"
          title="Curriculum"
          subtitle="The identity your whole team shares. Calendar settings moved to Settings → Calendar."
        />

        <CurriculumLabelSection />
      </div>
    </div>
  );
}

// ── Section 1 — Curriculum label ────────────────────────────────────────────
// Single text input bound to the team's curriculum label. Saves on blur
// (matches the Hierarchy-labels pattern on the Appearance page). Empty
// trimmed input clears the label so the wordmark falls back to plain
// "MyCurricula".

function CurriculumLabelSection(): ReactNode {
  const { currentUser, updateCurriculumLabel } = useAppState();
  const { showConsequence } = useConsequenceToast();

  // Local draft — independent during typing; re-syncs whenever the
  // context value updates (cross-tab change, login, etc.).
  const [draft, setDraft] = useState<string>(currentUser.curriculumLabel ?? "");
  useEffect(() => {
    setDraft(currentUser.curriculumLabel ?? "");
  }, [currentUser.curriculumLabel]);

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setDraft(e.target.value);
  };

  // Commit on blur — only when the trimmed value differs from the stored
  // one, so blurring without edits is a no-op.
  const onBlur = (): void => {
    const trimmed = draft.trim();
    const previous = currentUser.curriculumLabel ?? "";
    if (trimmed === previous) return;
    updateCurriculumLabel(trimmed);
    // W2-B8 + §4a Medium 4: the toast names the OBSERVABLE effect (this
    // device's top bar) and is explicit that team sync hasn't landed yet —
    // it must not promise teammates a change they cannot see. Undo offered
    // while the toast is visible.
    showConsequence({
      message: trimmed
        ? `Curriculum label set to "${trimmed}" — your top bar shows it now. Saved on this device for now; teammates see it once team sync arrives.`
        : "Curriculum label cleared — your top bar shows no suffix. Saved on this device for now.",
      onUndo: () => updateCurriculumLabel(previous),
    });
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.curriculum({ size: 14 })}
      anchorId="curriculum-label"
      eyebrow="Identity"
      scope="team"
      title={
        <Tooltip
          content="Your team's display name shown in the top bar — what shows after MyCurricula. Team-scoped by design; for now it saves on this device only."
          side="bottom"
          required
        >
          <span>Curriculum label</span>
        </Tooltip>
      }
      hint="The suffix shown next to the wordmark in the top bar — e.g. “Grade 5”, “K-12 Math”, “Year 7 Science”."
      action={<TeamChip />}
    >
      <div className={styles.formRow}>
        <label htmlFor="curriculum-label" className={styles.fieldLabel}>
          Label
        </label>
        <Tooltip
          content="Type what your team calls this curriculum — it appears next to the MyCurricula wordmark. Saved on this device for now; it reaches your teammates once team sync arrives. Saves when you click out of the field."
          side="bottom"
          required
        >
          <input
            id="curriculum-label"
            name="curriculumLabel"
            type="text"
            value={draft}
            onChange={onChange}
            onBlur={onBlur}
            placeholder="e.g. Grade 5, K-12 Math, Year 7 Science"
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
            title="Type what your team calls this curriculum — it appears next to the MyCurricula wordmark. Saved on this device for now; it reaches your teammates once team sync arrives. Saves when you click out of the field."
            className={styles.textInput}
          />
        </Tooltip>
        <p className={styles.fieldHint}>
          Saves when you click out of the field. Clear it to leave just
          “MyCurricula” in the top bar.
        </p>
      </div>
    </SettingsCard>
  );
}

// ── Team-scope chip — the honest, unsynced variant (§4a Medium 4) ──────────
// The curriculum label is team-scoped BY DESIGN but persists to this
// browser's localStorage (lib/app-state.tsx, `mycurricula:team:
// curriculum-label`) until the team-settings backend lands — so the chip
// states what is true TODAY instead of claiming teammates see the value.
// Amber dot + distinct label so the unsynced state reads at a glance, not
// only on hover. Mirrors the calendar page's TeamChip; when this page gains
// a genuinely DB-backed setting, port that page's `synced` prop rather than
// re-widening this copy.

function TeamChip(): ReactNode {
  const tip =
    "A team setting by design — but right now it saves on this device only. Teammates won't see it until team sync arrives with the backend update.";
  return (
    <Tooltip content={tip} side="bottom" required>
      <span
        className={`${styles.teamChip} ${styles.teamChipLocal}`}
        tabIndex={0}
        title={tip}
        aria-label="Team setting, saved on this device only"
      >
        <span
          aria-hidden="true"
          className={`${styles.teamChipDot} ${styles.teamChipDotLocal}`}
        />
        Team setting · this device only
      </span>
    </Tooltip>
  );
}
