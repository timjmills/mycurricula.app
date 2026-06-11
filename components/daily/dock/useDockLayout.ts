"use client";

// useDockLayout.ts — state + actions for the Daily dock panel system.
//
// Owns the full DockLayoutState (per-slot panel lists, active panel,
// collapse/pin, tabs/stack usermode, column widths) and persists it to
// localStorage under DOCK_LAYOUT_KEY. Hydration discipline matches the
// rest of the codebase: the default layout renders on the server and the
// first client paint; the saved layout loads in a post-mount effect; a
// hydrated ref gates persistence so the initial load never overwrites
// storage with the default.
//
// Keyboard: `[` toggles the LEFT column between expanded and the icon
// rail; `]` toggles the RIGHT column. Both are ignored while focus sits
// in an input / textarea / select / contenteditable, and when a modifier
// (⌘ / Ctrl / Alt) is held — per the design handoff.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DockLayoutState,
  type DockPanelId,
  type DockSlotState,
  type SlotKey,
  type SlotMode,
  DOCK_LAYOUT_KEY,
  SLOT_KEYS,
  defaultDockLayout,
  isRailed,
  readDockLayout,
  writeDockLayout,
} from "./dock-model";

export interface DockLayoutApi {
  layout: DockLayoutState;
  /** Move a panel into a slot (appends; becomes the slot's active panel). */
  movePanel: (panel: DockPanelId, dest: SlotKey) => void;
  /** Activate a panel within its slot (tabs mode). */
  activatePanel: (key: SlotKey, panel: DockPanelId) => void;
  /** Set a slot's tabs/stack preference. */
  setUsermode: (key: SlotKey, mode: SlotMode) => void;
  /** Collapse a side slot to its icon rail (pins it first). */
  collapseSlot: (key: SlotKey) => void;
  /** Expand a side slot from its rail (pins + uncollapses). */
  expandSlot: (key: SlotKey) => void;
  /** Toggle a side slot between pinned-open and floating (hover-peek). */
  togglePin: (key: SlotKey) => void;
  /** `[` / `]` behavior — expanded ↔ rail. */
  toggleSide: (key: "left" | "right") => void;
  /** Splitter drag commit — set the flex-grow ratios of two neighbors. */
  setWidths: (widths: Partial<Record<SlotKey, number>>) => void;
  /** Double-click a splitter — reset every column to the default ratio. */
  resetWidths: () => void;
}

