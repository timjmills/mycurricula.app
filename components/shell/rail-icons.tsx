"use client";

// rail-icons.tsx — shared icon-button renderer for the LEFT (GlobalRail) and
// RIGHT (RightIconRail) shell icon rails.
//
// Wave 1.5 Lane FA introduced a teacher-arrangeable rail layout: every icon
// button can live on either rail and be drag-reordered between them. To make
// that work without duplicating the SVG glyphs and the per-icon onClick
// wiring across two rail components, the icons live HERE — both rails just
// pass a `RailIconId` and get back a fully-wired button (icon + tooltip +
// behavior + sortable wrapper).
//
// ── Shared behavior contracts ────────────────────────────────────────────
// Each icon's behavior is preserved exactly as it shipped in the original
// GlobalRail — clicking Settings still navigates to /settings, clicking the
// Chat icon still toggles the comments slide-out on /daily, the unread badge
// still appears on the Chat icon, the coming-soon affordances still render
// as inert <span>s. Wrapping a button in a sortable does not change its
// onClick — dnd-kit uses a small pointer activation distance so a plain
// click is never mis-read as a drag.
//
// ── Drag handle ──────────────────────────────────────────────────────────
// The button itself is the drag handle (per the Lane FA spec). dnd-kit's
// useSortable returns listeners + attributes that we spread onto the
// sortable <li> wrapper. A short activation distance (6px — same as the
// collapse-on-drag pattern in lib/collapse-on-drag.ts) ensures plain clicks
// never become drags.
//
// ── Tooltips ─────────────────────────────────────────────────────────────
// CLAUDE.md §4 mandates an onboarding explanation on every interactive
// control. Each icon preserves its original tooltip copy and adds a
// secondary "Drag to move to the other rail" line so the new arrangement
// affordance is discoverable.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { Button, Tooltip } from "@/components/ui";
import {
  useRailLayout,
  type RailIconId,
  type RailSide,
} from "@/lib/use-rail-layout";
import { RailContextMenu } from "./RailContextMenu";
import styles from "./GlobalRail.module.css";

// ── Icon glyphs ──────────────────────────────────────────────────────────

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

// ── Drag-hint copy ───────────────────────────────────────────────────────
// Appended (as a second line) to every tooltip so the rearrange affordance
// is discoverable.
function dragHint(side: RailSide): string {
  return side === "left"
    ? "Drag to move to the right rail"
    : "Drag to move to the left rail";
}

// ── Sortable rail-button wrapper ─────────────────────────────────────────
// useSortable is called per-icon; the resulting ref + transform + listeners
// drive the visual feedback during drag. The button itself is the drag
// handle, so we spread `listeners` onto the wrapper. A short activation
// distance (configured in lib/collapse-on-drag) ensures plain clicks never
// become drags.

// Long-press threshold and movement tolerance. iOS uses ~500ms and ~10px;
// we match so teachers with mobile habits get the expected affordance.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

interface SortableWrapProps {
  id: RailIconId;
  side: RailSide;
  children: ReactNode;
}

