"use client";

// NotificationBell.tsx — top-bar notification surface (W4-D1).
//
// A bell icon + count badge that lives in the top bar's right cluster
// next to the Catch-up flame. Clicking opens a portalled dropdown listing
// recent team activity ("Sarah edited X", "Omar added a resource to Y",
// "You have 2 new Lesson Comments"). Each row is dismissible; the footer
// has a "Dismiss all" action. Empty state renders the canonical
// <EmptyState> primitive.
//
// W4-D1 minimal-scope contract (Decision #9):
//   • Bell + count + dropdown + dismissals — yes.
//   • Avatars + live cursors — DEFERRED. Initials chips only.
//   • Realtime backend — mocked. See lib/realtime-presence.ts.
//
// Portal:
//   The dropdown uses createPortal to document.body so it escapes the
//   top bar's `overflow-x: clip` (top-bar.module.css §.bar). Same approach
//   as components/ui/Tooltip.tsx and components/schedule/SchedulePanel.tsx.
//
// Interaction:
//   • Click outside → close.
//   • Escape → close + focus the bell.
//   • Click a row with `link` → router.push + dismiss item.
//   • Click ✕ on a row → dismiss item only (panel stays open).
//   • Click "Dismiss all" → dismiss everything (panel stays open and
//     renders the empty state until reopened).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Tooltip } from "@/components/ui";
import {
  useNotifications,
  type NotificationItem,
} from "@/lib/realtime-presence";
import topBarStyles from "./top-bar.module.css";
import styles from "./NotificationBell.module.css";

// ── Position calculation ─────────────────────────────────────────────────
// The dropdown anchors below the bell, right-aligned to the bell's right
// edge so it never sails off the viewport when the bell is near the
// right edge of the top bar (which it always is). Computed in viewport
// (fixed) coordinates — the portal mounts to document.body.

const GAP = 6; // px between bell and panel
const PANEL_WIDTH = 360; // mirrored from .panel width in module CSS
const VIEWPORT_MARGIN = 8;

interface PanelPlacement {
  top: number;
  left: number;
}

function computePlacement(buttonRect: DOMRect): PanelPlacement {
  const vw = window.innerWidth;
  // Right-align under the bell.
  let left = buttonRect.right - PANEL_WIDTH;
  // Clamp into viewport.
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, vw - PANEL_WIDTH - VIEWPORT_MARGIN),
  );
  const top = buttonRect.bottom + GAP;
  return { top, left };
}

// ── Relative time formatter ──────────────────────────────────────────────
// "Just now" / "5m ago" / "2h ago" / "Yesterday" / locale date.
// Pure function — same input → same output, no SSR hazard.

function formatRelative(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(then).toLocaleDateString();
}

// ── Component ────────────────────────────────────────────────────────────

