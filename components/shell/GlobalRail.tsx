"use client";

// GlobalRail.tsx — the slim vertical icon nav strip mounted by the
// planner shell (app/(planner)/layout.tsx) on every planner route.
//
// ── Why it lives here (not under components/daily) ───────────────────────
// The user wants the left rail to be the SITE-WIDE chrome — surfaces that
// belong to "the app" rather than a single view. The right rail is reserved
// for context-specific affordances (Resources, To-dos, Shoutbox, etc.) and
// stays owned by the view. Promoting this rail from Daily/Weekly into the
// shell layer means it appears on Weekly, Daily, Year, Catch-up, Subject,
// and Schedule without each view having to mount its own copy.
//
// A later wave (Lane CD) will let teachers drag-to-move icons between the
// left and right rails with persistence. This file stays unaware of that —
// it only renders the canonical site-wide button set today.
//
// ── Context-gating rule ──────────────────────────────────────────────────
// Some buttons make sense everywhere (Settings gear, To-dos toggle).
// Others only make sense on a specific route — opening the Schedule side-
// panel from /weekly or /year would be meaningless, because there's no
// "current day" the panel can anchor to in those surfaces. We filter by
// `usePathname()`:
//
//   GLOBAL (every planner route):
//     • To-dos toggle    — toggles the planner-wide to-do panel
//     • Chat (comments)  — on /daily wires to the comments slide-out;
//                          on other routes a coming-soon affordance (the
//                          global comments drawer lands Phase 1B)
//     • Resources        — coming-soon affordance everywhere today; on
//                          /daily a future wave will wire it to the right-
//                          rail Resources tab (no global toggle exists yet)
//     • Year overview    — coming-soon affordance (route doesn't exist yet)
//     • Voice note       — coming-soon affordance
//     • Settings gear    — site-wide entry to /settings
//
//   /daily ONLY (context-specific):
//     • Today            — visually-active marker for the daily surface
//     • Schedule trigger — opens the SchedulePanel side-drawer for today
//
// To add a new globally-relevant button: just add a <li> in the JSX below.
// To add a new context-specific button: gate it with `if (isOnDaily)` (or
// the equivalent `pathname?.startsWith(…)` check) so it only mounts on the
// routes that own its behavior.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────
//   • Tailwind = layout only. All color / type / spacing via tokens.css.
//   • The rail is subject-neutral (ink tokens only).
//   • Every interactive button is a ≥44px tap target (WCAG AA).
//   • Icons follow the Lucide-style inline-SVG idiom.
//   • Onboarding tooltips on every button (CLAUDE.md §4).
//   • Reduced motion respected by the consumed form components.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { Button, Tooltip } from "@/components/ui";
// SchedulePanel — the right-side drawer that exposes today's timetable.
// Only mounted when the rail is on /daily; on other routes the trigger
// (and the panel state) doesn't exist.
import { SchedulePanel } from "@/components/schedule";
import styles from "./GlobalRail.module.css";

// ── Icon set ─────────────────────────────────────────────────────────────
// Inline SVGs in the Lucide-style outline idiom. 20×20 rendered size,
// 24×24 viewBox. currentColor strokes follow the button's color token.

function TodayIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2.5" x2="8" y2="6" />
      <line x1="16" y1="2.5" x2="16" y2="6" />
      <rect
        x="10.5"
        y="12.5"
        width="3.5"
        height="3.5"
        rx="0.6"
        fill="currentColor"
      />
    </svg>
  );
}

function ScheduleIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function TodosIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z" />
      <path d="M16 4.5h2a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2" />
      <polyline points="8.5 12 10.5 14 14 10.5" />
      <line x1="8.5" y1="17" x2="15.5" y2="17" />
    </svg>
  );
}

function YearIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="5" height="5" rx="0.8" />
      <rect x="9.5" y="3.5" width="5" height="5" rx="0.8" />
      <rect x="15.5" y="3.5" width="5" height="5" rx="0.8" />
      <rect x="3.5" y="9.5" width="5" height="5" rx="0.8" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
      <rect x="15.5" y="9.5" width="5" height="5" rx="0.8" />
      <rect x="3.5" y="15.5" width="5" height="5" rx="0.8" />
      <rect x="9.5" y="15.5" width="5" height="5" rx="0.8" />
      <rect x="15.5" y="15.5" width="5" height="5" rx="0.8" />
    </svg>
  );
}

function VoiceIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function ChatIcon(): ReactNode {
  // Speech-bubble glyph in the Lucide outline idiom — mirrors the top-bar
  // CommentsIcon so the two surfaces feel like one product.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function ResourcesIcon(): ReactNode {
  // Folder-with-link glyph — matches the right-rail Resources panel
  // affordance (a folder of attached links / slides / handouts / videos).
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11.5z" />
      <path d="M10 13.5l1.5 1.5 3-3" />
    </svg>
  );
}

function SettingsIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.27.652.875 1.106 1.59 1.18H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── GlobalRail ───────────────────────────────────────────────────────────

export function GlobalRail(): ReactNode {
  const {
    todoPanelOpen,
    toggleTodoPanel,
    commentsPanelOpen,
    toggleCommentsPanel,
  } = useAppState();
  // Lessons feed the unread-comments badge on the Chat button — mirrors
  // the top-bar's existing pattern so the two surfaces stay in lockstep.
  const { lessons } = usePlanner();
  const unreadCount = lessons.reduce((n, l) => n + (l.unreadComments ?? 0), 0);
  const router = useRouter();
  const pathname = usePathname();

  // Context filter — the Today and Schedule buttons only make sense on
  // the /daily surface, so we gate them here. Other routes get the
  // global subset (To-dos, Year/Voice coming-soon, Settings).
  const isOnDaily = pathname?.startsWith("/daily") ?? false;

  // Local state for the Schedule side-panel toggle. Only relevant on
  // /daily, but we always declare it (hooks must be unconditional).
  // On other routes the panel + trigger simply never render.
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Choose an aria-label that reflects which route owns the rail. The
  // visual treatment is the same on every route; the label just helps
  // screen-reader users know the buttons in here are global navigation.
  const railAriaLabel = isOnDaily
    ? "Daily view navigation"
    : "Planner navigation";

  return (
    <nav className={styles.rail} aria-label={railAriaLabel}>
      {/* ── Top group: the main surface buttons ────────────────────── */}
      <ul className={styles.list} role="list">
        {/* Today — only on /daily. The button reads as "active" because
            /daily IS the daily surface; clicking it is a no-op refresh.
            Hidden on other routes because there is no current-day
            anchor and the Today affordance lives in the top-bar week
            navigator on /weekly. */}
        {isOnDaily && (
          <li className={styles.item} data-context="daily">
            <Tooltip content="Today" side="right">
              <Button
                variant="icon"
                iconAriaLabel="Today (daily view)"
                aria-pressed={true}
                className={`${styles.button} ${styles.buttonActive}`}
                onClick={() => router.push("/daily")}
              >
                <TodayIcon />
              </Button>
            </Tooltip>
          </li>
        )}

        {/* Schedule — only on /daily. Toggles the SchedulePanel side-
            drawer for today's timetable. A future wave will surface
            an equivalent from Weekly/Subject/etc., but today the
            trigger + panel are scoped to the daily context. */}
        {isOnDaily && (
          <li className={styles.item} data-context="daily">
            <Tooltip
              content="Open the schedule side panel — see your day's timetable while you work in any view"
              side="right"
            >
              <Button
                variant="icon"
                iconAriaLabel={
                  scheduleOpen ? "Close schedule panel" : "Open schedule panel"
                }
                aria-pressed={scheduleOpen}
                className={`${styles.button} ${scheduleOpen ? styles.buttonActive : ""}`}
                onClick={() => setScheduleOpen((o) => !o)}
              >
                <ScheduleIcon />
              </Button>
            </Tooltip>
          </li>
        )}

        {/* To-dos — global. Wired to the planner-wide to-do panel toggle. */}
        <li className={styles.item} data-context="global">
          <Tooltip content="To-dos" side="right">
            <Button
              variant="icon"
              iconAriaLabel={
                todoPanelOpen ? "Close to-do list" : "Open to-do list"
              }
              aria-pressed={todoPanelOpen}
              className={`${styles.button} ${todoPanelOpen ? styles.buttonActive : ""}`}
              onClick={toggleTodoPanel}
            >
              <TodosIcon />
            </Button>
          </Tooltip>
        </li>

        {/* Chat (comments) — global affordance, behavior switches per route.
            Placement rationale: To-dos / Chat / Resources form the "right-
            rail panel openers" cluster. Keeping them adjacent in the rail
            telegraphs "these three toggle the same family of side panels."

            • On /daily — toggles the planner-wide comments slide-out
              (the same panel the top-bar's chat icon opens). aria-pressed
              reflects `commentsPanelOpen` so screen-reader users hear the
              state and the visual active-style matches the To-dos button.
            • Off /daily — renders as an inert coming-soon affordance.
              Comments are lesson-scoped today; a global drawer that picks
              a target lesson lands in Phase 1B. */}
        {isOnDaily ? (
          <li className={styles.item} data-context="global">
            <Tooltip
              content="Open the lesson comments panel — see and reply to what teammates wrote on the lesson you're viewing."
              side="right"
            >
              <div className={styles.badgeWrap}>
                <Button
                  variant="icon"
                  iconAriaLabel={
                    commentsPanelOpen
                      ? "Close comments panel"
                      : `Open comments panel${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`
                  }
                  aria-pressed={commentsPanelOpen}
                  className={`${styles.button} ${commentsPanelOpen ? styles.buttonActive : ""}`}
                  onClick={toggleCommentsPanel}
                >
                  <ChatIcon />
                </Button>
                {/* Unread-comments badge. Hidden via aria-hidden because
                    the count is already surfaced in the iconAriaLabel
                    above so screen-readers don't double-announce it. */}
                {unreadCount > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
            </Tooltip>
          </li>
        ) : (
          <li className={styles.item} data-context="global">
            <Tooltip
              content="Comments are scoped to lessons — coming as a global drawer in Phase 1B."
              side="right"
            >
              {/* <span>, not <button>, so it isn't keyboard-reachable as an
                  interactive control. Same idiom as the Year / Voice
                  coming-soon slots below — `buttonSoon` already applies
                  pointer-events:none + opacity 0.45 to convey "inert". */}
              <span
                className={`${styles.button} ${styles.buttonSoon}`}
                title="Comments — coming soon"
              >
                <span className={styles.iconSlot} aria-hidden="true">
                  <ChatIcon />
                </span>
                <span className={styles.soonChip} aria-hidden="true">
                  soon
                </span>
              </span>
            </Tooltip>
          </li>
        )}

        {/* Resources — global affordance, coming-soon today on every route.
            The right-rail Resources panel exists ONLY on /daily and /weekly,
            and its open-state lives inside RightRail.tsx (a private
            `activeTab` + `railMode` pair persisted to localStorage). There
            is no global `resourcesPanelOpen` in app-state yet, so wiring
            this button to "open the Resources panel" requires either:
              (a) lifting RightRail's tab state into useAppState, or
              (b) adding a one-way "request:resources" event the rail
                  consumes to switch its activeTab.
            Both are out of scope for Lane CF (Lane CD owns the rail-state
            unification wave). For now the button renders as a coming-soon
            affordance everywhere — present in the IA so teachers see it
            on day one, inert until Phase 1B lights it up.

            TODO(lane-cd): wire to RightRail when global panel state lands.

            Onboarding tooltip per CLAUDE.md §4: keeps the voice consistent
            with the Chat tooltip above (verb-first, names the panel,
            explains what's inside). */}
        <li className={styles.item} data-context="global">
          <Tooltip
            content="Open the lesson resources panel — links, slides, handouts, and videos attached to the lesson you're viewing."
            side="right"
          >
            <span
              className={`${styles.button} ${styles.buttonSoon}`}
              title="Resources — coming soon"
            >
              <span className={styles.iconSlot} aria-hidden="true">
                <ResourcesIcon />
              </span>
              <span className={styles.soonChip} aria-hidden="true">
                soon
              </span>
            </span>
          </Tooltip>
        </li>

        {/* Year / month overview — global coming-soon affordance.
            Renders on every route as an inert visual reservation. */}
        <li className={styles.item} data-context="global">
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Year / month overview — coming soon"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <YearIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </li>

        {/* Voice note — global coming-soon affordance. */}
        <li className={styles.item} data-context="global">
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Voice note — coming soon"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <VoiceIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </li>
      </ul>

      {/* ── Schedule side-panel ────────────────────────────────────────
            Only mounted on /daily because the trigger that opens it is
            also gated to /daily. The panel handles its own positioning
            and portal, so we mount it inline at the bottom of the rail. */}
      {isOnDaily && (
        <SchedulePanel
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
        />
      )}

      {/* ── Bottom-pinned settings gear ───────────────────────────────
            Global — renders on every planner route. position:sticky +
            bottom:0 (via the .bottom class) keeps the gear always
            reachable without scrolling, even when the nav is taller
            than the viewport.
            Renders as a Next.js <Link> (not a Button) so it is a real
            navigable anchor — middle-click / cmd-click / "open in new
            tab" all work the way teachers expect from a primary nav
            target. */}
      <div className={styles.bottom} data-context="global">
        <Tooltip
          content="Settings — your team's curriculum and your personal preferences"
          side="right"
        >
          <Link
            href="/settings"
            aria-label="Settings"
            className={styles.button}
          >
            <SettingsIcon />
          </Link>
        </Tooltip>
      </div>
    </nav>
  );
}
