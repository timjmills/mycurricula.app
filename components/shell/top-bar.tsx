"use client";

// top-bar.tsx — app shell top bar.
//
// Sticky chrome bar at the top of every planner view. Left-to-right order:
//   wordmark → panel collapse → view switcher → week jumper →
//   undo/redo → master/personal toggle → view-mode pill → search →
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
import styles from "./top-bar.module.css";

// ── View definitions ─────────────────────────────────────────────────────
// Views with a route are live links. Views without carry the `soon` flag so
// they render visibly but non-interactively (no route, cursor: default).

interface ViewDef {
  label: string;
  href?: string;
  soon?: boolean;
}

const VIEWS: ViewDef[] = [
  { label: "Weekly", href: "/weekly" },
  { label: "Daily", href: "/daily" },
  { label: "Subject", href: "/subject" },
  { label: "Schedule", soon: true },
  { label: "Unit", soon: true },
  { label: "Year", soon: true },
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
      <button
        type="button"
        className={`${styles.iconBtn} ${leftPanelOpen ? styles.iconBtnActive : ""}`}
        onClick={toggleLeftPanel}
        aria-label={
          leftPanelOpen ? "Collapse filter panel" : "Expand filter panel"
        }
        aria-expanded={leftPanelOpen}
      >
        <PanelLeftIcon />
      </button>

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
          Cmd/Ctrl+Shift+Z (or Ctrl+Y). Disabled state prevents interaction
          and meets WCAG AA contrast via the .iconBtnDisabled modifier. */}
      <div
        className={styles.undoRedoGroup}
        role="group"
        aria-label="Undo and redo"
      >
        <button
          type="button"
          className={`${styles.iconBtn} ${!canUndo ? styles.iconBtnDisabled : ""}`}
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title={canUndo ? `Undo: ${undoLabel}` : "Nothing to undo"}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${!canRedo ? styles.iconBtnDisabled : ""}`}
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title={canRedo ? `Redo: ${redoLabel}` : "Nothing to redo"}
        >
          <RedoIcon />
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── Personal / Master segmented control (POLISH-002/TOPBAR-005/QW-5)
          Two-option pill: the active option gets a paper background + shadow
          (editToggleBtnActive); the inactive option is muted. A 1px separator
          div between the two options provides visible structural separation so
          the pair reads as two distinct choices rather than a single label.
          aria-pressed on each button communicates the selection to assistive
          technology. The floating bullet dot has been removed — the pill active
          state provides sufficient visual differentiation. The red Master active
          style and the heads-up banner behavior are preserved unchanged. */}
      <div className={styles.editToggle} role="group" aria-label="Edit mode">
        <button
          type="button"
          className={`${styles.editToggleBtn} ${
            editMode === "personal" ? styles.editToggleBtnActive : ""
          }`}
          onClick={() => setEditMode("personal")}
          aria-pressed={editMode === "personal"}
        >
          Personal
        </button>
        {/* Visible 1px separator between the two options — confirms to the
            teacher that these are two distinct, independent choices. */}
        <span className={styles.editToggleSep} aria-hidden="true" />
        <button
          type="button"
          className={`${styles.editToggleBtn} ${styles.editToggleBtnMaster} ${
            editMode === "master" ? styles.editToggleBtnMasterActive : ""
          }`}
          onClick={() => setEditMode("master")}
          aria-pressed={editMode === "master"}
          title="Changes in Master mode affect the whole team"
        >
          Master
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* ── View-mode pill (Simple | Task | Grid) ─────────────────── */}
      <div
        className={styles.viewModePill}
        role="group"
        aria-label="View detail level"
      >
        {(["simple", "task", "grid"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`${styles.viewModeBtn} ${
              viewMode === mode ? styles.viewModeBtnActive : ""
            }`}
            onClick={() => setViewMode(mode)}
            aria-pressed={viewMode === mode}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
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
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Search lessons"
          title="Search lessons"
          data-search-trigger
          onClick={() => {
            setSearchOpen(true);
            // Focus the input on the next frame after it mounts.
            requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
        >
          <SearchIcon />
        </button>
      )}

      {/* ── To-do panel toggle ────────────────────────────────────── */}
      <button
        type="button"
        className={`${styles.iconBtn} ${todoPanelOpen ? styles.iconBtnActive : ""}`}
        onClick={toggleTodoPanel}
        aria-label={todoPanelOpen ? "Close to-do panel" : "Open to-do panel"}
        aria-expanded={todoPanelOpen}
      >
        <TodoIcon />
      </button>

      {/* ── Comments panel toggle with unread badge ───────────────── */}
      <div className={styles.badgeWrap}>
        <button
          type="button"
          className={`${styles.iconBtn} ${commentsPanelOpen ? styles.iconBtnActive : ""}`}
          onClick={toggleCommentsPanel}
          aria-label={
            commentsPanelOpen
              ? "Close comments panel"
              : `Open comments panel${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`
          }
          aria-expanded={commentsPanelOpen}
        >
          <CommentsIcon />
        </button>
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
          this working even if the icon button loses its JS handler. */}
      <form action="/auth/signout" method="post" className={styles.signOutForm}>
        <button
          type="submit"
          className={styles.iconBtn}
          aria-label="Sign out"
          title="Sign out"
        >
          <SignOutIcon />
        </button>
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
