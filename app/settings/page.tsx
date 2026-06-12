"use client";

// /settings — the overview dashboard.
//
// A grouped grid of section tiles, one per settings page, each carrying a
// LIVE one-line summary of that section's current values ("Sun–Thu · 3
// holidays", "Paper · Vivid"). Groups mirror the sidebar registry in
// layout.tsx (Planning / Content / People / Preferences) so the overview
// and the sidebar teach the same mental model.
//
// This page replaced the old last-visited redirect when the settings hub
// was regrouped: an overview orients a teacher before they dive in,
// which a blind redirect never did. The layout still records
// `mycurricula:user:settings-last-page` for back-compat.
//
// Summary plumbing:
//   • Sections whose hooks are mountable here read them directly
//     (theme, school week, holidays, notebooks, account, catch-up via a
//     local CatchupProvider — the settings tree doesn't mount one).
//   • Sections owned by sibling pages (schedule, subjects, templates)
//     are summarized from their localStorage keys via useStoredJson —
//     the keys are the stable contract, so this page never depends on
//     those pages' internals.

import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { useTheme } from "@/lib/theme";
import { CatchupProvider, useCatchup } from "@/lib/catchup-state";
import { useNotebookState } from "@/lib/notebook-state";
import {
  detectSchoolWeekPreset,
  useSchoolWeek,
  WEEKDAY_LABEL,
} from "@/lib/use-school-week";
import { useHolidays } from "@/lib/use-holidays";
import { useDisplayName, useDefaultView } from "@/lib/use-account-settings";
import { LESSON_TEMPLATES } from "@/lib/lesson-templates";
import { SUBJECTS } from "@/lib/mock";
import { OverviewCard } from "@/components/settings";
import styles from "./page.module.css";

// ── Generic post-mount localStorage JSON reader ────────────────────────────
// SSR-safe: first render returns `fallback`; the stored value arrives in a
// post-mount effect; a `storage` listener keeps it fresh cross-tab. Used
// for sections whose richer hooks live with their own pages.

function useStoredJson<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const read = (): void => {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw == null) {
          setValue(fallback);
          return;
        }
        const parsed: unknown = JSON.parse(raw);
        // Shape guard — every fallback here is an object or array, and a
        // stored `null` / mismatched type (stale or hand-edited storage)
        // would crash the summary math downstream. Keep the fallback
        // unless the parsed value matches the fallback's container kind.
        const matchesShape = Array.isArray(fallback)
          ? Array.isArray(parsed)
          : typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed);
        setValue(matchesShape ? (parsed as T) : fallback);
      } catch {
        // Malformed / storage disabled — keep the fallback.
      }
    };
    read();
    const onStorage = (e: StorageEvent): void => {
      if (e.key === key) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return value;
}

// ── Display helpers ─────────────────────────────────────────────────────────

const TITLE_CASE: Record<string, string> = {
  paper: "Paper",
  cloud: "Cloud",
  night: "Night",
  mint: "Mint",
  sky: "Sky",
  blossom: "Blossom",
  system: "Follow system",
  quiet: "Quiet",
  calm: "Calm",
  vivid: "Vivid",
  normal: "Normal",
  highlight: "Highlight",
};

const VIEW_LABEL: Record<string, string> = {
  "/weekly": "Weekly",
  "/daily": "Daily",
  "/year": "Yearly",
  "/subject": "Curriculum",
};

// ── Page ────────────────────────────────────────────────────────────────────

export default function SettingsOverviewPage(): ReactNode {
  return (
    // Local CatchupProvider — same reason the catch-up settings page
    // mounts its own: the settings tree has no planner provider stack.
    <CatchupProvider>
      <OverviewBody />
    </CatchupProvider>
  );
}

