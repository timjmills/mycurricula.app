"use client";

// ResourceWall.tsx — the Resource Wall shell (Wave 9a, route /post): the
// toolbar (wall switcher, view mode, search, fullscreen, add, wall menu), the
// section list, and the wall-level state that Section and Card act on.
//
// This file is the COMPONENT LAYER of lib/wall-scope: it assembles the
// WallScopeInput (lessons, units, the current week, today's configured-week
// column, the label functions) from the real stores and hands it to the pure
// `resolveWall`. The scope module deliberately takes all of that as input so it
// stays testable; this is the one place that reads the stores.
//
// AUTO-FORK (CLAUDE.md §2, applied to walls). The six presets are the shared
// starting points; the moment a teacher edits one, `ensurePersonal` lazily
// forks it into "My Walls" and every later edit lands on their copy. There is
// no "make a copy" button — the same lazy-forking contract the planner uses for
// lessons. Every mutator goes through `withFork`, so a new mutator cannot
// forget the rule.
//
// PHONES ARE VIEW-ONLY (product decision 2026-07-10). `usePhoneViewport` is
// read ONCE here and threaded down as `readOnly`, so the rule has a single
// origin rather than a per-component media query that can drift. It doubles as
// a render-layer safety net: a wall edited on a tablet and reopened on a phone
// shows no edit affordances rather than half of them.
//
// NO SHARE BUTTON. The bundle's toolbar and card modal carry "Share link"
// (resource-wall.jsx:502, :542) minting a base64 token. The share system is
// deferred to Wave 9b and its token is forgeable, so the affordance is omitted
// entirely rather than stubbed. A dead Share button teaches a teacher a
// capability that does not exist.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PlannerEmpty, Tooltip, UndoToast } from "@/components/ui";
import { OpenInBoardDialog } from "@/components/boards";
import { useAppState } from "@/lib/app-state";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { todayColumnIndex } from "@/lib/now-anchor";
import { useSchoolWeek } from "@/lib/use-school-week";
import { useOrderedWeekdays } from "@/lib/week-order";
import { SUBJECT_BY_ID } from "@/lib/mock/subjects";
import { usePhoneViewport } from "@/lib/use-phone-viewport";
import type { Lesson, LessonResource, SubjectId } from "@/lib/types";
import {
  WALL_PRESETS,
  WALL_PRESET_LABEL,
  resolveWall,
  type WallItem,
  type WallLessonRef,
  type WallPreset,
  type WallSection,
  type WallView,
} from "@/lib/wall-scope";
import { Lightbox } from "./Lightbox";
import { Section, WALL_FILTERS, type WallFilter, type WallLayout } from "./Section";
import { WallLibrary } from "./WallLibrary";
import { backgroundStyle, type WallBackground } from "./backgrounds";
import {
  copyWallSectionBackgrounds,
  loadCustomWalls,
  loadPresetBackgrounds,
  loadSubjectColorPref,
  newWallId,
  saveCustomWalls,
  saveSubjectColorPref,
  sweepOrphanPresetBackgrounds,
  type CustomWall,
} from "./wall-state";
import styles from "./ResourceWall.module.css";

// ── View modes ───────────────────────────────────────────────────────────────

/**
 * The four view modes — keys AND labels verbatim from the design bundle
 * (resource-wall.jsx:97): Medium / Large / Icon / List. The plan's
 * Mosaic/Single/Grid/List names never existed in the artboard; the tooltips
 * carry the "what you get" explanation instead of renaming the control.
 */
const VIEWS: readonly { key: WallView; label: string; hint: string }[] = [
  { key: "med", label: "Medium", hint: "Balanced tiles — the everyday wall" },
  { key: "large", label: "Large", hint: "Big tiles — best for presenting to the class" },
  { key: "icon", label: "Icon", hint: "Small tiles — see everything at once" },
  { key: "list", label: "List", hint: "One compact row per resource" },
];

// ── Icons ────────────────────────────────────────────────────────────────────

const IconSearch = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);
const IconX = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconChevron = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconPlus = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconDots = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
);
const IconExpand = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
const IconCompress = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
);
const IconFolder = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);
const IconBoard = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="13" rx="2" /><path d="M12 17v4M8 21h8" />
  </svg>
);

// ── Props ────────────────────────────────────────────────────────────────────

export interface ResourceWallProps {
  /**
   * The lesson the teacher arrived from, when there is one. Decides the default
   * preset: with a focus, "Current Lesson"; without, "Today's Lessons (Mixed)"
   * (the bundle's focus-dependent default, resource-wall.jsx:332). Also the
   * anchor the "Current Lesson" preset reads.
   */
  focusLessonId?: string | null;
  /** Anchor for the subject-scoped presets ("This Week · Subject", "Subject
   *  View", "Unit View"). Without it those presets resolve to an empty wall —
   *  deliberately, per wall-scope: a missing anchor never falls back to
   *  "everything", which would show the wrong plan. */
  focusSubject?: SubjectId | null;
  /** Anchor for "Unit View" — only meaningful together with `focusSubject`
   *  (unit ids are unique only within a subject). */
  focusUnit?: string | null;
  /**
   * Identity of the deep link the URL is asking for: the RAW query values,
   * before they are validated against the stores. It changes only on a real
   * navigation — never while an anchor resolves — which is the one thing the
   * resolved anchors above cannot express, and what lets a NEW deep link
   * re-arm the anchor-follow after the teacher has picked a wall by hand.
   * Omit it and the wall simply never re-arms.
   */
  anchorKey?: string;
  /**
   * The canonical resource list for a lesson. Optional override: the full
   * answer is the de-duplicated union of a lesson's section-level rows (store-
   * owned) and its lesson-level rows, which only a caller holding the section
   * store can assemble. The default is the lesson-level list — real data and a
   * working wall; inject to widen it without touching this file.
   */
  resourcesFor?: (lesson: Lesson) => readonly LessonResource[];
  /**
   * A landing preset asked for EXPLICITLY, overriding the anchor inference.
   *
   * `anchoredPreset` below maps anchors to `unit | lesson | subject | today`
   * and can never return either WEEK preset, so before this prop
   * "This Week · Mixed" and "This Week · Subject" were reachable only by
   * clicking the toolbar — not by any URL. /weekly's Resources button needs
   * exactly that (task #47: the Week lost its resources rail, and the Wall's
   * week preset is the richer surface that replaces it), and
   * app/(planner)/post/page.tsx now narrows `?preset=` to this union.
   *
   * Absent or null → the anchor inference, unchanged. This is purely additive.
   */
  initialPreset?: WallPreset | null;
  // "Send to board" is handled internally by OpenInBoardDialog (it does the real
  // write + owns its own navigation), so this surface needs no navigation
  // callback. A prior `onTeach` prop was removed with the board-seam fix.
}

/** The wall currently on screen: a shared preset, or the teacher's own copy. */
type WallMode = "preset" | "custom";

// ── Deep-link anchors → the landing wall ─────────────────────────────────────

/** The anchors a deep link carried, as this component receives them. */
export interface WallAnchors {
  focusLessonId?: string | null;
  focusSubject?: SubjectId | null;
  focusUnit?: string | null;
}