export function NotificationBell(): ReactNode {
  const router = useRouter();
  const { count, items, dismiss, dismissAll } = useNotifications();

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  // Anchor for relative-time formatting in the dropdown. Like the seed
  // anchor in lib/realtime-presence.ts, we use a stable epoch on SSR and
  // refresh post-mount so "5m ago" reads sensibly across deploys without
  // a hydration mismatch.
  const [now, setNow] = useState<number>(() => Date.UTC(2026, 4, 28, 12, 0, 0));
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Measure + position on open ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPlacement(computePlacement(rect));
  }, [open]);

  // ── Click-outside close ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    // mousedown rather than click so the close happens before any
    // would-be click target receives focus — matches the SchedulePanel
    // and TopBarMoreMenu patterns.
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Escape closes + restores focus ─────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // ── Reposition on resize / scroll while open ───────────────────────
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!buttonRef.current) return;
      setPlacement(computePlacement(buttonRef.current.getBoundingClientRect()));
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const toggleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const handleRowClick = useCallback(
    (item: NotificationItem) => {
      dismiss(item.id);
      if (item.link) {
        router.push(item.link);
        setOpen(false);
      }
    },
    [dismiss, router],
  );

  const handleDismissOne = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>, id: string) => {
      e.stopPropagation();
      dismiss(id);
    },
    [dismiss],
  );

  // Visible badge text — same 99+ ceiling as the comments / catch-up badges.
  const badgeText = useMemo(() => {
    if (count === 0) return null;
    return count > 99 ? "99+" : String(count);
  }, [count]);

  const tooltipContent = useMemo<ReactNode>(() => {
    if (count === 0) {
      return (
        <>
          <strong>Team activity</strong> — recent edits, comments, and shared
          resources from your team. Nothing new right now.
        </>
      );
    }
    return (
      <>
        <strong>Team activity</strong> — recent edits, comments, and shared
        resources from your team. {count} new item{count === 1 ? "" : "s"}.
      </>
    );
  }, [count]);

  return (
    <div className={topBarStyles.badgeWrap}>
      <Tooltip
        content={tooltipContent}
        side="bottom"
        tooltipId="notification-bell"
      >
        <button
          ref={buttonRef}
          type="button"
          className={`${styles.bellBtn} ${open ? styles.bellBtnOpen : ""}`}
          aria-label={
            count > 0
              ? `Open team activity (${count} new)`
              : "Open team activity"
          }
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={toggleOpen}
        >
          <BellIcon />
        </button>
      </Tooltip>
      {badgeText !== null && (
        <span
          className={`${topBarStyles.badge} ${styles.notifBadge}`}
          aria-hidden="true"
        >
          {badgeText}
        </span>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <NotificationPanel
            ref={panelRef}
            placement={placement}
            items={items}
            count={count}
            now={now}
            onClose={() => setOpen(false)}
            onDismissOne={handleDismissOne}
            onDismissAll={dismissAll}
            onRowClick={handleRowClick}
          />,
          document.body,
        )}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────

interface PanelProps {
  ref: React.Ref<HTMLDivElement>;
  placement: PanelPlacement | null;
  items: NotificationItem[];
  count: number;
  now: number;
  onClose: () => void;
  onDismissOne: (e: ReactMouseEvent<HTMLButtonElement>, id: string) => void;
  onDismissAll: () => void;
  onRowClick: (item: NotificationItem) => void;
}

function NotificationPanel({
  ref,
  placement,
  items,
  count,
  now,
  onClose,
  onDismissOne,
  onDismissAll,
  onRowClick,
}: PanelProps): ReactNode {
  // Render offscreen during the first measurement tick so we don't flash
  // at (0, 0) before computePlacement fires.
  const positionStyle: CSSProperties =
    placement !== null
      ? { top: placement.top, left: placement.left }
      : { top: -9999, left: -9999, opacity: 0 };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Team activity"
      className={styles.panel}
      style={positionStyle}
      // Stop clicks inside the panel from bubbling to the click-outside
      // handler. The handler also explicitly checks `panelRef.contains`,
      // but stopPropagation is belt-and-braces for nested portals.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>
          Team activity
          {count > 0 && <span className={styles.headerCount}>{count} new</span>}
        </h2>
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel="Close team activity"
          onClick={onClose}
          tooltip="Close team activity — your dismissals are saved"
          tooltipSide="bottom"
        >
          <CloseIcon />
        </Button>
      </header>

      {items.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            size="sm"
            heading="You're all caught up."
            body="When teammates edit shared lessons or post comments, you'll see them here."
          />
        </div>
      ) : (
        <>
          <div className={styles.list} role="list">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                now={now}
                onClick={() => onRowClick(item)}
                onDismiss={(e) => onDismissOne(e, item.id)}
              />
            ))}
          </div>
          <footer className={styles.footer}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismissAll}
              tooltip="Mark every item as read — they won't reappear after a refresh"
              tooltipSide="top"
            >
              Dismiss all
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────

interface RowProps {
  item: NotificationItem;
  now: number;
  onClick: () => void;
  onDismiss: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}

function NotificationRow({
  item,
  now,
  onClick,
  onDismiss,
}: RowProps): ReactNode {
  const hasLink = Boolean(item.link);
  const time = useMemo(() => formatRelative(item.ts, now), [item.ts, now]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!hasLink) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const avatarStyle: CSSProperties | undefined =
    item.actor !== null ? { background: item.actor.avatarColor } : undefined;

  return (
    <div
      role={hasLink ? "button" : "listitem"}
      tabIndex={hasLink ? 0 : -1}
      className={`${styles.row} ${hasLink ? "" : styles.rowStatic}`}
      onClick={hasLink ? onClick : undefined}
      onKeyDown={handleKeyDown}
    >
      <span
        className={`${styles.avatar} ${item.actor === null ? styles.avatarSystem : ""}`}
        style={avatarStyle}
        aria-hidden="true"
      >
        {item.actor !== null ? item.actor.initials : <SystemIcon />}
      </span>
      <div className={styles.rowBody}>
        <span className={styles.rowTitle}>{item.title}</span>
        {item.body && <span className={styles.rowSub}>{item.body}</span>}
        <span className={styles.rowTime}>{time}</span>
      </div>
      <button
        type="button"
        className={styles.dismissBtn}
        aria-label={`Dismiss notification: ${item.title}`}
        onClick={onDismiss}
        title="Dismiss this notification"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

// ── Inline SVGs ──────────────────────────────────────────────────────────
// Single-stroke, currentColor, matching the rest of the top-bar icon set.

function BellIcon(): ReactNode {
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
      {/* Bell body */}
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      {/* Clapper */}
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number } = {}): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function SystemIcon(): ReactNode {
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
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12" y2="16.5" />
    </svg>
  );
}
