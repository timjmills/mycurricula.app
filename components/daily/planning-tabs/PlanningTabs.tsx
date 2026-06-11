"use client";

// PlanningTabs.tsx — the Daily lesson detail's PLANNING TABS panel
// (6.11.26 design_handoff_daily_view §6 "Planning tabs").
//
// A browser-style tab strip seated on a white content card, sitting between
// the lesson title block and the lesson-flow/agenda area. Six TOOLS, fixed
// identity order: objective · standards · notes (Lesson notes) · diff
// (Differentiation) · chat · resources. The first four are visible by
// default; Chat + Resources start hidden and are addable from the "+"
// popover menu. Each tool carries a `--pc` accent color that paints the
// colored bar across its tab top (3px at 50% opacity → 85% hover → 4px at
// 100% active) and tints its pane icon.
//
// Interactions (behavioral spec = the prototype's plan-tabs IIFE):
//   • Click a tab → activate its pane.
//   • Drag a tab within the strip → reorder (midpoint insertion; the
//     dragged tab renders at 40% opacity). HTML5 drag — no new deps.
//   • Close (the 17px circle, hidden until tab hover/active) → hides the
//     tool; it returns via the "+" menu. Closing the active tab activates
//     the first remaining tool. (The prototype's drag-to-sidenav "Context"
//     drop target doesn't exist in production — approved deviation.)
//   • Zero visible tools → a dashed empty state with an "Add a tool"
//     button that opens the same popover.
//   • "+" popover lists hidden tools with their icon + accent; when all
//     six are visible it reads "All tools are in the panel". Closes on
//     outside click and Escape.
//
// Accessibility: the strip is a true role="tablist". The CLICKABLE tab is
// a real <button role="tab"> with aria-selected + roving tabindex and
// Left/Right/Home/End arrow navigation; the close button is a SIBLING of
// that button inside the styled wrapper (nested buttons are invalid HTML).
// Panes are role="tabpanel" labelled by their tab. Visible panes stay
// MOUNTED and toggle via display (the prototype's .on pattern) so editor
// and chat state survive tab switches.
//
// Persistence: visible set + order + active tool → ONE localStorage key
// (`cc_daily_plantabs_v1`), following the dock-model discipline
// (components/daily/dock/dock-model.ts): server render = defaults, the
// saved state loads in a post-mount effect, a hydrated ref gates writes,
// and the parsed shape is validated/normalized before use.
//
// Store wiring (planner-store) — same coalesced-editLesson pattern the
// host LessonDetail uses for its title editor:
//   objective       → editLesson(id, { objective }, coalesced) — the pane
//                     edits the FULL stored objective text.
//   notes           → editLesson(id, { notes }, coalesced). This pane is
//                     the former bottom "My notes" section of LessonDetail,
//                     moved here wholesale (state + store-sync + guards).
//   differentiation → editLesson(id, { differentiation }, coalesced) —
//                     three tier editors (Support / On level / Extension)
//                     writing the WHOLE LessonDifferentiation object.
//   standards       → read-only rows from lesson.standards via
//                     describeStandard().
//   chat            → the existing <Shoutbox> for the lesson's day.
//   resources       → read-only lesson.resources rows (ResourceTypePill
//                     from the lesson-flow barrel + label + type).
//
// The host activates a tool programmatically (the action-row "Lesson
// notes" button) through the forwarded PlanningTabsHandle.

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import type { Lesson, LessonDifferentiation } from "@/lib/types";
import { describeStandard } from "@/lib/mock";
import { usePlanner } from "@/lib/planner-store";
import { RichTextEditor } from "@/components/rich-text";
import { ResourceTypePill } from "@/components/lesson-flow";
import { Tooltip } from "@/components/ui";
import { Shoutbox } from "../Shoutbox";
import styles from "./planning-tabs.module.css";

// ── Tool model ───────────────────────────────────────────────────────────

export type PlanningToolKey =
  | "objective"
  | "standards"
  | "notes"
  | "diff"
  | "chat"
  | "resources";

