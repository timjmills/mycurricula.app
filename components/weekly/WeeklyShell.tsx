"use client";

// WeeklyShell.tsx — the Weekly view's shell.
//
//   body row → [icon rail] [weekly canvas]
//
// There is NO lesson-list column for Weekly — the canvas IS the lessons.
//
// ── THE WEEK HAS NO RIGHT PANEL (2026-08-01, user-directed) ─────────────
// It used to. A click on a lesson card opened one, and this file was built
// around that: a resizable <RightRail mode="week">, a <PaneSplitter> between
// it and the canvas, a drag-to-swap panel reorder, an overlay
// <WeeklyRailDrawer> for the ≤1280px band where the inline rail could not
// fit, and three localStorage keys persisting the width, the collapsed state,
// and the panel order. All of it is gone. The instruction was plain: "I don't
// want any right panel on the weekly view — a click should expand the lesson
// and there should be a button to expand all."
//
// So the Week now answers a click IN PLACE. The card expands where it sits
// (lib/week-expansion.ts holds the shared set; each canvas renders it), and
// <WeeklyViewControls> carries one "Expand all" / "Collapse all" control in
// the page header. THREE separate surfaces had to go for that to be true, and
// only two of them lived in this file — the third is the shell-level
// <RightPanel>'s /weekly gate (components/shell/right-panel.tsx), which mounts
// on every planner route and so cannot be suppressed from here. If a lesson
// panel ever reappears on /weekly, check that gate first.
//
// What did NOT go, and must not: the GlobalRail's To-dos and Shoutbox icons.
// The rail was their /weekly home, so deleting it without a new one would
// have left two live icons doing nothing. They now open the same shell-level
// panels every other route uses — see the rewritten /weekly gate.
//
// ── Reuse, not rebuild ──────────────────────────────────────────────────
// One Daily-view component is still consumed verbatim:
//
//   • <IconRail>       — the 56px far-left nav strip; presentational only
//                        in Phase 1A. Subject-neutral chrome, same for
//                        both views.
//
// <RightRail> and <PaneSplitter> are no longer imported here. They are NOT
// deleted from components/daily: /daily is a different surface with a
// different job (CLAUDE.md §3) and still uses both, as does WeeklyShellV1
// (the NEXT_PUBLIC_V2-off fallback, which keeps the whole rail composition
// this file just shed). Same for <WeeklyRailDrawer> and ./drawer-mq — still
// live, still V1's.
//
// The canvas is rendered in a single full-width slot; a thin module wrapper
// carries `min-width: 0; min-height: 0` so it shrinks gracefully.
//
// ── Accessibility ──────────────────────────────────────────────────────
// Every interactive control is keyboard-operable. Expansion is driven from
// the card's own header band (a real button, Enter/Space) and from the header
// control, so the panel-era splitter/drag keyboard affordances are not lost
// capability — they governed chrome that no longer exists.
//
// ── Deep links (UX roadmap item 07) ────────────────────────────────────
// Two halves, both speaking lib/deep-links' frozen scheme:
//
//   READ  — app/(planner)/weekly/page.tsx parses `?week=…&subject=…&
//           lesson=…&grade=…` server-side and passes `initialLink`. A
//           once-on-mount effect applies it: jump to the week, set the
//           subject filter, and when a lesson id resolves open its detail
//           (selectedLessonId → the right rail / drawer) and container-
//           scroll its card into view via the store's house helper
//           scrollPlannerItemIntoView (the same mechanism WeeklyGrid uses
//           for its lastChange effect).
//   WRITE — as the teacher navigates weeks / changes the subject filter /
//           opens a lesson detail, an effect mirrors that SHAREABLE state
//           into the URL with router.replace (never push — no history
//           spam), skipping when the URL already matches. Ephemeral state
//           (open menus, panel sizes, selection-free scroll) never enters
//           the URL, and links never encode Personal/Master mode — each
//           viewer resolves Personal-first per the forking model.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";
import Link from "next/link";
import { PlannerEmpty, Tooltip } from "@/components/ui";
import { useRouter } from "next/navigation";
import { IconRail } from "@/components/daily";
import { WeekNavigator } from "@/components/grid";
import { WeeklyList } from "@/components/list";
import { ScheduleTimeline } from "@/components/schedule";
import { WeeklyViewControls } from "./WeeklyViewControls";
import { WeekColumns } from "./WeekColumns";
import { WeekGridSkeleton } from "./WeekGridSkeleton";
// W5 — the three Week VIEW frames: WeekA (glass, read-only period×day grid),
// WeekColumns (paper, day columns), and WeekC (color, subject lanes). Edit
// mode uses WeekEditBoard, schedule uses ScheduleTimeline, and narrow/list uses
// WeeklyList — so the v1 WeeklyGrid is no longer rendered from this shell at
// all (see renderGridPanel).
import { WeekA, WeekC } from "@/components/week-v2";
import { WeekEditBoard } from "./WeekEditBoard";
// W3.8 — the context that carries the lesson-editor opener down to every
// WeeklyLessonCard (grid, columns, and board parents alike — see the seam note
// in weekly-lesson-card.tsx). B5.7 repointed what it opens: the global unit
// workspace's Lesson mode, not the retired centered popup.
import { OpenLessonEditorContext } from "./weekly-lesson-card";
import {
  getUnitWorkspaceTarget,
  useUnitWorkspace,
} from "@/components/year-v2/workspace-host";
import { useAppState } from "@/lib/app-state";
import {
  WeeklyScheduleProvider,
  useWeeklyScheduleMode,
} from "@/lib/weekly-schedule-state";
import { WeekExpansionProvider, useWeekExpansion } from "@/lib/week-expansion";
import {
  usePlanner,
  usePlannerDataState,
  scrollPlannerItemIntoView,
} from "@/lib/planner-store";
import { useTheme } from "@/lib/theme";
import { useViewEditMode } from "@/lib/edit-mode-state";
import { usePhoneViewport } from "@/lib/use-phone-viewport";
import { buildWeeklyLink, type WeeklyLink } from "@/lib/deep-links";
// The Wall URL for "what resources does this week use?" — see lib/wall-link.
import { weekResourcesHref } from "@/lib/wall-link";
import type { Lesson } from "@/lib/types";
import styles from "./WeeklyShell.module.css";