/**
 * The wall a deep link's anchors point at. Narrowest anchor wins: a unit (which
 * rides on a subject) → Unit View, a lesson → Current Lesson, a bare subject →
 * Subject View, nothing → the everyday Today wall.
 *
 * THE LESSON TEST SITS ABOVE THE BARE-SUBJECT TEST ON PURPOSE. The route
 * documents `/post?lesson=<id>` as "Current Lesson" (app/(planner)/post/page.tsx),
 * but PostClient fills `focusSubject` from the FOCUS LESSON'S subject when the
 * URL carries no subject of its own (PostClient.tsx:54). That derived subject
 * exists so the subject-scoped presets have an anchor if the teacher switches to
 * one — it is not a request to land on them. Tested after the bare subject, it
 * shadowed the lesson branch completely: every `/post?lesson=X` opened Subject
 * View (a section per unit of the whole subject) and the "Current Lesson" landing
 * was unreachable, whatever the hydrate did.
 */
export function anchoredPreset({
  focusLessonId,
  focusSubject,
  focusUnit,
}: WallAnchors): WallPreset {
  if (focusSubject && focusUnit) return "unit";
  if (focusLessonId) return "lesson";
  if (focusSubject) return "subject";
  return "today";
}

/**
 * Whether a (re-)resolved anchor may move the wall — the "never fight the
 * teacher" rule for the re-resolve effect.
 *
 * It stands down permanently once the teacher has chosen a wall themselves:
 * `teacherChoseWall` covers the switcher and every route onto one of their own
 * walls, and the `wallMode` test covers the frame they are actually on one.
 *
 * It also refuses to follow an anchor BACKWARDS. "today" is the no-anchor
 * fallback, so `anchored === "today"` while the store is unsettled means "the
 * anchor cannot be resolved right now", not "the link had none": a re-hydrate
 * (a workspace switch drops the document to EMPTY_DOC and re-loads) makes
 * PostClient's `getLesson` return null again, and following that would bounce a
 * deep-linked teacher Lesson → Today → Lesson for the length of the hydrate.
 * Only a SETTLED store may move the wall back to Today, which is the case that
 * matters: a real navigation from /post?lesson=X to /post.
 */
export function shouldFollowAnchor(state: {
  anchored: WallPreset;
  preset: WallPreset;
  wallMode: WallMode;
  teacherChoseWall: boolean;
  settled: boolean;
}): boolean {
  if (state.teacherChoseWall) return false;
  if (state.wallMode !== "preset") return false;
  if (state.anchored === "today" && !state.settled) return false;
  return state.anchored !== state.preset;
}

/**
 * The teacher's own fork of a preset wall, if they have one — PERSONAL-FIRST
 * VIEWING applied to walls (CLAUDE.md §2: "a teacher always sees their version
 * where one exists").
 *
 * Without this, every load of /post opens the SHARED preset even for a teacher
 * who forked it minutes ago: the fork is on disk and its section backgrounds are
 * on disk, but the wall that addresses them is never reopened, so a pinned photo
 * reads as lost. (Measured on /post?lesson=m-11-1: pin → "My Current Lesson",
 * `hasBg:true`; reload → "Current Lesson", `hasBg:false`, record still in
 * storage.) Nothing is lost — it is unreachable until the teacher navigates back
 * by hand, which is worse, because it looks like data loss.
 *
 * Matching is on `anchor === "forked"` + the source label, so a DUPLICATE of a
 * fork is never auto-opened: `duplicateWall` marks a copy `unanchored` while
 * carrying `forkedFrom` forward, and a copy is a deliberate side branch rather
 * than the teacher's working version of that preset. Newest wins when a teacher
 * has forked the same preset more than once. Returns null when there is no fork
 * — including when the wall was deleted, since a deleted wall is simply absent
 * from the list, so the caller falls back to the preset and never to a blank.
 */
export function personalWallFor(
  preset: WallPreset,
  walls: readonly CustomWall[],
): CustomWall | null {
  const label = WALL_PRESET_LABEL[preset];
  let best: CustomWall | null = null;
  for (const w of walls) {
    if (w.anchor !== "forked" || w.forkedFrom !== label) continue;
    if (!best || w.created > best.created) best = w;
  }
  return best;
}

