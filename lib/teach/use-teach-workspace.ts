"use client";

// use-teach-workspace.ts — the Teach view's per-teacher workspace layout.
//
// The Teach workspace has two dockable panels (left + right) and two icon
// rails (far-left + far-right). Each panel hosts a set of module TABS, has
// an active tab, a collapsed flag, and a teacher-tuned width. The rails hold
// the module icons that aren't currently docked as a tab.
//
// This hook owns that arrangement and persists it to localStorage so the
// workspace remembers itself across reloads. It is the DATA half of Wave 1:
// the panels-ui teammate's TeachPanel / TeachTabStrip / TeachIconRail render
// against the public API below and never touch persistence directly.
//
// ── SSR-safe hydration (same discipline as lib/weekly-schedule-state.ts) ──
// The first render returns DEFAULT_LAYOUT so the server-rendered HTML matches
// the first client paint (no hydration mismatch). A post-mount effect reads
// the saved layout and swaps it in, then flips `hydrated` true. Every mutator
// is gated on `hydratedRef` so the hydration pass can't immediately overwrite
// storage with the defaults before the saved layout has loaded.
//
// Storage key: myc.teach.workspace.v1 (versioned so a future shape change can
// migrate or discard cleanly instead of crashing on a stale blob).

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModuleId } from "./teach-types";
import {
  DEFAULT_WORKSPACE_LAYOUT,
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  type PanelSide,
  type WorkspaceLayout,
} from "./teach-types";

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "myc.teach.workspace.v1";

/** Clamp a panel width to the sane min/max so a dragged splitter can't wedge
 *  a panel off-screen or collapse the center board. */
function clampWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_WORKSPACE_LAYOUT.left.width;
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(px)));
}

/** Deep-clone the default layout so a reset (or the initial state) never
 *  shares array/object identity with the frozen template — mutators always
 *  work on fresh copies. */
function cloneDefault(): WorkspaceLayout {
  const d = DEFAULT_WORKSPACE_LAYOUT;
  return {
    left: { ...d.left, tabs: [...d.left.tabs] },
    right: { ...d.right, tabs: [...d.right.tabs] },
    leftRail: [...d.leftRail],
    rightRail: [...d.rightRail],
  };
}

// Every ModuleId the registry knows about, used to scrub a persisted blob of
// any id that no longer exists (e.g. a module renamed/removed between
// versions). Kept in sync with the ModuleId union in teach-types.ts.
const KNOWN_MODULES: readonly ModuleId[] = [
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
];

function isModuleId(value: unknown): value is ModuleId {
  return (
    typeof value === "string" && KNOWN_MODULES.includes(value as ModuleId)
  );
}

/** Coerce an unknown array into a deduped ModuleId[] (drops stale/unknown
 *  ids). Order is preserved. */
