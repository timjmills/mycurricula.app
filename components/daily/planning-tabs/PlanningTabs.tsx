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
//   objective       → editLesson(id, { objective }, coalesced). The STORED
//                     value keeps the app-wide "I can …" convention: the
//                     pane shows an "I can" lead-in label, the singleLine
//                     editor edits only the trailing text, and the commit
//                     re-attaches the plain-text prefix — exactly the old
//                     I-CAN line's contract, so every other objective
//                     consumer (weekly/lesson cards' /^I can/ strip, the
//                     plain-text renders in right-panel / SubjectView /
//                     Teach) keeps working.
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
// Rich-text toolbars — pane editors are chromeless (no per-editor docked
// toolbar). They register with the shared command bus on focus, and the
// one sticky RtToolbar mounted at the top of LessonDetail's scroll body
// drives whichever editor currently has focus via that bus. See
// components/rich-text/command-bus.ts for the bus contract.
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
import type { CSSProperties, DragEvent, KeyboardEvent, ReactNode } from "react";
import type { Lesson, LessonDifferentiation } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { bundledDescriptions } from "@/lib/standards/items";
import { RichTextEditor } from "@/components/rich-text";
import { ResourceTypePill } from "@/components/lesson-flow";
import { Button, Tooltip } from "@/components/ui";
import { StandardsPicker } from "@/components/standards";
import { Shoutbox } from "../Shoutbox";
import {
  TOOL_KEYS,
  defaultPlanningTabsState,
  readPlanningTabs,
  writePlanningTabs,
} from "./planning-tabs-state";
import type { PlanningTabsState, PlanningToolKey } from "./planning-tabs-state";
import styles from "./planning-tabs.module.css";

// ── Tool model ───────────────────────────────────────────────────────────
// The tool vocabulary + persisted-arrangement model (state shape, defaults,
// normalize, localStorage read/write) live in ./planning-tabs-state.ts —
// pure data, unit-tested in tests/planning-tabs-state.test.ts. This file
// owns only the presentation metadata and behavior.

/** Bundled standards-item descriptions (CCSS practices, NGSS PEs, IB ATL),
 *  computed once. Fallback for the Standards pane so a code tagged via the
 *  StandardsPicker that the mock catalog doesn't know still renders a human
 *  label instead of the bare code repeated twice. */
const BUNDLED_DESCRIPTIONS = bundledDescriptions();

/** Per-tool label (sentence case per the design system) + `--pc` accent. */
const TOOL_META: Record<PlanningToolKey, { label: string; color: string }> = {
  objective: { label: "Objective", color: "var(--brand-500)" },
  standards: { label: "Standards", color: "var(--done)" },
  notes: { label: "Lesson notes", color: "var(--writing-bright)" },
  diff: { label: "Differentiation", color: "var(--grammar-bright)" },
  chat: { label: "Chat", color: "var(--reading-bright)" },
  resources: { label: "Resources", color: "var(--explorers-bright)" },
};

/** Strip the app-wide plain-text "I can " objective prefix for editing.
 *  The Objective pane edits only the trailing text; the commit re-attaches
 *  the prefix (see handleObjectiveChange) so the stored shape never
 *  changes. Mirrors the regex the weekly/lesson cards use for display. */
function stripICanPrefix(html: string): string {
  return html.replace(/^I can\s+/i, "");
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
}

// ── Component ────────────────────────────────────────────────────────────

