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
    // W2-B8: name the team-wide effect. Curriculum label is team-scoped
    // (every teacher sees the same suffix), so the toast leads with the
    // blast radius and offers Undo while the toast is visible.
    showConsequence({
      message: trimmed
        ? `Curriculum label set to "${trimmed}" — every teacher on your team now sees it.`
        : "Curriculum label cleared — every teacher on your team now sees no suffix.",
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
          content="Your team's display name shown in the top bar — what shows after MyCurricula. Shared with everyone on your grade-level team."
          side="bottom"
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
          content="Type what your team calls this curriculum — it appears next to the MyCurricula wordmark for every teacher on the team. Saves when you click out of the field."
          side="bottom"
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
            title="Type what your team calls this curriculum — it appears next to the MyCurricula wordmark for every teacher on the team. Saves when you click out of the field."
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

// ── "Shared with your team" chip ───────────────────────────────────────────
// A subtle visual cue pinned to each Card header. The tooltip explains
// the scope to a first-time teacher; the visual is intentionally
// understated so it doesn't compete with the section header itself.

function TeamChip(): ReactNode {
  return (
    <Tooltip
      content="This setting affects every teacher on your grade-level team."
      side="bottom"
    >
      <span
        className={styles.teamChip}
        tabIndex={0}
        title="This setting affects every teacher on your grade-level team."
        aria-label="Shared with your team"
      >
        <span aria-hidden="true" className={styles.teamChipDot} />
        Shared with your team
      </span>
    </Tooltip>
  );
}