function sanitizeIds(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ModuleId>();
  const out: ModuleId[] = [];
  for (const item of value) {
    if (isModuleId(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** Coerce an unknown blob into a PanelState, falling back to the matching
 *  default for any malformed field. activeTab is forced into the tab set so a
 *  persisted active tab that was since removed can't dangle. */
function sanitizePanel(
  value: unknown,
  fallback: WorkspaceLayout["left"],
): WorkspaceLayout["left"] {
  if (typeof value !== "object" || value === null) {
    return { ...fallback, tabs: [...fallback.tabs] };
  }
  const v = value as Record<string, unknown>;
  const tabs = sanitizeIds(v.tabs);
  const safeTabs = tabs.length > 0 ? tabs : [...fallback.tabs];
  const activeTab =
    isModuleId(v.activeTab) && safeTabs.includes(v.activeTab)
      ? v.activeTab
      : safeTabs[0];
  return {
    tabs: safeTabs,
    activeTab,
    collapsed: typeof v.collapsed === "boolean" ? v.collapsed : fallback.collapsed,
    width:
      typeof v.width === "number" ? clampWidth(v.width) : fallback.width,
  };
}

/** Read + validate the persisted layout. Any structural problem falls back to
 *  the default layout rather than throwing — a corrupt blob must never break
 *  the route. SSR-guarded. */
function readLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return cloneDefault();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return cloneDefault();
    const p = parsed as Record<string, unknown>;
    return {
      left: sanitizePanel(p.left, DEFAULT_WORKSPACE_LAYOUT.left),
      right: sanitizePanel(p.right, DEFAULT_WORKSPACE_LAYOUT.right),
      leftRail: sanitizeIds(p.leftRail),
      rightRail: sanitizeIds(p.rightRail),
    };
  } catch {
    return cloneDefault();
  }
}

function writeLayout(layout: WorkspaceLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage full / unavailable — the layout persists for the session only.
  }
}

// ── Public hook ──────────────────────────────────────────────────────────

export interface UseTeachWorkspaceReturn {
  /** The current workspace arrangement. Stable identity between renders that
   *  don't mutate it. */
  layout: WorkspaceLayout;
  /** False on the server + first client paint, true once the saved layout has
   *  loaded. The UI can use this to defer drag affordances until hydrated. */
  hydrated: boolean;
  setPanelWidth: (side: PanelSide, px: number) => void;
  toggleCollapse: (side: PanelSide) => void;
  setActiveTab: (side: PanelSide, id: ModuleId) => void;
  reorderTabs: (side: PanelSide, ids: ModuleId[]) => void;
  reorderRail: (side: PanelSide, ids: ModuleId[]) => void;
  /** Move an icon from one rail to the other (drag-between-rails). No-op when
   *  the id isn't on the source rail. */
  moveIcon: (from: PanelSide, to: PanelSide, id: ModuleId) => void;
  /** Dock a module as a tab on a panel (the "+" module picker). Removes the id
   *  from either rail and appends it to the panel's tabs, then activates it.
   *  No-op when it's already a tab on that panel. */
  addModuleToPanel: (side: PanelSide, id: ModuleId) => void;
  /** Restore the seeded default arrangement. */
  resetToDefault: () => void;
}

/**
 * Per-teacher Teach workspace layout.
 *
 * Provider-less: a single consumer (TeachShell) drives the whole workspace, so
 * the hook owns its own state + the localStorage round-trip directly. Mutators
 * are pure functional updates so React can batch them and the write-through
 * effect sees the committed value.
 */
export function useTeachWorkspace(): UseTeachWorkspaceReturn {
  const [layout, setLayout] = useState<WorkspaceLayout>(cloneDefault);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // Post-mount hydration — load the saved layout, then open the write gate.
  useEffect(() => {
    const stored = readLayout();
    setLayout(stored);
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  // Centralized mutate-and-persist. Applies the updater, then writes the
  // result through to storage — but only once hydration has run, so the
  // initial mount + hydration pass don't clobber the saved blob.
  const update = useCallback(
    (updater: (prev: WorkspaceLayout) => WorkspaceLayout): void => {
      setLayout((prev) => {
        const next = updater(prev);
        if (hydratedRef.current) writeLayout(next);
        return next;
      });
    },
    [],
  );

  const setPanelWidth = useCallback(
    (side: PanelSide, px: number): void => {
      update((prev) => {
        const clamped = clampWidth(px);
        if (prev[side].width === clamped) return prev;
        return { ...prev, [side]: { ...prev[side], width: clamped } };
      });
    },
    [update],
  );

  const toggleCollapse = useCallback(
    (side: PanelSide): void => {
      update((prev) => ({
        ...prev,
        [side]: { ...prev[side], collapsed: !prev[side].collapsed },
      }));
    },
    [update],
  );

  const setActiveTab = useCallback(
    (side: PanelSide, id: ModuleId): void => {
      update((prev) => {
        // Only activate a tab the panel actually hosts.
        if (!prev[side].tabs.includes(id)) return prev;
        if (prev[side].activeTab === id) return prev;
        return { ...prev, [side]: { ...prev[side], activeTab: id } };
      });
    },
    [update],
  );

  const reorderTabs = useCallback(
    (side: PanelSide, ids: ModuleId[]): void => {
      update((prev) => {
        // Trust only ids the panel already hosts — a reorder reorders, it
        // never adds or drops. Keep the current set; reject a malformed list.
        const current = prev[side].tabs;
        const next = sanitizeIds(ids).filter((id) => current.includes(id));
        if (next.length !== current.length) return prev;
        const active = next.includes(prev[side].activeTab)
          ? prev[side].activeTab
          : next[0];
        return {
          ...prev,
          [side]: { ...prev[side], tabs: next, activeTab: active },
        };
      });
    },
    [update],
  );

  const reorderRail = useCallback(
    (side: PanelSide, ids: ModuleId[]): void => {
      const railKey = side === "left" ? "leftRail" : "rightRail";
      update((prev) => {
        const current = prev[railKey];
        const next = sanitizeIds(ids).filter((id) => current.includes(id));
        if (next.length !== current.length) return prev;
        return { ...prev, [railKey]: next };
      });
    },
    [update],
  );

  const moveIcon = useCallback(
    (from: PanelSide, to: PanelSide, id: ModuleId): void => {
      if (from === to) return;
      const fromKey = from === "left" ? "leftRail" : "rightRail";
      const toKey = to === "left" ? "leftRail" : "rightRail";
      update((prev) => {
        if (!prev[fromKey].includes(id)) return prev;
        const nextFrom = prev[fromKey].filter((x) => x !== id);
        // Guard against a duplicate landing on the destination rail.
        const nextTo = prev[toKey].includes(id)
          ? prev[toKey]
          : [...prev[toKey], id];
        return { ...prev, [fromKey]: nextFrom, [toKey]: nextTo };
      });
    },
    [update],
  );

  const addModuleToPanel = useCallback(
    (side: PanelSide, id: ModuleId): void => {
      update((prev) => {
        if (prev[side].tabs.includes(id)) {
          // Already docked here — just activate it.
          return prev[side].activeTab === id
            ? prev
            : { ...prev, [side]: { ...prev[side], activeTab: id } };
        }
        // Detach from wherever it currently lives — either rail or the OTHER
        // panel's tabs — so a module is never docked in two places at once.
        const otherSide: PanelSide = side === "left" ? "right" : "left";
        const otherTabs = prev[otherSide].tabs.filter((x) => x !== id);
        // INVARIANT (v1, fix (a)): a panel must never be emptied of all tabs,
        // AND a module must never be docked in two panels at once. When `id`
        // is the OTHER panel's SOLE tab, honoring both is impossible —
        // detaching it empties that panel, but keeping it (to avoid the empty
        // panel) would leave it docked in both. We resolve the conflict by
        // making the move a NO-OP in that case. (The "+" picker realistically
        // only offers rail/undocked modules, so this is a defensive guard;
        // but the guard must still be correct if offered an other-panel
        // module that is its panel's only tab.) v1 has no empty-panel UI;
        // allowing the empty panel (fix (b)) is the alternative if that
        // changes.
        const idIsOnOtherPanel = prev[otherSide].tabs.includes(id);
        if (idIsOnOtherPanel && otherTabs.length === 0) return prev;
        const nextLeftRail = prev.leftRail.filter((x) => x !== id);
        const nextRightRail = prev.rightRail.filter((x) => x !== id);
        const otherActive = otherTabs.includes(prev[otherSide].activeTab)
          ? prev[otherSide].activeTab
          : otherTabs[0];
        const nextTabs = [...prev[side].tabs, id];
        return {
          ...prev,
          leftRail: nextLeftRail,
          rightRail: nextRightRail,
          // Only rebuild the other panel when `id` was actually a tab there;
          // otherwise leave it untouched (a no-op spread would be wasteful and
          // the activeTab recompute is meaningless when nothing was removed).
          [otherSide]: idIsOnOtherPanel
            ? { ...prev[otherSide], tabs: otherTabs, activeTab: otherActive }
            : prev[otherSide],
          [side]: { ...prev[side], tabs: nextTabs, activeTab: id },
        };
      });
    },
    [update],
  );

  const resetToDefault = useCallback((): void => {
    update(() => cloneDefault());
  }, [update]);

  return {
    layout,
    hydrated,
    setPanelWidth,
    toggleCollapse,
    setActiveTab,
    reorderTabs,
    reorderRail,
    moveIcon,
    addModuleToPanel,
    resetToDefault,
  };
}
