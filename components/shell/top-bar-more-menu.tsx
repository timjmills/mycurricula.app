"use client";

// top-bar-more-menu.tsx — overflow menu for the top bar's right cluster.
//
// At desktop widths ≤1280px the full right-side control cluster
// (Search / Catch-up / To-do / Comments / Sign out) does not fit between
// the Personal/Master toggle and the viewport edge. With `overflow-x: clip`
// on `.bar` (RES-CRIT-001) any overflow is silently hidden — Profile and
// Sign Out are unreachable by mouse/touch at every laptop width in the
// audit window (1024–1280px).
//
// This component absorbs that cluster into a single `⋯ More` button that
// opens a small dropdown menu anchored below the trigger. The button itself
// is the only thing that takes a slot in the top-bar flex row; everything
// else lives inside the panel. Profile avatar stays a sibling of this menu
// (it is the single Settings entry point and must stay visible).
//
// The component owns no business logic — every handler/state is passed in
// from the parent so there is one source of truth for searchOpen,
// todoPanelOpen, commentsPanelOpen, unreadCount, etc. The Sign Out form
// inside the menu mirrors the desktop POST form exactly (server action
// preserved) — only the visual chrome differs.
//
// Dismissal: outside-click (pointerdown capture), Escape key (restores
// focus to the trigger), or selecting a menu item that itself navigates /
// opens a panel (we close after the click so the panel reveal is visible).
//
// Accessibility:
//   • Trigger has aria-haspopup="menu", aria-expanded={open},
//     aria-controls={panelId} when open.
//   • Panel is role="menu" with aria-label="More controls".
//   • Each item is role="menuitem" (or a native <a>/<button>/<input>
//     descendant where semantics matter — search input, sign-out submit).
//   • Touch targets ≥44px on every row (height: 44px in the module CSS).
//   • Reduced-motion: panel open fade is suppressed by the module CSS.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Tooltip } from "@/components/ui";
import { CatchupFlameButton } from "./catchup-flame-button";
import { ThemeQuickSwitch } from "@/components/appearance/theme-quick-switch";
import styles from "./top-bar-more-menu.module.css";

