"use client";

// DockLayout.tsx — the Daily view's dockable, resizable, collapsible
// three-column panel system (6.11.26 design_handoff_daily_view).
//
// Structure per slot (left / center / right):
//
//   .dockCol[data-slot]            ← the flex column (`flex-grow: var(--w)`)
//     .colDock                     ← dockable content host
//       .slotTabs                  ← one draggable tab per docked panel,
//                                    tabs/stack toggle, pin + collapse
//       .dockPanel[data-panel] ×N  ← the panels themselves (children stay
//                                    mounted; visibility is CSS-driven)
//     .colRail                     ← 50px icon rail (side slots only)
//
// Between columns sit pointer-draggable splitters that rewrite the `--w`
// flex-grow ratios (double-click resets all widths). Dragging a slot tab
// raises a dock overlay whose drop zones align to the real columns and
// preview the landing panel as a ghost card.
//
// Accessibility:
//   • every control is a real <button> with a label;
//   • splitters are keyboard-operable separators (arrows / Home / End);
//   • a focused slot tab moves its panel with Shift+ArrowLeft / Right —
//     the keyboard parallel of drag-to-dock;
//   • `[` / `]` collapse shortcuts live in useDockLayout.
//
// All animation respects prefers-reduced-motion via Dock.module.css.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import { type DockLayoutApi } from "./useDockLayout";
import {
  type DockPanelId,
  type DockSlotState,
  type SlotKey,
  DOCK_PANEL_TITLE,
  SLOT_DEFAULT_WIDTH,
  SLOT_KEYS,
  SLOT_MIN_WIDTH,
  effectiveMode,
  isRailed,
  modeChoiceAvailable,
} from "./dock-model";
import {
  DockChevronLeftIcon,
  DockChevronRightIcon,
  DockGripIcon,
  DockPinIcon,
  DockStackModeIcon,
  DockTabsModeIcon,
  DockZoneIcon,
  dockPanelIcon,
} from "./dock-icons";
import styles from "./Dock.module.css";

// ── Public panel definition ───────────────────────────────────────────────

/** One inner-tab entry surfaced on the icon rail when the owning panel's
 *  column is collapsed (the `side` panel expands into one rail icon per
 *  inner tab: Resources / To-do / Chat). */
export interface DockRailItem {
  key: string;
  title: string;
  /** Numeric badge (e.g. open to-dos). 0 / undefined → no badge. */
  badgeCount?: number;
  /** Small urgent dot (e.g. unread chat). */
  badgeDot?: boolean;
  active: boolean;
  onActivate: () => void;
}

export interface DockPanelDef {
  id: DockPanelId;
  title: string;
  content: ReactNode;
  /** Side-panel inner tabs — drive the per-tab rail icons + badges. */
  railItems?: DockRailItem[];
}

interface DockLayoutProps {
  panels: DockPanelDef[];
  api: DockLayoutApi;
  /** id + aria plumbing for the body container (the Daily view keeps its
   *  existing tabpanel relationship with the week strip). */
  bodyId?: string;
  ariaLabelledBy?: string;
  /** Narrow-viewport (≤720px) pane choice — CSS shows exactly one panel
   *  ("list" → the day panel, "detail" → the lesson panel) and hides the
   *  dock chrome. Inert on wide viewports. */
  narrowPane?: "list" | "detail";
}

// ── Geometry for the dock overlay ────────────────────────────────────────

interface ZoneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimum landing-zone footprint (px) so collapsed rails and hidden
 *  columns still present a usable drop target. */
const ZONE_MIN_WIDTH = 170;

/** Splitter keyboard nudge (px per arrow press). */
const SPLITTER_STEP = 16;

// ── Component ─────────────────────────────────────────────────────────────

