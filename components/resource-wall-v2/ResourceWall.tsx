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

import { Tooltip, UndoToast } from "@/components/ui";
import { OpenInBoardDialog } from "@/components/boards";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
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

export function ResourceWall({
  focusLessonId,
  focusSubject,
  focusUnit,
  resourcesFor,
}: ResourceWallProps): ReactNode {
  const readOnly = usePhoneViewport();

  // The landing preset honors whichever anchor the deep link carried, narrowest
  // first: a unit (which rides on a subject) → Unit View, a subject → Subject
  // View, a lesson → Current Lesson, else the everyday Today wall. Without this
  // a /post?subject=math link would open on Today and silently ignore the anchor.
  const [preset, setPreset] = useState<WallPreset>(() => {
    if (focusSubject && focusUnit) return "unit";
    if (focusSubject) return "subject";
    if (focusLessonId) return "lesson";
    return "today";
  });
  const [wallMode, setWallMode] = useState<WallMode>("preset");
  const [activeCustom, setActiveCustom] = useState<CustomWall | null>(null);
  const [customWalls, setCustomWalls] = useState<CustomWall[]>([]);

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
    setWallMode("preset");
    setPreset(p);
    setActiveCustom(null);
    setOverride(null); // drop the override so the live projection returns
  }, []);

  const openCustom = useCallback((wall: CustomWall) => {
    setWallMode("custom");
    setActiveCustom(wall);
    setOverride(wall.layout);
    setView(wall.view);
  }, []);

  // ── Auto-fork ─────────────────────────────────────────────────────────────

  /**
   * The lazy fork. Editing a preset copies the CURRENT projection into a new
   * "My Walls" entry and switches to it; editing an existing custom wall is a
   * no-op. Returns the sections the caller should mutate, because setState is
   * async — a mutator that re-read `sections` here would still see the pre-fork
   * value.
   */
  const ensurePersonal = useCallback((): WallSection[] => {
    const current = override ?? presetSections;
    if (wallMode === "custom") return current;
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
    return current;
  }, [override, presetSections, wallMode, preset, view, say]);

  /** Apply a change to the wall's sections, forking first if needed. */
  const withFork = useCallback(
    (mutate: (sections: WallSection[]) => WallSection[]) => {
      const base = ensurePersonal();
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

  // Identity of the wall on screen — the custom wall's id, else the preset id.
  // Scopes each section's "this section" background so it can't bleed onto
  // another wall that (post-fork/duplicate) shares the same section ids.
  const wallKey = wallMode === "custom" ? (activeCustom?.id ?? preset) : preset;

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
    onEdit: ensurePersonal,
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
        {sections.length === 0 ? (
          <p className={styles.wallEmpty}>
            Nothing on this wall yet. Pick another wall, or add a section to start one.
          </p>
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