/** Fixed identity order — the canonical tool sequence, also the "+" menu
 *  listing order. The teacher's own arrangement lives in persisted state. */
const TOOL_KEYS: readonly PlanningToolKey[] = [
  "objective",
  "standards",
  "notes",
  "diff",
  "chat",
  "resources",
];

/** Chat + Resources start hidden — addable via the "+" menu. */
const DEFAULT_HIDDEN: readonly PlanningToolKey[] = ["chat", "resources"];

/** Per-tool label (sentence case per the design system) + `--pc` accent. */
const TOOL_META: Record<PlanningToolKey, { label: string; color: string }> = {
  objective: { label: "Objective", color: "var(--brand-500)" },
  standards: { label: "Standards", color: "var(--done)" },
  notes: { label: "Lesson notes", color: "var(--writing-bright)" },
  diff: { label: "Differentiation", color: "var(--grammar-bright)" },
  chat: { label: "Chat", color: "var(--reading-bright)" },
  resources: { label: "Resources", color: "var(--explorers-bright)" },
};

// ── Persistence (dock-model discipline) ──────────────────────────────────

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

function defaultPlanningTabsState(): PlanningTabsState {
  return {
    order: [...TOOL_KEYS],
    hidden: [...DEFAULT_HIDDEN],
    active: "objective",
  };
}

function isToolKey(v: unknown): v is PlanningToolKey {
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
function readPlanningTabs(): PlanningTabsState {
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
function writePlanningTabs(state: PlanningTabsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAN_TABS_KEY, JSON.stringify(state));
  } catch {
    // Storage full / unavailable — the arrangement simply won't persist.
  }
}

// ── Icons — stroke-based, currentColor, from the design handoff ──────────

function ToolIcon({ tool }: { tool: PlanningToolKey }): ReactNode {
  switch (tool) {
    case "objective": // concentric target
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
    case "standards": // open book
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 7c-1.5-1.2-3.5-2-6-2v13c2.5 0 4.5.8 6 2 1.5-1.2 3.5-2 6-2V5c-2.5 0-4.5.8-6 2Z" />
          <path d="M12 7v13" />
        </svg>
      );
    case "notes": // page with lines
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M16 3v5h5M8 12h6M8 16h4" />
        </svg>
      );
    case "diff": // three-node branch
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="12" r="2.5" />
          <path d="M8.2 7.4 15.5 11M8.2 16.6 15.5 13" />
        </svg>
      );
    case "chat": // speech bubble
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "resources": // folder
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6l1.8 1.8h7.6A1.5 1.5 0 0 1 20 9.3v7.2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z" />
        </svg>
      );
  }
}

/** 6-dot drag grip — the shared reorder affordance vocabulary. */
function GripIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function CloseIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PlusIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// ── Public handle + props ────────────────────────────────────────────────

export interface PlanningTabsHandle {
  /** Make `tool` visible (re-adding it if closed) and activate its pane.
   *  With `focus: true` the panel scrolls into view and focus lands in
   *  the pane's first editable region — the action-row "Lesson notes"
   *  jump uses this. */
  activate: (tool: PlanningToolKey, opts?: { focus?: boolean }) => void;
}

export interface PlanningTabsProps {
  lesson: Lesson;
  /** Docked rich-text toolbar target — threaded into every pane editor
   *  (the host's scrollable detail body, same ref <LessonFlow> gets). */
  dockTarget?: RefObject<HTMLElement | null>;
}

// ── Component ────────────────────────────────────────────────────────────