export const PlanningTabs = forwardRef<PlanningTabsHandle, PlanningTabsProps>(
  function PlanningTabs({ lesson }, ref): ReactNode {
    const { editLesson, subjects, describeStandard } = usePlanner();
    const [standardsPickerOpen, setStandardsPickerOpen] = useState(false);
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
        if (e.key === "Escape") {
          setMenuOpen(false);
          // Hand focus back to the trigger (APG menu-button pattern).
          addBtnRef.current?.focus();
        }
      }
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [menuOpen]);

    // APG menu keyboard pattern: focus moves into the menu on open and
    // roves with the arrow keys; items sit outside the tab order.
    useEffect(() => {
      if (!menuOpen) return;
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    }, [menuOpen]);

    function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]',
        ) ?? [],
      );
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      let next: number | null = null;
      if (e.key === "ArrowDown") next = (idx + 1) % items.length;
      else if (e.key === "ArrowUp")
        next = (idx - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      if (next === null) return;
      e.preventDefault();
      items[next]?.focus();
    }

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
      // Shift+Arrow MOVES the tab (keyboard counterpart of the pointer
      // drag-reorder); plain arrows rove per the APG tabs pattern.
      if (e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const target = visibleTools[idx + (e.key === "ArrowRight" ? 1 : -1)];
        if (!target) return;
        e.preventDefault();
        setTabsState((s) => {
          // Same move-before-target rule as the pointer drag; hidden
          // tools keep their order slots.
          const order = [...s.order];
          const from = order.indexOf(tool);
          const to = order.indexOf(target);
          if (from < 0 || to < 0) return s;
          order.splice(from, 1);
          order.splice(to, 0, tool);
          return { ...s, order };
        });
        // Keep focus with the moved tab after the re-render.
        window.requestAnimationFrame(() => {
          tabBtnRefs.current.get(tool)?.focus();
        });
        return;
      }
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
        const reduce =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        root.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
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
    // The stored objective carries a PLAIN-TEXT "I can " prefix (the
    // app-wide convention) — the editor holds only the trailing text and
    // the prefix is re-attached on commit, so downstream consumers that
    // strip /^I can\s+/i or render the objective as plain text keep their
    // contract.
    const [objectiveHtml, setObjectiveHtml] = useState<string>(
      stripICanPrefix(lesson.objective ?? ""),
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
      setObjectiveHtml(stripICanPrefix(lesson.objective ?? ""));
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
      if (!objectiveEditingRef.current)
        setObjectiveHtml(stripICanPrefix(storeObjective));
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
      // Re-attach the "I can " prefix unless the field was cleared — the
      // stored shape stays identical to the old I-CAN line's commits.
      const trimmed = html.trim();
      editLesson(
        lesson.id,
        { objective: trimmed ? `I can ${trimmed}` : "" },
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

    function handleStandardsSave(codes: string[]): void {
      // Same coalesced-editLesson contract as objective/notes/diff above: one
      // undo step, routed through the store's save-target (Personal vs Master)
      // like every other lesson edit.
      editLesson(
        lesson.id,
        { standards: codes },
        { key: `lesson:${lesson.id}:standards`, ts: Date.now() },
      );
    }

    // ── Pane renderers ────────────────────────────────────────────────

    function renderPaneContent(tool: PlanningToolKey): ReactNode {
      switch (tool) {
        case "objective":
          // singleLine + the "I can" lead-in: the editor edits only the
          // trailing objective text (the prefix is re-attached on commit),
          // and Enter can't introduce block markup into a field other
          // surfaces render as a single plain-text line.
          return (
            <div
              className={`${styles.paneEditor} ${styles.objectiveRow}`}
              onBlurCapture={() => {
                objectiveEditingRef.current = false;
              }}
            >
              <span className={styles.iCanLabel} aria-hidden="true">
                I can
              </span>
              <div className={styles.objectiveEditor}>
                <RichTextEditor
                  value={objectiveHtml}
                  onChange={handleObjectiveChange}
                  singleLine
                  placeholder="state the lesson objective…"
                  ariaLabel="Lesson objective (completes “I can …”)"
                  chromeless
                />
              </div>
            </div>
          );
        case "standards":
          return (
            <div className={styles.stdPane}>
              {lesson.standards.length > 0 ? (
                <div className={styles.stdList}>
                  {lesson.standards.map((code) => {
                    // describeStandard is flag-aware (planner-store): under the
                    // Supabase flag it resolves codes against the hydrated DB
                    // catalog (standards.description); flag-off it is the mock.
                    // If it returns the bare code (unknown to that catalog),
                    // fall back to the bundled label so the row never shows the
                    // code twice.
                    const fromCatalog = describeStandard(code);
                    const desc =
                      fromCatalog === code
                        ? (BUNDLED_DESCRIPTIONS[code] ?? code)
                        : fromCatalog;
                    return (
                      <div key={code} className={styles.stdItem}>
                        <span className={styles.stdCode}>{code}</span>
                        <span className={styles.stdDesc}>{desc}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.paneEmptyText}>
                  No standards tagged on this lesson yet.
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStandardsPickerOpen(true)}
                tooltip="Open the standards menu — search frameworks by subject and grade, pin your preferred systems, and tag the standards this lesson covers"
              >
                {lesson.standards.length > 0
                  ? "Edit standards"
                  : "Tag standards"}
              </Button>
            </div>
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
                chromeless
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
                      chromeless
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
        onKeyDown={handleMenuKeyDown}
      >
        <div className={styles.menuLabel}>Add a tool</div>
        {hiddenTools.length > 0 ? (
          hiddenTools.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              tabIndex={-1}
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
                  >
                    <Tooltip
                      content={`Open the ${TOOL_META[k].label} pane — drag the tab to reorder your tools (or hold Shift and press ←/→)`}
                      side="bottom"
                      tooltipId="planning-tabs-tab"
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
                    </Tooltip>
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
                // Read-only panes hold no focusable content, so the panel
                // itself joins the tab order (APG tabs pattern).
                // The standards pane now holds a focusable "Tag standards"
                // button, so only the still-read-only resources pane joins
                // the tab order itself (APG tabs pattern).
                tabIndex={k === "resources" ? 0 : undefined}
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

        {/* The standards menu — mounted once at the panel root so the modal
            overlays the whole pane; saves route through editLesson, matching
            every other tab's coalesced edit + save-target semantics. */}
        <StandardsPicker
          key={lesson.id}
          open={standardsPickerOpen}
          onClose={() => setStandardsPickerOpen(false)}
          value={lesson.standards}
          onSave={handleStandardsSave}
          defaultSubject={lesson.subject}
          subjects={subjects}
          targetLabel="this lesson"
        />
      </div>
    );
  },
);
