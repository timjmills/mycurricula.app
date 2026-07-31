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
  loadCustomWalls,
  loadPresetBackgrounds,
  loadSubjectColorPref,
  newWallId,
  saveCustomWalls,
  saveSubjectColorPref,
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

export function ResourceWall({
  focusLessonId,
  focusSubject,
  focusUnit,
  anchorKey,
  resourcesFor,
}: ResourceWallProps): ReactNode {
  const readOnly = usePhoneViewport();

  // The landing preset honors whichever anchor the deep link carried (see
  // `anchoredPreset`). Without it a /post?subject=math link would open on Today
  // and silently ignore the anchor.
  //
  // `anchored` is recomputed EVERY render and is NOT a constant: PostClient
  // resolves `?lesson=` against the planner store, which is empty for the whole
  // 11–16s Supabase hydrate, so a deep-linked lesson arrives here as `null` and
  // turns real seconds later. The re-resolve effect below is what catches that.
  const anchored = anchoredPreset({ focusLessonId, focusSubject, focusUnit });
  const [preset, setPreset] = useState<WallPreset>(anchored);
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
  const sections = override ?? presetSections;

  // RE-RESOLVE A LATE ANCHOR. `preset` seeds from `anchored` once, and a seed
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
    if (
      !shouldFollowAnchor({
        anchored,
        preset,
        wallMode,
        teacherChoseWall: teacherChoseWall.current,
        settled,
      })
    ) {
      return;
    }
    setPreset(anchored);
  }, [anchorKey, anchored, preset, wallMode, settled]);

  // localStorage reads are deferred to an effect: the server render and the
  // first client paint must agree (app SSR contract).
  useEffect(() => {
    setCustomWalls(loadCustomWalls());
    setSubjectColor(loadSubjectColorPref());
    setPresetBackgrounds(loadPresetBackgrounds());
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

  const addCard = useCallback(
    (sectionId: string) => {
      withFork((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          // A new note inherits the section's lesson context so "send to board"
          // and the subject color have somewhere to point. A section with no
          // lesson behind it (a hand-made one) yields an empty lessonId, which
          // routes the note to the untagged board.
          const lessonId = s.lessonIds?.[0] ?? s.items[0]?.lessonId ?? "";
          const lessonTitle = s.items[0]?.lessonTitle ?? s.title;
          const resource: LessonResource = { type: "notecard", label: "Note" };
          const item: WallItem = {
            key: `k-${newWallId()}`,
            type: "notecard",
            label: "Note",
            resource,
            subjectId: s.subjectId,
            lessonId,
            lessonTitle,
            // A fresh note is authored onto the wall, not tagged in any lesson,
            // so it has no cross-lesson refs — it routes to the untagged board.
            lessons: lessonId ? [{ id: lessonId, title: lessonTitle }] : [],
            composing: true,
          };
          return { ...s, items: [...s.items, item] };
        }),
      );
    },
    [withFork],
  );

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
  const commitCard = useCallback(
    (item: WallItem) => {
      withFork((prev) =>
        prev.map((s) => ({
          ...s,
          items: s.items.map((it) => (it.key === item.key ? item : it)),
        })),
      );
    },
    [withFork],
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
    setCustomWalls((prev) => {
      const next = [wall, ...prev];      return next;
    });
    setActiveCustom(wall);
    setWallMode("custom");
    setOverride(sections);
    say(`Duplicated as “${wall.name}”`);
  }, [activeCustom, preset, sections, view, say]);

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
  const rootStyle = backgroundStyle(wallBackdrop);

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
    onAddCard: addCard,
    onAddSection: (after: WallSection) => addSection(after),
    onCommitCard: commitCard,
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
