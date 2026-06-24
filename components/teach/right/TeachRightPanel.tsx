"use client";

// TeachRightPanel.tsx — the collapsible right panel of the Teach surface
// (docs/teach-view-plan.md §3, §6).
//
// Hosts the right-docked module bodies (Resources / Chat / To-do) behind a thin
// tab header. v1 scope per §6: open / close / focus + reorder WITHIN the panel.
// (Dragging tabs BETWEEN panels and detaching to floating windows is Phase 2.)
//
// The panel is the single owner of "which right module is focused"; the rail
// (TeachRightRail) and the panel tabs both drive it through the same
// `activeModuleId` + `onActivateModule` props, so the rail's active highlight
// and the panel's active tab never disagree.
//
// Collapse animation is reduced-motion-aware (200ms ease-out per §6; opacity
// only under prefers-reduced-motion). When collapsed the panel renders nothing
// (the 64px rail remains, owned by TeachRightRail) — the parent shell decides
// whether to mount the panel at all based on `rightCollapsed`, but the panel
// also guards on `collapsed` so it can animate the close.

import { useCallback } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DRAG_MOTION } from "@/lib/collapse-on-drag";
import type { TeachModuleId } from "@/lib/use-teach-workspace";
import type { TeachResource } from "@/lib/types";
import { Button, Tooltip } from "@/components/ui";
import { PanelAddMenu } from "@/components/teach/left/PanelAddMenu";
import { ResourcesIcon, ChatIcon, TodoIcon, ChevronIcon } from "./icons";
import { ResourcesModule } from "./modules/ResourcesModule";
import { ChatModule } from "./modules/ChatModule";
import { TodoModule } from "./modules/TodoModule";
import styles from "./TeachRightPanel.module.css";

// ── Module metadata (tab label + glyph) ──────────────────────────────────────

interface PanelModuleMeta {
  label: string;
  icon: ReactNode;
  tip: string;
}