export const PlanningTabs = forwardRef<PlanningTabsHandle, PlanningTabsProps>(
  function PlanningTabs({ lesson, dockTarget }, ref): ReactNode {
    const { editLesson } = usePlanner();
    const uid = useId();

    // ── Tool arrangement — SSR-safe persisted state ───────────────────
    // Server render + first client paint use the defaults; the saved
    // arrangement loads post-mount. hydratedRef gates writes so the
    // default state never clobbers a saved one before the load runs.
    const [tabsState, setTabsState] = useState<PlanningTabsState>(
      defaultPlanningTabsState,
    );
    const hydratedRef = useRef(false);
    useEffect(() => {
      setTabsState(readPlanningTabs());
      hydratedRef.current = true;
    }, []);
    useEffect(() => {
      if (!hydratedRef.current) return;
      writePlanningTabs(tabsState);
    }, [tabsState]);

    const visibleTools = tabsState.order.filter(
      (k) => !tabsState.hidden.includes(k),
    );
    const hiddenTools = TOOL_KEYS.filter((k) => tabsState.hidden.includes(k));
    const active = tabsState.active;

    // ── Activate / close / add ────────────────────────────────────────

    function activateTool(tool: PlanningToolKey): void {
      setTabsState((s) => {
        const hidden = s.hidden.filter((k) => k !== tool);
        return { ...s, hidden, active: tool };
      });
    }

    function closeTool(tool: PlanningToolKey): void {
      setTabsState((s) => {
        if (s.hidden.includes(tool)) return s;
        const hidden = [...s.hidden, tool];
        const visible = s.order.filter((k) => !hidden.includes(k));
        const active = s.active === tool ? (visible[0] ?? null) : s.active;
        return { ...s, hidden, active };
      });
    }

    // ── "+" popover menu — outside click + Escape to close ───────────
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const addBtnRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
      if (!menuOpen) return;
      function onPointerDown(e: PointerEvent): void {
        const t = e.target as Node;
        if (menuRef.current?.contains(t)) return;
        if (addBtnRef.current?.contains(t)) return;
        setMenuOpen(false);
      }
      function onKeyDown(e: globalThis.KeyboardEvent): void {
        if (e.key === "Escape") setMenuOpen(false);
      }
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [menuOpen]);

    // ── Drag-to-reorder (HTML5 drag, midpoint insertion) ─────────────
    const [dragKey, setDragKey] = useState<PlanningToolKey | null>(null);
    const tabRefs = useRef(new Map<PlanningToolKey, HTMLDivElement>());

    function handleStripDragOver(e: DragEvent<HTMLDivElement>): void {
      if (!dragKey) return;
      e.preventDefault();
      // First visible tab whose horizontal midpoint is right of the
      // pointer — the dragged tab inserts before it (or at the end).
      let before: PlanningToolKey | null = null;
      for (const k of visibleTools) {
        if (k === dragKey) continue;
        const el = tabRefs.current.get(k);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (e.clientX < b.left + b.width / 2) {
          before = k;
          break;
        }
      }
      setTabsState((s) => {
        const rest = s.order.filter((k) => k !== dragKey);
        let idx: number;
        if (before) {
          idx = rest.indexOf(before);
        } else {
          // After the LAST visible tool (hidden tools keep their slots).
          idx = 0;
          for (let i = rest.length - 1; i >= 0; i--) {
            if (!s.hidden.includes(rest[i])) {
              idx = i + 1;
              break;
            }
          }
        }
        const order = [...rest];
        order.splice(idx, 0, dragKey);
        // No-op guard — avoid a render (and a persistence write) per
        // dragover event when nothing moved.
        if (order.every((k, i) => k === s.order[i])) return s;
        return { ...s, order };
      });
    }

    // ── Arrow-key navigation (roving tabindex, automatic activation) ─
    const tabBtnRefs = useRef(new Map<PlanningToolKey, HTMLButtonElement>());

    function handleTabKeyDown(
      e: KeyboardEvent<HTMLButtonElement>,
      tool: PlanningToolKey,
    ): void {
      const idx = visibleTools.indexOf(tool);
      let next: PlanningToolKey | undefined;
      if (e.key === "ArrowRight") {
        next = visibleTools[(idx + 1) % visibleTools.length];
      } else if (e.key === "ArrowLeft") {
        next =
          visibleTools[(idx - 1 + visibleTools.length) % visibleTools.length];
      } else if (e.key === "Home") {
        next = visibleTools[0];
      } else if (e.key === "End") {
        next = visibleTools[visibleTools.length - 1];
      }
      if (!next) return;
      e.preventDefault();
      activateTool(next);
      tabBtnRefs.current.get(next)?.focus();
    }

    // ── Host-driven activation (action-row "Lesson notes" button) ────
    const rootRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => ({
      activate(tool, opts) {
        activateTool(tool);
        if (!opts?.focus) return;
        const root = rootRef.current;
        if (!root) return;
        root.scrollIntoView({ behavior: "smooth", block: "start" });
        // Defer focus a tick so the smooth scroll can begin first and the
        // newly-activated pane is display:flex before we query it.
        window.setTimeout(() => {
          const editable = root.querySelector<HTMLElement>(
            `[data-plan-pane="${tool}"] [contenteditable="true"]`,
          );
          editable?.focus();
        }, 80);
      },
    }));

    // ── Objective — editable rich text, coalesced store writes ───────
    // The exact "My notes" pattern: local html state drives the editor
    // synchronously; every change coalesce-commits to the store; an
    // editing guard stops external store updates (undo/redo) from
    // overwriting mid-edit content; the editor reseeds on lesson change.
    const [objectiveHtml, setObjectiveHtml] = useState<string>(
      lesson.objective ?? "",
    );
    const objectiveEditingRef = useRef(false);

    // ── Lesson notes — MOVED here from LessonDetail's bottom section ─
    const [notesHtml, setNotesHtml] = useState<string>(lesson.notes ?? "");
    const notesEditingRef = useRef(false);

    // ── Differentiation — three tiers, whole-object store writes ─────
    const emptyDiff: LessonDifferentiation = {
      support: "",
      onLevel: "",
      extension: "",
    };
    const [diffHtml, setDiffHtml] = useState<LessonDifferentiation>(
      lesson.differentiation ?? emptyDiff,
    );
    const diffEditingRef = useRef(false);

    // When the selected lesson changes, reseed every editor from the new
    // lesson's fields and clear the editing guards.
    useEffect(() => {
      setObjectiveHtml(lesson.objective ?? "");
      setNotesHtml(lesson.notes ?? "");
      setDiffHtml(lesson.differentiation ?? emptyDiff);
      objectiveEditingRef.current = false;
      notesEditingRef.current = false;
      diffEditingRef.current = false;
    }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // When a store value changes while this lesson stays selected (e.g.
    // undo/redo from another view), reseed the matching editor — but only
    // if the teacher is not actively typing in it.
    const storeObjective = lesson.objective ?? "";
    useEffect(() => {
      if (!objectiveEditingRef.current) setObjectiveHtml(storeObjective);
    }, [storeObjective]); // eslint-disable-line react-hooks/exhaustive-deps

    const storeNotes = lesson.notes ?? "";
    useEffect(() => {
      if (!notesEditingRef.current) setNotesHtml(storeNotes);
    }, [storeNotes]); // eslint-disable-line react-hooks/exhaustive-deps

    const storeDiff = lesson.differentiation;
    useEffect(() => {
      if (!diffEditingRef.current) setDiffHtml(storeDiff ?? emptyDiff);
    }, [storeDiff?.support, storeDiff?.onLevel, storeDiff?.extension]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleObjectiveChange(html: string): void {
      objectiveEditingRef.current = true;
      setObjectiveHtml(html);
      editLesson(
        lesson.id,
        { objective: html },
        { key: `lesson:${lesson.id}:objective`, ts: Date.now() },
      );
    }

    function handleNotesChange(html: string): void {
      notesEditingRef.current = true;
      setNotesHtml(html);
      editLesson(
        lesson.id,
        { notes: html },
        { key: `lesson:${lesson.id}:notes`, ts: Date.now() },
      );
    }

    function handleDiffChange(
      tier: keyof LessonDifferentiation,
      html: string,
    ): void {
      diffEditingRef.current = true;
      const next: LessonDifferentiation = { ...diffHtml, [tier]: html };
      setDiffHtml(next);
      editLesson(
        lesson.id,
        { differentiation: next },
        { key: `lesson:${lesson.id}:differentiation`, ts: Date.now() },
      );
    }

    // ── Pane renderers ────────────────────────────────────────────────

    function renderPaneContent(tool: PlanningToolKey): ReactNode {
      switch (tool) {
        case "objective":
          return (
            <div
              className={styles.paneEditor}
              onBlurCapture={() => {
                objectiveEditingRef.current = false;
              }}
            >
              <RichTextEditor
                value={objectiveHtml}
                onChange={handleObjectiveChange}
                placeholder="Add a lesson objective…"
                ariaLabel="Lesson objective"
                dockTarget={dockTarget}
              />
            </div>
          );
        case "standards":
          return lesson.standards.length > 0 ? (
            <div className={styles.stdList}>
              {lesson.standards.map((code) => (
                <div key={code} className={styles.stdItem}>
                  <span className={styles.stdCode}>{code}</span>
                  <span className={styles.stdDesc}>
                    {describeStandard(code)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.paneEmptyText}>
              No standards tagged on this lesson yet.
            </p>
          );
        case "notes":
          return (
            <div
              className={styles.paneEditor}
              onBlurCapture={() => {
                notesEditingRef.current = false;
              }}
            >
              <RichTextEditor
                value={notesHtml}
                onChange={handleNotesChange}
                placeholder="Add private notes for yourself…"
                ariaLabel="Teacher notes"
                dockTarget={dockTarget}
              />
            </div>
          );
        case "diff":
          return (
            <div
              className={styles.diffGrid}
              onBlurCapture={() => {
                diffEditingRef.current = false;
              }}
            >
              {(
                [
                  ["support", "Support"],
                  ["onLevel", "On level"],
                  ["extension", "Extension"],
                ] as const
              ).map(([tier, label]) => (
                <div key={tier} className={styles.diffCol}>
                  <h5>{label}</h5>
                  <div className={styles.diffColBody}>
                    <RichTextEditor
                      value={diffHtml[tier]}
                      onChange={(html) => handleDiffChange(tier, html)}
                      placeholder={`Plan the ${label.toLowerCase()} tier…`}
                      ariaLabel={`Differentiation — ${label}`}
                      dockTarget={dockTarget}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        case "chat":
          // Compact reuse of the day-scoped team chat — the lesson knows
          // its own week + day, so the thread tracks the selected lesson.
          return <Shoutbox week={lesson.week} day={lesson.day} />;
        case "resources":
          return lesson.resources.length > 0 ? (
            <div className={styles.resList}>
              {lesson.resources.map((r, i) => (
                <div key={`${r.label}-${i}`} className={styles.resRow}>
                  <ResourceTypePill type={r.type} />
                  <span className={styles.resLabel}>{r.label}</span>
                  <span className={styles.resType}>{r.type}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.paneEmptyText}>
              No resources attached to this lesson yet.
            </p>
          );
      }
    }

    // ── Add-tool menu (shared by the "+" button and the empty state) ──

    const menu = menuOpen && (
      <div
        ref={menuRef}
        className={styles.menu}
        role="menu"
        aria-label="Add a tool"
      >
        <div className={styles.menuLabel}>Add a tool</div>
        {hiddenTools.length > 0 ? (
          hiddenTools.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              style={{ "--pc": TOOL_META[k].color } as CSSProperties}
              onClick={() => {
                activateTool(k);
                setMenuOpen(false);
              }}
            >
              <span className={styles.menuItemIcon}>
                <ToolIcon tool={k} />
              </span>
              {TOOL_META[k].label}
            </button>
          ))
        ) : (
          <div className={styles.menuEmpty}>All tools are in the panel</div>
        )}
      </div>
    );

    const isEmpty = visibleTools.length === 0;

    return (
      <div
        ref={rootRef}
        className={styles.wrap}
        title="Planning tools panel — quick tabs for this lesson's objective, standards, notes, differentiation, chat, and resources. Drag tabs to reorder, close the ones you don't use, and add them back with the + button."
      >
        {/* ── Tab strip + "+" add button + popover ───────────────────── */}
        <div className={styles.tabsRow}>
          <div className={styles.tabsScroll}>
            <div
              className={styles.tabs}
              role="tablist"
              aria-label="Lesson planning"
              onDragOver={handleStripDragOver}
            >
              {visibleTools.map((k) => {
                const on = k === active;
                return (
                  /* Styled wrapper — drag source. The role="tab" button and
                     the close button are SIBLINGS inside it (nested buttons
                     are invalid HTML). */
                  <div
                    key={k}
                    ref={(el) => {
                      if (el) tabRefs.current.set(k, el);
                      else tabRefs.current.delete(k);
                    }}
                    className={`${styles.tab} ${on ? styles.tabOn : ""} ${
                      dragKey === k ? styles.tabDragging : ""
                    }`}
                    style={{ "--pc": TOOL_META[k].color } as CSSProperties}
                    draggable
                    onDragStart={(e) => {
                      setDragKey(k);
                      try {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", `plan:${k}`);
                      } catch {
                        // Some engines throw on setData with custom types.
                      }
                    }}
                    onDragEnd={() => setDragKey(null)}
                    title={`${TOOL_META[k].label} — click to open; drag to reorder the tools`}
                  >
                    <button
                      type="button"
                      role="tab"
                      id={`${uid}-tab-${k}`}
                      aria-selected={on}
                      aria-controls={`${uid}-pane-${k}`}
                      tabIndex={on ? 0 : -1}
                      className={styles.tabBtn}
                      ref={(el) => {
                        if (el) tabBtnRefs.current.set(k, el);
                        else tabBtnRefs.current.delete(k);
                      }}
                      onClick={() => activateTool(k)}
                      onKeyDown={(e) => handleTabKeyDown(e, k)}
                    >
                      <span className={styles.grip} aria-hidden="true">
                        <GripIcon />
                      </span>
                      <span className={styles.tabIcon} aria-hidden="true">
                        <ToolIcon tool={k} />
                      </span>
                      {TOOL_META[k].label}
                    </button>
                    <Tooltip
                      content={`Hide the ${TOOL_META[k].label} tool from this panel — bring it back any time with the + button`}
                      side="bottom"
                      tooltipId="planning-tabs-close-tool"
                    >
                      <button
                        type="button"
                        className={styles.tabClose}
                        aria-label={`Close ${TOOL_META[k].label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTool(k);
                        }}
                      >
                        <CloseIcon />
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
            <Tooltip
              content="Add a planning tool to this panel — tools you closed (like Chat or Resources) come back from here"
              side="bottom"
              tooltipId="planning-tabs-add-tool"
            >
              <button
                type="button"
                ref={addBtnRef}
                className={styles.add}
                aria-label="Add a tool"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <PlusIcon />
              </button>
            </Tooltip>
          </div>
          {menu}
        </div>

        {/* ── Panes — visible tools stay mounted; display toggles ────── */}
        {!isEmpty && (
          <div className={styles.content}>
            {visibleTools.map((k) => (
              <div
                key={k}
                id={`${uid}-pane-${k}`}
                data-plan-pane={k}
                role="tabpanel"
                aria-labelledby={`${uid}-tab-${k}`}
                className={`${styles.pane} ${k === active ? styles.paneOn : ""}`}
                style={{ "--pc": TOOL_META[k].color } as CSSProperties}
              >
                <span className={styles.paneIcon} aria-hidden="true">
                  <ToolIcon tool={k} />
                </span>
                <div className={styles.paneBody}>
                  <p className={styles.paneTitle}>{TOOL_META[k].label}</p>
                  {renderPaneContent(k)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Zero-visible-tools empty state ──────────────────────────── */}
        {isEmpty && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </span>
            <span className={styles.emptyMsg}>Add or drag tools here</span>
            <button
              type="button"
              className={styles.emptyAdd}
              onClick={() => setMenuOpen(true)}
            >
              <PlusIcon />
              Add a tool
            </button>
          </div>
        )}
      </div>
    );
  },
);