function SortableWrap({ id, side, children }: SortableWrapProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const { moveIcon } = useRailLayout();

  // Context-menu open-point. Null when closed.
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Long-press tracking — refs (not state) because we don't need re-renders
  // while pressing; we only need to remember the timer + initial position
  // across pointer events.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback((): void => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
  }, []);

  // Cleanup on unmount in case a press is in flight when React tears down.
  useEffect(() => clearLongPress, [clearLongPress]);

  // ── Long-press handlers ────────────────────────────────────────────────
  // pointerdown starts a 500ms timer. If the user moves more than 10px
  // (which is also above @dnd-kit's 6px drag-activation threshold) we
  // cancel — that's a drag, not a long-press. If they let go before
  // the timer fires, we cancel — that's a tap. Otherwise the timer fires
  // and we open the context menu at the press position.
  //
  // We deliberately attach these to a SEPARATE pointer-handler set from
  // dnd-kit's. dnd-kit's PointerSensor uses an activation distance of 6px
  // (configured in lib/collapse-on-drag) so a stationary press doesn't
  // activate a drag — both can coexist on the same element. When a drag
  // does activate (movement > 6px), our pointermove handler cancels the
  // long-press timer before it fires.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent): void => {
      // Only listen for touch + pen + primary mouse button. Right-click
      // (button === 2) opens the menu via onContextMenu instead.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pressStart.current = { x: e.clientX, y: e.clientY };
      const startX = e.clientX;
      const startY = e.clientY;
      longPressTimer.current = setTimeout(() => {
        // Fire only if we're still pressing (pressStart wasn't cleared by
        // pointermove/pointerup).
        if (pressStart.current != null) {
          setMenuPos({ x: startX, y: startY });
          clearLongPress();
        }
      }, LONG_PRESS_MS);
    },
    [clearLongPress],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent): void => {
      if (pressStart.current == null) return;
      const dx = e.clientX - pressStart.current.x;
      const dy = e.clientY - pressStart.current.y;
      if (
        dx * dx + dy * dy >
        LONG_PRESS_MOVE_THRESHOLD * LONG_PRESS_MOVE_THRESHOLD
      ) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  const handlePointerUp = useCallback((): void => {
    clearLongPress();
  }, [clearLongPress]);

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    // Right-click opens the menu. Prevent the browser's native menu.
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // CSS.Transform.toString handles browser-vendor prefixes. We append
  // `scale(1.05)` while dragging so the lifted icon reads as floating above
  // the rest — combine into a single transform string so we never set the
  // same CSS property twice on the inline style.
  const baseTransform = CSS.Transform.toString(transform);
  const composedTransform = isDragging
    ? `${baseTransform ?? ""} scale(1.05)`.trim()
    : (baseTransform ?? undefined);

  const style: React.CSSProperties = {
    transform: composedTransform,
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
    // touch-action: none is required by @dnd-kit's TouchSensor so the
    // browser doesn't claim the gesture for scrolling.
    touchAction: "none",
  };

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className={styles.item}
        data-rail-icon={id}
        data-dragging={isDragging ? "true" : "false"}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        {...attributes}
        {...listeners}
      >
        {children}
      </li>
      {menuPos != null && (
        <RailContextMenu
          iconId={id}
          currentSide={side}
          x={menuPos.x}
          y={menuPos.y}
          onSelect={(toSide) => {
            // Append to the end of the destination bucket — simple and
            // predictable for a menu-driven move (the drag affordance
            // keeps fine-grained ordering).
            moveIcon(id, toSide, Number.POSITIVE_INFINITY);
          }}
          onClose={() => setMenuPos(null)}
        />
      )}
    </>
  );
}

// ── RailIcon — the wired button for a given id ────────────────────────────
// One function, big switch on `id`. Each branch returns the exact same
// button JSX that GlobalRail used to render inline. Behavior, tooltip copy,
// active-state styling, and the unread badge are preserved verbatim — the
// drag-hint line is added to every tooltip.

interface RailIconProps {
  id: RailIconId;
  /** Which side the icon currently lives on — used to flip the drag hint
   *  and the tooltip side. */
  side: RailSide;
  /** Route the rail is rendered on — passed in so RightIconRail and
   *  GlobalRail share the same context-gating without re-reading
   *  usePathname twice per icon. */
  pathname: string | null;
}