export function ResourceWall({
  focusLessonId,
  focusSubject,
  focusUnit,
  anchorKey,
  resourcesFor,
  initialPreset = null,
}: ResourceWallProps): ReactNode {
  const readOnly = usePhoneViewport();
  // NO useComposer() here, deliberately. The wall composes notes INLINE, in its
  // own card (see `addInlineNote`), so it neither opens nor depends on the
  // shared modal composer — which is also what keeps this surface working on a
  // section with no lesson behind it.

  // The landing preset honors whichever anchor the deep link carried (see
  // `anchoredPreset`). Without it a /post?subject=math link would open on Today
  // and silently ignore the anchor.
  //
  // `inferred` is recomputed EVERY render and is NOT a constant: PostClient
  // resolves `?lesson=` against the planner store, which is empty for the whole
  // 11–16s Supabase hydrate, so a deep-linked lesson arrives here as `null` and
  // turns real seconds later. The re-resolve effect below is what catches that.
  const inferred = anchoredPreset({ focusLessonId, focusSubject, focusUnit });
  // THE WALL THE URL IS ASKING FOR. An explicit `?preset=` outranks the anchor
  // inference — it is a wall stated outright, where the anchors are a wall
  // deduced — and it has to outrank it EVERYWHERE, not only in the seed.
  //
  // It used to seed `useState` and nothing else, which quietly discarded it: the
  // re-resolve effect below compared the seeded wall against `inferred`, and a
  // bare /post?preset=week-mixed carries no anchors at all, so `inferred` is
  // "today". The moment the planner settled the effect "corrected" the asked-for
  // wall back to Today — on the FIRST load, not just on a second navigation
  // (Codex gate, reported as Medium; tests/resource-wall-preset-link.test.ts
  // pins both). Feeding the effect the same value the seed uses is what makes
  // the two agree.
  //
  // This does NOT re-assert the link over the teacher: `shouldFollowAnchor`'s
  // teacherChoseWall / wallMode tests are unchanged and still stand the effect
  // down the moment they pick a wall by hand.
  const target = initialPreset ?? inferred;
  const [preset, setPreset] = useState<WallPreset>(target);
  const [wallMode, setWallMode] = useState<WallMode>("preset");
  const [activeCustom, setActiveCustom] = useState<CustomWall | null>(null);
  const [customWalls, setCustomWalls] = useState<CustomWall[]>([]);

  // Identity of the wall on screen — the custom wall's id, else the preset id.
  // Scopes each section's "this section" background so it can't bleed onto
  // another wall that (post-fork/duplicate) shares the same section ids.
  // Declared up here because `ensurePersonal` closes over it: a fork has to
  // return the key storage should use, and reading it from further down the
  // body would make that dependency invisible.
  const wallKey = wallMode === "custom" ? (activeCustom?.id ?? preset) : preset;

  const [view, setView] = useState<WallView>("med");
  const [layout, setLayout] = useState<WallLayout>("natural");
  const [presetBackgrounds, setPresetBackgrounds] = useState<
    Partial<Record<WallPreset, WallBackground>>
  >({});
  const [filter, setFilter] = useState<WallFilter>("All");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [subjectColor, setSubjectColor] = useState(false);
  // Bumped on any section-background write. Threaded to every Section and folded
  // into its bg-load effect deps, so a "Whole subject" apply/reset re-hues EVERY
  // mounted section of that subject at once — not just the one whose popover was
  // open (which is all that its local `bg` state would otherwise update).
  const [bgRevision, setBgRevision] = useState(0);
  const bumpBgRevision = useCallback(() => setBgRevision((r) => r + 1), []);

  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchTab, setSwitchTab] = useState<"presets" | "my">("presets");
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const [sectionDragging, setSectionDragging] = useState(false);
  const [cardDragging, setCardDragging] = useState(false);
  const [solo, setSolo] = useState<string | null>(null);
  const [light, setLight] = useState<{
    slides: WallItem[];
    index: number;
    mode?: "enlarge";
  } | null>(null);
  const [chooser, setChooser] = useState<{ item: WallItem; lessons: WallLessonRef[] } | null>(
    null,
  );
  const [boardDialog, setBoardDialog] = useState<{
    resource: LessonResource;
    lessonId: string | null;
  } | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastSeq = useRef(0);

  const say = useCallback((message: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message });
  }, []);

  // ── The scope input (this file's job) ─────────────────────────────────────

  const { lessons, units } = usePlanner();
  // Whether the store can actually back a claim about what the plan holds. Read
  // unconditionally — it gates a render branch, not a code path.
  const settled = usePlannerDataState() === "settled";
  const { week } = useAppState();
  const { days } = useSchoolWeek();
  const weekdays = useOrderedWeekdays();

  // todayColumnIndex reads a clock, so it must not run during render — the
  // server and the first client paint would disagree. Resolve post-mount; until
  // then the day-anchored presets render as "no school day", which is also the
  // honest answer on a weekend.
  const [todayCol, setTodayCol] = useState<number | null>(null);
  useEffect(() => {
    setTodayCol(todayColumnIndex(new Date(), days));
  }, [days]);

  const resolveResources = useCallback(
    (lesson: Lesson): readonly LessonResource[] =>
      resourcesFor ? resourcesFor(lesson) : lesson.resources,
    [resourcesFor],
  );

  const dayLabel = useCallback(
    (dayIndex: number): string => weekdays[dayIndex]?.longLabel ?? `Day ${dayIndex + 1}`,
    [weekdays],
  );
  const subjectLabel = useCallback(
    (subject: SubjectId): string => SUBJECT_BY_ID[subject]?.name ?? subject,
    [],
  );

  const presetSections = useMemo(
    () =>
      resolveWall({
        scope: {
          preset,
          lessonId: focusLessonId ?? null,
          subject: focusSubject ?? null,
          unit: focusUnit ?? null,
        },
        lessons,
        units,
        currentWeek: week,
        todayCol,
        resourcesFor: resolveResources,
        dayLabel,
        subjectLabel,
      }),
    [
      preset,
      focusLessonId,
      focusSubject,
      focusUnit,
      lessons,
      units,
      week,
      todayCol,
      resolveResources,
      dayLabel,
      subjectLabel,
    ],
  );

  // The sections on screen: a custom wall's saved layout, else the live preset
  // projection. `null` means "not overridden", so a preset stays LIVE — it must
  // re-project when the planner changes, which a snapshot in state would freeze.
  const [override, setOverride] = useState<WallSection[] | null>(null);

  // ── The note being composed, held OUT of the wall ─────────────────────────
  // A composing note is transient: it exists only while the editor is open, and
  // it is rendered by merging it into the section list below — never by writing
  // it into the wall.
  //
  // THE FORK IS WHAT THIS PROTECTS. `withFork` → `ensurePersonal()` copies a
  // preset into a frozen "My Walls" wall that stops receiving later lesson
  // updates. Inserting the placeholder card through it meant pressing "Add note"
  // and then CANCEL left the teacher owning that frozen copy, having saved
  // nothing — invisible, because the wall looks unchanged while it has silently
  // stopped tracking the team's resources (§4a review, High). Deferring the fork
  // to the commit removes the failure by construction: nothing is created until
  // there is something to save, and Cancel has nothing to roll back.
  //
  // It also stops the "Copied to My Walls" toast firing before the teacher has
  // typed a character.
  const [pendingNote, setPendingNote] = useState<{
    sectionId: string;
    item: WallItem;
  } | null>(null);

  const sections = useMemo(() => {
    const base = override ?? presetSections;
    if (!pendingNote) return base;
    // Rendered, not stored. The pending card is appended to its section for
    // display only; if that section has gone (a wall switch mid-compose) the
    // note simply does not render, which is the honest outcome.
    return base.map((s) =>
      s.id === pendingNote.sectionId
        ? { ...s, items: [...s.items, pendingNote.item] }
        : s,
    );
  }, [override, presetSections, pendingNote]);

  // RE-RESOLVE A LATE ANCHOR. `preset` seeds from `target` once, and a seed
  // runs ONCE — so over Supabase it is taken while `focusLessonId` is still
  // null, the wall lands on "today", and the deep link is dropped FOREVER: no
  // error, no retry, and nothing on screen to tell the teacher the link they
  // followed was ignored. (/daily has the same hazard and threads the RAW id
  // through state so its seeding effect can retry — DailyView.tsx:284. This is
  // that retry, expressed over the resolved anchor.) Whenever the anchored wall
  // changes — the hydrate resolving it, or a NEW deep link arriving while the
  // wall stays mounted — the wall follows it.
  //
  // `shouldFollowAnchor` is the whole "never fight the teacher" rule; see its
  // docstring. No setOverride here: the effect only fires in preset mode, where
  // `override` is already null (every setOverride to a non-null layout ships
  // with setWallMode("custom")).
  const teacherChoseWall = useRef(false);
  const lastAnchorKey = useRef(anchorKey);
  useEffect(() => {
    // A NEW deep link is a fresh ask, so it re-arms the follow even for a
    // teacher who had picked a wall by hand. `anchorKey` is the RAW query, so
    // this cannot fire on the hydrate resolving the SAME link — which is the
    // whole reason the resolved anchors are not used for the comparison.
    if (anchorKey !== lastAnchorKey.current) {
      lastAnchorKey.current = anchorKey;
      teacherChoseWall.current = false;
    }
    // Landing on one of the teacher's own walls IS a wall choice, and it stays
    // chosen after they delete that wall and drop back to a preset (deleteWall,
    // and the library's delete-the-active-wall fallback, both return to preset
    // mode). Latching here rather than at each call site means the auto-fork,
    // Duplicate, New wall, and both delete paths are covered without any of them
    // having to remember the rule.
    // Deliberately AFTER the re-arm, which makes a custom wall the one place a
    // new deep link does NOT move the teacher: leaving would mean dropping the
    // wall they are looking at (wallMode + override + activeCustom) on a URL
    // change. Their layout is safe either way — it is already persisted — so
    // this is the conservative half of the trade, and nothing in the app links
    // to /post with an anchor today. Revisit when the first such link ships.
    if (wallMode === "custom") teacherChoseWall.current = true;
    // `target`, not `inferred`: an explicit `?preset=` is the wall the URL asked
    // for, and comparing the seeded wall against an inference that never knew
    // about it is what silently corrected it away. See `target`'s note above.
    if (
      !shouldFollowAnchor({
        anchored: target,
        preset,
        wallMode,
        teacherChoseWall: teacherChoseWall.current,
        settled,
      })
    ) {
      return;
    }
    setPreset(target);
  }, [anchorKey, target, preset, wallMode, settled]);

  // localStorage reads are deferred to an effect: the server render and the
  // first client paint must agree (app SSR contract).
  useEffect(() => {
    setCustomWalls(loadCustomWalls());
    setSubjectColor(loadSubjectColorPref());
    setPresetBackgrounds(loadPresetBackgrounds());
    // One sweep per mount for the pre-8d445df orphans (task #37). It rides the
    // storage-load effect rather than a migration flag because it is idempotent
    // and self-limiting: after the first pass there is nothing left to find, and
    // no code path can create another. A persisted "already migrated" flag would
    // add a key that can itself go wrong for no benefit.
    sweepOrphanPresetBackgrounds(WALL_PRESETS);
  }, []);


  // SINGLE PERSISTENCE SINK for the wall list. Every mutator just updates
  // `customWalls`; this is the one place that writes it to storage. That keeps
  // `saveCustomWalls` OUT of the `setCustomWalls` updaters — a side effect in a
  // state updater double-fires under StrictMode (harmless while the write is
  // idempotent, but an anti-pattern). The first run is skipped so the empty
  // initial seed can't clobber stored walls before the load effect hydrates
  // them (the load's setState re-runs this with the real list).
  const savedHydrated = useRef(false);
  useEffect(() => {
    if (!savedHydrated.current) {
      savedHydrated.current = true;
      return;
    }
    saveCustomWalls(customWalls);
  }, [customWalls]);

  /** Replace the wall list (the write path the library shares). If the active
   *  wall was edited (renamed / re-backgrounded) the updated record replaces
   *  `activeCustom` so the toolbar name/backdrop track. Persistence rides the
   *  sink above — this only sets state. */
  const persistCustomWalls = useCallback(
    (next: CustomWall[]) => {
      setCustomWalls(next);
      setActiveCustom((prev) => (prev ? (next.find((w) => w.id === prev.id) ?? null) : prev));
    },
    [],
  );

  const openPreset = useCallback((p: WallPreset) => {
    teacherChoseWall.current = true; // their choice outranks a late-resolving anchor
    setWallMode("preset");
    setPreset(p);
    setActiveCustom(null);
    setOverride(null); // drop the override so the live projection returns
  }, []);

  const openCustom = useCallback((wall: CustomWall) => {
    // No teacherChoseWall latch needed: the effect above latches on every frame
    // in "custom" mode, which is every wall this opens.
    setWallMode("custom");
    setActiveCustom(wall);
    setOverride(wall.layout);
    setView(wall.view);
  }, []);

  // PERSONAL-FIRST: open the teacher's own fork of the wall the URL selects,
  // when they have one. See `personalWallFor` for why — in short, a forked wall
  // and its section backgrounds both survive a reload today, but the wall is
  // never reopened, so the work reads as lost.
  //
  // GATED ON `settled`, which is what keeps this from fighting the anchor
  // follow above. Until the store settles, `target` is still moving (a
  // deep-linked lesson resolves late), and opening the fork of a wall the URL
  // never asked for would be sticky: `wallMode === "custom"` latches
  // `teacherChoseWall`, and the real anchor would then arrive to find the
  // follow disarmed. Once settled, `target` is final for this URL — the only
  // thing that moves it after that is a genuine navigation, which re-arms via
  // `anchorKey` and re-runs this rule for the new preset.
  //
  // `target`, so an explicit `?preset=` gets the same personal-first treatment
  // as an anchor: a teacher who forked "This Week · Mixed" must get their fork
  // back when /weekly's Resources button sends them to it.
  //
  // It never forks and never writes: `openCustom` loads an EXISTING wall's
  // stored layout. And it only ever moves a teacher OFF the shared preset onto
  // their own copy — the safe direction under the forking model, since the
  // preset is the team's.
  useEffect(() => {
    if (!settled || teacherChoseWall.current || wallMode !== "preset") return;
    const mine = personalWallFor(target, customWalls);
    if (!mine) return; // no fork (or it was deleted) → stay on the preset
    openCustom(mine);
  }, [settled, target, customWalls, wallMode, openCustom]);

  // ── Auto-fork ─────────────────────────────────────────────────────────────

  /**
   * The lazy fork. Editing a preset copies the CURRENT projection into a new
   * "My Walls" entry and switches to it; editing an existing custom wall is a
   * no-op.
   *
   * Returns BOTH halves of the post-fork world, because setState is async and a
   * caller that re-read either from the enclosing render would still see the
   * pre-fork value:
   *   • `sections` — what a mutator must transform.
   *   • `wallKey` — where wall-scoped STORAGE for this edit belongs. A fork
   *     mints a new wall id, and `wallKey` is derived from it, so a writer using
   *     the render's `wallKey` writes under the wall it just left. That is
   *     exactly how the first section-background pin on a preset was lost: it
   *     landed under `cc_secbg_<preset>:…` while the section re-read under
   *     `cc_secbg_<newWallId>:…`, found nothing, and reverted — a click that
   *     appeared to do nothing, plus an orphan record under a key that no longer
   *     addresses anything.
   */
  const ensurePersonal = useCallback((): {
    sections: WallSection[];
    wallKey: string;
  } => {
    const current = override ?? presetSections;
    if (wallMode === "custom") return { sections: current, wallKey };
    const wall: CustomWall = {
      id: newWallId(),
      name: `My ${WALL_PRESET_LABEL[preset]}`,
      anchor: "forked",
      forkedFrom: WALL_PRESET_LABEL[preset],
      layout: current,
      view,
      created: Date.now(),
    };
    setCustomWalls((prev) => {
      const next = [wall, ...prev];      return next;
    });
    setActiveCustom(wall);
    setWallMode("custom");
    setOverride(current);
    say("Copied to My Walls — you're editing your version");
    return { sections: current, wallKey: wall.id };
  }, [override, presetSections, wallMode, wallKey, preset, view, say]);

  /** Apply a change to the wall's sections, forking first if needed. */
  const withFork = useCallback(
    (mutate: (sections: WallSection[]) => WallSection[]) => {
      const { sections: base } = ensurePersonal();
      setOverride(mutate(base));
    },
    [ensurePersonal],
  );

  // Persist the active custom wall whenever its layout or view changes. Keyed
  // off `override` (the edited layout), never `sections` — a preset's live
  // projection must never be written back as if the teacher had authored it.
  useEffect(() => {
    if (wallMode !== "custom" || !activeCustom || !override) return;
    setCustomWalls((prev) => {
      const next = prev.map((w) =>
        w.id === activeCustom.id ? { ...w, layout: override, view } : w,
      );      return next;
    });
  }, [override, view, wallMode, activeCustom]);

  // ── Mutators ──────────────────────────────────────────────────────────────

  const moveCard = useCallback(
    (cardKey: string, toSectionId: string, beforeKey?: string) => {
      if (cardKey === beforeKey) return;
      withFork((prev) => {
        let moved: WallItem | null = null;
        const stripped = prev.map((s) => ({
          ...s,
          items: s.items.filter((it) => {
            if (it.key !== cardKey) return true;
            moved = it;
            return false;
          }),
        }));
        const item = moved as WallItem | null;
        if (!item) return prev;
        return stripped.map((s) => {
          if (s.id !== toSectionId) return s;
          const idx = beforeKey ? s.items.findIndex((it) => it.key === beforeKey) : -1;
          if (idx < 0) return { ...s, items: [...s.items, item] };
          const items = [...s.items];
          items.splice(idx, 0, item);
          return { ...s, items };
        });
      });
    },
    [withFork],
  );

  const moveSection = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      withFork((prev) => {
        const from = prev.findIndex((s) => s.id === fromId);
        const to = prev.findIndex((s) => s.id === toId);
        if (from < 0 || to < 0) return prev;
        const next = [...prev];
        const [lifted] = next.splice(from, 1);
        next.splice(to, 0, lifted);
        return next;
      });
    },
    [withFork],
  );

  /**
   * Insert a note card, already open for composing — the handoff's own add flow
   * (bundled mockup :7087, which seeds `{type:'note', composing:true}` and lets
   * Card render the editor in place).
   *
   * This is now the wall's PRIMARY add path, not the fallback it used to be.
   * The editor it opens is no longer the handoff's bare textarea: Card's note
   * composer carries a colour picker, an attachable link, Cancel, and an
   * empty-submit guard (the user's "this is too bare", answered). The card is
   * inserted OPTIMISTICALLY so the composer can appear exactly where the "+"
   * was — `discardCard` is what takes it back out if they cancel.
   *
   * WHERE THE NOTE LIVES, measured rather than assumed: `withFork` →
   * `saveCustomWalls` → localStorage, with ZERO `/rest/v1/` calls on commit. A
   * lesson-less note survives a reload on the same profile (text and `wash`
   * both round-trip) and is INVISIBLE on another profile. That is the whole
   * wall's contract, not this composer's — wall-state.ts says "Persisting to
   * Supabase is out of scope for 9a" and every wall feature (forks, section
   * backgrounds, custom walls) is device-local. Worth knowing before anyone
   * treats a wall note as something a teammate can see.
   */
  const addInlineNote = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId);
      // A new note inherits the section's lesson context so "send to board" and
      // the subject color have somewhere to point. A hand-made section yields an
      // empty lessonId, which routes the note to the untagged board — the
      // lesson-less case, which is supported rather than blocked.
      const lessonId = section?.lessonIds?.[0] ?? section?.items[0]?.lessonId ?? "";
      const lessonTitle = section?.items[0]?.lessonTitle ?? section?.title ?? "";
      const resource: LessonResource = { type: "notecard", label: "Note" };
      setPendingNote({
        sectionId,
        item: {
          key: `k-${newWallId()}`,
          type: "notecard",
          label: "Note",
          resource,
          subjectId: section?.subjectId ?? "math",
          lessonId,
          lessonTitle,
          lessons: lessonId ? [{ id: lessonId, title: lessonTitle }] : [],
          composing: true,
        },
      });
    },
    [sections],
  );

  /**
   * "Add note" — opens the wall's OWN inline composer, in place, where the "+"
   * was pressed. It does not open the shared modal composer, and that is the
   * deliberate resolution of a contradiction this surface has carried for weeks.
   *
   * THE HISTORY, because it will otherwise be re-litigated a fourth time.
   * e0eab58 wired /post to the shared composer; 1cf4816 reverted it, reading the
   * 7.21 handoff as making the wall collection-only (ph-more.jsx:136, :169) and
   * leaving a live probe asserting NO composer may ever appear here; 2ffbb43
   * wired it back. Meanwhile the tooltip still told teachers resources could not
   * be added here. Three sources of truth, all disagreeing.
   *
   * THE WALL IS AN AUTHORING SURFACE. `1cf4816` read the 7.21 handoff as making
   * it collection-only (`ph-more.jsx:136`, `:169`) and that reading was
   * defensible then; it is OVERRIDDEN now, by the user directly. They looked at
   * this exact surface, called its note editor "too bare", pointed at a
   * Padlet-style reference, and asked for MORE authoring on it — under a
   * standing instruction to improve on the handoff where an audit says so. That
   * sentence is the decision; `ph-more.jsx` is not grounds to revert it a third
   * time without asking the user again.
   *
   * A note's OWNER IS THE SECTION, and a lesson is optional context rather than
   * a precondition. That is the product model this surface replaces (a Padlet
   * board, CLAUDE.md §1): plenty of wall content — "bring in shoeboxes
   * Thursday" — belongs to a section and to no lesson at all, and making a
   * teacher nominate one before they can jot is friction in front of the
   * fastest action here.
   *
   * They want MORE authoring here, not less. What they do NOT
   * want is a modal: the handoff's composer is an inline card in the section
   * grid, and that shape is right (a note on a wall is composed where it will
   * live). So the wall keeps the handoff's SHAPE and gains the capability —
   * colour, an attached link, Cancel, an empty guard — in `Card`'s note editor.
   *
   * The shared modal composer stays exactly where it belongs: the lesson-centric
   * surfaces (Day, Week, Year, the lesson maker) that compose ONTO a lesson.
   * This one needs no lesson at all, which is also what makes it work on a
   * hand-made section — the case the old fallback existed for.
   */
  const addSection = useCallback(
    (after?: WallSection) => {
      withFork((prev) => {
        const seed = after ?? prev[prev.length - 1];
        const section: WallSection = {
          id: `sec-${newWallId()}`,
          title: "New section",
          meta: "",
          subjectId: seed?.subjectId ?? prev[0]?.subjectId ?? "math",
          lessonIds: [],
          items: [],
        };
        const at = after ? prev.findIndex((s) => s.id === after.id) + 1 : prev.length;
        const next = [...prev];
        next.splice(at, 0, section);
        return next;
      });
    },
    [withFork],
  );

  /** A note card's edit committing back from the Card. */
  /**
   * Drop a card the teacher abandoned mid-compose.
   *
   * A PENDING note never entered the wall, so discarding it is pure state — no
   * fork to undo, nothing written, no "My Walls" copy left behind. That is the
   * whole point of holding it outside the layout; see `pendingNote`.
   *
   * The `withFork` branch below is for a card that IS on the wall — an existing
   * note the teacher opened and then removed. That one legitimately edits the
   * wall, so it forks like any other edit.
   */
  const discardCard = useCallback(
    (cardKey: string) => {
      if (pendingNote?.item.key === cardKey) {
        setPendingNote(null);
        return;
      }
      withFork((prev) =>
        prev.map((s) => ({
          ...s,
          items: s.items.filter((it) => it.key !== cardKey),
        })),
      );
    },
    [withFork, pendingNote],
  );

  const commitCard = useCallback(
    (item: WallItem) => {
      // THE ONLY PLACE A NOTE BECOMES REAL, and therefore the only place the
      // wall forks. A pending note is APPENDED to its section; an existing card
      // (a note being re-edited) is replaced in place.
      if (pendingNote && pendingNote.item.key === item.key) {
        const { sectionId } = pendingNote;
        setPendingNote(null);
        withFork((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, items: [...s.items, item] } : s,
          ),
        );
        return;
      }
      withFork((prev) =>
        prev.map((s) => ({
          ...s,
          items: s.items.map((it) => (it.key === item.key ? item : it)),
        })),
      );
    },
    [withFork, pendingNote],
  );

  // ── Wall menu actions ─────────────────────────────────────────────────────

  const duplicateWall = useCallback(() => {
    const sourceName = activeCustom ? activeCustom.name : WALL_PRESET_LABEL[preset];
    const wall: CustomWall = {
      id: newWallId(),
      name: `Copy of ${sourceName}`,
      anchor: activeCustom ? "unanchored" : "forked",
      ...(activeCustom?.forkedFrom ? { forkedFrom: activeCustom.forkedFrom } : {}),
      layout: sections,
      view,
      created: Date.now(),
    };
    // A duplicate mints a NEW wall id, and section backgrounds are stored under
    // it — so without this the copy opens blank and every per-section colour and
    // photo is silently gone (task #39). Copy, never move: the source wall is
    // still on disk and still open behind the toast, and must look untouched.
    copyWallSectionBackgrounds(wallKey, wall.id);
    setCustomWalls((prev) => {
      const next = [wall, ...prev];      return next;
    });
    setActiveCustom(wall);
    setWallMode("custom");
    setOverride(sections);
    // The sections' own bg state is keyed on `wallKey`, which changes on the
    // next render; bumping the revision makes every mounted Section re-read
    // under the new key so the copy paints its backgrounds immediately rather
    // than only after a reload.
    bumpBgRevision();
    say(`Duplicated as “${wall.name}”`);
  }, [activeCustom, preset, sections, view, wallKey, bumpBgRevision, say]);

  /** Start a fresh, empty custom wall. Unlike the auto-fork (which copies the
   *  current preset), this is a deliberate blank slate the teacher fills with
   *  their own sections. */
  const newBlankWall = useCallback(() => {
    const wall: CustomWall = {
      id: newWallId(),
      name: "New wall",
      anchor: "unanchored",
      layout: [],
      view,
      created: Date.now(),
    };
    setCustomWalls((prev) => {
      const next = [wall, ...prev];      return next;
    });
    setActiveCustom(wall);
    setWallMode("custom");
    setOverride([]);
    say("Started a new wall — add sections to fill it");
  }, [view, say]);

  const deleteWall = useCallback(() => {
    if (!activeCustom) return;
    const name = activeCustom.name;
    setCustomWalls((prev) => {
      const next = prev.filter((w) => w.id !== activeCustom.id);      return next;
    });
    setActiveCustom(null);
    setWallMode("preset");
    setOverride(null);
    say(`Deleted “${name}”`);
  }, [activeCustom, say]);

  const toggleSubjectColor = useCallback(() => {
    setSubjectColor((on) => {
      saveSubjectColorPref(!on);
      return !on;
    });
  }, []);

  // ── Board routing ─────────────────────────────────────────────────────────

  // The TERMINAL action of "send to board" is OpenInBoardDialog — the shared
  // component that does the REAL write (createBoardWithResource / add-to-
  // existing), owns grade resolution + the board cap + single-flight guarding,
  // and navigates into the editor itself. We do NOT navigate or toast here: the
  // earlier version's `onTeach?.()` only routed to /teach WITHOUT sending the
  // card, and its untagged toast claimed an action that never happened. The
  // dialog's `lessonId: null` is its supported lesson-less path — so the
  // untagged case becomes a real board, not theatre.
  const openBoard = useCallback(
    (resource: LessonResource, lessonId: string | null) => {
      setChooser(null);
      setBoardDialog({ resource, lessonId });
    },
    [],
  );

  /**
   * Send a card to its Teaching Board. A wall card can map to SEVERAL lessons —
   * `resolveWall` dedupes the same content (a file linked from two lessons is one
   * card carrying both refs), so "which board?" is a real question. The lesson
   * the card was opened FROM wins without asking (a card in the Math section
   * means the Math board); a genuine multi-lesson tie opens the chooser; no
   * lesson at all → a lesson-less board.
   */
  const board = useCallback(
    (item: WallItem, fromLessonId?: string) => {
      const refs = item.lessons;
      if (fromLessonId && refs.some((l) => l.id === fromLessonId)) {
        return openBoard(item.resource, fromLessonId);
      }
      if (refs.length === 1) return openBoard(item.resource, refs[0].id);
      if (refs.length > 1) return setChooser({ item, lessons: refs });
      // No refs, but the card still knows the lesson it was surfaced from.
      return openBoard(item.resource, item.lessonId || null);
    },
    [openBoard],
  );

  // ── Escape closes the transient layers ────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // Defer to every overlay that owns its own Escape and portals ABOVE the
      // wall: the board dialog, the Lightbox, and the Library modal. This
      // document listener fires before their window listeners in bubble order,
      // so without this guard one Escape would close the top overlay AND unwind
      // a layer beneath it (e.g. fullscreen → lightbox → Esc dropped BOTH,
      // dumping the teacher out of fullscreen instead of just closing the card).
      if (boardDialog || light || libraryOpen) return;
      if (chooser) return setChooser(null);
      if (solo) return setSolo(null);
      if (fullscreen) return setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [boardDialog, light, libraryOpen, chooser, solo, fullscreen]);

  const wallName =
    wallMode === "custom"
      ? (activeCustom?.name ?? "Choose a wall")
      : WALL_PRESET_LABEL[preset];

  // The wall-level backdrop set from the library: a custom wall carries it on
  // its record; a preset's lives in the preset-background store. Rendered
  // through the same audited descriptor builder — never a raw string.
  const wallBackdrop: WallBackground | null =
    wallMode === "custom"
      ? (activeCustom?.bg ?? null)
      : (presetBackgrounds[preset] ?? null);
  // `--wall-bg` is the frame hook for the wall's own surface — see the note on
  // `hooked()` in backgrounds.ts. The backdrop is per-wall state so it stays an
  // inline declaration, but wrapped in a var() the frame/tone axes can override
  // it. Nothing sets it today, so the paint is unchanged.
  const rootStyle = backgroundStyle(wallBackdrop, "--wall-bg");

  const soloSection = useMemo(
    () => (solo ? (sections.find((s) => s.id === solo) ?? null) : null),
    [solo, sections],
  );

  const sectionProps = {
    wallKey,
    bgRevision,
    onBgChange: bumpBgRevision,
    view,
    layout,
    query,
    filter,
    readOnly,
    sectionDragging,
    cardDragging,
    onCardDragState: setCardDragging,
    // Section's only use of this is "fork if needed, then tell me where this
    // edit's wall-scoped storage lives" — hence the key, not the sections.
    onEdit: (): string => ensurePersonal().wallKey,
    onOpen: (item: WallItem, list: WallItem[]) =>
      setLight({
        slides: list,
        index: Math.max(0, list.findIndex((x) => x.key === item.key)),
      }),
    onEnlarge: (item: WallItem) =>
      setLight({ slides: [item], index: 0, mode: "enlarge" as const }),
    onBoard: board,
    onModal: (item: WallItem) => setLight({ slides: [item], index: 0 }),
    // A card that can OPEN the preview has to be able to shut it: a double-click
    // slower than Card's deferral window opens the lightbox on its first click
    // and the composer on its second, leaving the editor underneath the modal
    // (§4a gate, task #9). Bails out rather than re-rendering when nothing is
    // open, so calling it on every double-click costs nothing.
    onCloseModal: () => setLight(null),
    onAddCard: addInlineNote,
    onAddSection: (after: WallSection) => addSection(after),
    onCommitCard: commitCard,
    onDiscardCard: discardCard,
    onDropCard: moveCard,
    onDropSection: moveSection,
    onDragStartSection: () => setSectionDragging(true),
    onDragEndSection: () => setSectionDragging(false),
    onSolo: (s: WallSection) => setSolo(s.id),
  };

  return (
    <div
      className={`${styles.root} ${fullscreen ? styles.fs : ""} ${
        subjectColor ? styles.subjColor : ""
      } ${wallBackdrop ? styles.hasBackdrop : ""}`}
      style={rootStyle}
    >
      {/* No self-rendered title: the chrome immersbar carries "Resource Wall"
          in its .view-title slot (VIEW_TITLES map, chrome ruling). A second h2
          here would double-title, and a lone subtitle over the photo stage
          reads poorly — so the toolbar is the first content row. */}
      <div className={styles.bar}>
        {/* Wall switcher */}
        <div className={styles.dd}>
          <Tooltip
            content="Switch walls — the shared presets, or a wall you saved"
            tooltipId="rw-switch"
            side="bottom"
          >
            <button
              type="button"
              className={styles.ddBtn}
              onClick={() => {
                setSwitchTab(wallMode === "custom" ? "my" : "presets");
                setSwitchOpen((o) => !o);
              }}
              aria-expanded={switchOpen}
            >
              <span className={styles.ddIc}><IconFolder /></span>
              <span className={styles.ddName}>{wallName}</span>
              {wallMode === "custom" && activeCustom?.forkedFrom && (
                <span className={styles.ddTag}>Personal</span>
              )}
              <span className={styles.ddChev}><IconChevron /></span>
            </button>
          </Tooltip>
          {switchOpen && (
            <div className={styles.pop} onMouseLeave={() => setSwitchOpen(false)}>
              <div className={styles.tabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={switchTab === "presets"}
                  className={`${styles.tab} ${switchTab === "presets" ? styles.on : ""}`}
                  onClick={() => setSwitchTab("presets")}
                >
                  Presets
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={switchTab === "my"}
                  className={`${styles.tab} ${switchTab === "my" ? styles.on : ""}`}
                  onClick={() => setSwitchTab("my")}
                >
                  My Walls
                </button>
              </div>
              <div className={styles.popList}>
                {switchTab === "presets" ? (
                  WALL_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.popRow} ${
                        wallMode === "preset" && preset === p ? styles.on : ""
                      }`}
                      onClick={() => {
                        openPreset(p);
                        setSwitchOpen(false);
                      }}
                    >
                      {WALL_PRESET_LABEL[p]}
                    </button>
                  ))
                ) : customWalls.length > 0 ? (
                  customWalls.slice(0, 8).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={`${styles.popRow} ${
                        activeCustom?.id === w.id ? styles.on : ""
                      }`}
                      onClick={() => {
                        openCustom(w);
                        setSwitchOpen(false);
                      }}
                    >
                      {w.name}
                      <span className={styles.rowMeta}>
                        {w.layout.length} section{w.layout.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className={styles.popEmpty}>No saved walls yet.</p>
                )}
              </div>
              <button
                type="button"
                className={styles.browse}
                onClick={() => {
                  setSwitchOpen(false);
                  setLibraryOpen(true);
                }}
              >
                Browse all in Library →
              </button>
            </div>
          )}
        </div>

        <div className={styles.spacer} />

        {/* View mode */}
        <div className={styles.viewSeg} role="group" aria-label="View mode">
          {VIEWS.map((v) => (
            <Tooltip key={v.key} content={v.hint} tooltipId={`rw-view-${v.key}`} side="bottom">
              <button
                type="button"
                className={`${styles.viewBtn} ${view === v.key ? styles.on : ""}`}
                onClick={() => setView(v.key)}
                aria-pressed={view === v.key}
              >
                {v.label}
              </button>
            </Tooltip>
          ))}
        </div>

        {/* Search */}
        {searchOpen ? (
          <div className={styles.search}>
            <IconSearch />
            <input
              autoFocus
              className={styles.searchInput}
              value={query}
              placeholder="Search resources…"
              aria-label="Search resources"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={styles.searchX}
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
              aria-label="Close search"
            >
              <IconX />
            </button>
          </div>
        ) : (
          <Tooltip
            content="Find a resource by name across this wall"
            tooltipId="rw-search"
            side="bottom"
          >
            <button
              type="button"
              className={`${styles.iconBtn} ${query ? styles.active : ""}`}
              onClick={() => setSearchOpen(true)}
              aria-label="Search resources"
            >
              <IconSearch />
            </button>
          </Tooltip>
        )}

        {/* Fullscreen */}
        <Tooltip
          content={
            fullscreen ? "Leave fullscreen" : "Fill the screen — for presenting to the class"
          }
          tooltipId="rw-fullscreen"
          side="bottom"
        >
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setFullscreen((f) => !f)}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Present fullscreen"}
          >
            {fullscreen ? <IconCompress /> : <IconExpand />}
          </button>
        </Tooltip>

        {/* Add */}
        {!readOnly && (
          <div className={styles.dd}>
            <Tooltip content="Add a note or a section to this wall" tooltipId="rw-add" side="bottom">
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => setAddOpen((o) => !o)}
                aria-expanded={addOpen}
              >
                <IconPlus />
                <span>Add</span>
              </button>
            </Tooltip>
            {addOpen && (
              <div className={styles.pop} onMouseLeave={() => setAddOpen(false)}>
                {/* No "Add note" here: a note belongs to a SECTION, and a
                    toolbar note has no unambiguous target — the bundle's
                    version always dumped it into the first section
                    (resource-wall.jsx:490). Adding a note lives on each
                    section's own "Add" card, where the target is obvious. */}
                <button
                  type="button"
                  className={styles.popRow}
                  onClick={() => {
                    setAddOpen(false);
                    addSection(sections[sections.length - 1]);
                  }}
                >
                  Section
                </button>
                <button
                  type="button"
                  className={styles.popRow}
                  onClick={() => {
                    setAddOpen(false);
                    newBlankWall();
                  }}
                >
                  New blank wall
                </button>
              </div>
            )}
          </div>
        )}

        {/* Wall menu */}
        <div className={styles.dd}>
          <Tooltip
            content="Filters, layout, and what to do with this wall"
            tooltipId="rw-menu"
            side="bottom"
          >
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label="Wall menu"
            >
              <IconDots />
            </button>
          </Tooltip>
          {menuOpen && (
            <div
              className={`${styles.pop} ${styles.menuPop}`}
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className={styles.popSec}>Filter by type</div>
              <div className={styles.chips}>
                {WALL_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`${styles.chip} ${filter === f ? styles.on : ""}`}
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className={styles.popSec}>Tile height</div>
              <div className={styles.chips}>
                {(
                  [
                    ["natural", "Natural"],
                    ["uniform", "Uniform"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.chip} ${layout === value ? styles.on : ""}`}
                    onClick={() => setLayout(value)}
                    aria-pressed={layout === value}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {!readOnly && (
                <>
                  <div className={styles.popDiv} />
                  <Tooltip
                    content="Tint each section with its subject's color, so you can find a subject at a glance"
                    tooltipId="rw-subjcolor"
                    side="left"
                  >
                    <button
                      type="button"
                      className={styles.popRow}
                      onClick={toggleSubjectColor}
                      aria-pressed={subjectColor}
                    >
                      <span
                        className={`${styles.sw} ${subjectColor ? styles.swOn : ""}`}
                        aria-hidden="true"
                      />
                      Color sections by subject
                    </button>
                  </Tooltip>

                  <div className={styles.popDiv} />
                  <button
                    type="button"
                    className={styles.popRow}
                    onClick={() => {
                      setMenuOpen(false);
                      duplicateWall();
                    }}
                  >
                    Duplicate
                  </button>
                  <Tooltip
                    content="Permanently delete this wall. The resources on it stay in your lessons — only the wall goes."
                    required
                    side="left"
                  >
                    <button
                      type="button"
                      className={`${styles.popRow} ${styles.del}`}
                      disabled={wallMode !== "custom"}
                      onClick={() => {
                        setMenuOpen(false);
                        deleteWall();
                      }}
                    >
                      Delete
                    </button>
                  </Tooltip>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className={styles.sections}>
        {/* "Nothing on this wall yet" is only TRUE once the store can back it.
            A preset's sections are `resolveWall(...)` over usePlanner().lessons,
            and resolveWall returns [] for an empty lesson set (lib/wall-scope.ts)
            — which is every /post load for the whole 11–16s Supabase hydrate. So
            this line used to tell a teacher their wall was bare while their
            resources were still on the wire, and told them the same thing when
            the hydrate FAILED. Until the store settles the answer is unknown, so
            it defers to <PlannerEmpty>, which already owns the pending skeleton
            and the failed-hydrate copy. A SETTLED store still gets the plain
            claim below — deferring forever would strand a genuinely bare wall in
            a permanent skeleton, a worse bug than this one. (PlannerEmpty's own
            settled branch is therefore unreachable from here; its `heading` is
            the required-prop mirror of that claim, kept identical so loosening
            this guard cannot silently change the copy a teacher reads.)
            A CUSTOM wall (`override`) is exempt: its layout is the teacher's own,
            loaded from wall-state, so its emptiness is authored rather than
            un-hydrated and is honest to report immediately. */}
        {sections.length === 0 ? (
          settled || override !== null ? (
            <p className={styles.wallEmpty}>
              Nothing on this wall yet. Pick another wall, or add a section to start one.
            </p>
          ) : (
            <PlannerEmpty
              className={styles.wallEmpty}
              size="sm"
              heading="Nothing on this wall yet. Pick another wall, or add a section to start one."
            />
          )
        ) : (
          sections.map((section) => (
            <Section key={section.id} section={section} {...sectionProps} />
          ))
        )}
        {!readOnly && sections.length > 0 && (
          <button type="button" className={styles.addSec} onClick={() => addSection()}>
            <IconPlus />
            Add section
          </button>
        )}
      </div>

      {/* Solo — one section, everything else hidden */}
      {soloSection && (
        <div className={styles.soloScrim} onClick={() => setSolo(null)} role="presentation">
          <div
            className={styles.solo}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={soloSection.title}
          >
            <div className={styles.soloHead}>
              <h3 className={styles.soloTitle}>{soloSection.title}</h3>
              <span className={styles.soloMeta}>
                {soloSection.items.length} resource
                {soloSection.items.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setSolo(null)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>
            <Section section={soloSection} {...sectionProps} onSolo={() => setSolo(null)} />
          </div>
        </div>
      )}

      {light && (
        <Lightbox
          slides={light.slides}
          index={light.index}
          mode={light.mode}
          readOnly={readOnly}
          onIndexChange={(i) => setLight((l) => (l ? { ...l, index: i } : l))}
          onClose={() => setLight(null)}
          onBoard={(item) => board(item)}
        />
      )}

      {libraryOpen && (
        <WallLibrary
          initialTab={switchTab === "my" ? "my" : "presets"}
          activePreset={wallMode === "preset" ? preset : null}
          activeCustomId={activeCustom?.id ?? null}
          customWalls={customWalls}
          readOnly={readOnly}
          onOpenPreset={(p) => {
            openPreset(p);
            setLibraryOpen(false);
          }}
          onOpenCustom={(w) => {
            openCustom(w);
            setLibraryOpen(false);
          }}
          onPersistCustomWalls={(next) => {
            persistCustomWalls(next);
            // If the active wall was deleted from the library, drop back to its
            // source preset so the surface isn't stranded on a gone wall.
            if (activeCustom && !next.some((w) => w.id === activeCustom.id)) {
              setActiveCustom(null);
              setWallMode("preset");
              setOverride(null);
            }
          }}
          onPresetBackgroundsChange={setPresetBackgrounds}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {/* Board chooser — a card whose content is tagged in several lessons */}
      {chooser && (
        <div className={styles.soloScrim} onClick={() => setChooser(null)} role="presentation">
          <div
            className={styles.chooser}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a Teaching Board"
          >
            <div className={styles.soloHead}>
              <h3 className={styles.soloTitle}>Open Teaching Board for…</h3>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setChooser(null)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>
            <p className={styles.chooserSub}>
              “{chooser.item.label}” is on more than one lesson.
            </p>
            {chooser.lessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                className={styles.chooserRow}
                onClick={() => openBoard(chooser.item.resource, lesson.id)}
              >
                <IconBoard />
                <span>{lesson.title}</span>
              </button>
            ))}
            <button
              type="button"
              className={styles.chooserRow}
              onClick={() => openBoard(chooser.item.resource, null)}
            >
              <IconBoard />
              <span>Board without a lesson</span>
            </button>
          </div>
        </div>
      )}

      {boardDialog && (
        <OpenInBoardDialog
          resource={boardDialog.resource}
          lessonId={boardDialog.lessonId}
          onClose={() => setBoardDialog(null)}
        />
      )}

      {toast && (
        <UndoToast key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
