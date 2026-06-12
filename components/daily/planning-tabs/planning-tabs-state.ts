// planning-tabs-state.ts — the planning panel's persisted-arrangement model.
//
// Pure data layer for PlanningTabs.tsx (the dock-model.ts pattern): the
// tool vocabulary, the persisted shape, and the localStorage read/write/
// normalize pipeline live here, free of JSX, so the contract is unit-
// testable and the component file stays presentation-focused.
//
// Persistence discipline (components/daily/dock/dock-model.ts): server
// render = defaults, the saved state loads in a post-mount effect, a
// hydrated ref gates writes, and the parsed shape is validated/normalized
// before use.

export type PlanningToolKey =
  | "objective"
  | "standards"
  | "notes"
  | "diff"
  | "chat"
  | "resources";

/** Fixed identity order — the canonical tool sequence, also the "+" menu
 *  listing order. The teacher's own arrangement lives in persisted state. */
export const TOOL_KEYS: readonly PlanningToolKey[] = [
  "objective",
  "standards",
  "notes",
  "diff",
  "chat",
  "resources",
];

/** Chat + Resources start hidden — addable via the "+" menu. */
export const DEFAULT_HIDDEN: readonly PlanningToolKey[] = ["chat", "resources"];

/** Persisted shape: the teacher's tool arrangement. `order` is always a
 *  permutation of all six tools (hidden tools keep their slot so re-adding
 *  restores a tool where it was); `hidden` is the closed set; `active` is
 *  the open pane. */
export interface PlanningTabsState {
  order: PlanningToolKey[];
  hidden: PlanningToolKey[];
  active: PlanningToolKey | null;
}

export const PLAN_TABS_KEY = "cc_daily_plantabs_v1";

export function defaultPlanningTabsState(): PlanningTabsState {
  return {
    order: [...TOOL_KEYS],
    hidden: [...DEFAULT_HIDDEN],
    active: "objective",
  };
}

export function isToolKey(v: unknown): v is PlanningToolKey {
  return typeof v === "string" && (TOOL_KEYS as readonly string[]).includes(v);
}

/** Normalize a parsed candidate into a valid state:
 *  - `order` is a permutation of all six tools (unknowns/dupes dropped,
 *    missing tools appended in canonical order);
 *  - `hidden` ⊆ tools, deduped;
 *  - `active` must be a VISIBLE tool — else the first visible, else null. */
export function normalizePlanningTabs(raw: unknown): PlanningTabsState {
  const base = defaultPlanningTabsState();
  if (typeof raw !== "object" || raw === null) return base;
  const c = raw as Record<string, unknown>;

  const order: PlanningToolKey[] = [];
  if (Array.isArray(c.order)) {
    for (const k of c.order) {
      if (isToolKey(k) && !order.includes(k)) order.push(k);
    }
  }
  for (const k of TOOL_KEYS) if (!order.includes(k)) order.push(k);

  const hidden: PlanningToolKey[] = [];
  if (Array.isArray(c.hidden)) {
    for (const k of c.hidden) {
      if (isToolKey(k) && !hidden.includes(k)) hidden.push(k);
    }
  } else {
    hidden.push(...DEFAULT_HIDDEN);
  }

  const visible = order.filter((k) => !hidden.includes(k));
  const active =
    isToolKey(c.active) && visible.includes(c.active)
      ? c.active
      : (visible[0] ?? null);

  return { order, hidden, active };
}

/** Read the saved state, or the default. SSR-guarded. */
export function readPlanningTabs(): PlanningTabsState {
  if (typeof window === "undefined") return defaultPlanningTabsState();
  try {
    const raw = window.localStorage.getItem(PLAN_TABS_KEY);
    if (!raw) return defaultPlanningTabsState();
    return normalizePlanningTabs(JSON.parse(raw) as unknown);
  } catch {
    // Corrupt or unavailable storage — fall back to the defaults.
    return defaultPlanningTabsState();
  }
}

/** Persist the state. Non-fatal on failure. */
export function writePlanningTabs(state: PlanningTabsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAN_TABS_KEY, JSON.stringify(state));
  } catch {
    // Storage full / unavailable — the arrangement simply won't persist.
  }
}
