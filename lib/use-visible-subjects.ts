"use client";

// use-visible-subjects — the composition seam between the locked
// 8-subject roster and the Settings → Subjects configuration layers.
//
// Composes, in order:
//   1. The base SUBJECTS fixture (lib/mock/subjects.ts — the 8 locked
//      team subjects, ids + colors immutable per CLAUDE.md §4);
//   2. TEAM overrides (lib/use-subject-settings.ts) — display renames
//      applied, academic flags resolved, archived subjects separated;
//   3. PERSONAL custom subjects appended — each borrowing a locked
//      subject's color family via its `swatch` field;
//   4. The PERSONAL hidden-subjects filter ("I don't teach this").
//
// Returns { all, visible, hidden, archived } where every entry carries
// its EFFECTIVE display name (team rename applied) and a `cls` that is
// always one of the 8 locked SubjectIds — so `cp-subj ${cls}` /
// `useSubjectColor(cls)` paints every entry, personal or team, without
// any new color ever being invented.
//
// ── THE ADOPTION SEAM — read before consuming ─────────────────────────────
//
// TODAY: only the Settings surfaces consume this hook (Settings →
// Subjects renders its rosters from it). The planner views — /weekly,
// /daily, /year, /subject, /schedule, /catch-up — still read the raw
// SUBJECTS fixture from lib/mock directly and know nothing about
// renames, archiving, hiding, or personal subjects.
//
// PLANNER-VIEW ADOPTION IS AN EXPLICITLY FLAGGED FOLLOW-UP WAVE. When
// that wave lands, each view swaps its `SUBJECTS` import for
// `useVisibleSubjects().visible` (and a lookup helper for lessons that
// reference an archived/hidden subject — those lessons must degrade
// gracefully, not crash). DO NOT modify any planner view ahead of that
// wave; the settings pages set expectations in copy ("rolling out to
// your views") so teachers aren't surprised by the staging.
//
// Until adoption, this hook is intentionally read-only composition —
// no setters — so the seam stays one-directional: settings WRITE via
// lib/use-subject-settings.ts, views READ via this hook.

import { useMemo } from "react";
import type { SubjectId } from "./types";
import { SUBJECTS } from "./mock";
import {
  useHiddenSubjects,
  usePersonalSubjects,
  useSubjectOverrides,
} from "./use-subject-settings";

// ── Public shape ───────────────────────────────────────────────────────────

/**
 * One subject as the app should DISPLAY it — team or personal, with
 * every Settings → Subjects layer already applied.
 */
export interface EffectiveSubject {
  /** Locked SubjectId for team subjects; `p-…` slug for personal ones. */
  id: string;
  /** Effective display name — the team rename when one exists. */
  name: string;
  /** The locked roster name this entry was renamed FROM. Only set on
   *  renamed team subjects, so UIs can show "was Math". */
  baseName?: string;
  /**
   * Palette class — ALWAYS one of the 8 locked SubjectIds. For team
   * subjects it equals `id`; for personal subjects it is the borrowed
   * `swatch`. Paint with `cp-subj ${cls}` or `useSubjectColor(cls)` —
   * never any other color source (CLAUDE.md §4: never invent a
   * subject color).
   */
  cls: SubjectId;
  /** Short monogram (e.g. "Ma"). Derived from the name for personal
   *  subjects; the fixture's icon for team subjects. */
  icon: string;
  /** True for this teacher's own custom subjects. */
  isPersonal: boolean;
  /** Resolved academic flag (team override applied; personal subjects
   *  default to academic). Non-academic blocks skip lesson-flow. */
  isAcademic: boolean;
  /** TEAM archive flag — archived subjects leave every teacher's
   *  rosters. Always false for personal subjects (delete instead). */
  archived: boolean;
  /** PERSONAL hide flag — "I don't teach this". Affects only this
   *  teacher's views. Always false for personal subjects. */
  hidden: boolean;
}

export interface VisibleSubjectsResult {
  /** Every subject — team (8, overrides applied) then personal —
   *  including archived + hidden entries, flags set. The superset the
   *  other three lists are partitions of. */
  all: EffectiveSubject[];
  /** What this teacher's planner views should render once they adopt
   *  the seam: not archived (team) and not hidden (personal filter). */
  visible: EffectiveSubject[];
  /** Active team subjects this teacher chose to hide. (Archived
   *  subjects are NOT repeated here — archive wins over hide.) */
  hidden: EffectiveSubject[];
  /** Team subjects archived for the whole team. */
  archived: EffectiveSubject[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive a two-character monogram from a display name, matching the
 * fixture style ("Math" → "Ma"). Falls back to "?" for degenerate
 * names — normalization upstream makes that effectively unreachable.
 */
function monogramFor(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "?";
  const first = trimmed[0].toUpperCase();
  const second = trimmed.length > 1 ? trimmed[1].toLowerCase() : "";
  return `${first}${second}`;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Compose the locked roster + team overrides + personal subjects +
 * the personal hidden filter into display-ready lists.
 *
 * All four lists are memoized off the three underlying states, so
 * consumers re-render only when a layer actually changes. Each
 * underlying hook is SSR-safe (defaults first, localStorage post-mount),
 * which makes this hook SSR-safe by composition: the server render
 * shows the unmodified 8-subject roster, the real configuration
 * arrives in the post-mount effects.
 */
export function useVisibleSubjects(): VisibleSubjectsResult {
  const { overrides } = useSubjectOverrides();
  const { hidden: hiddenIds } = useHiddenSubjects();
  const { subjects: personalSubjects } = usePersonalSubjects();

  return useMemo(() => {
    const hiddenSet = new Set<string>(hiddenIds);

    // 1+2 — the locked roster with team overrides applied. Order is the
    // canonical fixture order so rosters render consistently app-wide.
    const team: EffectiveSubject[] = SUBJECTS.map((s) => {
      const o = overrides[s.id];
      const renamed = o?.name !== undefined;
      return {
        id: s.id,
        name: o?.name ?? s.name,
        ...(renamed ? { baseName: s.name } : {}),
        cls: s.id,
        icon: s.icon,
        isPersonal: false,
        isAcademic: o?.isAcademic ?? true,
        archived: o?.archived ?? false,
        hidden: hiddenSet.has(s.id),
      };
    });

    // 3 — personal subjects appended after the team roster. They borrow
    // a locked palette via `cls = swatch` and are never archived or
    // hidden (a teacher deletes their own subject instead).
    const personal: EffectiveSubject[] = personalSubjects.map((p) => ({
      id: p.id,
      name: p.name,
      cls: p.swatch,
      icon: monogramFor(p.name),
      isPersonal: true,
      isAcademic: true,
      archived: false,
      hidden: false,
    }));

    const all = [...team, ...personal];

    // 4 — partitions. Precedence: archived (team-wide removal) beats
    // hidden (personal preference) so a subject never appears twice.
    return {
      all,
      visible: all.filter((s) => !s.archived && !s.hidden),
      hidden: all.filter((s) => !s.archived && s.hidden),
      archived: all.filter((s) => s.archived),
    };
  }, [overrides, hiddenIds, personalSubjects]);
}
