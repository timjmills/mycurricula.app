"use client";

// use-teach-workspace — the USER-scoped persisted workspace layout for the
// Teach surface (docs/teach-view-plan.md §8). The direct analogue of
// `use-rail-layout.ts`: per-teacher UI preferences (which side each panel docks
// to, panel widths, icon-rail order, collapse state, last-used board per
// lesson) that survive reloads and stay coherent across tabs.
//
// SSR-safe pattern, mirrored EXACTLY from use-rail-layout.ts:
//   1. The initial useState is DEFAULT_TEACH_WORKSPACE so the server-rendered
//      HTML matches the first client render (no hydration mismatch).
//   2. A post-mount effect syncs from localStorage and subscribes to an
//      in-process event bus so every hook instance in the tab stays in lockstep.
//   3. A `storage` event listener picks up writes from OTHER tabs.
//   4. `normalize()` runs on every read AND write so a layout missing a module
//      id (or carrying an unknown one) is repaired — guarding against a future
//      release that adds a module while a teacher's localStorage holds the old
//      shape.
//
// Board/widget CONTENT does NOT live here — it flows through the repository
// seam (lib/teach/queries.ts). This hook is layout only.
//
// MIGRATION: in Phase 1B this migrates to the `teach_workspace_layouts` row;
// localStorage stays as the offline cache, so the swap is additive.

import { useCallback, useEffect, useState } from "react";
import type {
  TeachFloatingWindow,
  TeachPanelDock,
  TeachWorkspaceLayout,
} from "./types";

// ── Canonical module set + defaults (plan §3.1) ─────────────────────────────

/** The canonical Teach panel-module ids. Adding a module means: extend this
 *  set, give it a default dock side below, and teach the rail renderer
 *  (Wave 1, Agents B/E) to draw it. The strings double as React keys and
 *  dnd-kit ids, so they MUST be stable across releases. */
export const TEACH_MODULE_IDS = [
  "lessons",
  "lesson",
  "boards",
  "notes",
  "groups",
  "class",
  "tools",
  "resources",
  "chat",
  "todo",
] as const;

export type TeachModuleId = (typeof TEACH_MODULE_IDS)[number];

/** The context-scoped default rail split (plan §3.1). */
const DEFAULT_DOCK: Record<TeachModuleId, TeachPanelDock> = {
  lessons: "left",
  lesson: "left",
  boards: "left",
  notes: "left",
  groups: "left",
  class: "left",
  tools: "left",
  resources: "right",
  chat: "right",
  todo: "right",
};

const DEFAULT_LEFT_TABS: TeachModuleId[] = [
  "lessons",
  "lesson",
  "boards",
  "notes",
  "groups",
  "class",
  "tools",
];
const DEFAULT_RIGHT_TABS: TeachModuleId[] = ["resources", "chat", "todo"];

/** Default panel widths in px — comfortable on a laptop, collapsible to the
 *  64px rail on smaller tiers (handled by the responsive pass, not here). */
const DEFAULT_PANEL_WIDTH = 320;

export const DEFAULT_TEACH_WORKSPACE: TeachWorkspaceLayout = {
  panelDock: { ...DEFAULT_DOCK },
  tabOrder: {
    left: [...DEFAULT_LEFT_TABS],
    right: [...DEFAULT_RIGHT_TABS],
  },
  panelWidths: { left: DEFAULT_PANEL_WIDTH, right: DEFAULT_PANEL_WIDTH },
  floatingWindows: [],
  iconRailLeftOrder: [...DEFAULT_LEFT_TABS],
  iconRailRightOrder: [...DEFAULT_RIGHT_TABS],
  leftCollapsed: false,
  rightCollapsed: false,
  lastUsedBoardPerLesson: {},
};

/** Min/max panel widths the resize handle clamps to (also enforced here so a
 *  malformed stored width is repaired by normalize). */
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 560;

// ── Storage ──────────────────────────────────────────────────────────────────

/** localStorage key — USER-scoped per the `mycurricula:user:*` convention. */
const STORAGE_KEY = "mycurricula:user:teach-workspace";

function isModuleId(v: unknown): v is TeachModuleId {
  return (
    typeof v === "string" && (TEACH_MODULE_IDS as readonly string[]).includes(v)
  );
}

function clampWidth(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_PANEL_WIDTH;
  return Math.max(MIN_PANEL_WIDTH, Math.min(v, MAX_PANEL_WIDTH));
}