// ── Print entry point ─────────────────────────────────────────────────────
// The ONLY reason these three additions (Link, IconPrint, and the link in the
// WeekNavigator `actions` slot below) exist: /weekly/print had no inbound link
// anywhere in the app, so a fully-built print template was unreachable —
// against CLAUDE.md §2's "print- and paper-friendly" principle. Deliberately
// mirrors the Year precedent (components/year/YearView.tsx:428-441) so it reads
// as the same affordance, not a new pattern. <Link> rather than a router push,
// so it works without JS and stays keyboard-accessible.
//
// The href carries `?week=` for cold loads and bookmarks. Filters and search
// are NOT in the href: /weekly/print sits under the same (planner) layout, so a
// client-side navigation preserves the AppStateProvider and the sheet reads
// them straight from the store (see WeeklyPrintSheet's precedence note).
// The Resources entry's glyph — a stack of cards, matching the ⋮ menu's "Post"
// row so the two routes to the Wall read as the same destination.
const IconResources = (p: SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 14h5" />
  </svg>
);

const IconPrint = (p: SVGProps<SVGSVGElement>) => (
  <svg
    {...p}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    aria-hidden="true"
  >
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="9" rx="1.5" />
    <path d="M6 14h12v6H6z" />
  </svg>
);


// ── Narrow-viewport breakpoint ────────────────────────────────────────────
// TWO different questions are asked about viewport width on this surface, and
// they have DIFFERENT answers. Keeping them apart is the whole point of this
// comment — one threshold answering both is exactly the bug that was here.
//
//   Q1 "can the SCHEDULE TIMELINE be used here?" → NARROW_MQ, 900px, below.
//      A 5-column period×day timeline is unusable across the whole 360–900px
//      band, and `/schedule` is the dedicated phone/tablet entry for it, so
//      the in-place timeline is withheld for the entire tablet tier too.
//      `isNarrow` also travels into <WeeklyViewControls> so the Schedule
//      option disappears from the toggle rather than becoming a dead choice.
//
//   Q2 "can a multi-day WEEK CANVAS be used here?" → PHONE_MQ (600px), via
//      usePhoneViewport() — NOT this query. See renderGridPanel.
//
// The user's viewMode is LEFT UNCHANGED by either gate, so widening the
// viewport restores their chosen canvas with no preference mutation.

const NARROW_MQ = "(max-width: 900px)";

// The W3-C3 drawer-mode breakpoint that used to be imported and re-exported
// here is gone with the drawer. ./drawer-mq.ts itself stays — WeeklyShellV1
// (the NEXT_PUBLIC_V2-off fallback) still runs the rail + drawer composition
// and imports the leaf directly, as does the weekly barrel.

// ── WeeklyShell ──────────────────────────────────────────────────────────

export interface WeeklyShellProps {
  /** Parsed `/weekly?week=…` deep link from the route page (UX roadmap
   *  item 07). Applied ONCE on mount: navigate to the week, set the
   *  subject filter, and — when `lesson` resolves — open that lesson's
   *  detail and container-scroll its card into view. Absent on a plain
   *  `/weekly` visit. */
  initialLink?: WeeklyLink;
}

/** buildWeeklyLink throws on a week its own parser rejects (1–99). The
 *  write-side URL sync guards with the same bounds so a transient or
 *  out-of-range week state can never crash the effect. */
function isSyncableWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= 99;
}

