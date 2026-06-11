// dock-model.ts — data model + persistence for the Daily view's dockable
// panel system (6.11.26 design_handoff_daily_view).
//
// The Daily body is THREE slots (left / center / right). Each slot hosts
// zero or more dock PANELS — `day` (the lesson-list column), `lesson` (the
// center lesson detail), and `side` (the Resources / To-do / Chat rail).
// Teachers move panels between slots by dragging a slot tab, collapse the
// side slots to a 50px icon rail, unpin them into a hover-peek overlay,
// and resize the columns with the splitters.
//
// The full layout state persists to ONE localStorage key so a reload
// restores the teacher's arrangement exactly. Persistence follows the
// codebase's SSR discipline: the default state is used for the server
// render and the first client render; the saved state loads post-mount
// (see useDockLayout.ts).

export type SlotKey = "left" | "center" | "right";
export type DockPanelId = "day" | "lesson" | "side";
export type SlotMode = "tabs" | "stack";

export const SLOT_KEYS: readonly SlotKey[] = ["left", "center", "right"];
export const DOCK_PANEL_IDS: readonly DockPanelId[] = ["day", "lesson", "side"];

/** Human-readable panel titles — slot tabs, dock-ghost header, aria. */
export const DOCK_PANEL_TITLE: Record<DockPanelId, string> = {
  day: "Day",
  lesson: "Lesson",
  side: "Side panel",
};

/** Default column flex-grow ratios (from the design handoff). The values
 *  double as pseudo-px proportions: 312 / 620 / 332. */
export const SLOT_DEFAULT_WIDTH: Record<SlotKey, number> = {
  left: 312,
  center: 620,
  right: 332,
};

/** Minimum column widths in px (handoff: left 220 / center 340 / right 260).
 *  Mirrored in Dock.module.css min-width rules; the splitter drag math
 *  clamps against these too. */
export const SLOT_MIN_WIDTH: Record<SlotKey, number> = {
  left: 220,
  center: 340,
  right: 260,
};

/** Per-slot state. `width` is the `--w` flex-grow ratio (null → default).
 *  `usermode` is the teacher's tabs/stack choice — the EFFECTIVE mode may
 *  override it to "tabs" (center slot, or any slot holding `lesson`). */
export interface DockSlotState {
  panels: DockPanelId[];
  active: DockPanelId | null;
  collapsed: boolean;
  pinned: boolean;
  usermode: SlotMode | null;
  width: number | null;
}

export interface DockLayoutState {
  slots: Record<SlotKey, DockSlotState>;
}

/** Home slot per panel — where a panel returns if a saved layout omits it. */
const PANEL_HOME: Record<DockPanelId, SlotKey> = {
  day: "left",
  lesson: "center",
  side: "right",
};

export function defaultDockLayout(): DockLayoutState {
  return {
    slots: {
      left: { panels: ["day"], active: "day", collapsed: false, pinned: true, usermode: null, width: null }, // prettier-ignore
      center: { panels: ["lesson"], active: "lesson", collapsed: false, pinned: true, usermode: null, width: null }, // prettier-ignore
      right: { panels: ["side"], active: "side", collapsed: false, pinned: true, usermode: null, width: null }, // prettier-ignore
    },
  };
}

export const DOCK_LAYOUT_KEY = "mycurricula:daily-dock-layout-v1";

function isPanelId(v: unknown): v is DockPanelId {
  return (
    typeof v === "string" && (DOCK_PANEL_IDS as readonly string[]).includes(v)
  );
}

/** Normalize a parsed candidate into a valid layout:
 *  - every panel appears EXACTLY once (duplicates dropped, missing panels
 *    returned to their home slot);
 *  - each slot's `active` is one of its panels (or its first panel);
 *  - widths are finite positive numbers or null;
 *  - collapse/pin only meaningful on side slots (center is never railed). */
export function normalizeDockLayout(raw: unknown): DockLayoutState {
  const base = defaultDockLayout();
  if (typeof raw !== "object" || raw === null) return base;
  const rawSlots = (raw as { slots?: unknown }).slots;
  if (typeof rawSlots !== "object" || rawSlots === null) return base;

  const seen = new Set<DockPanelId>();
  const out = defaultDockLayout();
  for (const key of SLOT_KEYS) out.slots[key].panels = [];

  for (const key of SLOT_KEYS) {
    const cand = (rawSlots as Record<string, unknown>)[key];
    if (typeof cand !== "object" || cand === null) continue;
    const c = cand as Record<string, unknown>;
    const panels = Array.isArray(c.panels) ? c.panels.filter(isPanelId) : [];
    for (const p of panels) {
      if (!seen.has(p)) {
        seen.add(p);
        out.slots[key].panels.push(p);
      }
    }
    out.slots[key].collapsed = c.collapsed === true;
    out.slots[key].pinned = c.pinned !== false;
    out.slots[key].usermode =
      c.usermode === "tabs" || c.usermode === "stack" ? c.usermode : null;
    const w = typeof c.width === "number" ? c.width : null;
    out.slots[key].width = w !== null && Number.isFinite(w) && w > 0 ? w : null;
    out.slots[key].active = isPanelId(c.active) ? c.active : null;
  }

  // Return any missing panel to its home slot.
  for (const p of DOCK_PANEL_IDS) {
    if (!seen.has(p)) out.slots[PANEL_HOME[p]].panels.push(p);
  }

  // Repair active pointers + side-only collapse semantics.
  for (const key of SLOT_KEYS) {
    const slot = out.slots[key];
    if (slot.active === null || !slot.panels.includes(slot.active)) {
      slot.active = slot.panels[0] ?? null;
    }
    if (key === "center") {
      slot.collapsed = false;
      slot.pinned = true;
    }
  }
  return out;
}

/** Read the saved layout, or the default. SSR-guarded. */
export function readDockLayout(): DockLayoutState {
  if (typeof window === "undefined") return defaultDockLayout();
  try {
    const raw = window.localStorage.getItem(DOCK_LAYOUT_KEY);
    if (!raw) return defaultDockLayout();
    return normalizeDockLayout(JSON.parse(raw) as unknown);
  } catch {
    // Corrupt or unavailable storage — fall back to the default layout.
    return defaultDockLayout();
  }
}

/** Persist the layout. Non-fatal on failure. */
export function writeDockLayout(layout: DockLayoutState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCK_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Storage full / unavailable — layout simply won't persist; non-fatal.
  }
}

/** A side slot reads as a 50px icon rail when collapsed OR floating. */
export function isRailed(key: SlotKey, slot: DockSlotState): boolean {
  if (key === "center") return false;
  return slot.collapsed || !slot.pinned;
}

/** Effective display mode for a slot: the center slot — and any slot
 *  holding the `lesson` panel — is forced to tabs (the lesson detail is
 *  too tall to stack under another panel). */
export function effectiveMode(key: SlotKey, slot: DockSlotState): SlotMode {
  if (key === "center" || slot.panels.includes("lesson")) return "tabs";
  return slot.usermode ?? "tabs";
}

/** Whether the tabs/stack segmented control should render for a slot. */
export function modeChoiceAvailable(
  key: SlotKey,
  slot: DockSlotState,
): boolean {
  return (
    key !== "center" &&
    !slot.panels.includes("lesson") &&
    slot.panels.length > 1
  );
}