/** Keep only known module ids, drop duplicates, preserve order. */
function safeIdList(
  input: unknown,
  seen?: Set<TeachModuleId>,
): TeachModuleId[] {
  const local = seen ?? new Set<TeachModuleId>();
  const out: TeachModuleId[] = [];
  if (Array.isArray(input)) {
    for (const v of input) {
      if (isModuleId(v) && !local.has(v)) {
        local.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

/**
 * Normalize a (possibly malformed) workspace payload back into a valid
 * `TeachWorkspaceLayout`. Unknown module ids are dropped; missing modules are
 * appended to their default side; widths are clamped; booleans coerced. Never
 * mutates the input.
 */
function normalize(input: unknown): TeachWorkspaceLayout {
  const obj =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  // Tab order per side — dedupe ACROSS sides so a module lives on one side only.
  const seen = new Set<TeachModuleId>();
  const rawOrder =
    obj.tabOrder && typeof obj.tabOrder === "object"
      ? (obj.tabOrder as Record<string, unknown>)
      : {};
  const left = safeIdList(rawOrder.left, seen);
  const right = safeIdList(rawOrder.right, seen);

  // Append any module missing from BOTH sides to its default side.
  for (const id of TEACH_MODULE_IDS) {
    if (seen.has(id)) continue;
    if (DEFAULT_DOCK[id] === "left") left.push(id);
    else right.push(id);
    seen.add(id);
  }

  // Dock map derived from final placement so panelDock can't disagree.
  const panelDock = {} as Record<TeachModuleId, TeachPanelDock>;
  for (const id of left) panelDock[id] = "left";
  for (const id of right) panelDock[id] = "right";

  const rawWidths =
    obj.panelWidths && typeof obj.panelWidths === "object"
      ? (obj.panelWidths as Record<string, unknown>)
      : {};

  const rawFloating = Array.isArray(obj.floatingWindows)
    ? (obj.floatingWindows as unknown[])
    : [];
  const floatingWindows: TeachFloatingWindow[] = [];
  for (const f of rawFloating) {
    if (f && typeof f === "object") {
      const w = f as Record<string, unknown>;
      if (isModuleId(w.moduleId)) {
        floatingWindows.push({
          moduleId: w.moduleId,
          x: typeof w.x === "number" ? w.x : 0,
          y: typeof w.y === "number" ? w.y : 0,
          width: typeof w.width === "number" ? w.width : 360,
          height: typeof w.height === "number" ? w.height : 280,
          zIndex: typeof w.zIndex === "number" ? w.zIndex : 1,
        });
      }
    }
  }

  const rawLastUsed =
    obj.lastUsedBoardPerLesson &&
    typeof obj.lastUsedBoardPerLesson === "object" &&
    !Array.isArray(obj.lastUsedBoardPerLesson)
      ? (obj.lastUsedBoardPerLesson as Record<string, unknown>)
      : {};
  const lastUsedBoardPerLesson: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawLastUsed)) {
    if (typeof v === "string") lastUsedBoardPerLesson[k] = v;
  }

  return {
    panelDock,
    tabOrder: { left, right },
    panelWidths: {
      left: clampWidth(rawWidths.left),
      right: clampWidth(rawWidths.right),
    },
    floatingWindows,
    iconRailLeftOrder: [...left],
    iconRailRightOrder: [...right],
    leftCollapsed: obj.leftCollapsed === true,
    rightCollapsed: obj.rightCollapsed === true,
    lastUsedBoardPerLesson,
  };
}

function freshDefault(): TeachWorkspaceLayout {
  return normalize(DEFAULT_TEACH_WORKSPACE);
}

function readFromStorage(): TeachWorkspaceLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return null;
  }
}

function writeToStorage(layout: TeachWorkspaceLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage disabled / quota exceeded — state still updates in-memory.
  }
}

// ── Same-tab sync (in-process event bus) ─────────────────────────────────────
// Mirrors use-rail-layout.ts: the native `storage` event only fires on OTHER
// tabs, so a tiny in-process bus keeps multiple hook instances in THIS tab
// coherent after a write.

type Listener = (next: TeachWorkspaceLayout) => void;
const listeners = new Set<Listener>();

// The single, tab-wide source of truth for the latest committed layout. Every
// hook instance is kept in lockstep with this via `broadcast`, so deriving a
// `commit`'s next value from it (rather than per-instance React state) is both
// race-free across instances in the same tick AND lets the actual `setLayout`
// happen OUTSIDE any updater — which is what keeps a commit from updating one
// component while another is mid-render. Initialized to the normalized default
// so a `commit` that somehow fires before any mount still composes off a valid
// base; the mount/storage effects below overwrite it from localStorage.
let currentLayout: TeachWorkspaceLayout = freshDefault();

/** Push a new layout to every hook instance and advance the shared mirror.
 *  The `setLayout` calls happen here, in the caller's normal flow — never
 *  inside a React state updater. */