/**
 * Exported shell — mounts the two Week-wide providers ONCE, so each has a
 * single shared instance above ALL of its consumers:
 *
 *   • <WeeklyScheduleProvider> — the Subject↔Schedule state, written by
 *     <WeeklyViewControls> (in the WeekNavigator actions slot) and read by the
 *     canvas branch inside <WeeklyShellInner>. Without one mount above both,
 *     writer and reader held independent useState copies and the canvas only
 *     switched Grid↔Schedule after a reload.
 *   • <WeekExpansionProvider> — the expanded-card set, written by BOTH the
 *     "Expand all" control (also in the actions slot) and each card's own
 *     click, and read by whichever canvas the frame axis picked. Exactly the
 *     same writer-above-reader problem, so exactly the same shape; the header
 *     button and the cards must be operating on one set or "expand all"
 *     expands nothing anyone can see.
 *
 * Both wrap the WHOLE shell rather than just the body, because the header's
 * actions slot is a consumer of each. The inner component holds all the
 * existing shell logic.
 */
export function WeeklyShell(props: WeeklyShellProps = {}): ReactNode {
  return (
    <WeeklyScheduleProvider>
      <WeekExpansionProvider>
        <WeeklyShellInner {...props} />
      </WeekExpansionProvider>
    </WeeklyScheduleProvider>
  );
}