/** True when a keydown originates inside an editing surface. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function useDockLayout(): DockLayoutApi {
  const [layout, setLayout] = useState<DockLayoutState>(defaultDockLayout);
  const hydratedRef = useRef(false);

  // Load the saved layout once, post-mount (SSR-safe; see header comment).
  // First visit on a tablet-width viewport (≤960px, the old rail-collapse
  // fold): default the right column to its icon rail so three full
  // columns never fight for tablet width. A teacher's SAVED layout always
  // wins — this only shapes the very first layout.
  useEffect(() => {
    const saved = readDockLayout();
    let hasSaved = false;
    try {
      hasSaved = window.localStorage.getItem(DOCK_LAYOUT_KEY) !== null;
      // One-time cleanup: the pre-dock layout keys (px pane widths +
      // column order) are superseded by the dock layout and would
      // otherwise linger forever. Their values don't translate to the
      // ratio model, so they're removed rather than migrated.
      for (const stale of [
        "mycurricula:daily-left-width",
        "mycurricula:daily-right-width",
        "mycurricula:daily-column-order",
      ]) {
        window.localStorage.removeItem(stale);
      }
    } catch {
      // Storage unavailable — treat as a first visit.
    }
    if (!hasSaved && window.innerWidth <= 960) {
      saved.slots.right.collapsed = true;
    }
    setLayout(saved);
  }, []);

  // Persist on every change after the initial load. The skip-first gate
  // lives HERE (not in the load effect): both effects run in the same
  // post-mount flush, and this one still sees the default layout in its
  // closure on that first run — flipping the gate in the load effect
  // would let that first run overwrite the saved layout with the default.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    writeDockLayout(layout);
  }, [layout]);

  /** Immutable per-slot update helper. */
  const updateSlots = useCallback(
    (fn: (slots: Record<SlotKey, DockSlotState>) => void): void => {
      setLayout((prev) => {
        const slots = {
          left: { ...prev.slots.left, panels: [...prev.slots.left.panels] },
          center: {
            ...prev.slots.center,
            panels: [...prev.slots.center.panels],
          },
          right: { ...prev.slots.right, panels: [...prev.slots.right.panels] },
        };
        fn(slots);
        // Repair active pointers after any structural change.
        for (const key of SLOT_KEYS) {
          const slot = slots[key];
          if (slot.active === null || !slot.panels.includes(slot.active)) {
            slot.active = slot.panels[0] ?? null;
          }
        }
        return { slots };
      });
    },
    [],
  );

  const movePanel = useCallback(
    (panel: DockPanelId, dest: SlotKey): void => {
      updateSlots((slots) => {
        for (const key of SLOT_KEYS) {
          slots[key].panels = slots[key].panels.filter((p) => p !== panel);
        }
        slots[dest].panels.push(panel);
        slots[dest].active = panel;
        // Landing in a railed side slot expands it — a drop the teacher
        // can't see would read as the panel vanishing.
        if (dest !== "center") {
          slots[dest].collapsed = false;
          slots[dest].pinned = true;
        }
      });
    },
    [updateSlots],
  );

  const activatePanel = useCallback(
    (key: SlotKey, panel: DockPanelId): void => {
      updateSlots((slots) => {
        if (slots[key].panels.includes(panel)) slots[key].active = panel;
      });
    },
    [updateSlots],
  );

  const setUsermode = useCallback(
    (key: SlotKey, mode: SlotMode): void => {
      updateSlots((slots) => {
        slots[key].usermode = mode;
      });
    },
    [updateSlots],
  );

  const collapseSlot = useCallback(
    (key: SlotKey): void => {
      if (key === "center") return;
      updateSlots((slots) => {
        slots[key].pinned = true;
        slots[key].collapsed = true;
      });
    },
    [updateSlots],
  );

  const expandSlot = useCallback(
    (key: SlotKey): void => {
      updateSlots((slots) => {
        slots[key].pinned = true;
        slots[key].collapsed = false;
      });
    },
    [updateSlots],
  );

  const togglePin = useCallback(
    (key: SlotKey): void => {
      if (key === "center") return;
      updateSlots((slots) => {
        if (!slots[key].pinned) {
          slots[key].pinned = true;
          slots[key].collapsed = false;
        } else {
          slots[key].pinned = false;
        }
      });
    },
    [updateSlots],
  );

  const toggleSide = useCallback(
    (key: "left" | "right"): void => {
      updateSlots((slots) => {
        const railed = isRailed(key, slots[key]);
        slots[key].pinned = true;
        slots[key].collapsed = !railed;
      });
    },
    [updateSlots],
  );

  const setWidths = useCallback(
    (widths: Partial<Record<SlotKey, number>>): void => {
      updateSlots((slots) => {
        for (const key of SLOT_KEYS) {
          const w = widths[key];
          if (typeof w === "number" && Number.isFinite(w) && w > 0) {
            slots[key].width = Math.round(w * 10) / 10;
          }
        }
      });
    },
    [updateSlots],
  );

  const resetWidths = useCallback((): void => {
    updateSlots((slots) => {
      for (const key of SLOT_KEYS) slots[key].width = null;
    });
  }, [updateSlots]);

  // `[` / `]` keyboard shortcuts (design handoff §4). Capture phase +
  // preventDefault so the global week-navigation shortcuts (which bind
  // the same keys and now yield on e.defaultPrevented — see
  // lib/use-keyboard-shortcuts.ts) never double-fire on /daily. The
  // e.repeat guard keeps a held key from rapid-toggling the column.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "[") {
        e.preventDefault();
        toggleSide("left");
      } else if (e.key === "]") {
        e.preventDefault();
        toggleSide("right");
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [toggleSide]);

  return {
    layout,
    movePanel,
    activatePanel,
    setUsermode,
    collapseSlot,
    expandSlot,
    togglePin,
    toggleSide,
    setWidths,
    resetWidths,
  };
}