export function DockLayout({
  panels,
  api,
  bodyId,
  ariaLabelledBy,
  narrowPane,
}: DockLayoutProps): ReactNode {
  const { layout } = api;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<SlotKey, HTMLDivElement | null>>({
    left: null,
    center: null,
    right: null,
  });

  const panelById = useMemo(() => {
    const map = new Map<DockPanelId, DockPanelDef>();
    for (const p of panels) map.set(p.id, p);
    return map;
  }, [panels]);

  // ── Drag-to-dock state ──────────────────────────────────────────────────
  const [draggingPanel, setDraggingPanel] = useState<DockPanelId | null>(null);
  const [zoneRects, setZoneRects] = useState<Record<SlotKey, ZoneRect> | null>(
    null,
  );
  const [hotZone, setHotZone] = useState<SlotKey | null>(null);
  // Drop feedback — the destination column flashes briefly.
  const [flashSlot, setFlashSlot] = useState<SlotKey | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    };
  }, []);

  /** Align each drop zone to its column's live footprint. Hidden columns
   *  (zero-width rects) get a synthetic landing strip at their edge of the
   *  body so an emptied column can always be repopulated. */
  const positionZones = useCallback((): void => {
    const body = bodyRef.current;
    if (!body) return;
    const br = body.getBoundingClientRect();
    const rects = {} as Record<SlotKey, ZoneRect>;
    for (const key of SLOT_KEYS) {
      const el = slotRefs.current[key];
      const r = el ? el.getBoundingClientRect() : null;
      let left = r ? r.left - br.left : 0;
      let width = r ? r.width : 0;
      if (width < ZONE_MIN_WIDTH) {
        // Collapsed rail or hidden column — synthesize a usable footprint.
        if (width === 0) {
          // display:none — anchor to the body edge / middle by slot.
          if (key === "left") left = 0;
          else if (key === "right")
            left = Math.max(0, br.width - ZONE_MIN_WIDTH);
          else left = Math.max(0, (br.width - ZONE_MIN_WIDTH) / 2);
        } else if (key === "right") {
          left = Math.max(0, left + width - ZONE_MIN_WIDTH);
        } else if (key === "center") {
          left = Math.max(0, left + (width - ZONE_MIN_WIDTH) / 2);
        }
        width = ZONE_MIN_WIDTH;
      }
      rects[key] = {
        left: left + 6,
        top: 6,
        width: width - 12,
        height: br.height - 12,
      };
    }
    setZoneRects(rects);
  }, []);

  const startPanelDrag = useCallback(
    (panel: DockPanelId, e: React.DragEvent): void => {
      setDraggingPanel(panel);
      positionZones();
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", `dock:${panel}`);
      } catch {
        // Some browsers throw on setData with custom types — non-fatal.
      }
    },
    [positionZones],
  );

  const endPanelDrag = useCallback((): void => {
    setDraggingPanel(null);
    setHotZone(null);
    setZoneRects(null);
  }, []);

  // Keep the drop zones aligned with the real columns if the window
  // resizes mid-drag (the zones are positioned from rects captured at
  // dragstart).
  useEffect(() => {
    if (!draggingPanel) return;
    window.addEventListener("resize", positionZones);
    return () => window.removeEventListener("resize", positionZones);
  }, [draggingPanel, positionZones]);

  const dropOnZone = useCallback(
    (dest: SlotKey): void => {
      if (draggingPanel) {
        api.movePanel(draggingPanel, dest);
        setFlashSlot(dest);
        if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlashSlot(null), 700);
      }
      endPanelDrag();
    },
    [api, draggingPanel, endPanelDrag],
  );

  /** Keyboard parallel of drag-to-dock: Shift+ArrowLeft / Right moves the
   *  focused tab's panel one column over. */
  const movePanelByKeyboard = useCallback(
    (panel: DockPanelId, from: SlotKey, dir: -1 | 1): void => {
      const idx = SLOT_KEYS.indexOf(from);
      const dest = SLOT_KEYS[idx + dir];
      if (dest) api.movePanel(panel, dest);
    },
    [api],
  );

  // ── Splitter enablement (mirrors the handoff's updateSplitters) ────────
  const open = (key: SlotKey): boolean => layout.slots[key].panels.length > 0;
  const railed = (key: SlotKey): boolean => isRailed(key, layout.slots[key]);
  const leftOK = open("left") && !railed("left");
  const rightOK = open("right") && !railed("right");
  const centerOpen = open("center");
  const splitterEnabled: [boolean, boolean] = [
    leftOK && (centerOpen || rightOK),
    centerOpen && rightOK,
  ];
  /** The two slots a splitter actually resizes (skips a closed center). */
  const splitterNeighbors: [SlotKey, SlotKey][] = [
    ["left", centerOpen ? "center" : "right"],
    ["center", "right"],
  ];

  // ── Splitter drag ──────────────────────────────────────────────────────

  /** Live minimum width for a slot — read from the element's computed
   *  style so the JS clamp always agrees with the responsive CSS
   *  min-width tiers in Dock.module.css. Falls back to the model
   *  constant when the element hasn't measured yet. */
  const slotMinWidth = useCallback((key: SlotKey): number => {
    const el = slotRefs.current[key];
    if (el) {
      const m = parseInt(getComputedStyle(el).minWidth, 10);
      if (Number.isFinite(m) && m > 0) return m;
    }
    return SLOT_MIN_WIDTH[key];
  }, []);

  // The drag sets page-wide cursor / user-select styles; this guarantees
  // they never outlive the component (e.g. unmount mid-drag).
  const clearDragBodyStyles = useCallback((): void => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);
  useEffect(() => clearDragBodyStyles, [clearDragBodyStyles]);

  const onSplitterPointerDown = useCallback(
    (index: 0 | 1, e: React.PointerEvent<HTMLDivElement>): void => {
      if (!splitterEnabled[index]) return;
      // Primary button only — a right-click must not enter drag mode (the
      // context menu would swallow the pointerup and strand the page in a
      // col-resize cursor).
      if (!e.isPrimary || e.button !== 0) return;
      const [prevKey, nextKey] = splitterNeighbors[index];
      const prevEl = slotRefs.current[prevKey];
      const nextEl = slotRefs.current[nextKey];
      if (!prevEl || !nextEl) return;
      e.preventDefault();

      const startX = e.clientX;
      const pw = prevEl.getBoundingClientRect().width;
      const nw = nextEl.getBoundingClientRect().width;
      const sum = pw + nw;
      const pMin = slotMinWidth(prevKey);
      const nMin = slotMinWidth(nextKey);
      // Degenerate clamp range (container narrower than the two minimums
      // combined) — resizing would only desync ratios from rendered
      // widths, so bail.
      if (sum <= pMin + nMin) return;

      // Snapshot EVERY open column's live px width as its ratio first, so
      // the column not being dragged keeps its exact width while the two
      // neighbors trade pixels (flex-grow ratios are relative).
      const snapshot: Partial<Record<SlotKey, number>> = {};
      for (const key of SLOT_KEYS) {
        const el = slotRefs.current[key];
        if (el && open(key) && !railed(key)) {
          snapshot[key] = el.getBoundingClientRect().width;
        }
      }
      api.setWidths(snapshot);

      const target = e.currentTarget;
      let captured = true;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture unavailable — fall back to WINDOW listeners, or
        // the drag dies (and body styles stick) the moment the pointer
        // leaves the 10px splitter track.
        captured = false;
      }
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      // With capture, element listeners receive every event; without it,
      // only window listeners track a pointer that left the splitter.
      const listenTarget: HTMLElement | Window = captured ? target : window;
      const onMove = (ev: PointerEvent): void => {
        const d = ev.clientX - startX;
        const np = Math.max(pMin, Math.min(sum - nMin, pw + d));
        api.setWidths({ [prevKey]: np, [nextKey]: sum - np });
      };
      const onUp = (): void => {
        clearDragBodyStyles();
        listenTarget.removeEventListener("pointermove", onMove as EventListener);
        listenTarget.removeEventListener("pointerup", onUp);
        listenTarget.removeEventListener("pointercancel", onUp);
        listenTarget.removeEventListener("lostpointercapture", onUp);
      };
      listenTarget.addEventListener("pointermove", onMove as EventListener);
      listenTarget.addEventListener("pointerup", onUp);
      listenTarget.addEventListener("pointercancel", onUp);
      listenTarget.addEventListener("lostpointercapture", onUp);
    },
    // splitterEnabled / splitterNeighbors are cheap derived values; the
    // handler reads them from the closure of the render that bound it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, layout, slotMinWidth, clearDragBodyStyles],
  );

  const onSplitterKeyDown = useCallback(
    (index: 0 | 1, e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!splitterEnabled[index]) return;
      const [prevKey, nextKey] = splitterNeighbors[index];
      const prevEl = slotRefs.current[prevKey];
      const nextEl = slotRefs.current[nextKey];
      if (!prevEl || !nextEl) return;
      const pw = prevEl.getBoundingClientRect().width;
      const nw = nextEl.getBoundingClientRect().width;
      const sum = pw + nw;
      const pMin = slotMinWidth(prevKey);
      const nMin = slotMinWidth(nextKey);
      if (sum <= pMin + nMin) return;

      let np: number | null = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") np = pw - SPLITTER_STEP;
      else if (e.key === "ArrowRight" || e.key === "ArrowDown")
        np = pw + SPLITTER_STEP;
      else if (e.key === "Home") np = pMin;
      else if (e.key === "End") np = sum - nMin;
      if (np === null) return;
      e.preventDefault();
      const clamped = Math.max(pMin, Math.min(sum - nMin, np));
      api.setWidths({ [prevKey]: clamped, [nextKey]: sum - clamped });
    },
    // Same closure rationale as onSplitterPointerDown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, layout, slotMinWidth],
  );

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderSlotTab(
    key: SlotKey,
    slot: DockSlotState,
    panel: DockPanelDef,
    mode: "tabs" | "stack",
  ): ReactNode {
    const isActive = mode === "stack" || slot.active === panel.id;
    const isSide = key !== "center";
    return (
      <Tooltip
        key={panel.id}
        content={`Drag to move the ${panel.title} panel to another column (or press Shift+←/→ while focused)${isSide ? " · double-click collapses this column" : ""}`}
        side="bottom"
        tooltipId="daily-dock-tab"
      >
        <button
          type="button"
          draggable
          className={`${styles.slotTab} ${isActive ? styles.slotTabActive : ""} ${
            draggingPanel === panel.id ? styles.slotTabDragging : ""
          }`}
          aria-pressed={isActive}
          aria-label={`${panel.title} panel`}
          aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
          onClick={() => api.activatePanel(key, panel.id)}
          onDoubleClick={isSide ? () => api.collapseSlot(key) : undefined}
          onDragStart={(e) => startPanelDrag(panel.id, e)}
          onDragEnd={endPanelDrag}
          onKeyDown={(e) => {
            if (e.shiftKey && e.key === "ArrowLeft") {
              e.preventDefault();
              movePanelByKeyboard(panel.id, key, -1);
            } else if (e.shiftKey && e.key === "ArrowRight") {
              e.preventDefault();
              movePanelByKeyboard(panel.id, key, 1);
            }
          }}
        >
          <span className={styles.slotTabGrip} aria-hidden="true">
            <DockGripIcon />
          </span>
          <span className={styles.slotTabTitle}>{panel.title}</span>
        </button>
      </Tooltip>
    );
  }

  function renderSlotControls(key: SlotKey, slot: DockSlotState): ReactNode {
    if (key === "center") return null;
    const kbd = key === "left" ? "[" : "]";
    const chevron =
      key === "left" ? <DockChevronLeftIcon /> : <DockChevronRightIcon />;
    return (
      <span className={styles.slotCtrls}>
        <Tooltip
          content={
            slot.pinned
              ? "Unpin this column — it floats over the page and peeks open on hover"
              : "Pin this column open"
          }
          side="bottom"
          tooltipId="daily-dock-pin"
        >
          <button
            type="button"
            className={`${styles.slotCtrlBtn} ${slot.pinned ? styles.slotCtrlBtnOn : ""}`}
            aria-pressed={slot.pinned}
            aria-label={slot.pinned ? "Unpin column" : "Pin column open"}
            onClick={() => api.togglePin(key)}
          >
            <DockPinIcon />
          </button>
        </Tooltip>
        <Tooltip
          content={`Collapse this column to an icon rail (shortcut: ${kbd})`}
          side="bottom"
          tooltipId="daily-dock-collapse"
        >
          <button
            type="button"
            className={styles.slotCtrlBtn}
            aria-label={`Collapse column (shortcut: ${kbd})`}
            aria-keyshortcuts={kbd}
            onClick={() => api.collapseSlot(key)}
          >
            {chevron}
          </button>
        </Tooltip>
      </span>
    );
  }

  function renderModeToggle(key: SlotKey, slot: DockSlotState): ReactNode {
    if (!modeChoiceAvailable(key, slot)) return null;
    const mode = effectiveMode(key, slot);
    return (
      <span
        className={styles.slotMode}
        role="group"
        aria-label="Panel display mode"
      >
        <button
          type="button"
          className={`${styles.slotModeBtn} ${mode === "tabs" ? styles.slotModeBtnOn : ""}`}
          aria-pressed={mode === "tabs"}
          aria-label="Show panels as tabs"
          title="Tabs — one panel at a time"
          onClick={() => api.setUsermode(key, "tabs")}
        >
          <DockTabsModeIcon />
        </button>
        <button
          type="button"
          className={`${styles.slotModeBtn} ${mode === "stack" ? styles.slotModeBtnOn : ""}`}
          aria-pressed={mode === "stack"}
          aria-label="Stack panels vertically"
          title="Stack — panels share the column"
          onClick={() => api.setUsermode(key, "stack")}
        >
          <DockStackModeIcon />
        </button>
      </span>
    );
  }

  function renderRail(key: SlotKey, slot: DockSlotState): ReactNode {
    if (key === "center") return null;
    const kbd = key === "left" ? "[" : "]";
    const expandChevron =
      key === "left" ? <DockChevronRightIcon /> : <DockChevronLeftIcon />;
    const label = slot.panels
      .map((p) => panelById.get(p)?.title ?? DOCK_PANEL_TITLE[p])
      .join(" · ");
    return (
      <div className={styles.colRail}>
        <Tooltip
          content={`Expand this column (shortcut: ${kbd})`}
          side={key === "left" ? "right" : "left"}
          tooltipId="daily-dock-expand"
        >
          <button
            type="button"
            className={styles.colRailExpand}
            aria-label={`Expand column (shortcut: ${kbd})`}
            aria-keyshortcuts={kbd}
            onClick={() => api.expandSlot(key)}
          >
            {expandChevron}
          </button>
        </Tooltip>
        <div className={styles.colRailIcons}>
          {slot.panels.map((pid) => {
            const def = panelById.get(pid);
            if (!def) return null;
            const items = def.railItems;
            if (items && items.length > 0) {
              // Multi-tab panel → one rail icon per inner tab. The badge
              // count folds into the accessible name (the visual badge
              // itself is aria-hidden).
              return items.map((item) => (
                <button
                  key={`${pid}:${item.key}`}
                  type="button"
                  className={`${styles.colRailIcon} ${
                    slot.active === pid && item.active
                      ? styles.colRailIconOn
                      : ""
                  }`}
                  title={`Open ${item.title}`}
                  aria-label={`Open ${item.title}${
                    item.badgeCount ? ` (${item.badgeCount} open)` : ""
                  }${item.badgeDot ? " (new activity)" : ""}`}
                  onClick={() => {
                    api.expandSlot(key);
                    api.activatePanel(key, pid);
                    item.onActivate();
                  }}
                >
                  {dockPanelIcon(item.key)}
                  {item.badgeCount ? (
                    <span className={styles.railBadge} aria-hidden="true">
                      {item.badgeCount}
                    </span>
                  ) : null}
                  {item.badgeDot ? (
                    <span
                      className={styles.railDotBadge}
                      title="New messages"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              ));
            }
            return (
              <button
                key={pid}
                type="button"
                className={`${styles.colRailIcon} ${
                  slot.active === pid ? styles.colRailIconOn : ""
                }`}
                title={`Open ${def.title}`}
                aria-label={`Open ${def.title}`}
                onClick={() => {
                  api.expandSlot(key);
                  api.activatePanel(key, pid);
                }}
              >
                {dockPanelIcon(pid)}
              </button>
            );
          })}
        </div>
        <span className={styles.colRailLabel} aria-hidden="true">
          {label}
        </span>
        <span className={styles.colRailDot} aria-hidden="true" />
      </div>
    );
  }

  function renderSlot(key: SlotKey): ReactNode {
    const slot = layout.slots[key];
    const mode = effectiveMode(key, slot);
    const slotOpen = slot.panels.length > 0;
    const width = slot.width ?? SLOT_DEFAULT_WIDTH[key];
    const style = { "--w": String(width) } as CSSProperties;

    return (
      <div
        key={key}
        ref={(el) => {
          slotRefs.current[key] = el;
        }}
        className={`${styles.dockCol} ${flashSlot === key ? styles.dockFlash : ""}`}
        data-slot={key}
        data-mode={mode}
        data-open={slotOpen ? "true" : "false"}
        data-collapsed={slot.collapsed ? "true" : "false"}
        data-pinned={slot.pinned ? "true" : "false"}
        style={style}
      >
        <div className={styles.colDock}>
          {slotOpen && (
            <div className={styles.slotTabs}>
              {slot.panels.map((pid) => {
                const def = panelById.get(pid);
                return def ? renderSlotTab(key, slot, def, mode) : null;
              })}
              <span className={styles.slotTabsSpacer} />
              {renderModeToggle(key, slot)}
              {renderSlotControls(key, slot)}
            </div>
          )}
          {slot.panels.map((pid) => {
            const def = panelById.get(pid);
            if (!def) return null;
            const active = mode === "stack" || slot.active === pid;
            return (
              <div
                key={pid}
                className={`${styles.dockPanel} ${active ? styles.dockPanelActive : ""}`}
                data-panel={pid}
              >
                {def.content}
              </div>
            );
          })}
        </div>
        {renderRail(key, slot)}
      </div>
    );
  }

  function renderSplitter(index: 0 | 1): ReactNode {
    const enabled = splitterEnabled[index];
    const [prevKey, nextKey] = splitterNeighbors[index];
    // aria-value* from the stored ratios (px-equivalent after the first
    // drag snapshot) so screen-reader users hear position + range while
    // resizing — every keyboard step re-renders via setWidths, keeping
    // aria-valuenow live. Matches the PaneSplitter contract this surface
    // shipped with.
    const prevW = layout.slots[prevKey].width ?? SLOT_DEFAULT_WIDTH[prevKey];
    const nextW = layout.slots[nextKey].width ?? SLOT_DEFAULT_WIDTH[nextKey];
    return (
      <div
        className={styles.splitter}
        data-on={enabled ? "true" : "false"}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize the ${prevKey} and ${nextKey} columns — drag, or use the arrow keys; double-click resets all column widths`}
        aria-valuemin={SLOT_MIN_WIDTH[prevKey]}
        aria-valuemax={Math.round(prevW + nextW - SLOT_MIN_WIDTH[nextKey])}
        aria-valuenow={Math.round(prevW)}
        tabIndex={enabled ? 0 : -1}
        onPointerDown={(e) => onSplitterPointerDown(index, e)}
        onKeyDown={(e) => onSplitterKeyDown(index, e)}
        onDoubleClick={api.resetWidths}
      >
        <span className={styles.splitterGrip} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      id={bodyId}
      ref={bodyRef}
      className={`${styles.dockBody} ${draggingPanel ? styles.dockBodyDocking : ""}`}
      role="tabpanel"
      aria-labelledby={ariaLabelledBy}
      data-narrow-pane={narrowPane}
    >
      {SLOT_KEYS.map((key, i) => (
        <Fragment key={key}>
          {renderSlot(key)}
          {i < SLOT_KEYS.length - 1 && renderSplitter(i as 0 | 1)}
        </Fragment>
      ))}

      {/* ── Dock overlay: column-aligned drop zones + ghost preview ──── */}
      {draggingPanel && zoneRects && (
        <div className={styles.dockLayer}>
          {SLOT_KEYS.map((key) => {
            const r = zoneRects[key];
            const def = panelById.get(draggingPanel);
            const hint =
              key === "left" ? "Move left" : key === "right" ? "Move right" : "Move center"; // prettier-ignore
            return (
              <div
                key={key}
                className={`${styles.dockZone} ${hotZone === key ? styles.dockZoneHot : ""}`}
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setHotZone(key);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  try {
                    e.dataTransfer.dropEffect = "move";
                  } catch {
                    // dataTransfer may be read-only in some browsers.
                  }
                }}
                onDragLeave={() =>
                  setHotZone((cur) => (cur === key ? null : cur))
                }
                onDrop={(e) => {
                  e.preventDefault();
                  dropOnZone(key);
                }}
              >
                <div className={styles.dzHint}>
                  <DockZoneIcon size={26} />
                  <span>{hint}</span>
                </div>
                <div className={styles.dockGhost} aria-hidden="true">
                  <div className={styles.dockGhostHead}>
                    <span className={styles.dockGhostIcon}>
                      {dockPanelIcon(draggingPanel)}
                    </span>
                    <span>{def?.title ?? DOCK_PANEL_TITLE[draggingPanel]}</span>
                  </div>
                  <div className={styles.dockGhostBody}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
