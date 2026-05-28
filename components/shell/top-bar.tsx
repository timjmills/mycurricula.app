"use client";

// top-bar.tsx — app shell top bar.
//
// Sticky chrome bar at the top of every planner view. Left-to-right order:
//   wordmark → panel collapse → view switcher → week jumper →
//   undo/redo → master/personal toggle → view-mode pill (Grid|List) → search →
//   to-do button → comments button (with badge) → profile avatar.
//
// State from useAppState() — including `currentUser`, derived from the
// Supabase Auth session, for the profile avatar. CURRENT_WEEK (mock) seeds the
// week jumper. Desktop-first (~1280px).
//
// TOPBAR-001: bar must fit without horizontal scroll at 1024–1920px.
//   • The search field is collapsible: icon-only at rest, expands to a text
//     input on click/focus, collapses on blur or Escape.
//   • "soon" view tabs are hidden below 1280px (they are non-interactive;
//     hiding them recovers ~210px that would otherwise trigger overflow).
//   • The right cluster (to-do, comments, profile, sign-out) has a minimum
//     padding-right:16px so the last control is never flush with the edge.
//
// W3-C1 chrome-slimming (2026-05-27 audit) — minimum-viable scope shipped.
//   The audit asked us to slim the bar to ONLY: "Where am I? Personal/Team?
//   Where next?" + Help + Profile + Search. Two ambient/secondary controls
//   already collapse below the desktop tier:
//     • Catch-up flame — folds into the More menu at ≤1280 (the entire
//       .rightClusterFull hides there); the More menu re-renders the
//       <CatchupFlameButton /> in its own panel, so the affordance stays
//       reachable on tablet. At ≤540 the flame's module CSS hides it
//       entirely (count remains visible on the in-grid CatchupWeekBar).
//     • Clock chip — hides at ≤900 via Clock.module.css (it's ambient
//       context, not navigation). Not duplicated into the More menu by
//       design: the OS clock + the in-grid week header carry the same
//       information on phone/tablet.
//
//   TODO (next chrome-slim wave): the Grid/List/Schedule toggle below
//   currently lives in the top bar at >1024px. The canonical W3-C1 plan
//   wants it relocated INTO each route's local toolbar (Weekly + Daily
//   own a Grid/List chooser; Schedule is the route itself). That move is
//   a multi-file refactor — Weekly + Daily shells each gain a header
//   slot, the toggle migrates with its viewMode wiring, the .module.css
//   collapse rules drop. Out of scope for this lane (Wave 3 file-disjoint
//   constraint). Track as W4 chrome-relocation when Wave 4 opens.
// TOPBAR-004: the panel-collapse toggle calls useAppState().toggleLeftPanel —
//   confirmed wired (see onClick below).
// TOPBAR-003/006: search → setSearch ✓; view-mode pill → setViewMode ✓.

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppState, type CurrentUser } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { Button, Tooltip, ToggleGroup } from "@/components/ui";
import { CatchupFlameButton } from "./catchup-flame-button";
import { Clock } from "./Clock";
import { SHORTCUTS_TOGGLE_EVENT } from "./global-shortcuts";
import { NotificationBell } from "./NotificationBell";
import { SearchResults } from "./SearchResults";
import { TeamModeIntro } from "./team-mode-intro";
import { TopBarMoreMenu } from "./top-bar-more-menu";
import styles from "./top-bar.module.css";

// ── View definitions ─────────────────────────────────────────────────────
// Views with a route are live links. Views without carry the `soon` flag so
// they render visibly but non-interactively (no route, cursor: default).

interface ViewDef {
  label: string;
  href?: string;
  soon?: boolean;
  /** Onboarding tooltip — explains what this view is FOR. CLAUDE.md §4. */
  tooltip?: string;
}

// Top-bar tab order, left → right: Daily · Weekly · Yearly · Curriculum.
// Yearly is a label rename of the Year route (/year stays the canonical URL).
// Curriculum is a label rename of the Subject route (/subject/[slug] stays the
// canonical URL — "subject" is the data-model entity; "Curriculum" is just the
// chrome label that teachers see).
// The "Unit" SOON tab was retired — units live inside the Curriculum tab.
// Schedule was dropped from primary navigation on 2026-05-25 — the daily
// timetable now lives as a side-pane trigger on the Daily IconRail. The
// `/schedule` route is preserved as a deep link target for shared URLs, but
// it is no longer surfaced in the tab strip or the More menu.
//
// Exported so the More menu (top-bar-more-menu.tsx) can render the same list
// as menu items at ≤768px where the inline tab strip is hidden — see the
// Navigation section in TopBarMoreMenu and the `.viewSwitcher` media-hide in
// top-bar.module.css. Single source of truth: changing the tab order or copy
// here updates both the desktop strip and the phone/tablet menu.
export const VIEWS: ViewDef[] = [
  {
    label: "Daily",
    href: "/daily",
    tooltip:
      "Today's lessons in detail — schedule, lesson cards, and the day's notes",
  },
  {
    label: "Weekly",
    href: "/weekly",
    tooltip:
      "Your full week of lessons across every subject — Grid or List, edit in place",
  },
  {
    label: "Yearly",
    href: "/year",
    tooltip:
      "High-level roadmap of units across the year — see the whole arc at a glance",
  },
  {
    label: "Curriculum",
    href: "/subject",
    tooltip:
      "The full year of units and lessons per subject, with the standards each covers",
  },
];
export type { ViewDef };