const MODULE_META: Partial<Record<TeachModuleId, PanelModuleMeta>> = {
  resources: {
    label: "Resources",
    icon: <ResourcesIcon size={14} />,
    tip: "This lesson's resources — drag a card onto a board cell, or open it large.",
  },
  chat: {
    label: "Chat",
    icon: <ChatIcon size={14} />,
    tip: "Today's Shoutbox — team chat scoped to this day.",
  },
  todo: {
    label: "To-do",
    icon: <TodoIcon size={14} />,
    tip: "Your to-do list for today.",
  },
  // Wave 1 declutter: "Tools" is a LEFT module with a single canonical home (the
  // left rail + its module body). The right panel no longer renders a duplicate
  // Tools tab/body — that was one of the 5–6 duplicate Tools entry points.
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface TeachRightPanelProps {
  /** Ordered right-docked module ids (from `iconRailRightOrder` /
   *  `tabOrder.right`). Drives tab order. Unknown ids are skipped. */
  order: TeachModuleId[];
  /** The focused module. When null the first module in `order` is shown. */
  activeModuleId: TeachModuleId | null;
  /** Focus a module's tab. */
  onActivateModule: (moduleId: TeachModuleId) => void;
  /** Whether the panel body is collapsed (animates closed). */
  collapsed: boolean;
  /** Collapse the panel to the rail. */
  onCollapse: () => void;
  /** Pixel width (from the persisted layout). */
  width?: number;
  // ── Resources-module wiring ───────────────────────────────────────────────
  /** Active lesson id — resources derive from it. */
  activeLessonId: string | null;
  /** Magnify a resource — flips the center to full-bleed. Wired to the
   *  workspace reducer's `openResource` action by integration. */
  onMagnifyResource: (resource: TeachResource) => void;
  /** Embed a resource onto the active board (T8 explicit path). Optional. */
  onEmbedResource?: (resource: TeachResource) => void;
  /** Active week/day overrides for the Chat module (defaults to app-state). */
  week?: number;
  day?: number;
  /** Open the Widget Library overlay from the panel-bar "+" menu. Optional —
   *  when absent the "Browse widget library" entry is hidden. Wired by the
   *  TeachWorkspace lead to the existing Widget Library overlay. */
  onOpenWidgetLibrary?: () => void;
}

// ── TeachRightPanel ───────────────────────────────────────────────────────────

export function TeachRightPanel({
  order,
  activeModuleId,
  onActivateModule,
  collapsed,
  onCollapse,
  width,
  activeLessonId,
  onMagnifyResource,
  onEmbedResource,
  week,
  day,
  onOpenWidgetLibrary,
}: TeachRightPanelProps): ReactNode {
  const reducedMotion = useReducedMotion() ?? false;

  // Resolve the effective focused module: the explicit active id when it is in
  // `order` AND right-supported (has MODULE_META), else the first supported
  // module. Requiring MODULE_META guards against a stale/cross-side-dropped id
  // like the left-only `tools` resolving to a blank body (gate F4).
  const effectiveActive: TeachModuleId | null =
    activeModuleId && order.includes(activeModuleId) && MODULE_META[activeModuleId]
      ? activeModuleId
      : (order.find((id) => MODULE_META[id]) ?? null);

  const renderBody = useCallback(
    (moduleId: TeachModuleId): ReactNode => {
      switch (moduleId) {
        case "resources":
          return (
            <ResourcesModule
              activeLessonId={activeLessonId}
              onMagnifyResource={onMagnifyResource}
              onEmbedResource={onEmbedResource}
            />
          );
        case "chat":
          return <ChatModule week={week} day={day} />;
        case "todo":
          return <TodoModule />;
        default:
          return null;
      }
    },
    [activeLessonId, onMagnifyResource, onEmbedResource, week, day],
  );

  // Stable ids wire each tab to its panel (audit A4 — WAI-ARIA tabs need
  // aria-controls / aria-labelledby + roving tabindex + arrow-key nav).
  const tabId = (id: TeachModuleId): string => `teach-right-tab-${id}`;
  const panelId = `teach-right-panel-${effectiveActive ?? "none"}`;

  // Roving tabindex: only the active tab is in the tab sequence; Arrow keys
  // move selection (and DOM focus) between tabs within the tablist.
  const visibleTabIds = order.filter((id) => MODULE_META[id]);
  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp"
    ) {
      return;
    }
    if (visibleTabIds.length === 0) return;
    e.preventDefault();
    const currentIndex = Math.max(
      0,
      visibleTabIds.indexOf(effectiveActive ?? visibleTabIds[0]),
    );
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (currentIndex + delta + visibleTabIds.length) % visibleTabIds.length;
    const nextId = visibleTabIds[nextIndex];
    onActivateModule(nextId);
    e.currentTarget
      .querySelector<HTMLButtonElement>(`[id="${tabId(nextId)}"]`)
      ?.focus();
  };

  // Collapsed → render nothing (the rail carries the affordance to reopen).
  if (collapsed) return null;

  return (
    <motion.section
      className={styles.panel}
      style={{ width }}
      aria-label="Right panel — resources, chat, to-do"
      title="Right panel — this lesson's resources, the day's team chat, and your to-do list. Collapse it to free up board space."
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
      transition={reducedMotion ? DRAG_MOTION.reduced : DRAG_MOTION.collapse}
    >
      {/* ── Thin tab header ─────────────────────────────────────────────── */}
      <header className={styles.head}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Right modules"
          onKeyDown={handleTabKeyDown}
        >
          {order.map((id) => {
            const meta = MODULE_META[id];
            if (!meta) return null;
            const isActive = effectiveActive === id;
            return (
              <Tooltip
                key={id}
                content={meta.tip}
                side="bottom"
                tooltipId={`teach-tab-${id}`}
              >
                <button
                  type="button"
                  id={tabId(id)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={isActive ? panelId : undefined}
                  // Roving tabindex — only the active tab is tab-reachable;
                  // Arrow keys move between the rest (handled on the tablist).
                  tabIndex={isActive ? 0 : -1}
                  className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                  onClick={() => onActivateModule(id)}
                >
                  <span className={styles.tabIcon} aria-hidden="true">
                    {meta.icon}
                  </span>
                  <span className={styles.tabLabel}>{meta.label}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
        {/* Panel-bar "+": open the widget library. Hidden until hover/focus on
            desktop; always visible on touch. */}
        <PanelAddMenu
          side="right"
          onOpenWidgetLibrary={onOpenWidgetLibrary}
          triggerClassName={styles.addTrigger}
        />
        {/* Collapse-to-rail chevron — flush right. */}
        <Button
          variant="icon"
          iconAriaLabel="Collapse the right panel"
          className={styles.collapseBtn}
          onClick={onCollapse}
          tooltip="Collapse the right panel to its icon rail — gives the board more room"
        >
          <ChevronIcon direction="right" size={15} />
        </Button>
      </header>

      {/* ── Active module body ──────────────────────────────────────────── */}
      <div
        className={styles.body}
        id={panelId}
        role="tabpanel"
        aria-labelledby={effectiveActive ? tabId(effectiveActive) : undefined}
        tabIndex={0}
      >
        {effectiveActive ? renderBody(effectiveActive) : null}
      </div>
    </motion.section>
  );
}