function broadcast(layout: TeachWorkspaceLayout): void {
  currentLayout = layout;
  for (const fn of listeners) fn(layout);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseTeachWorkspaceResult {
  /** The current layout. Server-rendered HTML uses DEFAULT_TEACH_WORKSPACE;
   *  a post-mount effect syncs from localStorage. */
  layout: TeachWorkspaceLayout;
  /** Set a side panel's pixel width (clamped + persisted). */
  setPanelWidth: (side: TeachPanelDock, width: number) => void;
  /** Toggle the left panel's collapsed-to-rail state. */
  toggleLeftCollapsed: () => void;
  /** Toggle the right panel's collapsed-to-rail state. */
  toggleRightCollapsed: () => void;
  /** Move a module's icon to `toSide` at `toIndex` (reorder within a side, or
   *  dock it to the other side). Normalized on write. */
  moveRailIcon: (
    moduleId: TeachModuleId,
    toSide: TeachPanelDock,
    toIndex: number,
  ) => void;
  /** Remember the last board a teacher opened for a lesson. */
  setLastUsedBoard: (lessonId: string, boardId: string) => void;
  /** Restore the canonical default rail split + widths. */
  resetToDefault: () => void;
}

export function useTeachWorkspace(): UseTeachWorkspaceResult {
  // SSR-safe initial state — never reads localStorage during render.
  const [layout, setLayout] = useState<TeachWorkspaceLayout>(freshDefault);

  // Post-mount: sync from localStorage + subscribe to in-process broadcasts.
  // The first mounted instance seeds the tab-wide `currentLayout` mirror from
  // localStorage so every later `commit` composes off the persisted value.
  useEffect(() => {
    const stored = readFromStorage();
    if (stored != null) {
      currentLayout = stored;
      setLayout(stored);
    }
    const listener: Listener = (next) => setLayout(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        const next = freshDefault();
        currentLayout = next;
        setLayout(next);
        return;
      }
      try {
        const next = normalize(JSON.parse(e.newValue) as unknown);
        currentLayout = next;
        setLayout(next);
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  /** Apply a producer, normalize, persist, and broadcast.
   *
   * The next layout is derived from the tab-wide `currentLayout` mirror OUTSIDE
   * any `setLayout` updater, so the side effects — `writeToStorage` and
   * `broadcast` (which fans the new value to every hook instance via their
   * `setLayout`, and also advances `currentLayout`) — run in the calling event
   * handler's normal flow, never inside React's render/commit-phase updater.
   * That is what removes the prior setState-in-render path (the old code ran
   * `broadcast` inside a `setLayout` updater, which React 19 could invoke /
   * replay during render → "Cannot update TeachLeftRail while rendering
   * TeachWorkspace"). Reading from the shared mirror also keeps back-to-back
   * commits — even from different hook instances in the same tick — composing
   * off the latest committed value rather than a stale per-instance snapshot. */
  const commit = useCallback(
    (producer: (prev: TeachWorkspaceLayout) => TeachWorkspaceLayout): void => {
      const next = normalize(producer(currentLayout));
      writeToStorage(next);
      broadcast(next);
    },
    [],
  );

  const setPanelWidth = useCallback(
    (side: TeachPanelDock, width: number): void => {
      commit((prev) => ({
        ...prev,
        panelWidths: { ...prev.panelWidths, [side]: clampWidth(width) },
      }));
    },
    [commit],
  );

  const toggleLeftCollapsed = useCallback((): void => {
    commit((prev) => ({ ...prev, leftCollapsed: !prev.leftCollapsed }));
  }, [commit]);

  const toggleRightCollapsed = useCallback((): void => {
    commit((prev) => ({ ...prev, rightCollapsed: !prev.rightCollapsed }));
  }, [commit]);

  const moveRailIcon = useCallback(
    (
      moduleId: TeachModuleId,
      toSide: TeachPanelDock,
      toIndex: number,
    ): void => {
      commit((prev) => {
        // Strip from BOTH sides so a module can only live in one place.
        const left = prev.tabOrder.left.filter((x) => x !== moduleId);
        const right = prev.tabOrder.right.filter((x) => x !== moduleId);
        const target = toSide === "left" ? left : right;
        const idx = Math.max(0, Math.min(toIndex, target.length));
        target.splice(idx, 0, moduleId);
        return { ...prev, tabOrder: { left, right } };
      });
    },
    [commit],
  );

  const setLastUsedBoard = useCallback(
    (lessonId: string, boardId: string): void => {
      commit((prev) => ({
        ...prev,
        lastUsedBoardPerLesson: {
          ...prev.lastUsedBoardPerLesson,
          [lessonId]: boardId,
        },
      }));
    },
    [commit],
  );

  const resetToDefault = useCallback((): void => {
    const next = freshDefault();
    writeToStorage(next);
    // `broadcast` advances the shared mirror AND updates every instance
    // (including this one, whose `setLayout` is a registered listener), so no
    // separate local `setLayout` is needed — and like `commit`, the state
    // update happens outside any updater.
    broadcast(next);
  }, []);

  return {
    layout,
    setPanelWidth,
    toggleLeftCollapsed,
    toggleRightCollapsed,
    moveRailIcon,
    setLastUsedBoard,
    resetToDefault,
  };
}