function OverviewBody(): ReactNode {
  // ── Live values ───────────────────────────────────────────────────────
  const { currentUser } = useAppState();
  const { theme, style, palette } = useTheme();
  const { enabled: catchupEnabled } = useCatchup();
  const { workspaceName, activeNotebooks } = useNotebookState();
  const { days } = useSchoolWeek();
  const { holidays } = useHolidays();
  const { displayName } = useDisplayName();
  const { defaultView } = useDefaultView();

  // Sibling-page state, summarized straight from the stable storage keys.
  const rotation = useStoredJson<{ rotation?: string; cycleLength?: number }>(
    "mycurricula:team:schedule-rotation",
    {},
  );
  const customBlocks = useStoredJson<Record<string, unknown[]>>(
    "mycurricula:user:schedule-blocks",
    {},
  );
  const subjectOverrides = useStoredJson<
    Record<string, { archived?: boolean }>
  >("mycurricula:team:subject-overrides", {});
  const hiddenSubjects = useStoredJson<string[]>(
    "mycurricula:user:hidden-subjects",
    [],
  );
  const personalSubjects = useStoredJson<unknown[]>(
    "mycurricula:user:personal-subjects",
    [],
  );
  const customTemplates = useStoredJson<unknown[]>(
    "mycurricula:custom-templates",
    [],
  );

  // ── Summary strings ───────────────────────────────────────────────────
  const weekPreset = detectSchoolWeekPreset(days);
  const weekLabel =
    weekPreset === "custom"
      ? days.map((d) => WEEKDAY_LABEL[d]).join(" ")
      : `${WEEKDAY_LABEL[days[0]]}–${WEEKDAY_LABEL[days[days.length - 1]]}`;

  const rotationLabel =
    rotation.rotation === "ab"
      ? "A/B rotation"
      : rotation.rotation === "cycle"
        ? `${rotation.cycleLength ?? 4}-day cycle`
        : "Same every week";
  const customDayCount = Object.values(customBlocks).filter(
    (blocks) => Array.isArray(blocks) && blocks.length > 0,
  ).length;

  const archivedCount = Object.values(subjectOverrides).filter(
    (o) => o && typeof o === "object" && o.archived === true,
  ).length;
  const teamSubjectCount = SUBJECTS.length - archivedCount;

  const summaries = {
    curriculum: currentUser.curriculumLabel
      ? `Label: “${currentUser.curriculumLabel}”`
      : "No curriculum label set",
    calendar: `${weekLabel} week · ${holidays.length} ${
      holidays.length === 1 ? "holiday" : "holidays"
    }`,
    schedule: `${rotationLabel}${
      customDayCount > 0
        ? ` · custom blocks on ${customDayCount} ${customDayCount === 1 ? "day" : "days"}`
        : " · sample timetable"
    }`,
    subjects: `${teamSubjectCount} team ${
      teamSubjectCount === 1 ? "subject" : "subjects"
    }${personalSubjects.length > 0 ? ` · ${personalSubjects.length} personal` : ""}${
      hiddenSubjects.length > 0 ? ` · ${hiddenSubjects.length} hidden` : ""
    }`,
    templates: `${LESSON_TEMPLATES.length} built-in${
      customTemplates.length > 0 ? ` · ${customTemplates.length} custom` : ""
    }`,
    workspace: `${workspaceName} · ${activeNotebooks.length} ${
      activeNotebooks.length === 1 ? "notebook" : "notebooks"
    } · members & invites`,
    account: `${displayName} · opens on ${VIEW_LABEL[defaultView] ?? "Weekly"}`,
    appearance: `${TITLE_CASE[theme] ?? theme} · ${TITLE_CASE[style] ?? style} · ${
      TITLE_CASE[palette] ?? palette
    }`,
    catchup: catchupEnabled ? "Cues on" : "Cues off",
  };

  // ── Grouped tiles (mirrors SETTINGS_GROUPS in layout.tsx) ─────────────
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageHeader
          eyebrow="Settings"
          title="Overview"
          subtitle="Everything your planner is configured to do — tap a card to change it."
        />

        <section className={styles.group} aria-label="Planning settings">
          <h2 className={styles.groupLabel}>Planning</h2>
          <div className={styles.grid}>
            <OverviewCard
              href="/settings/curriculum"
              label="Curriculum"
              scope="team"
              summary={summaries.curriculum}
            />
            <OverviewCard
              href="/settings/calendar"
              label="Calendar"
              scope="team"
              summary={summaries.calendar}
            />
            <OverviewCard
              href="/settings/schedule"
              label="Schedule"
              scope="personal"
              summary={summaries.schedule}
            />
          </div>
        </section>

        <section className={styles.group} aria-label="Content settings">
          <h2 className={styles.groupLabel}>Content</h2>
          <div className={styles.grid}>
            <OverviewCard
              href="/settings/subjects"
              label="Subjects"
              scope="team"
              summary={summaries.subjects}
            />
            <OverviewCard
              href="/settings/lesson-templates"
              label="Lesson templates"
              scope="personal"
              summary={summaries.templates}
            />
          </div>
        </section>

        <section className={styles.group} aria-label="People settings">
          <h2 className={styles.groupLabel}>People</h2>
          <div className={styles.grid}>
            <OverviewCard
              href="/settings/workspace"
              label="Workspace & Team"
              scope="team"
              summary={summaries.workspace}
            />
            <OverviewCard
              href="/settings/account"
              label="Account"
              scope="personal"
              summary={summaries.account}
            />
          </div>
        </section>

        <section className={styles.group} aria-label="Preference settings">
          <h2 className={styles.groupLabel}>Preferences</h2>
          <div className={styles.grid}>
            <OverviewCard
              href="/settings/appearance"
              label="Appearance"
              scope="personal"
              summary={summaries.appearance}
            />
            <OverviewCard
              href="/settings/catch-up"
              label="Catch-up"
              scope="personal"
              summary={summaries.catchup}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
