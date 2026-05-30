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
import { useRailsDragIntro } from "@/lib/use-rails-drag-intro";
import { RailContextMenu } from "./RailContextMenu";
import {
  TodayIcon,
  ScheduleIcon,
  TodosIcon,
  YearIcon,
  VoiceIcon,
  ChatIcon,
  ResourcesIcon,
  SettingsIcon,
} from "./rail-icon-meta";
import styles from "./GlobalRail.module.css";

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
  /** True when this icon is the first on its rail AND eligible for the
   *  W3-C7 first-session drag-intro pulse. Only the left rail's first
   *  icon ever passes true (see GlobalRail.tsx). */
  isFirstOnRail: boolean;
  children: ReactNode;
}

// W3-C7 pulse duration — matches the .itemIntro keyframes (1s × 2 iters).
// We mark-introduced after the pulse finishes so subsequent renders skip
// the class and the localStorage gate stays consistent across reloads.
const DRAG_INTRO_PULSE_MS = 2000;

function SortableWrap({
  id,
  side,
  isFirstOnRail,
  children,
}: SortableWrapProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const { moveIcon } = useRailLayout();

  // W3-C7 — first-session drag-intro pulse. The hook is SSR-safe: `mounted`
  // is false on the server and on the first client render, so we never
  // paint the animation until a post-mount effect has read localStorage.
  // `playIntro` becomes true only when this is the eligible icon AND the
  // teacher has never been introduced — at which point we paint the
  // .itemIntro class, schedule a 2s timeout to call markIntroduced(), and
  // then strip the class so the icon settles back to normal.
  const {
    mounted: dragIntroMounted,
    hasIntroduced,
    markIntroduced,
  } = useRailsDragIntro();
  const [playIntro, setPlayIntro] = useState(false);

  useEffect(() => {
    if (!dragIntroMounted) return;
    if (!isFirstOnRail) return;
    if (hasIntroduced) return;
    // Eligible: paint the pulse, then mark-introduced after the keyframes
    // finish (2s total). Cleanup clears the timer if the icon unmounts
    // mid-pulse (route change, layout swap) so we don't call setState on
    // an unmounted instance.
    setPlayIntro(true);
    const t = setTimeout(() => {
      markIntroduced();
      setPlayIntro(false);
    }, DRAG_INTRO_PULSE_MS);
    return () => clearTimeout(t);
  }, [dragIntroMounted, isFirstOnRail, hasIntroduced, markIntroduced]);

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
        className={`${styles.item} ${playIntro ? styles.itemIntro : ""}`.trim()}
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
  /** W3-C7: when true, this icon plays the first-session drag-intro pulse
   *  once per teacher (gated by `mycurricula:user:rails-drag-introduced`).
   *  Only the left rail's first icon ever passes true; the bottom-pinned
   *  settings slot and every right-rail icon default to false. */
  isFirstOnRail?: boolean;
}

export function RailIcon({
  id,
  side,
  pathname,
  isFirstOnRail = false,
}: RailIconProps): ReactNode {
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
      // User-visible label is "Team Shoutbox" (W5-E3 disambiguation from the
      // per-day "Today's Shoutbox" surface on the Daily view). The rail icon
      // opens the global Team Shoutbox panel which subsumes both team chat
      // and the browse-by-lesson/unit comment index. The state name
      // (commentsPanelOpen / toggleCommentsPanel) and rail-layout id
      // "comments" stay as-is for internal stability per the rename brief.
      body = (
        <Tooltip
          content={`Open the Team Shoutbox — quick messages between teachers covering the same lessons and units${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}\n${hint}`}
          side={tipSide}
        >
          <div className={styles.badgeWrap}>
            <Button
              variant="icon"
              iconAriaLabel={
                commentsPanelOpen
                  ? "Close Team Shoutbox panel"
                  : `Open Team Shoutbox panel${unreadCount > 0 ? ` (${unreadCount} unread Team Shoutbox messages)` : ""}`
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
                aria-label={`${unreadCount} unread Team Shoutbox messages`}
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
    <SortableWrap id={id} side={side} isFirstOnRail={isFirstOnRail}>
      {body}
    </SortableWrap>
  );
}