// ── Tab definition (mirrors top-bar.tsx's ViewDef) ──────────────────────────
// Re-declared locally rather than imported to avoid a circular module ref
// (top-bar.tsx imports this component). The shape is intentionally minimal —
// the parent passes the same array it consumes for the desktop tab strip,
// so any change there propagates here automatically.
export interface MoreMenuTab {
  label: string;
  href?: string;
  soon?: boolean;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface TopBarMoreMenuProps {
  /** Current search query (controlled). */
  search: string;
  /** Update the search query — wired to useAppState().setSearch. */
  setSearch: (v: string) => void;
  /** Is the to-do panel currently open? */
  todoPanelOpen: boolean;
  /** Toggle the to-do panel — wired to useAppState().toggleTodoPanel. */
  toggleTodoPanel: () => void;
  /** Is the comments panel currently open? */
  commentsPanelOpen: boolean;
  /** Toggle the comments panel — wired to useAppState().toggleCommentsPanel. */
  toggleCommentsPanel: () => void;
  /** Total unread comments across all live lessons. */
  unreadCount: number;
  /**
   * Navigation tabs — the same VIEWS array consumed by the desktop tab strip
   * in top-bar.tsx. When supplied, the menu renders a Navigation section at
   * the top of the panel with each live tab as a `<Link role="menuitem">`.
   * At ≤768px the inline tab strip is hidden via CSS (see
   * top-bar.module.css), so this section is the only way to navigate
   * between primary views on phone/tablet. Optional — desktop variants
   * that don't need nav can omit it.
   */
  tabs?: MoreMenuTab[];
  /**
   * The current route's pathname, normally `usePathname()` from the
   * top-bar. Used to mark the matching nav row aria-current="page" and to
   * paint it with the active style. Passed in (rather than re-derived via
   * usePathname here) so the parent owns the source of truth for active
   * route — and to keep this component otherwise hook-free apart from its
   * own UI state.
   */
  activePath?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TopBarMoreMenu({
  search,
  setSearch,
  todoPanelOpen,
  toggleTodoPanel,
  commentsPanelOpen,
  toggleCommentsPanel,
  unreadCount,
  tabs,
  activePath,
}: TopBarMoreMenuProps): ReactNode {
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // ── Outside-click + Escape dismissal ─────────────────────────────────────
  // Mirrors the pattern in components/weekly/note-popover.tsx. Pointerdown
  // (capture) catches any click outside the menu root; Escape closes and
  // restores focus to the trigger so keyboard users keep their place.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The search input inside the menu has its own Escape handler that
        // clears the query and stops propagation — that runs first. If the
        // event reaches this listener the search input is not focused (or
        // is empty and the user wants to dismiss the menu).
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  // Focus the search input shortly after the panel opens so keyboard users
  // can start typing immediately. requestAnimationFrame waits for the input
  // to mount.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Wrap a panel item's click so the menu closes after the action runs.
  const runAndClose = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {/* ── Trigger — the ⋯ More button ───────────────────────────────────
          A bespoke <button> rather than the Button primitive because we
          need aria-haspopup / aria-controls / aria-expanded on a single
          element that Tooltip can wrap via cloneElement. The visual
          treatment matches the surrounding icon buttons (44×44 hit area,
          ghost background, ink-500 stroke). */}
      <Tooltip content={open ? "Close menu" : "More controls"} side="bottom">
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          aria-label={
            open ? "Close more controls menu" : "Open more controls menu"
          }
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreIcon />
        </button>
      </Tooltip>

      {/* ── Panel — anchored below-right of the trigger ────────────────────
          Only mounted while open. role="menu" so AT announces the items as
          a menu. Items inside are interactive native controls (button,
          input, link, submit) — each carries its own semantics. */}
      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label="More controls"
          className={styles.panel}
        >
          {/* ── Navigation section — only at ≤768px ───────────────────────
              Round-2 fix (RES-CRIT-002): the desktop inline tab strip is
              hidden at ≤768px because five live tabs + Logo + Personal/
              Master toggle + More + Profile do not fit a 768px viewport
              (let alone phone). The same VIEWS array is passed in via
              the `tabs` prop and rendered here as menuitem links. Soon
              tabs are skipped (they render only as visual placeholders
              on desktop — non-interactive). The active tab matches by
              pathname equality OR pathname-starts-with so nested routes
              like `/boards/<id>` still highlight their parent row. */}
          {tabs && tabs.length > 0 && (
            <>
              <div
                className={styles.navSection}
                role="group"
                aria-label="Views"
              >
                {tabs.map((t) => {
                  if (t.soon || !t.href) return null;
                  const href = t.href;
                  const isActive =
                    activePath === href ||
                    (activePath !== undefined &&
                      activePath.startsWith(href + "/"));
                  return (
                    <Link
                      key={t.label}
                      href={href}
                      role="menuitem"
                      className={`${styles.row} ${isActive ? styles.rowActive : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={close}
                    >
                      <span className={styles.rowLabel}>{t.label}</span>
                    </Link>
                  );
                })}
              </div>
              <div
                className={styles.divider}
                role="separator"
                aria-hidden="true"
              />
            </>
          )}

          {/* ── Search row ────────────────────────────────────────────────
              An inline text input rather than a collapsible trigger — at
              ≤1280px the More menu replaces the desktop's icon-then-expand
              pattern. data-search-input keeps the `\` keyboard shortcut
              wired (lib/use-keyboard-shortcuts.ts:178). */}
          <div className={styles.searchRow} role="menuitem">
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
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (search) {
                    // First Escape: clear the query but keep the menu open.
                    e.stopPropagation();
                    setSearch("");
                  }
                  // Second Escape (empty query): let it bubble so the menu
                  // root handler closes the menu and restores focus.
                }
              }}
            />
          </div>

          <div className={styles.divider} role="separator" aria-hidden="true" />

          {/* ── Catch-up flame ───────────────────────────────────────────
              The flame button self-gates on enabled + uncovered>0, so when
              there is nothing to catch up on it renders nothing and the
              menu skips the row gracefully. We re-use it directly so the
              click → /catch-up navigation, the badge math, and the catchup
              tinting all stay in one place. */}
          <div className={styles.flameRow} role="menuitem">
            <CatchupFlameButton />
          </div>

          {/* ── To-do panel toggle ───────────────────────────────────────
              Mirrors the desktop button's behavior — toggleTodoPanel + the
              aria-expanded reflection. Closing the menu after the click
              keeps the reveal of the to-do panel visible. Tooltip wrap
              per CLAUDE.md §4 — teach first-time teachers what the
              panel does, in the styled black bubble. */}
          <Tooltip
            content={
              todoPanelOpen
                ? "Close the to-do panel"
                : "Your planning to-dos — non-lesson tasks like print handouts or message a parent"
            }
            side="left"
          >
            <button
              type="button"
              role="menuitem"
              className={`${styles.row} ${todoPanelOpen ? styles.rowActive : ""}`}
              onClick={runAndClose(toggleTodoPanel)}
              aria-expanded={todoPanelOpen}
              title={
                todoPanelOpen
                  ? "Close the to-do panel"
                  : "Your planning to-dos — non-lesson tasks like print handouts or message a parent"
              }
            >
              <span className={styles.rowIcon} aria-hidden="true">
                <TodoIcon />
              </span>
              <span className={styles.rowLabel}>
                {todoPanelOpen ? "Close to-do panel" : "Open to-do panel"}
              </span>
            </button>
          </Tooltip>

          {/* ── Team Shoutbox panel toggle (with unread badge) ───────────
              User-visible label is "Team Shoutbox" (W5-E3 disambiguation
              from the per-day "Today's Shoutbox" surface on the Daily
              view). The panel subsumes both team chat and the comment
              index per the rename brief. The unread count chip mirrors the
              desktop badge styling but renders inline on the row's right
              edge rather than absolutely over the icon — the menu row has
              more room to spell out the count and the chip stays a
              sibling, not a layered overlay. */}
          <Tooltip
            content={
              commentsPanelOpen
                ? "Close the Team Shoutbox panel"
                : `Open the Team Shoutbox — quick messages between teachers covering the same lessons and units${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`
            }
            side="left"
          >
            <button
              type="button"
              role="menuitem"
              className={`${styles.row} ${commentsPanelOpen ? styles.rowActive : ""}`}
              onClick={runAndClose(toggleCommentsPanel)}
              aria-expanded={commentsPanelOpen}
              aria-label={
                commentsPanelOpen
                  ? "Close Team Shoutbox panel"
                  : `Open Team Shoutbox panel${unreadCount > 0 ? ` (${unreadCount} unread Team Shoutbox messages)` : ""}`
              }
              title={
                commentsPanelOpen
                  ? "Close the Team Shoutbox panel"
                  : `Open the Team Shoutbox — quick messages between teachers covering the same lessons and units${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`
              }
            >
              <span className={styles.rowIcon} aria-hidden="true">
                <CommentsIcon />
              </span>
              <span className={styles.rowLabel}>
                {commentsPanelOpen ? "Close Team Shoutbox panel" : "Team Shoutbox"}
              </span>
              {unreadCount > 0 && (
                <span
                  className={styles.rowBadge}
                  aria-label={`${unreadCount} unread Team Shoutbox messages`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </Tooltip>

          <div className={styles.divider} role="separator" aria-hidden="true" />

          {/* ── Theme quick-switch ───────────────────────────────────────
              The same miniature theme chips as Settings → Appearance, here
              for one-click access from anywhere. Picking a chip applies +
              persists immediately and the menu STAYS OPEN — flipping
              through themes while watching the app change is the point.
              Full descriptions + the style/palette axes live on the
              Appearance page; the Tooltip on the label teaches that. */}
          <div className={styles.themeRow}>
            <Tooltip
              content="Switch the app's color theme — applies instantly, saved on this device. The full picker (with card style and color intensity) is in Settings → Appearance."
              side="left"
            >
              <Link
                href="/settings/appearance"
                role="menuitem"
                className={styles.themeLabel}
                onClick={close}
                title="Theme — open all appearance settings"
              >
                Theme
              </Link>
            </Tooltip>
            <ThemeQuickSwitch menuSemantics />
          </div>

          <div className={styles.divider} role="separator" aria-hidden="true" />

          {/* ── Sign out — submit form (server action preserved) ─────────
              The form POSTs to /auth/signout exactly as the desktop chrome
              does; the route handler clears the Supabase session and
              redirects to /login. The bespoke <button type="submit"> is
              load-bearing (the Button primitive hardcodes type="button"). */}
          <form
            action="/auth/signout"
            method="post"
            className={styles.signOutRow}
          >
            <Tooltip
              content="Sign out of MyCurricula — you'll be returned to the login screen"
              side="left"
            >
              <button
                type="submit"
                role="menuitem"
                className={styles.row}
                aria-label="Sign out"
                title="Sign out of MyCurricula — you'll be returned to the login screen"
              >
                <span className={styles.rowIcon} aria-hidden="true">
                  <SignOutIcon />
                </span>
                <span className={styles.rowLabel}>Sign out</span>
              </button>
            </Tooltip>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons ────────────────────────────────────────────────────────
// Same 18×18 vocabulary as the rest of the top bar. Stroke-based, inherit
// currentColor so hover/active states pick up the row's color.

function MoreIcon(): ReactNode {
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
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
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