function WeeklyShellInner({ initialLink }: WeeklyShellProps = {}): ReactNode {
  // The active week is shared planner state — the same source the canvases
  // read. We don't pin a local copy here.
  //
  // `todoPanelOpen` / `commentsPanelOpen` are NOT read any more. They used to
  // drive this shell's overlay drawer; those two icons are now served by the
  // shell-level <RightPanel> on /weekly like on every other route, so nothing
  // in the Weekly subtree needs to know whether they are open. Likewise
  // `selectedDay`, which existed only to day-scope the rail's To-do and
  // Shoutbox panels.
  const {
    week,
    currentWeek,
    setWeek,
    selectedLessonId,
    setSelectedLessonId,
    viewMode,
    filters,
    updateFilters,
  } = useAppState();
  const { lessons, activeGradeId } = usePlanner();
  // Loading/error honesty for the Week VIEW canvases (renderGridPanel). During
  // the Supabase hydrate this is "pending" and the canvas would otherwise paint
  // a full week of false "No lessons" columns; "error" is a failed hydrate. It
  // is permanently "settled" with the Supabase flag OFF, so the mock/v1 path is
  // untouched. See components/ui/PlannerEmpty for the same fix on other surfaces.
  const gridDataState = usePlannerDataState();

  // ── W3.8 seam, B5.7 destination — "Open in editor" ───────────────────
  // The opener travels DOWN via <OpenLessonEditorContext> (provided around
  // the whole body below) so every WeeklyLessonCard — under WeeklyGrid,
  // WeekColumns, or the board — reaches it without per-parent prop
  // threading. What it OPENS changed in B5.7: the shell no longer hosts a
  // lesson popup of its own. It calls the global unit-workspace host, which
  // mounts the same Lesson Planner every other surface uses, so /weekly's
  // editor is the one editor — with the unit rail, the Assessments ·
  // Insights · Prep drawer, and B2's full lesson body — instead of a
  // parallel popup that had none of them.
  //
  // The lesson is looked up for its subject + unit, which scope the
  // workspace. A lesson with NO unit still opens: `focusLessonId` is what
  // the workspace keys on, and the unit only decides whether it can also
  // offer the unit roll-up. An id with no live lesson opens nothing rather
  // than an empty dialog — it can only mean the row was archived from
  // another surface between render and click.
  // Deep links open the lesson they name — see the expand call in the
  // initialLink effect below.
  const { expand: expandLesson } = useWeekExpansion();
  const { openUnitWorkspace } = useUnitWorkspace();
  const openLessonEditor = useCallback(
    (id: string): void => {
      const lesson = lessons.find((l) => l.id === id);
      if (!lesson) return;
      openUnitWorkspace(lesson.subject, lesson.unit, lesson.id);
    },
    [lessons, openUnitWorkspace],
  );
  const router = useRouter();
  // W3.6 — the v2 frame axis picks the Week GRID traversal (see
  // renderGridPanel): Frame B (paper) reads the week as day columns
  // (WeekColumns, the bundle's "WeekB"); glass/color keep the subject×day
  // matrix (WeeklyGrid), whose card shell already re-skins per frame.
  const { frame } = useTheme();
  // W3.8c — Week EDIT mode. Shared across nav by design (edit-mode-state's
  // force-reset rule resets Day, never Week), so the board persists as the
  // teacher moves between views. Drives the highest-precedence branch in
  // renderGridPanel below.
  // Phones are VIEW-ONLY (product decision 2026-07-10 — editing is a
  // tablet+/desktop affordance). The chrome hides the View/Edit toggle on
  // phones; this render-layer guard forces the view canvas so a persisted Week
  // edit flag (Week edit persists across nav, unlike Day) can't strand a phone
  // user in the board with no toggle to leave.
  // `isPhoneViewport` (< 600px, the tablet-tier floor) has a SECOND job in
  // renderGridPanel: it is the gate that forces the List canvas on phones.
  // It is deliberately NOT the 900px `isNarrow` query below — see the two-
  // question note at NARROW_MQ.
  const { isEdit: rawIsEdit } = useViewEditMode("Week");
  const isPhoneViewport = usePhoneViewport();
  const isEdit = rawIsEdit && !isPhoneViewport;

  // Inline schedule-mode state (Subject↔Schedule + Lessons-only↔All). Lives
  // in localStorage so a teacher's choice survives across sessions. The
  // Subject/Schedule + scope toggles render via <WeeklyViewControls> in the
  // page-header actions slot; this hook just exposes the derived booleans for
  // the render branch below. `scheduleMode` is true when Schedule is selected;
  // `includeAllEvents` is true when the Lessons-only/All-events toggle is on
  // "all" (i.e. non-academic blocks should appear in the timeline).
  const { scheduleMode, includeAllEvents } = useWeeklyScheduleMode();

  // ── Narrow-viewport state — SSR-safe matchMedia ───────────────────────
  // Default to false so the server-rendered HTML matches the first client
  // render (a server has no viewport; false ≡ "assume desktop"). A
  // post-mount effect syncs to the real viewport width and subscribes to
  // changes so tablet/phone users who resize into desktop get Grid back.
  // This is the same post-mount SSR-guard pattern used for localStorage
  // hydration elsewhere in this file.
  const [isNarrow, setIsNarrow] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(NARROW_MQ);
    // Sync once on mount — covers the common case where the page loaded
    // on a narrow device; without this we'd miss the first frame.
    setIsNarrow(mq.matches);
    // Subscribe to future viewport changes (orientation flip, DevTools
    // resize, etc.). addEventListener on MediaQueryList is the modern API;
    // browsers that only have addListener also get the polyfill path.
    const handler = (e: MediaQueryListEvent): void => setIsNarrow(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      // Older Safari / Chrome (pre-2020) shipped addListener.
      mq.addListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
      return () => mq.removeListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
    }
  }, []);

  // ── Lessons-for-this-week ─────────────────────────────────────────────
  // Filter once per (lessons, week) change so the consumers below see a
  // stable array identity until something actually moves into / out of the
  // week. It fed the rail's week-aggregated ResourcesPanel; what still needs
  // it is the selected-lesson lookup and the deep-link scroll target.
  // Archived lessons are excluded: WeekColumns hides them from the lanes, so
  // they must also vanish from every shell surface fed by this list (right
  // rail, selected-lesson lookup, drawer, deep-link scroll) — otherwise a
  // lesson archived while selected lingers in the rail/URL (audit Medium).
  const weekLessons = useMemo<Lesson[]>(
    () => lessons.filter((l) => l.week === week && l.archived !== true),
    [lessons, week],
  );

  // ── Navigable week span — drives the lifted WeekNavigator's prev/next
  //    disabled bounds. Same derivation WeeklyGrid + weekly-board use:
  //    min/max of every lesson's `week`. Memoized on the full lesson list
  //    so it only recomputes when lessons are added/removed. Falls back to
  //    the current week when there are no lessons (empty fixture) so the
  //    navigator never produces NaN bounds.
  //
  //    NOTE — this is a week-RANGE clamp for the degenerate zero-lesson case,
  //    not a today-marker: it collapses prev/next to a single navigable week so
  //    the navigator can't step into a void. It used to pin that lone week to
  //    the frozen mock `CURRENT_WEEK` (= 12); it now pins it to the week that
  //    actually contains today, which is also the week the shell opens on, so
  //    an empty plan lands the teacher on a week that matches its own heading
  //    instead of stranding them on week 12. The clamped-basis rule that gates
  //    today-RINGS deliberately does not apply here — navigation wants the
  //    closest week to now in every basis. */
  const { minWeek, maxWeek } = useMemo<{
    minWeek: number;
    maxWeek: number;
  }>(() => {
    if (lessons.length === 0) {
      return { minWeek: currentWeek, maxWeek: currentWeek };
    }
    const weeks = lessons.map((l) => l.week);
    return { minWeek: Math.min(...weeks), maxWeek: Math.max(...weeks) };
  }, [lessons, currentWeek]);

  // ── Selected lesson object — resolves selectedLessonId → Lesson | null ─
  // When a card is selected the Resources panel scopes to that lesson;
  // when null it aggregates across the whole week. The lookup is O(n) but
  // n is small (one week's lessons) and the result is memoized.
  const selectedLesson = useMemo<Lesson | null>(
    () =>
      selectedLessonId
        ? (weekLessons.find((l) => l.id === selectedLessonId) ?? null)
        : null,
    [selectedLessonId, weekLessons],
  );

  // A selection that BECOMES archived is cleared. weekLessons now excludes
  // archived lessons, so selectedLesson resolves null — but the drawer opens
  // on `selectedLessonId !== null` (below), which would hold it open on a
  // lesson no visible weekly surface still shows (audit Medium). Two scopes:
  //  • archived only (checked against the FULL store list) — a selection that
  //    merely left the visible week (cross-week navigation) is untouched;
  //  • TRANSITION only (false→true while selected) — WeeklyList deliberately
  //    shows archived rows, and its row click sets the selection then pushes
  //    /daily; clearing an already-archived selection in that same flush
  //    would strand the /daily handoff without its focused lesson (review
  //    Low #1). Mirrors WeekColumns' archived-transition watcher.
  const prevSelectedArchivedRef = useRef<{
    id: string;
    archived: boolean;
  } | null>(null);
  useEffect(() => {
    const prev = prevSelectedArchivedRef.current;
    if (selectedLessonId === null) {
      prevSelectedArchivedRef.current = null;
      return;
    }
    const sel = lessons.find((l) => l.id === selectedLessonId);
    const archived = sel?.archived === true;
    prevSelectedArchivedRef.current = { id: selectedLessonId, archived };
    if (
      archived &&
      prev !== null &&
      prev.id === selectedLessonId &&
      !prev.archived
    ) {
      setSelectedLessonId(null);
      prevSelectedArchivedRef.current = null;
    }
  }, [selectedLessonId, lessons, setSelectedLessonId]);

  // ── Deep link READ — apply `initialLink` once on mount ────────────────
  // The lesson card to container-scroll once the target week's grid has
  // painted. Held as state (not a ref) so the scroll effect below re-runs
  // when the week's lessons render.
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialLink) return;
    // When the link names a lesson that still exists, the LESSON's week is
    // authoritative — a lesson moved after the link was shared should still
    // be found (strict-but-forgiving, same spirit as the parsers).
    //
    // PHASE-1B: with the Supabase flag ON, `lessons` hydrates async and is
    // (or may be) EMPTY at mount time — this mount-only resolution would
    // then misread every `?lesson=` as "gone" and drop the link's lesson
    // focus. The 1B wave must gate this apply on the store's
    // hydration-ready signal (resolve `initialLink.lesson` once, after
    // lessons have loaded) instead of at mount. Mock data is synchronous
    // today (lib/mock/), so the mount-time read is safe in Phase 1A.
    const target = initialLink.lesson
      ? (lessons.find((l) => l.id === initialLink.lesson) ?? null)
      : null;
    setWeek(target?.week ?? initialLink.week);
    if (initialLink.subject) {
      updateFilters({ subjects: [initialLink.subject] });
    }
    if (target) {
      // Open the detail surface (right rail on desktop, overlay drawer in
      // the 901–1280 band) and queue the container scroll for when the
      // card exists in the DOM. An id that does NOT resolve in the store
      // never reaches setSelectedLessonId / setPendingScrollId — a stale
      // share degrades to "right week, no selection" (§4a L4).
      setSelectedLessonId(target.id);
      setPendingScrollId(target.id);
      // …and OPEN it. Before the panel was removed, `?lesson=` landed on a
      // lesson and its detail appeared in the rail; selecting alone now shows
      // nothing but a ring, so a shared link would arrive at a closed card and
      // silently lose the thing it was shared to show (Codex gate, Medium).
      // `expand` is idempotent, so this cannot toggle a card shut.
      expandLesson(target.id);
    }
    // Mount-only by design: the link is the page's INITIAL state; later
    // navigation must never re-apply it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Container-scroll the deep-linked card into view once it is rendered in
  // the active week. Reuses the store's house scroll mechanism — the same
  // data-planner-item lookup WeeklyGrid's lastChange effect uses — so the
  // grid's own scroll container moves, never the document. rAF defers to
  // after paint so the freshly-switched week has its final layout.
  useEffect(() => {
    if (!pendingScrollId) return;
    if (!weekLessons.some((l) => l.id === pendingScrollId)) {
      // Target absent from the rendered week (archived / filtered out /
      // moved between share and open). Once the week has ANY lessons we
      // know the absence is real rather than a pre-render frame, so clear
      // the pending id — otherwise this effect re-runs on every
      // weekLessons identity change forever (§4a L4). An empty week keeps
      // the id pending so lessons that are still arriving can match.
      if (weekLessons.length > 0) setPendingScrollId(null);
      return;
    }
    const id = pendingScrollId;
    const raf = requestAnimationFrame(() => scrollPlannerItemIntoView(id));
    setPendingScrollId(null);
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollId, weekLessons]);

  // ── Deep link WRITE — mirror shareable state into the URL ─────────────
  // Shareable state ONLY: the active week, the subject filter (when it is
  // exactly one subject — the only shape the link scheme carries), the
  // open lesson detail, and the active grade (grade scoping is always an
  // explicit param, never assumed — CLAUDE.md §1). Ephemeral state (open
  // menus, panel widths, drag state) stays out. Guards against replace
  // loops two ways: the first run after mount is skipped (the URL the
  // teacher loaded is already correct), and a replace only fires when the
  // built URL differs from what the address bar shows.
  const skippedFirstUrlSyncRef = useRef(false);
  useEffect(() => {
    if (!skippedFirstUrlSyncRef.current) {
      skippedFirstUrlSyncRef.current = true;
      return;
    }
    if (!isSyncableWeek(week)) return;
    const subject =
      filters.subjects.length === 1 ? filters.subjects[0] : undefined;
    const href = buildWeeklyLink({
      week,
      subject,
      lesson: selectedLesson?.id,
      grade: activeGradeId ?? undefined,
    });
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== href) {
      // replace, never push — week-to-week browsing must not bloat the
      // Back button; the URL is a live mirror, not a navigation log.
      router.replace(href, { scroll: false });
    }
  }, [week, filters.subjects, selectedLesson, activeGradeId, router]);

  // ── Esc key — clear the lesson selection. Listens on the document so it
  //    fires even when focus is inside the canvas.
  //
  //    What this accomplishes changed with the rail: clearing the selection
  //    used to revert the Resources panel to its week aggregate, and it now
  //    COLLAPSES the expanded card — each canvas watches selectedLessonId for
  //    a set→null transition and drops that id from the expanded set. So Esc
  //    still means "close the thing I opened", which is what a teacher who
  //    pressed it was reaching for; it just closes a card instead of a panel.
  //    It deliberately does NOT collapse the whole week: Esc undoing an
  //    "Expand all" a teacher deliberately chose would be a much larger,
  //    unasked-for undo than the keypress implies.
  //
  //    W3.8 innermost-first guard, B5.7 repointed: while the lesson editor
  //    is open, Esc belongs to it (ExplorerShell's window-level listener
  //    closes it) — this document listener runs FIRST (document before
  //    window) and would ALSO deselect on the same keypress, collapsing the
  //    expanded card and unmounting the "Open in editor" opener before the
  //    dialog's focus-restore could target it (the W3.8 gate's
  //    Esc-falls-to-body bug). Skipping while it is open keeps one Esc =
  //    one close.
  //
  //    Read at EVENT time from the workspace singleton rather than
  //    subscribed with `useUnitWorkspaceTarget()`: subscribing would
  //    re-render this whole shell — the grid, the rail, every card — each
  //    time the workspace opens or closes, to answer a question only this
  //    keydown asks.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (getUnitWorkspaceTarget() !== null) return;
      if (e.key === "Escape" && selectedLessonId !== null) {
        setSelectedLessonId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedLessonId, setSelectedLessonId]);

  // ── Canvas renderer ───────────────────────────────────────────────────
  // One renderer now, not two: the rail panel's is gone, and with a single
  // panel there is nothing to reorder, so the ColumnDragGrip this used to
  // take and place has gone with it.

  function renderGridPanel(): ReactNode {
    // Render selection, in precedence order:
    //   0. isEdit (Week EDIT mode) → WeekEditBoard. Edit WINS over every other
    //      branch below. It cannot collide with the phone-forced List: `isEdit`
    //      is itself `rawIsEdit && !isPhoneViewport` (see above), so on a phone
    //      this branch is already false and the List gate is what runs. On a
    //      tablet the board scrolls internally and stays usable, so the teacher
    //      keeps a single editing surface from 600px up (decision locked by the
    //      orchestrator, W3.8c). The board owns its own `data-pane="grid"`
    //      wrapper, so it is returned directly.
    //   1. Schedule pill ON, and NOT narrow (≤900px) → ScheduleTimeline (week
    //      scope), driven by the inline pill in the Weekly chrome. This is the
    //      one branch still gated at 900px: a 5-column timeline is unusable
    //      across the whole 360–900px band and /schedule is the phone/tablet
    //      entry for it.
    //   2. Phone (< 600px), OR viewMode === "list" at any width → WeeklyList.
    //   3. Default → the frame-picked Week VIEW canvas: paper → WeekColumns,
    //      glass → WeekA, color → WeekC (all self-contained, no props).
    //
    // ── The List force is a PHONE gate, not a narrow gate ─────────────────
    // `showList = isPhoneViewport || viewMode === "list"`. Two thresholds, two
    // questions (see the NARROW_MQ block at the top of this file):
    //
    //   < 600px  — List is FORCED. A multi-day grid genuinely does not fit: at
    //              375px the header controls ("Expand all", the Grid|List
    //              toggle) run off the right edge and Monday clips, which
    //              CLAUDE.md §4 forbids outright — every primary control must be
    //              reachable with no document-level horizontal scroll. List is
    //              a complete surface here, not a dead end: it carries its own
    //              per-day add affordance.
    //   600–900  — the teacher's CHOSEN canvas renders. This is the tablet tier
    //              and the part that was wrong before: `showList = isNarrow ||
    //              viewMode === "list"` unmounted the three Week canvases — it
    //              did not restyle them — for every tablet as well as every
    //              phone, silently overriding a teacher who had picked Grid.
    //              It also diverged from the handoff, whose only
    //              `@media (max-width: 900px)` rule on the view surfaces
    //              (bundled mockup :1253-1258, `7.21.26 …/source-home/views.css`
    //              :615-620) names `.vb-day`, `.vc-day` and `.teach` — the DAY
    //              and TEACH layouts — and no week class at all. The week grids
    //              carry an explicit `min-width` instead (`.vb-week` 920px at
    //              :884, `.vc-week` 760px at :945) with no responsive rule: they
    //              keep their lanes and scroll INSIDE their own container, which
    //              §4 permits — internal element scroll is fine, the DOCUMENT
    //              must not scroll sideways.
    //   > 900px  — unchanged.
    //
    // viewMode is never written by this gate, so a phone user who rotates or
    // resizes past 600px gets their chosen canvas back with no preference
    // mutation, exactly as before.
    //
    // Every branch gets the FULL body width — there is no rail to share it
    // with, so the splitter/rail track math these comments used to carry is
    // gone rather than merely satisfied.
    if (isEdit) {
      // Loading/error honesty for the Week EDIT board — the same 3-state gate
      // the VIEW canvases get below. With the Supabase flag ON a teacher can
      // cold-load /weekly directly into EDIT (cc_editmode persists the mode), so
      // during the 11–16s hydrate WeekEditBoard would otherwise paint a full,
      // false "empty week" board — the exact loading-vs-empty conflation the
      // view branch fixes. pending → the shared day-column skeleton (reused, not
      // a bespoke board-shaped variant); error → the canonical PlannerEmpty
      // "Couldn't load your plan" copy; settled → WeekEditBoard, unchanged.
      // Permanently "settled" with the Supabase flag OFF, so mock/v1 is a no-op.
      // Wrapped in the same columnWithGrip/data-pane="grid" host as the view
      // branch so the loading state occupies exactly the canvas's own box.
      if (gridDataState === "pending" || gridDataState === "error") {
        return (
          <div className={styles.columnWithGrip} data-pane="grid">
            {gridDataState === "pending" ? (
              <WeekGridSkeleton />
            ) : (
              /* heading is the settled-fallback only; PlannerEmpty renders its
                 own "Couldn't load your plan" copy in the "error" branch. */
              <PlannerEmpty heading="No lessons planned for this week yet." />
            )}
          </div>
        );
      }
      // `grip` is omitted, not passed as null: the board's prop is optional
      // and it places nothing when there is no grip to place.
      return <WeekEditBoard />;
    }
    const showList = isPhoneViewport || viewMode === "list";
    const showSchedule = !isNarrow && scheduleMode;
    return (
      <div className={styles.columnWithGrip} data-pane="grid">
        {/* The Subject↔Schedule + Lessons/All toggles that used to live in a
            standalone in-grid "VIEW" bar are now merged into the page-header
            <WeeklyViewControls />. The grid panel renders just the canvas
            below; `scheduleMode` / `includeAllEvents` still drive which
            canvas appears. */}
        {showSchedule ? (
          <ScheduleTimeline scope="week" showNonAcademic={includeAllEvents} />
        ) : showList ? (
          // WeeklyList replaces the grid in the same full-width slot. (It
          // carries its own PlannerEmpty loading/error honesty, so it is gated
          // ABOVE the grid-state branch below.)
          <WeeklyList />
        ) : gridDataState === "pending" ? (
          /* Hydrate in flight (Supabase, 11–16s) — a day-column skeleton in
             place of the canvas so the load never reads as a false "no lessons
             this week". Covers all three view frames (paper/glass/color)
             uniformly; the settled frame branch below is untouched. Permanently
             "settled" with the Supabase flag OFF, so this is a no-op on v1/mock. */
          <WeekGridSkeleton />
        ) : gridDataState === "error" ? (
          /* Hydrate threw — the canonical "Couldn't load your plan" state
             (PlannerEmpty renders its own error copy when the data state is
             "error"), never a silent blank. The heading prop is the graceful
             settled-fallback only; it is never shown in this branch. */
          <PlannerEmpty heading="No lessons planned for this week yet." />
        ) : frame === "paper" ? (
          /* W3.6 — Frame B (paper) reads the week as DAY COLUMNS (the
             bundle's "WeekB"). Same planner data, same rich card (so the
             material register + forking cue carry over), different
             traversal. This renders from the tablet tier up (600px) — the
             ≤900px fall-through to WeeklyList is gone; below 600px the phone
             gate takes the List branch above. See the note above the
             precedence list. */
          <WeekColumns />
        ) : frame === "glass" ? (
          /* W5 — Frame A (glass): the read-only period×day grid. */
          <WeekA />
        ) : (
          /* W5 — Frame C (color): subject lanes of color-forward tiles. Both
             new frames are self-contained (no props), reading the planner +
             app-state stores directly exactly like WeekColumns/WeeklyGrid, so
             selection flows through the shared selectedLessonId the shell's
             URL-sync consumes, and expansion through the shared
             <WeekExpansionProvider> set. The v1 WeeklyGrid is no longer
             reachable from the plain color/glass VIEW frame. */
          <WeekC />
        )}
      </div>
    );
  }

  return (
    /* W3.8 — the provider sits at the very top of the shell tree so every
       card parent (grid slot, columns) can reach the opener. */
    <OpenLessonEditorContext.Provider value={openLessonEditor}>
      <div className={styles.page}>
        {/* The panel-reorder aria-live region that used to sit here is gone
          with the reorder: one panel has no order to announce. */}

        {/* ── Single shared week row ──────────────────────────────────────
          The Weekly view's only header chrome. The former "Weekly View"
          title band was removed; this <WeekNavigator> is lifted here (out
          of the per-canvas renders) so exactly ONE instance exists and it
          is always visible regardless of which canvas (grid / list /
          schedule) is showing below. Its `actions` slot hosts the
          Grid|List|Schedule toggle at the far right, guaranteeing the
          toggle stays reachable in every mode — the schedule timeline has
          no navigator of its own, so a per-canvas toggle would vanish in
          schedule mode and trap the teacher there. */}
        <WeekNavigator
          week={week}
          currentWeek={currentWeek}
          minWeek={minWeek}
          maxWeek={maxWeek}
          onChange={setWeek}
          headingLevel="h1"
          actions={
            <>
              {/* ── Resources → the Wall, on "This Week · Mixed" ────────────
                  THE ONE CAPABILITY THE RAIL REMOVAL COSTS. The old right rail
                  aggregated every resource across the week; nothing else in the
                  product answered that. The replacement is not a rebuilt panel
                  but a route to the Wall's own week preset — ONE resource
                  surface instead of two, so the Wall's sections, per-card
                  colours, photos and composer are not shadowed by a lesser copy
                  that drifts as the Wall gains features.

                  The href comes from `weekResourcesHref()` rather than an
                  inline query string: it names the QUESTION, so this header
                  never learns which preset answers it. <Link>, like Print, so
                  it works without JS and stays keyboard-operable. */}
              <Tooltip
                content="Open this week's resources on the Wall — every resource across every lesson in the week, in one place."
                side="bottom"
                tooltipId="weekly-resources-link"
              >
                <Link
                  href={weekResourcesHref()}
                  className={styles.headerLink}
                  aria-label="Open this week's resources on the Wall"
                  title="Open this week's resources on the Wall"
                >
                  <IconResources width={14} height={14} />
                  Resources
                </Link>
              </Tooltip>

              {/* Print → /weekly/print, the paper-friendly subject × day sheet.
                  See the IconPrint note at the top of this file for why this
                  exists and why the href carries only `?week=`. */}
              <Tooltip
                content="Open a paper-friendly print layout of this week — the grid re-flows as a clean subject × day sheet for printing or saving as a PDF."
                side="bottom"
              >
                <Link
                  href={`/weekly/print?week=${week}`}
                  className={styles.printLink}
                  aria-label="Print this week"
                  title="Open a paper-friendly print layout of this week"
                >
                  <IconPrint width={14} height={14} />
                  Print
                </Link>
              </Tooltip>
              <WeeklyViewControls isNarrow={isNarrow} />
            </>
          }
        />

        {/* ── Body row: icon rail (fixed) + the single canvas ───────────── */}
        <div className={styles.bodyRow}>
          {/* Far-left slim icon nav strip — shared with Daily. */}
          <IconRail />

          {/* One full-width canvas slot, View and Edit alike. Edit used to be
            the special case here — the board mounted alone while View split
            the row with the rail — and now both take the whole row, so the
            branch that existed only to suppress the rail is gone with it.
            renderGridPanel still routes Edit to the board internally. */}
          <div className={styles.body} style={{ gridTemplateColumns: "1fr" }}>
            <div className={styles.gridSlot}>{renderGridPanel()}</div>
          </div>
        </div>

        {/* B5.7 — no lesson popup is mounted here any more. "Open in
            editor" calls the global unit-workspace host (mounted once in
            app/(planner)/layout.tsx), which renders the dialog above every
            planner route. One mount, one focus trap, one scroll lock.

            W3-C3 — and no overlay rail drawer either. It hosted the rail's
            content in the ≤1280px band; with no rail there is nothing for it
            to host. <WeeklyRailDrawer> itself stays in the folder for
            WeeklyShellV1. */}
      </div>
    </OpenLessonEditorContext.Provider>
  );
}