export function RailIcon({ id, side, pathname }: RailIconProps): ReactNode {
  const {
    todoPanelOpen,
    toggleTodoPanel,
    commentsPanelOpen,
    toggleCommentsPanel,
    scheduleOpen,
    toggleSchedulePanel,
  } = useAppState();
  const { lessons } = usePlanner();
  const router = useRouter();

  const unreadCount = lessons.reduce((n, l) => n + (l.unreadComments ?? 0), 0);
  const isOnDaily = pathname?.startsWith("/daily") ?? false;
  const hint = dragHint(side);
  // Tooltip side mirrors the rail side — left rail = tooltip on the right,
  // right rail = tooltip on the left, so the bubble never paints off-screen.
  const tipSide: "left" | "right" = side === "left" ? "right" : "left";

  let body: ReactNode = null;

  switch (id) {
    case "today": {
      if (isOnDaily) {
        body = (
          <Tooltip content={`Today\n${hint}`} side={tipSide}>
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
        );
      } else {
        body = (
          <Tooltip
            content={`Today — only available on the Daily view\n${hint}`}
            side={tipSide}
          >
            <span
              className={`${styles.button} ${styles.buttonSoon}`}
              title="Today — only available on the Daily view"
            >
              <span className={styles.iconSlot} aria-hidden="true">
                <TodayIcon />
              </span>
            </span>
          </Tooltip>
        );
      }
      break;
    }

    case "schedule":
      body = (
        <Tooltip
          content={`Schedule — today's time blocks, side-panel while you work\n${hint}`}
          side={tipSide}
        >
          <Button
            variant="icon"
            iconAriaLabel={
              scheduleOpen ? "Close schedule panel" : "Open schedule panel"
            }
            aria-pressed={scheduleOpen}
            className={`${styles.button} ${scheduleOpen ? styles.buttonActive : ""}`}
            onClick={toggleSchedulePanel}
          >
            <ScheduleIcon />
          </Button>
        </Tooltip>
      );
      break;

    case "todos":
      body = (
        <Tooltip content={`To-dos\n${hint}`} side={tipSide}>
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
      );
      break;

    case "comments": {
      // User-visible label is "Shoutbox" — the rail icon opens the global
      // Shoutbox panel which now subsumes both team chat and the browse-by-
      // lesson/unit comment index. The state name (commentsPanelOpen /
      // toggleCommentsPanel) and rail-layout id "comments" stay as-is for
      // internal stability per the rename brief.
      body = (
        <Tooltip
          content={`Open the team Shoutbox — quick messages between teachers covering the same lessons and units${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}\n${hint}`}
          side={tipSide}
        >
          <div className={styles.badgeWrap}>
            <Button
              variant="icon"
              iconAriaLabel={
                commentsPanelOpen
                  ? "Close Shoutbox panel"
                  : `Open Shoutbox panel${unreadCount > 0 ? ` (${unreadCount} unread Shoutbox messages)` : ""}`
              }
              aria-pressed={commentsPanelOpen}
              className={`${styles.button} ${commentsPanelOpen ? styles.buttonActive : ""}`}
              onClick={toggleCommentsPanel}
            >
              <ChatIcon />
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
        </Tooltip>
      );
      break;
    }

    case "resources":
      body = (
        <Tooltip
          content={`Open the lesson resources panel — links, slides, handouts, and videos attached to the lesson you're viewing.\n${hint}`}
          side={tipSide}
        >
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Open the lesson resources panel — links, slides, handouts, and videos attached to the lesson you're viewing."
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <ResourcesIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </Tooltip>
      );
      break;

    case "year":
      body = (
        <Tooltip
          content={`Year and month overview — zoom out to see the arc of your year at a glance (coming soon)\n${hint}`}
          side={tipSide}
        >
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Year and month overview — zoom out to see the arc of your year at a glance (coming soon)"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <YearIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </Tooltip>
      );
      break;

    case "voice":
      body = (
        <Tooltip
          content={`Dictate a quick voice note about a lesson — transcribed automatically into the lesson's notes (coming soon)\n${hint}`}
          side={tipSide}
        >
          <span
            className={`${styles.button} ${styles.buttonSoon}`}
            title="Dictate a quick voice note about a lesson — transcribed automatically into the lesson's notes (coming soon)"
          >
            <span className={styles.iconSlot} aria-hidden="true">
              <VoiceIcon />
            </span>
            <span className={styles.soonChip} aria-hidden="true">
              soon
            </span>
          </span>
        </Tooltip>
      );
      break;

    case "settings":
      // Settings is a real navigable Link so middle-click / cmd-click /
      // "open in new tab" all work.
      body = (
        <Tooltip
          content={`Settings — your team's curriculum and your personal preferences\n${hint}`}
          side={tipSide}
        >
          <Link
            href="/settings"
            aria-label="Settings"
            className={styles.button}
          >
            <SettingsIcon />
          </Link>
        </Tooltip>
      );
      break;
  }

  return (
    <SortableWrap id={id} side={side}>
      {body}
    </SortableWrap>
  );
}
