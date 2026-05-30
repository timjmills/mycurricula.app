"use client";

// TeachTabStrip.tsx — the tab header for a TeachPanel.
//
// One panel can hold several modules; each is a tab (icon + label). Exactly
// one tab is active and renders its module body below (TeachPanel owns that
// body). This strip's jobs:
//
//   1. Render one tab per module id, highlighting the active one.
//   2. Let the teacher REORDER tabs by dragging (dnd-kit, horizontal list).
//   3. Expose a "+" button that opens a module-picker popover listing the
//      modules NOT already in this panel, so they can be added here.
//
// ── Why dnd-kit here too ──────────────────────────────────────────────────
// We reuse the same dnd-kit + useDndSensors stack the rail icons and the
// Weekly column reorder use (lib/collapse-on-drag). Each tab is a small
// useSortable wrapper; a 6px pointer-activation distance means a plain click
// (switch tabs) is never mis-read as a drag. The drag handle IS the tab
// button — same affordance as the rail icons.
//
// ── Tokens / a11y / motion ────────────────────────────────────────────────
// Tokens only (var(--…)); ≥44px touch targets; every tab + the "+" button is
// keyboard-focusable and operable (dnd-kit KeyboardSensor lifts/moves/drops);
// each non-obvious control carries a dismissible onboarding <Tooltip
// tooltipId="…">. Reduced motion is honored by dnd-kit (null transition under
// prefers-reduced-motion) and by the CSS transition gate in the module.css.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Tooltip } from "@/components/ui";
import { useDndSensors } from "@/lib/collapse-on-drag";
import { MODULE_REGISTRY } from "@/components/teach/module-registry";
import type { ModuleId, PanelSide } from "@/lib/teach/teach-types";
import styles from "./TeachTabStrip.module.css";

// ── PlusIcon ────────────────────────────────────────────────────────────────
// Lucide-style plus glyph for the "add module" button. aria-hidden — the
// button carries the accessible name.

function PlusIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ── SortableTab ───────────────────────────────────────────────────────────
// One tab — a sortable wrapper around the tab button. The button is the drag
// handle (listeners spread onto it) AND the click target that activates the
// tab; the 6px activation distance keeps the two interactions disjoint.

interface SortableTabProps {
  id: ModuleId;
  /** True when this tab's module is the panel's active body. */
  active: boolean;
  /** Id of the panel body this tab controls — wires the tab/tabpanel ARIA
   *  relationship (aria-controls → the TeachPanel body's id). */
  panelBodyId: string;
  /** Click → make this the active tab. */
  onActivate: (id: ModuleId) => void;
}

function SortableTab({
  id,
  active,
  panelBodyId,
  onActivate,
}: SortableTabProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const entry = MODULE_REGISTRY[id];

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 2 : undefined,
    // Required by dnd-kit's TouchSensor so the browser doesn't claim the
    // gesture for scrolling.
    touchAction: "none",
  };

  return (
    // role="presentation" on the <li> so the tablist→tab parent/child
    // relationship isn't broken by an intervening listitem role.
    <li
      ref={setNodeRef}
      style={style}
      className={styles.tabItem}
      role="presentation"
      data-dragging={isDragging ? "true" : "false"}
    >
      <Tooltip
        content={`Show ${entry.label} in this panel — drag the tab to reorder it`}
        tooltipId={`teach-tab-${id}`}
        side="bottom"
      >
        <button
          type="button"
          // The tab is its own drag handle; spread dnd-kit's pointer +
          // keyboard listeners + a11y attributes FIRST, then override the
          // role/selection ARIA so this reads as a tab. We KEEP dnd-kit's
          // tabIndex={0} (every tab stays in the Tab order) rather than a
          // roving tabindex: the Wave-1 requirement is that every tab be
          // focusable AND operable by the dnd-kit keyboard sensor (focus a
          // tab, Space to lift, arrows to reorder, Space to drop). A roving
          // tabindex would leave inactive tabs unfocusable and thus
          // un-reorderable by keyboard, which conflicts with that contract.
          {...attributes}
          {...listeners}
          role="tab"
          aria-selected={active}
          aria-controls={panelBodyId}
          className={`${styles.tab} ${active ? styles.tabActive : ""}`.trim()}
          onClick={() => onActivate(id)}
        >
          <span className={styles.tabIcon} aria-hidden="true">
            {entry.icon}
          </span>
          <span className={styles.tabLabel}>{entry.label}</span>
        </button>
      </Tooltip>
    </li>
  );
}

// ── ModulePicker popover ────────────────────────────────────────────────────
// A small popover anchored under the "+" button listing every module NOT
// already in this panel. Selecting one calls onAdd and closes. Closes on
// outside-click and on Escape. Rendered inline (not portaled) — the strip
// sits at the top of the panel so the popover has room below without
// escaping any overflow:hidden ancestor that would clip it.

interface ModulePickerProps {
  /** Modules eligible to add (not already tabs here). */
  candidates: ModuleId[];
  /** The wrapper around BOTH the "+" trigger and this popover. A pointerdown
   *  inside it counts as "inside" so clicking the trigger to toggle the
   *  picker closed isn't immediately re-opened by the trigger's onClick. */
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onAdd: (id: ModuleId) => void;
  onClose: () => void;
}

