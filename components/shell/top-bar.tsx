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
// TOPBAR-004: the panel-collapse toggle calls useAppState().toggleLeftPanel —
//   confirmed wired (see onClick below).
// TOPBAR-003/006: search → setSearch ✓; view-mode pill → setViewMode ✓.

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState, type CurrentUser } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { Button, Tooltip, ToggleGroup } from "@/components/ui";
import { CatchupFlameButton } from "./catchup-flame-button";
import styles from "./top-bar.module.css";

// ── View definitions ─────────────────────────────────────────────────────
// Views with a route are live links. Views without carry the `soon` flag so
// they render visibly but non-interactively (no route, cursor: default).

interface ViewDef {
  label: string;
  href?: string;
  soon?: boolean;
}

// Top-bar tab order, left → right: Daily · Weekly · Yearly · Curriculum · Schedule.
// Yearly is a label rename of the Year route (/year stays the canonical URL).
// Curriculum is a label rename of the Subject route (/subject/[slug] stays the
// canonical URL — "subject" is the data-model entity; "Curriculum" is just the
// chrome label that teachers see).
// The "Unit" SOON tab was retired — units live inside the Curriculum tab.
const VIEWS: ViewDef[] = [
  { label: "Daily", href: "/daily" },
  { label: "Weekly", href: "/weekly" },
  { label: "Yearly", href: "/year" },
  { label: "Curriculum", href: "/subject" },
  { label: "Schedule", href: "/schedule" },
];

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
          The `title` carries the brand motto so it surfaces on hover
          without crowding the chrome — the full pair lives on the
          login screen; here we keep just the manifesto as a quiet
          tooltip on the home link. */}
      <Link
        href="/weekly"
        className={styles.wordmark}
        aria-label="MyCurricula home"
        title="Built for teachers, by teachers."
      >
        <span className={styles.wordmarkApp}>MyCurricula</span>
        <span className={styles.wordmarkGrade}>Grade 5</span>
      </Link>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Left-panel collapse toggle (TOPBAR-004) ───────────────────
          onClick calls toggleLeftPanel from useAppState() which drives the
          leftPanelOpen boolean. The panel itself is rendered by another agent
          (WeeklyShell / planner layout) — this button is solely responsible
          for toggling the state that controls it. */}
      <Tooltip
        content={
          leftPanelOpen ? "Collapse filter panel" : "Expand filter panel"
        }
        side="bottom"
      >
        <Button
          variant="icon"
          iconAriaLabel={
            leftPanelOpen ? "Collapse filter panel" : "Expand filter panel"
          }
          onClick={toggleLeftPanel}
          aria-expanded={leftPanelOpen}
          className={leftPanelOpen ? styles.iconActive : undefined}
        >
          <PanelLeftIcon />
        </Button>
      </Tooltip>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── View switcher ─────────────────────────────────────────── */}
      <nav className={styles.viewSwitcher} aria-label="View">
        {VIEWS.map((v) => {
          if (v.soon) {
            // POLISH-003/TOPBAR-002/QW-4: soon tabs render at low opacity
            // with cursor:not-allowed and a descriptive tooltip. No hover
            // state. The SOON badge is uppercase for consistency. They are
            // hidden below 1280px via CSS (from Wave 2).
            return (
              <span
                key={v.label}
                className={`${styles.viewTab} ${styles.viewTabSoon}`}
                aria-disabled="true"
                title={`Coming soon — ${v.label} view`}
              >
                {v.label}
                <span className={styles.soonBadge} aria-hidden="true">
                  SOON
                </span>
              </span>
            );
          }
          const isActive =
            pathname === v.href || pathname.startsWith(v.href + "/");
          return (
            <Link
              key={v.label}
              href={v.href!}
              className={`${styles.viewTab} ${isActive ? styles.viewTabActive : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Week label — static heading (POLISH-011) ─────────────────
          The top bar previously duplicated the in-grid week-navigation
          trio (Prev / Today / Next). POLISH-011 removes that duplication:
          the top bar keeps only the "Week N" heading as a passive context
          label; the in-grid WeekNavigator (owned by another agent) remains
          the working navigation control. */}
      <span
        className={styles.weekLabel}
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Current week: Week ${week}`}
      >
        Week {week}
      </span>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Save indicator (MED-8) ────────────────────────────────
          Shows "Saved HH:MM" after any mutation; "All changes saved" before
          the first edit. Subtle muted token color so it doesn't compete with
          the primary controls. aria-live="polite" announces changes to screen
          readers without interrupting the teacher mid-action. */}
      <span
        className={styles.saveIndicator}
        aria-live="polite"
        aria-atomic="true"
        title={
          savedAt
            ? `Last saved at ${savedAt.toLocaleTimeString()}`
            : "All changes saved"
        }
      >
        {savedAt
          ? `Saved ${savedAt.getHours().toString().padStart(2, "0")}:${savedAt.getMinutes().toString().padStart(2, "0")}`
          : "All changes saved"}
      </span>

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
        <Tooltip
          content={canUndo ? `Undo: ${undoLabel}` : "Nothing to undo"}
          side="bottom"
        >
          <Button
            variant="icon"
            iconAriaLabel="Undo"
            onClick={undo}
            disabled={!canUndo}
          >
            <UndoIcon />
          </Button>
        </Tooltip>
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
            },
            {
              value: "master",
              label: "Master",
              ariaLabel: "Master mode — changes affect the whole team",
            },
          ]}
          value={editMode}
          onChange={setEditMode}
          variant="subtle"
          size="sm"
          ariaLabel="Edit mode"
        />
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── View-mode pill (Grid | List) ─────────────────────────────
          Migrated to the ToggleGroup primitive (prominent variant, sm size).
          BUILD_STANDARD §7 designates Grid/List as a primary mode switch →
          prominent. Hidden below 1024px by .viewModePillWrap in the CSS
          (mirrors the old .viewModePill display:none rule).

          Schedule mode is NOT a value here — it is controlled by inline
          pills inside each view's own chrome (Weekly + Daily). The
          dedicated `/schedule` route renders the Schedule day-pane
          directly. Keeping this toggle 2-way preserves the top-bar
          collapse cascade unchanged. */}
      <div className={styles.viewModePillWrap}>
        <ToggleGroup
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
          value={viewMode}
          onChange={setViewMode}
          variant="prominent"
          size="sm"
          ariaLabel="Layout mode"
        />
      </div>

      {/* Push remaining controls to the right */}
      <div className={styles.spacer} aria-hidden="true" />

      {/* ── Search — collapsible (TOPBAR-001) ────────────────────────
          At rest: a 36px icon button (same size as the other icon buttons)
          so the bar fits without horizontal scroll at 1024px. Clicking the
          icon or pressing Enter/Space on it opens the full text input and
          moves focus into it. The input collapses back on blur (when the
          query is empty) or on Escape (always). A non-empty query keeps the
          field open after blur so search results stay visible. This pattern
          keeps every control reachable without a "More" overflow menu. */}
      {searchOpen ? (
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
            data-search-input
            // Collapse on blur when the query is empty; keep open otherwise
            // so results stay visible after the teacher types something.
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
      ) : (
        <Tooltip content="Search lessons" side="bottom">
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

      {/* ── Layer-3 Catch-up flame badge (planning-doc §1262) ────────
          Self-gates on enabled + total uncovered count > 0. Renders the
          same .badgeWrap/.badge geometry as the comments unread chip but
          tints the chip with var(--catchup). Click navigates to /catch-up. */}
      <CatchupFlameButton />

      {/* ── To-do panel toggle ────────────────────────────────────── */}
      <Button
        variant="icon"
        iconAriaLabel={todoPanelOpen ? "Close to-do panel" : "Open to-do panel"}
        onClick={toggleTodoPanel}
        aria-expanded={todoPanelOpen}
        className={todoPanelOpen ? styles.iconActive : undefined}
      >
        <TodoIcon />
      </Button>

      {/* ── Comments panel toggle with unread badge ───────────────── */}
      <div className={styles.badgeWrap}>
        <Button
          variant="icon"
          iconAriaLabel={
            commentsPanelOpen
              ? "Close comments panel"
              : `Open comments panel${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`
          }
          onClick={toggleCommentsPanel}
          aria-expanded={commentsPanelOpen}
          className={commentsPanelOpen ? styles.iconActive : undefined}
        >
          <CommentsIcon />
        </Button>
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

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

  return (
    <Link
      href="/settings/appearance"
      className={styles.avatar}
      aria-label={`Profile settings (${user.name})`}
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