// ── TopBar ───────────────────────────────────────────────────────────────

/** App shell top bar — sticky chrome above every planner view. */
export function TopBar(): ReactNode {
  const {
    viewMode,
    setViewMode,
    editMode,
    setEditMode,
    week,
    search,
    setSearch,
    leftPanelOpen,
    toggleLeftPanel,
    todoPanelOpen,
    toggleTodoPanel,
    commentsPanelOpen,
    toggleCommentsPanel,
    currentUser,
  } = useAppState();

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    lessons,
    lastChange,
  } = usePlanner();

  const pathname = usePathname();
  const router = useRouter();

  // TOPBAR-001 — collapsible search state.
  // The search field is hidden at rest (icon-only button shows instead).
  // Clicking the icon or focusing the input reveals the full input field.
  // Blurring with no query, or pressing Escape, collapses it back.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // MED-8 — save indicator. On each planner mutation (detected by lastChange
  // identity changing) we record the wall-clock time and render "Saved HH:MM".
  // `lastChange` is null before the first edit, so we show "All changes saved"
  // until the first mutation arrives.
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    // lastChange is null on mount (no mutations yet) — skip the initial null.
    if (lastChange === null) return;
    setSavedAt(new Date());
  }, [lastChange]);

  // Keep a stable ref to the latest undo/redo so the keydown listener never
  // captures a stale closure — the ref is updated on every render before the
  // effect dependency check runs.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  // ── Global keyboard shortcuts ────────────────────────────────────────
  // Cmd/Ctrl+Z → undo; Cmd/Ctrl+Shift+Z or Ctrl+Y → redo.
  // Skipped when the event target is a text input, textarea, or contentEditable
  // element so that the focused editor's own native undo is not hijacked.
  useEffect(() => {
    function isEditingTarget(target: EventTarget | null): boolean {
      if (!target || !(target instanceof Element)) return false;
      const tag = (target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      // Walk up to catch nested contenteditable (e.g. RichTextEditor).
      return target.closest('[contenteditable="true"]') !== null;
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;
      if (isEditingTarget(e.target)) return;

      const isZ = e.key === "z" || e.key === "Z";
      const isY = e.key === "y" || e.key === "Y";

      if (isZ && !e.shiftKey) {
        // Cmd/Ctrl + Z → undo
        e.preventDefault();
        undoRef.current();
      } else if ((isZ && e.shiftKey) || (isY && !e.shiftKey && e.ctrlKey)) {
        // Cmd/Ctrl + Shift + Z  OR  Ctrl + Y → redo
        e.preventDefault();
        redoRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // intentionally empty — we access latest callbacks via refs

  // Total unread comment count across all live lessons — re-derived on every
  // store mutation so undo/redo keeps the badge accurate.
  const unreadCount = lessons.reduce((n, l) => n + (l.unreadComments ?? 0), 0);

  return (
    <header className={styles.bar}>
      {/* ── Wordmark ──────────────────────────────────────────────────
          The tooltip carries the brand motto so it surfaces on hover
          without crowding the chrome — the full pair lives on the
          login screen; here we keep just the manifesto as a quiet
          tooltip on the home link. Wrapped in the styled <Tooltip>
          primitive (black backdrop / blur / light text) so it matches
          the rest of the chrome instead of rendering as the OS-default
          light-background native title bubble. The native title= is
          kept on the inner element as a cross-engine fallback for
          touch long-press. */}
      {/* Task #27 / audit m3: the wordmark suffix is FREE TEXT, not a
          grade enum. CLAUDE.md §1 mandates multi-grade by design; teachers
          might type "Grade 5", "K-12 Math", "Lower Elementary Reading",
          "Year 7 Science", etc. The label comes from
          currentUser.curriculumLabel (Lane S is building the Settings UI
          that edits it). When the label is absent (real Supabase users
          until the DB column lands), the suffix simply disappears — the
          wordmark reads "MyCurricula" alone. */}
      <Tooltip
        content="Built for teachers, by teachers — click to return to your Weekly planner home"
        side="bottom"
      >
        <Link
          href="/weekly"
          className={styles.wordmark}
          aria-label="MyCurricula home"
          title="Built for teachers, by teachers — click to return to your Weekly planner home"
        >
          <span className={styles.wordmarkApp}>MyCurricula</span>
          {currentUser.curriculumLabel && (
            <span className={styles.wordmarkGrade}>
              {currentUser.curriculumLabel}
            </span>
          )}
        </Link>
      </Tooltip>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Left-panel collapse toggle (TOPBAR-004) ───────────────────
          onClick calls toggleLeftPanel from useAppState() which drives the
          leftPanelOpen boolean. The panel itself is rendered by another agent
          (WeeklyShell / planner layout) — this button is solely responsible
          for toggling the state that controls it. */}
      {/* Lane X verification sample — uses the new Button.tooltip prop
          instead of the manual <Tooltip> wrapper. The tooltip copy follows
          CLAUDE.md §4 onboarding voice: it teaches the first-time teacher
          what the control accomplishes ("Hide the subject/unit/standards
          filters…"), not just what it's named ("Collapse panel"). */}
      <Button
        variant="icon"
        iconAriaLabel={
          leftPanelOpen ? "Collapse filter panel" : "Expand filter panel"
        }
        tooltip={
          leftPanelOpen
            ? "Hide the subject, unit, and standards filters to give the planner more room"
            : "Show the filter panel — narrow the planner to a subject, unit, or set of standards"
        }
        tooltipSide="bottom"
        onClick={toggleLeftPanel}
        aria-expanded={leftPanelOpen}
        className={leftPanelOpen ? styles.iconActive : undefined}
      >
        <PanelLeftIcon />
      </Button>

      {/* This divider sits between the left-panel-collapse toggle and the
          view switcher. At ≤768px the switcher collapses into the More
          menu's Navigation section, so the divider that "frames" it must
          hide alongside the strip — otherwise we'd render a lone hairline
          between two unrelated chunks of chrome. */}
      <div
        className={styles.divider}
        data-tabs-divider="true"
        aria-hidden="true"
      />

      {/* ── View switcher ─────────────────────────────────────────── */}
      {/* RES-CRIT-002 / Round 2: at ≤768px (tablet/phone) the four inline
          tabs (Daily / Weekly / Yearly / Curriculum) cannot fit alongside
          the Logo, Personal/Master toggle, More trigger, and Profile
          avatar within the viewport. They collapse into the More menu's
          Navigation section (rendered by TopBarMoreMenu) via
          `display: none` in the module CSS — see the
          `@media (max-width: 768px)` rule. The data-narrow-hide rules at
          ≤480px still apply when the strip IS visible (>768), so they
          remain on the Yearly/Curriculum tabs. */}
      <nav className={styles.viewSwitcher} aria-label="View">
        {VIEWS.map((v) => {
          if (v.soon) {
            // POLISH-003/TOPBAR-002/QW-4: soon tabs render at low opacity
            // with cursor:not-allowed and a descriptive tooltip. No hover
            // state. The SOON badge is uppercase for consistency. They are
            // hidden below 1280px via CSS (from Wave 2).
            const soonCopy = `Coming soon — ${v.label} view`;
            return (
              <Tooltip key={v.label} content={soonCopy} side="bottom">
                <span
                  className={`${styles.viewTab} ${styles.viewTabSoon}`}
                  aria-disabled="true"
                  title={soonCopy}
                >
                  {v.label}
                  <span className={styles.soonBadge} aria-hidden="true">
                    SOON
                  </span>
                </span>
              </Tooltip>
            );
          }
          const isActive =
            pathname === v.href || pathname.startsWith(v.href + "/");
          // RES-CRIT-002: at phone widths the master/personal toggle must
          // remain visible per CLAUDE.md §4. To keep the bar within the
          // viewport budget at ≤480px we hide the less-used Yearly +
          // Curriculum tabs. The data-narrow attribute drives the CSS
          // media-query hide below. Daily / Weekly are the two primary
          // tabs and stay visible at every width.
          const narrowOnly = v.label === "Yearly" || v.label === "Curriculum";
          // Convert the native title= to the styled <Tooltip> primitive
          // (black backdrop, blur, light text) so the four primary view
          // tabs match the rest of the chrome instead of rendering the
          // OS-default light bubble. The inner Link keeps the same
          // string as title= for touch long-press fallback (Lane X
          // pattern).
          return (
            <Tooltip key={v.label} content={v.tooltip ?? ""} side="bottom">
              <Link
                href={v.href!}
                className={`${styles.viewTab} ${isActive ? styles.viewTabActive : ""}`}
                data-narrow-hide={narrowOnly ? "true" : undefined}
                aria-current={isActive ? "page" : undefined}
                title={v.tooltip}
              >
                {v.label}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {/* Paired with the divider above the switcher — same data attribute
          so the hide rule at ≤768px collapses the tabbed group cleanly. */}
      <div
        className={styles.divider}
        data-tabs-divider="true"
        aria-hidden="true"
      />

      {/* ── Week label — static heading (POLISH-011) ─────────────────
          The top bar previously duplicated the in-grid week-navigation
          trio (Prev / Today / Next). POLISH-011 removes that duplication:
          the top bar keeps only the "Week N" heading as a passive context
          label; the in-grid WeekNavigator (owned by another agent) remains
          the working navigation control. Tooltip explains what "Week N"
          means in the school year per CLAUDE.md §4 onboarding voice. */}
      <Tooltip
        content={`Week ${week} of your school year — use the in-grid Prev/Today/Next controls to navigate`}
        side="bottom"
      >
        <span
          className={styles.weekLabel}
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Current week: Week ${week}`}
          title={`Week ${week} of your school year — use the in-grid Prev/Today/Next controls to navigate`}
        >
          Week {week}
        </span>
      </Tooltip>

      {/* Live Clock — user direction 2026-05-26: "the clock should be in
          the top-bar next to Week 12". Inline variant carries no chip
          background; renders flush with the weekLabel + saveIndicator
          row. Hidden at ≤900px via Clock.module.css to keep the bar's
          collapse budget intact at tablet/phone. */}
      <Clock variant="inline" />

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Save indicator (MED-8) ────────────────────────────────
          Shows "Saved HH:MM" after any mutation; "All changes saved" before
          the first edit. Subtle muted token color so it doesn't compete with
          the primary controls. aria-live="polite" announces changes to screen
          readers without interrupting the teacher mid-action.
          Wrapped in <Tooltip> so the auto-save reassurance copy renders in
          the styled black bubble instead of the native OS title; the inner
          span keeps the same string as a title= fallback. */}
      <Tooltip
        content={
          savedAt
            ? `Your changes are saved automatically — last sync at ${savedAt.toLocaleTimeString()}`
            : "Your changes save automatically as you edit — nothing to do, no Save button to find"
        }
        side="bottom"
      >
        <span
          className={styles.saveIndicator}
          aria-live="polite"
          aria-atomic="true"
          title={
            savedAt
              ? `Your changes are saved automatically — last sync at ${savedAt.toLocaleTimeString()}`
              : "Your changes save automatically as you edit — nothing to do, no Save button to find"
          }
        >
          {savedAt
            ? `Saved ${savedAt.getHours().toString().padStart(2, "0")}:${savedAt.getMinutes().toString().padStart(2, "0")}`
            : "All changes saved"}
        </span>
      </Tooltip>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Undo / Redo ───────────────────────────────────────────── */}
      {/* A paired group of icon buttons. Keyboard shortcuts: Cmd/Ctrl+Z and
          Cmd/Ctrl+Shift+Z (or Ctrl+Y). Button's disabled prop handles the
          non-interactive / faded state; Tooltip carries the label. */}
      <div
        className={styles.undoRedoGroup}
        role="group"
        aria-label="Undo and redo"
      >
        {/* Lane X verification sample — disabled-button tooltip path. Uses
            the new Button.tooltip prop so the styled Tooltip works via the
            wrapper-span (Tooltip.tsx detects the disabled child and binds
            listeners to a <span> wrapper) AND the native title= attribute
            mirrors the value as a belt-and-suspenders fallback for any
            engine that still drops events. Tooltip copy follows CLAUDE.md
            §4 onboarding voice — the disabled-state text explains _why_
            it's disabled, not just that it is. */}
        <Button
          variant="icon"
          iconAriaLabel="Undo"
          onClick={undo}
          disabled={!canUndo}
          tooltip={
            canUndo
              ? `Undo your last change (${undoLabel}) — restores the previous state of the planner`
              : "Nothing to undo yet — make a change first and you'll be able to step back"
          }
          tooltipSide="bottom"
        >
          <UndoIcon />
        </Button>
        <Tooltip
          content={canRedo ? `Redo: ${redoLabel}` : "Nothing to redo"}
          side="bottom"
        >
          <Button
            variant="icon"
            iconAriaLabel="Redo"
            onClick={redo}
            disabled={!canRedo}
          >
            <RedoIcon />
          </Button>
        </Tooltip>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Personal / Master segmented control (POLISH-002/TOPBAR-005/QW-5)
          Migrated to the ToggleGroup primitive (subtle variant, sm size).
          The wrapper div applies .editToggleWrap so CSS can layer a red
          var(--core-mode) fill onto the Master option when it is active —
          scoped via a :global rule targeting [aria-label*="Master"] with
          aria-checked="true" inside .editToggleWrap.

          RES-CRIT-002 fix (Option A): the toggle stays visible at every viewport
          width. The "P | M" short-label behavior is NOT preserved — full labels
          ("Personal" / "Master") are used at all widths. The ToggleGroup
          primitive renders a single <span> per option with no dual-span mechanism
          for CSS-driven label swapping; extending the primitive just for this one
          callsite is not warranted. At 360px the bar fits: both labels are short
          and the sm tray adds only ~84px total. Touch target ≥44px is satisfied
          by the primitive's ::before inflation at ≤900px. */}
      <div className={styles.editToggleWrap}>
        <ToggleGroup
          options={[
            {
              value: "personal",
              label: "Personal",
              ariaLabel: "Personal mode",
              title:
                "Edit YOUR copy of the curriculum — changes only affect your view",
            },
            {
              // Internal value stays "master" — the localStorage key, the
              // EditMode enum, and the master-banner filename all key off
              // it. Only user-facing copy switches to "Team Curriculum"
              // per the Unified Audit Section 0 Decision #2 vocabulary
              // standard ("Personal / Team Curriculum").
              value: "master",
              label: "Team Curriculum",
              ariaLabel: "Team Curriculum mode — changes affect the whole team",
              title:
                "Edit the team's curriculum — changes affect every teacher on your team",
            },
          ]}
          value={editMode}
          onChange={setEditMode}
          variant="subtle"
          size="sm"
          ariaLabel="Edit mode"
          // W2-B3: this is the single high-consequence toggle on the top bar.
          // Per CLAUDE.md §4 the Personal/Team Curriculum tooltip is on the
          // always-on exception list — `tooltipRequired` propagates
          // `required` to each option's wrapping <Tooltip>, so neither the
          // per-id dismissal set nor the global off switch can suppress it.
          tooltipRequired
        />
      </div>

      {/* W2-B1: one-time teaching popover anchored under the toggle. Fires
          the first time a teacher flips to Team Curriculum, then never
          again (keyed by `mycurricula:user:team-mode-introduced`). The
          existing MasterBanner pulse-then-persist runs alongside it; the
          popover teaches the concept BEFORE the first edit. */}
      <TeamModeIntro />

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Layout-mode pill (Grid | List | Schedule) ────────────────
          W3-C2 (2026-05-27 audit): a third Schedule option lives alongside
          Grid + List so the timetable surface is discoverable next to the
          two lesson-layout choices. The GlobalRail Schedule icon (added
          in Decision #6) stays in place — this is the second, more-obvious
          entry point for a teacher who is already looking at Weekly.

          ── Routing approach ───────────────────────────────────────────
          Schedule is NOT widened into app-state.ViewMode. Adding a third
          "schedule" branch to ViewMode would force every callsite of
          useAppState().viewMode (Weekly/Daily renderers, persistence,
          palette logic) to handle a value it never used to see, and the
          Schedule surface already has its own route at /schedule. The
          cleaner wiring is route-derived:
            • `value` reflects pathname when on `/schedule`, otherwise
              the existing viewMode. The toggle paints "Schedule" active
              when the user is on /schedule regardless of the stored
              Grid/List preference.
            • `onChange` routes: Schedule → router.push("/schedule");
              Grid/List → setViewMode(value) (no navigation when already
              on a planner route). This preserves Grid/List memory across
              Schedule round-trips: a teacher in Grid mode who clicks
              Schedule and then clicks Grid lands back in Grid.
            • If the teacher is on /schedule and picks Grid/List we also
              navigate back to /weekly so the layout change is visible.

          Hidden below 1024px by .viewModePillWrap in the CSS — same
          collapse-cascade slot as before. Schedule remains reachable on
          phone/tablet via the GlobalRail icon and the More menu nav. */}
      <div className={styles.viewModePillWrap}>
        <ToggleGroup<"grid" | "list" | "schedule">
          options={[
            {
              value: "grid",
              label: "Grid",
              title:
                "Grid layout — see every subject for the week side-by-side in columns",
            },
            {
              value: "list",
              label: "List",
              title:
                "List layout — a single scrollable stream of lessons grouped by day",
            },
            {
              value: "schedule",
              label: "Schedule",
              title:
                "Open the daily timetable — see the time blocks for each subject",
              // W3-C2: per audit, the new Schedule option is dismissible
              // (it sits next to two long-established controls and isn't
              // high-consequence). The tooltipId scopes the dismissal so
              // the existing Grid/List tooltips stay unaffected.
              tooltipId: "weekly-schedule-toggle",
            },
          ]}
          value={pathname === "/schedule" ? "schedule" : viewMode}
          onChange={(next) => {
            if (next === "schedule") {
              router.push("/schedule");
              return;
            }
            setViewMode(next);
            if (pathname === "/schedule") {
              router.push("/weekly");
            }
          }}
          variant="prominent"
          size="sm"
          ariaLabel="Layout mode"
        />
      </div>

      {/* Push remaining controls to the right */}
      <div className={styles.spacer} aria-hidden="true" />

      {/* ── Full right cluster (visible >1280px) ─────────────────────────
          The five right-side controls — Search / Catch-up / To-do /
          Comments — rendered inline as before. At ≤1280 this wrapper is
          hidden via CSS (`.rightClusterFull` rule in top-bar.module.css)
          and the same controls are reachable from the ⋯ More menu rendered
          below. The Profile avatar is intentionally a sibling, not a
          member of this wrapper — it stays visible at every width because
          it is the only Settings entry point. */}
      <div className={styles.rightClusterFull}>
        {/* ── Search — collapsible (TOPBAR-001) ────────────────────────
            At rest: a 36px icon button (same size as the other icon
            buttons) so the bar fits without horizontal scroll at 1024px.
            Clicking the icon or pressing Enter/Space on it opens the full
            text input and moves focus into it. The input collapses back on
            blur (when the query is empty) or on Escape (always). A
            non-empty query keeps the field open after blur so search
            results stay visible. At ≤1280 the search lives inside the
            ⋯ More menu (TopBarMoreMenu) as an inline input — that path
            keeps every control reachable. */}
        {searchOpen ? (
          // W4-D2: the expanded search input drives BOTH the existing
          // useAppState().search query string (consumed by WeeklyGrid to
          // filter the visible grid) AND the new overlay results panel
          // (<SearchResults> below). The two consumers are intentionally
          // independent — the grid filter is the legacy single-route narrow,
          // the results panel is the global jump-to-anything surface.
          //
          // Tooltip onboarding copy follows CLAUDE.md §4 voice: the search
          // input's first-time-teacher discovery story names the four
          // sources + the click-to-jump affordance, so a teacher who only
          // ever used the planner's old in-grid search learns the global
          // search shape on hover. tooltipId="topbar-search" makes the tip
          // dismissible via the W2-B3 system (it's an explanatory tip, not
          // a high-consequence one — no `required`).
          <Tooltip
            content="Search lessons, standards, resources, and team comments. Click a result to jump there."
            side="bottom"
            tooltipId="topbar-search"
          >
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon} aria-hidden="true">
                <SearchIcon />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                className={styles.searchInput}
                placeholder="Search lessons…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search lessons"
                aria-haspopup="listbox"
                data-search-input
                // Collapse on blur when the query is empty; keep open otherwise
                // so results stay visible after the teacher types something.
                // The SearchResults panel manages its OWN click-outside
                // close — it ignores blurs that move focus into the panel
                // (the panel's mousedown stopPropagation keeps the input
                // focused). When the user clicks a result, SearchResults
                // calls back via onDismiss which clears `search`; the next
                // blur then collapses the input naturally.
                onBlur={() => {
                  if (!search) setSearchOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
              />
            </div>
          </Tooltip>
        ) : (
          <Tooltip
            content="Search lessons, standards, resources, and team comments. Click a result to jump there."
            side="bottom"
            tooltipId="topbar-search"
          >
            <Button
              variant="icon"
              iconAriaLabel="Search lessons"
              data-search-trigger
              onClick={() => {
                setSearchOpen(true);
                // Focus the input on the next frame after it mounts.
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
            >
              <SearchIcon />
            </Button>
          </Tooltip>
        )}
        {/* W4-D2 — overlay results panel anchored under the search input.
            Self-gates on `query.trim() !== ""` and renders nothing on the
            SSR pass. The panel portals to document.body so it escapes the
            top bar's overflow-x: clip. Mounted unconditionally here (not
            inside the searchOpen branch) because the input ref is what
            anchors it — keeping the panel adjacent to its anchor minimizes
            React tree churn when the input collapses. */}
        <SearchResults
          query={search}
          anchorRef={searchInputRef}
          onDismiss={() => {
            // Clear the query so the input collapses on its next blur, and
            // so the grid-level filter (WeeklyGrid) stops narrowing too —
            // the teacher just jumped somewhere new and shouldn't land with
            // a filter still active. Keep searchOpen as-is; the input
            // collapses naturally when blur fires on an empty query.
            setSearch("");
          }}
        />

        {/* ── Layer-3 Catch-up flame badge (planning-doc §1262) ────────
            Self-gates on enabled + total uncovered count > 0. Renders the
            same .badgeWrap/.badge geometry as the comments unread chip but
            tints the chip with var(--catchup). Click navigates to
            /catch-up. */}
        <CatchupFlameButton />

        {/* ── W4-D1 NotificationBell — team activity inbox ────────────
            Bell + count badge + portalled dropdown. Mounts here per the
            audit's "between Catch-up flame and Profile avatar" spec.
            Backed today by a mocked presence layer
            (lib/realtime-presence.ts); the hook contract is the Phase-1B
            seam so swapping to Supabase Realtime is a single-file
            change. The dropdown portals to document.body so it escapes
            the top bar's overflow-x: clip. */}
        <NotificationBell />

        {/* ── To-do panel toggle ──────────────────────────────────────
            tooltip= prop wraps the button in the canonical <Tooltip>
            primitive AND mirrors to title= for touch (Button primitive
            handles both). Onboarding voice per CLAUDE.md §4 — explains
            what the panel is for, not just that it opens. */}
        <Button
          variant="icon"
          iconAriaLabel={
            todoPanelOpen ? "Close to-do panel" : "Open to-do panel"
          }
          tooltip={
            todoPanelOpen
              ? "Close the to-do panel"
              : "Your planning to-dos — non-lesson tasks like print handouts or message a parent"
          }
          tooltipSide="bottom"
          onClick={toggleTodoPanel}
          aria-expanded={todoPanelOpen}
          className={todoPanelOpen ? styles.iconActive : undefined}
        >
          <TodoIcon />
        </Button>

        {/* ── Shoutbox panel toggle with unread badge ─────────────────
            User-visible label is "Shoutbox" — the same internal panel that
            was the "Comments" panel now subsumes both team chat and the
            per-lesson/per-unit comment index. State names
            (commentsPanelOpen / toggleCommentsPanel) stay as-is for
            internal stability per the rename brief. The unread-count is
            appended to the tooltip so a teacher hovering over the badge
            sees both the count and what it means without parsing the
            chip alone. */}
        <div className={styles.badgeWrap}>
          <Button
            variant="icon"
            iconAriaLabel={
              commentsPanelOpen
                ? "Close Shoutbox panel"
                : `Open Shoutbox panel${unreadCount > 0 ? ` (${unreadCount} unread Shoutbox messages)` : ""}`
            }
            tooltip={
              commentsPanelOpen
                ? "Close the Shoutbox panel"
                : `Open the team Shoutbox — quick messages between teachers covering the same lessons and units${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`
            }
            tooltipSide="bottom"
            onClick={toggleCommentsPanel}
            aria-expanded={commentsPanelOpen}
            className={commentsPanelOpen ? styles.iconActive : undefined}
          >
            <CommentsIcon />
          </Button>
          {unreadCount > 0 && (
            <span
              className={styles.badge}
              aria-label={`${unreadCount} unread Shoutbox messages`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* ── Collapsed right cluster — ⋯ More menu (visible ≤1280px) ──────
          At desktop widths ≤1280px the inline right cluster above does not
          fit between the Personal/Master toggle and the viewport edge. The
          More menu absorbs Search / Catch-up / To-do / Comments / Sign Out
          into a single dropdown so every control stays reachable. The menu
          shares state with the desktop controls (no duplicated stores) via
          the props below. Hidden via CSS at >1280. */}
      <div className={styles.rightClusterCollapsed}>
        <TopBarMoreMenu
          search={search}
          setSearch={setSearch}
          todoPanelOpen={todoPanelOpen}
          toggleTodoPanel={toggleTodoPanel}
          commentsPanelOpen={commentsPanelOpen}
          toggleCommentsPanel={toggleCommentsPanel}
          unreadCount={unreadCount}
          tabs={VIEWS}
          activePath={pathname}
        />
      </div>

      {/* ── Help "?" button (W3-C8) ─────────────────────────────────
          Visible discoverable trigger for the keyboard-shortcuts overlay,
          which is now also the route-aware Help surface (shortcuts +
          per-route "About this view" copy + replay-onboarding link). Per
          Decision #10 we EXTEND the existing overlay rather than build a
          new HelpDrawer.

          Both this button and the `?` keyboard shortcut must drive the
          SAME overlay state — they cannot be allowed to diverge. The
          button dispatches a CustomEvent on window which GlobalShortcuts
          listens for; the keyboard path stays untouched. One state, two
          entry points.

          Tooltip: Help is the safety net, so per the brief we mark it
          `required` via tooltipId="help-button" + a `required` flag on
          the Tooltip wrapper. The required flag bypasses the dismissible
          mini-link AND the per-id dismissal — a teacher cannot turn off
          this tooltip even if they've dismissed others. */}
      <Tooltip
        content="Show keyboard shortcuts and a quick guide to this view (or press ?)"
        side="bottom"
        tooltipId="help-button"
        required
      >
        <Button
          variant="icon"
          iconAriaLabel="Open help and keyboard shortcuts"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(SHORTCUTS_TOGGLE_EVENT));
          }}
        >
          <HelpIcon />
        </Button>
      </Tooltip>

      {/* ── Profile avatar → settings ─────────────────────────────── */}
      {/* Keyed on the photo URL so ProfileAvatar's load-error state resets
          whenever the signed-in user changes. */}
      <ProfileAvatar
        key={currentUser.avatarUrl ?? "initials"}
        user={currentUser}
      />

      {/* ── Sign out ──────────────────────────────────────────────── */}
      {/* Native form POST to the /auth/signout route handler, which clears
          the Supabase session and redirects to /login. A plain form keeps
          this working even if the icon button loses its JS handler.
          NOTE: Button primitive hardcodes type="button" so we keep a bespoke
          <button type="submit"> here — the submit semantics are load-bearing. */}
      <form action="/auth/signout" method="post" className={styles.signOutForm}>
        <Tooltip content="Sign out" side="bottom">
          <button
            type="submit"
            className={styles.signOutBtn}
            aria-label="Sign out"
          >
            <SignOutIcon />
          </button>
        </Tooltip>
      </form>
    </header>
  );
}

// ── Profile avatar ───────────────────────────────────────────────────────
// Renders the Google profile photo when the session supplies one; on a load
// failure — or when no photo exists — it falls back to the initials monogram.
// The parent keys this component on the photo URL, so the load-error state
// resets cleanly whenever the signed-in user changes.

function ProfileAvatar({ user }: { user: CurrentUser }): ReactNode {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(user.avatarUrl) && !photoFailed;

  const settingsTip = `Open Settings — your team's curriculum and your personal preferences (${user.name})`;
  return (
    // Unified Settings entry — both the avatar and the IconRail gear
    // (components/daily/IconRail.tsx) point to /settings, which then
    // redirects to the teacher's last-visited sub-page (default
    // /settings/curriculum). One canonical Settings affordance.
    // Wrapped in <Tooltip> so the styled black bubble appears on hover
    // (matches the rest of the chrome); title= mirrors for touch.
    <Tooltip content={settingsTip} side="bottom">
      <Link
        href="/settings"
        className={styles.avatar}
        aria-label={`Profile settings (${user.name})`}
        title={settingsTip}
      >
        {showPhoto ? (
          <Image
            src={user.avatarUrl!}
            alt=""
            width={32}
            height={32}
            className={styles.avatarImg}
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          user.initials
        )}
      </Link>
    </Tooltip>
  );
}

// ── SVG icons ────────────────────────────────────────────────────────────
// All icons are inline SVG, aria-hidden, 18×18 grid.

function PanelLeftIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function SearchIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function TodoIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <polyline points="3 6 4 7 6 5" />
      <polyline points="3 12 4 13 6 11" />
      <polyline points="3 18 4 19 6 17" />
    </svg>
  );
}

function CommentsIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Curved counter-clockwise arrow — standard undo glyph.
function UndoIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7v6h6" />
      <path d="M3 13C5.4 7.4 12.3 4.5 18 7c3.4 1.5 5.5 4.7 5.5 8.2" />
    </svg>
  );
}

// Curved clockwise arrow — standard redo glyph.
function RedoIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 7v6h-6" />
      <path d="M21 13C18.6 7.4 11.7 4.5 6 7c-3.4 1.5-5.5 4.7-5.5 8.2" />
    </svg>
  );
}

// Question-mark in a circle — the canonical Help glyph. Drawn in the same
// 18×18 vocabulary as the other top-bar icons so it reads as a sibling.
function HelpIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.7.5-1.5 1-1.5 2.5" />
      <line x1="12" y1="17" x2="12" y2="17.5" />
    </svg>
  );
}

// Door with an exiting arrow — standard sign-out glyph.
function SignOutIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