function ModulePicker({
  candidates,
  anchorRef,
  onAdd,
  onClose,
}: ModulePickerProps): ReactNode {
  // Outside-click + Escape close. Pointerdown (not click) so a drag started
  // outside also dismisses. We test against the SHARED anchor wrapper (which
  // contains both the trigger and this popover) rather than the popover alone,
  // so a click on the trigger doesn't close-then-reopen the picker.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      className={styles.picker}
      role="menu"
      aria-label="Add a module to this panel"
    >
      {candidates.length === 0 ? (
        <p className={styles.pickerEmpty}>
          Every module is already open somewhere.
        </p>
      ) : (
        <ul className={styles.pickerList} role="list">
          {candidates.map((id) => {
            const entry = MODULE_REGISTRY[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.pickerItem}
                  onClick={() => {
                    onAdd(id);
                    onClose();
                  }}
                >
                  <span className={styles.pickerIcon} aria-hidden="true">
                    {entry.icon}
                  </span>
                  <span className={styles.pickerLabel}>{entry.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── TeachTabStrip ───────────────────────────────────────────────────────────

interface TeachTabStripProps {
  /** Which panel this strip heads — used to scope ids + announcements. */
  side: PanelSide;
  /** Ordered module ids shown as tabs. */
  tabs: ModuleId[];
  /** The active tab whose body the panel renders. */
  activeTab: ModuleId;
  /** Module ids eligible to add via the "+" picker (not already tabs). */
  addable: ModuleId[];
  /** Id of the panel body the active tab controls — wires the tab/tabpanel
   *  ARIA relationship. Supplied by TeachPanel (which owns the body). */
  panelBodyId: string;
  /** Switch the active tab. */
  onActivate: (id: ModuleId) => void;
  /** Commit a new tab order — receives the full reordered id array (matches
   *  the workspace hook's `reorderTabs(side, ids)` signature). */
  onReorder: (ids: ModuleId[]) => void;
  /** Add a module as a new tab in this panel. */
  onAdd: (id: ModuleId) => void;
}

export function TeachTabStrip({
  side,
  tabs,
  activeTab,
  addable,
  panelBodyId,
  onActivate,
  onReorder,
  onAdd,
}: TeachTabStripProps): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sensors = useDndSensors();
  // Wraps BOTH the "+" trigger and the picker popover so the picker's
  // outside-click detection treats the trigger as "inside" — otherwise a
  // click on the trigger while open closes via document pointerdown and then
  // the trigger's onClick re-opens it (the picker would never close on a
  // second trigger click). Codex Low finding.
  const addWrapRef = useRef<HTMLDivElement | null>(null);

  // Screen-reader live announcement when a tab is reordered by keyboard.
  const [announcement, setAnnouncement] = useState("");
  const announceRegionId = useId();

  const handleDragEnd = useCallback(
    (e: DragEndEvent): void => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const from = tabs.indexOf(active.id as ModuleId);
      const to = tabs.indexOf(over.id as ModuleId);
      if (from === -1 || to === -1) return;
      onReorder(arrayMove(tabs, from, to));
      const movedLabel = MODULE_REGISTRY[active.id as ModuleId].label;
      setAnnouncement(`${movedLabel} tab moved to position ${to + 1}.`);
    },
    [tabs, onReorder],
  );

  const togglePicker = useCallback(() => setPickerOpen((p) => !p), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    // The outer strip is a plain container (no ARIA role) so the live region
    // and the "+" add button are NOT mistaken for tablist children. Only the
    // <ul> below carries role="tablist", and it holds tabs exclusively.
    <div className={styles.strip}>
      {/* Visually-hidden polite live region for keyboard reorder feedback.
          Sits OUTSIDE the tablist so it isn't treated as a tab. */}
      <div
        id={announceRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {announcement}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
          {/* role="tablist" lives HERE — this list holds ONLY tabs. Its <li>s
              are role="presentation" so the tablist→tab parent/child
              relationship holds. dnd-kit sorting works fine without a list
              role. */}
          <ul
            className={styles.tabs}
            role="tablist"
            aria-orientation="horizontal"
            aria-label={`${side} panel tabs`}
          >
            {tabs.map((id) => (
              <SortableTab
                key={id}
                id={id}
                active={id === activeTab}
                panelBodyId={panelBodyId}
                onActivate={onActivate}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {/* ── "+" add-module affordance ───────────────────────────────────── */}
      <div className={styles.addWrap} ref={addWrapRef}>
        <Tooltip
          content="Add another module as a tab in this panel"
          tooltipId="teach-tab-add"
          side="bottom"
        >
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Add a module to this panel"
            aria-expanded={pickerOpen}
            aria-haspopup="menu"
            className={styles.addBtn}
            onClick={togglePicker}
          >
            <PlusIcon />
          </Button>
        </Tooltip>

        {pickerOpen && (
          <ModulePicker
            candidates={addable}
            anchorRef={addWrapRef}
            onAdd={onAdd}
            onClose={closePicker}
          />
        )}
      </div>
    </div>
  );
}
