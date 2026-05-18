"use client";

// lesson-flow.tsx — the per-lesson section editor.
//
// Renders a lesson's sections as an ordered list of cards. Each card
// contains a styled heading (RichTextEditor, singleLine), a body
// (RichTextEditor, multi-line with the section prompt as placeholder),
// and a resources area showing attached chips with add/remove controls.
//
// Section reorder uses @dnd-kit (DndContext + SortableContext + useSortable).
// Resource-chip drag is a SEPARATE concern and remains native HTML5 — the
// two drag operations are independent and must not conflict.
//
// Collapse-on-drag: when a section drag is active, ALL section cards
// collapse simultaneously to 40px chips (heading only + grip + index).
// The dragged section rides a <DragOverlay> as a chip. On drop everything
// re-expands. Motion honours prefers-reduced-motion via useReducedMotion().
//
// Three-tier order precedence (spec §4.2):
//   Template → Master lesson instance → Personal lesson instance.
// The component receives sections from usePlanner().getSections(lessonId)
// on mount it snapshots the baseline; when the teacher's current order
// diverges a "↺ Custom order" indicator appears with a reset affordance.
//
// Keyboard reorder: Move Up / Move Down buttons are also preserved as a
// non-drag path; dnd-kit KeyboardSensor is also wired via useDndSensors().
//
// Store wiring (planner-store): all structural operations (reorder, add,
// remove, duplicate; resource add/remove/move; website toggle) dispatch
// granular store actions — one history step each. Text edits (heading +
// body) call editSection with a coalesce key so a typing burst collapses
// to a single undo step. UI-only state (drag, hover, website visibility,
// resource drag) stays local; it is never persisted or undone.

import type { ReactNode } from "react";
import { memo, useCallback, useId, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
// arrayMove is used by the store's reorderSections reducer; LessonFlow itself
// no longer needs to import it — reorders are dispatched through the store.
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LessonSectionContent, SectionResource } from "@/lib/lesson-flow";
// newLessonSection / newSectionResource are no longer called in LessonFlow —
// section and resource creation is delegated to the store's granular actions.
import {
  type DragState,
  type Density,
  DRAG_MOTION,
  densityFor,
  useDndSensors,
} from "@/lib/collapse-on-drag";
import { usePlanner } from "@/lib/planner-store";
import { RichTextEditor } from "@/components/rich-text";
import { SectionToolbar } from "./section-toolbar";
import styles from "./lesson-flow.module.css";

// ── Props ────────────────────────────────────────────────────────────────

export interface LessonFlowProps {
  /** The lesson whose sections this editor manages.
   *  Passed as a prop (not pulled from context) so LessonFlow remains
   *  portable and clearly scoped — the parent decides which lesson is open. */
  lessonId: string;
}

// ── SortableSection ──────────────────────────────────────────────────────
// Memoized section card that integrates with dnd-kit useSortable.
// Receives `density` from the board-level drag state — per spec §2.2,
// no child decides its own density.

interface SortableSectionProps {
  section: LessonSectionContent;
  idx: number;
  isFirst: boolean;
  isLast: boolean;
  density: Density;
  reducedMotion: boolean;
  // Mutation callbacks threaded from LessonFlow.
  onPatch: (id: string, patch: Partial<LessonSectionContent>) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  onAddResource: (id: string) => void;
  onAddImage: (id: string) => void;
  onAddNote: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleWebsite: (id: string) => void;
  websiteVisible: boolean;
  /** Whether this section can be removed (false when it's the last one). */
  canRemove: boolean;
  // Hover state for toolbar reveal.
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocusCapture: () => void;
  onBlurCapture: (e: React.FocusEvent<HTMLLIElement>) => void;
  // Resource drag state forwarded for zone highlighting.
  overSectionId: string | null;
  onResourceDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onResourceDrop: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onResourceZoneDragLeave: (
    e: React.DragEvent<HTMLDivElement>,
    id: string,
  ) => void;
  onResourceDragStart: (id: string, res: SectionResource) => void;
  onResourceDragEnd: () => void;
  onRemoveResource: (sectionId: string, resourceId: string) => void;
  isResourceDrag: boolean;
}

const SortableSection = memo(function SortableSection({
  section,
  idx,
  isFirst,
  isLast,
  density,
  reducedMotion,
  onPatch,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddResource,
  onAddImage,
  onAddNote,
  onDuplicate,
  onToggleWebsite,
  websiteVisible,
  canRemove,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onFocusCapture,
  onBlurCapture,
  overSectionId,
  onResourceDragOver,
  onResourceDrop,
  onResourceZoneDragLeave,
  onResourceDragStart,
  onResourceDragEnd,
  onRemoveResource,
  isResourceDrag,
}: SortableSectionProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({ id: section.id });

  const isCompact = density === "compact";
  const isResourceTarget = isResourceDrag && overSectionId === section.id;

  // Motion transition — collapse uses DRAG_MOTION; honour reduced-motion.
  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  // Content-summary for the compact chip (spec §4.3)
  const summary = buildSummary(section);

  // dnd-kit transform style for the sortable placeholder position.
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: sortableTransition,
  };

  // Chip (compact) content — 40px row: grip + icon + heading + summary
  const chipContent = (
    <div className={styles.chip40Row}>
      {/* Drag handle — activator for dnd-kit; 44×44 touch target (spec §2.5) */}
      <button
        type="button"
        className={styles.dragHandle}
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Drag to reorder section ${idx + 1}: ${stripHtml(section.heading)}`}
        title="Drag to reorder"
      >
        <GripVerticalIcon />
      </button>

      {/* Section type icon */}
      <span className={styles.chip40TypeIcon} aria-hidden="true">
        <SectionTypeIcon section={section} />
      </span>

      {/* Heading text — strip HTML for the chip */}
      <span className={styles.chip40Heading}>
        {stripHtml(section.heading) || "Untitled section"}
      </span>

      {/* Small index number */}
      <span className={styles.chip40Index} aria-hidden="true">
        {idx + 1}
      </span>

      {/* Content summary chip (spec §4.3) */}
      <span
        className={[
          styles.chip40Summary,
          summary === "Empty" ? styles.chip40SummaryEmpty : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      >
        {summary}
      </span>
    </div>
  );

  return (
    <li
      ref={setNodeRef}
      style={sortableStyle}
      className={[
        styles.cardWrapper,
        isDragging ? styles.cardWrapperDragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      {/* ── Padlet-style hover toolbar — stays anchored, does not collapse ── */}
      <div className={styles.toolbarAnchor}>
        <SectionToolbar
          visible={isHovered && !isCompact}
          onAddResource={() => onAddResource(section.id)}
          onAddImage={() => onAddImage(section.id)}
          onAddNote={() => onAddNote(section.id)}
          onMoveUp={() => onMoveUp(section.id)}
          onMoveDown={() => onMoveDown(section.id)}
          onDuplicate={() => onDuplicate(section.id)}
          onToggleWebsite={() => onToggleWebsite(section.id)}
          onDelete={() => onRemove(section.id)}
          websiteVisible={websiteVisible}
          canMoveUp={!isFirst}
          canMoveDown={!isLast}
        />
      </div>

      {/* ── Card shell ────────────────────────────────────────────────── */}
      {/* Bug 3 fix: NO `layout` prop here. framer-motion `layout` uses FLIP
          with transform:scale(), which stretches text 3–4× while a section
          transitions from the 40px chip to full height. Instead we let the
          shell be a plain div (no scale transform) and animate only the rich
          content's height inside AnimatePresence below. */}
      <div
        className={[styles.card, isDragging ? styles.cardDragging : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Compact chip — rendered instantly (it is the drag affordance,
            no enter animation needed). */}
        {isCompact && chipContent}

        {/* Full content — Bug 3 fix: AnimatePresence is mounted UNCONDITIONALLY
            (outside the isCompact branch) so the height 0→auto enter and
            height→0 exit animations actually play. If AnimatePresence were
            inside the ternary it would unmount on collapse, skipping the exit
            animation, and `initial={false}` would skip the enter animation —
            making both transitions instant. The motion.div inside animates
            height, never transform:scale, so text never stretches. */}
        <AnimatePresence initial={false}>
          {!isCompact && (
            <motion.div
              key="rich-content"
              initial={
                reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
              }
              animate={
                reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }
              }
              exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={collapseTransition}
              style={reducedMotion ? undefined : { overflow: "hidden" }}
            >
              {/* ── Section header: drag handle + index + reorder + remove ── */}
              <div className={styles.cardHeader}>
                {/* Drag handle — activator for dnd-kit; 44×44 touch target */}
                <button
                  type="button"
                  className={styles.dragHandle}
                  ref={setActivatorNodeRef}
                  {...listeners}
                  {...attributes}
                  aria-label={`Drag to reorder section ${idx + 1}`}
                  title="Drag to reorder"
                >
                  <GripVerticalIcon />
                </button>

                <span className={styles.sectionIndex} aria-hidden="true">
                  {idx + 1}
                </span>

                {/* Keyboard reorder buttons — Move Up / Move Down */}
                <div
                  className={styles.reorderBtns}
                  aria-label={`Reorder section ${idx + 1}`}
                >
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.reorderBtn}`}
                    onClick={() => onMoveUp(section.id)}
                    disabled={isFirst}
                    aria-label={`Move section ${idx + 1} up`}
                    title="Move up"
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.reorderBtn}`}
                    onClick={() => onMoveDown(section.id)}
                    disabled={isLast}
                    aria-label={`Move section ${idx + 1} down`}
                    title="Move down"
                  >
                    <ChevronDownIcon />
                  </button>
                </div>

                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.removeBtn}`}
                  onClick={() => onRemove(section.id)}
                  disabled={!canRemove}
                  aria-label={`Remove section ${idx + 1}`}
                  title="Remove section"
                >
                  <RemoveIcon />
                </button>
              </div>

              {/* ── Section heading — styleable rich text, single line ── */}
              <div className={styles.headingRow}>
                <RichTextEditor
                  value={section.heading}
                  onChange={(html) => onPatch(section.id, { heading: html })}
                  singleLine
                  placeholder="Section heading…"
                  ariaLabel={`Heading for section ${idx + 1}`}
                />
              </div>

              {/* ── Section body ── */}
              <div className={styles.bodyRow}>
                <RichTextEditor
                  value={section.body}
                  onChange={(html) => onPatch(section.id, { body: html })}
                  placeholder={section.prompt || "Start writing…"}
                  ariaLabel={`Body for section ${idx + 1}`}
                />
              </div>

              {/* ── Resources area ── */}
              <div
                className={[
                  styles.resourcesArea,
                  isResourceTarget ? styles.resourcesAreaOver : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(e) => onResourceDragOver(e, section.id)}
                onDrop={(e) => onResourceDrop(e, section.id)}
                onDragLeave={(e) => onResourceZoneDragLeave(e, section.id)}
              >
                {section.resources.length > 0 && (
                  <ul
                    className={styles.resourceChips}
                    aria-label={`Resources for section ${idx + 1}`}
                  >
                    {section.resources.map((res) => (
                      <li
                        key={res.id}
                        className={styles.chip}
                        draggable
                        onDragStart={() => onResourceDragStart(section.id, res)}
                        onDragEnd={onResourceDragEnd}
                      >
                        <span className={styles.chipIcon} aria-hidden="true">
                          <ResourceTypeIcon type={res.type} />
                        </span>
                        <span className={styles.chipLabel}>
                          {res.label || res.type}
                        </span>
                        <button
                          type="button"
                          className={styles.chipRemove}
                          onClick={() => onRemoveResource(section.id, res.id)}
                          aria-label={`Remove resource: ${res.label || res.type}`}
                          title="Remove resource"
                        >
                          <RemoveIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className={styles.addResourceBtn}
                  onClick={() => onAddResource(section.id)}
                  aria-label={`Add resource to section ${idx + 1}`}
                >
                  <AddIcon />
                  Add resource
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
});

// ── LessonFlow ───────────────────────────────────────────────────────────

/** Ordered section editor for a single lesson's content.
 *
 *  Reads sections from usePlanner().getSections(lessonId) and writes all
 *  mutations through the planner store so every edit participates in the
 *  shared undo/redo history.
 *
 *  Action mapping:
 *    Structural ops (one undo step each):
 *      section reorder (dnd or keyboard) → reorderSections
 *      add section                       → addSection
 *      remove section                    → removeSection
 *      duplicate section                 → duplicateSection
 *      add resource (any type)           → addSectionResource
 *      remove resource                   → removeSectionResource
 *      move resource (HTML5 drag)        → moveSectionResource
 *      toggle website preview            → toggleSectionWebsite (local UI)
 *    Text edits (coalesced, one burst = one undo step):
 *      heading change                    → editSection(…, { heading }, coalesce)
 *      body change                       → editSection(…, { body },    coalesce)
 */
export function LessonFlow({ lessonId }: LessonFlowProps): ReactNode {
  // ── Store ────────────────────────────────────────────────────────────
  const {
    getSections,
    setSections,
    reorderSections,
    editSection,
    addSection: storeAddSection,
    removeSection: storeRemoveSection,
    duplicateSection: storeDuplicateSection,
    addSectionResource,
    removeSectionResource,
    moveSectionResource,
    toggleSectionWebsite,
  } = usePlanner();

  // Sections are authoritative from the store; never from local state.
  const sections = getSections(lessonId);

  // ── Motion preference ────────────────────────────────────────────────
  const prefersReducedMotion = useReducedMotion() ?? false;

  // ── dnd-kit sensors (pointer + touch + keyboard) ──────────────────
  const sensors = useDndSensors();

  // ── Board-level drag state (spec §2.2) — drives ALL cards' density ──
  const [dragState, setDragState] = useState<DragState>({ phase: "idle" });
  const density = densityFor(dragState);

  // ── Three-tier order precedence / divergence tracking (spec §4.2) ──
  // Snapshot the section id order when the lesson changes as the "baseline"
  // (Template → Master → Personal as delivered by the store). When the
  // teacher reorders, the current store order may diverge from this baseline.
  const baselineOrderRef = useRef<string[]>(sections.map((s) => s.id));
  // Track lessonId changes to reset baseline when a new lesson is opened.
  const prevLessonIdRef = useRef(lessonId);
  if (prevLessonIdRef.current !== lessonId) {
    baselineOrderRef.current = sections.map((s) => s.id);
    prevLessonIdRef.current = lessonId;
  }

  // Derived: does the current order differ from the baseline?
  const currentOrder = sections.map((s) => s.id);
  const isOrderDiverged =
    currentOrder.length !== baselineOrderRef.current.length ||
    currentOrder.some((id, i) => id !== baselineOrderRef.current[i]);

  // ── Resource drag state (native HTML5 — unchanged) ────────────────
  interface ResourceDragState {
    sourceSectionId: string;
    resource: SectionResource;
  }
  const [resourceDrag, setResourceDrag] = useState<ResourceDragState | null>(
    null,
  );
  const [overSectionId, setOverSectionId] = useState<string | null>(null);

  // ── Hover/focus state for toolbar ────────────────────────────────
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);

  // ── Website-visible toggle (local UI, no undo needed) ────────────
  // websiteVisible is intentionally local — the store's toggleSectionWebsite
  // action is a no-op doc mutation kept for future persistence (see store
  // comment). The actual show/hide is managed here for isolation.
  const [websiteVisible, setWebsiteVisible] = useState<Record<string, boolean>>(
    {},
  );

  // ── Accessibility: aria-live announcement region ──────────────────
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const announceRegionId = useId();

  // ── Section ids array for SortableContext ─────────────────────────
  const sectionIds = sections.map((s) => s.id);

  // ── Mutation helpers — wired to the store ────────────────────────

  // Text-edit patch: coalesced so a typing burst = one undo step.
  // The coalesce key encodes lesson + section + field so edits to different
  // fields or sections never merge into the same undo step.
  const patchSection = useCallback(
    (id: string, patch: Partial<LessonSectionContent>): void => {
      const field = "heading" in patch ? "heading" : "body";
      editSection(lessonId, id, patch, {
        key: `section:${lessonId}:${id}:${field}`,
        ts: Date.now(),
      });
    },
    [lessonId, editSection],
  );

  // Add a blank section — structural op, one history step.
  function addSection(): void {
    storeAddSection(lessonId);
  }

  // Remove a section — store already guards against removing the last one.
  const removeSection = useCallback(
    (id: string): void => {
      storeRemoveSection(lessonId, id);
    },
    [lessonId, storeRemoveSection],
  );

  // Keyboard reorder: Move Up delegates to the store's reorderSections.
  // The store uses arrayMove internally — same semantics as dnd-kit drag.
  const moveSectionUp = useCallback(
    (id: string): void => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx <= 0) return;
      reorderSections(lessonId, id, sections[idx - 1].id);
    },
    [lessonId, sections, reorderSections],
  );

  const moveSectionDown = useCallback(
    (id: string): void => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx === -1 || idx >= sections.length - 1) return;
      reorderSections(lessonId, id, sections[idx + 1].id);
    },
    [lessonId, sections, reorderSections],
  );

  // Resource mutations — each one history step.
  const addResource = useCallback(
    (sectionId: string): void => {
      addSectionResource(lessonId, sectionId, "link");
    },
    [lessonId, addSectionResource],
  );

  const removeResource = useCallback(
    (sectionId: string, resourceId: string): void => {
      removeSectionResource(lessonId, sectionId, resourceId);
    },
    [lessonId, removeSectionResource],
  );

  const addImageResource = useCallback(
    (sectionId: string): void => {
      addSectionResource(lessonId, sectionId, "image", "New image");
    },
    [lessonId, addSectionResource],
  );

  const addNoteResource = useCallback(
    (sectionId: string): void => {
      addSectionResource(lessonId, sectionId, "link", "New note");
    },
    [lessonId, addSectionResource],
  );

  const duplicateSection = useCallback(
    (id: string): void => {
      storeDuplicateSection(lessonId, id);
    },
    [lessonId, storeDuplicateSection],
  );

  // Website toggle — local UI state; also fires the store action for
  // future persistence (store currently treats it as a no-op mutation).
  const toggleWebsiteVisible = useCallback(
    (id: string): void => {
      setWebsiteVisible((prev) => ({ ...prev, [id]: !prev[id] }));
      toggleSectionWebsite(lessonId, id);
    },
    [lessonId, toggleSectionWebsite],
  );

  // ── Reset to baseline (inherited) order ───────────────────────────
  // Re-sorts the section array to match the baseline id order. Any section
  // not in baseline (added after mount) stays at the end. Uses setSections
  // so the whole reset is ONE undo step rather than N reorderSections calls.
  function resetToBaselineOrder(): void {
    const baseline = baselineOrderRef.current;
    const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
    const inBaseline = baseline
      .filter((id) => byId[id])
      .map((id) => byId[id] as LessonSectionContent);
    const extras = sections.filter((s) => !baseline.includes(s.id));
    setSections(lessonId, [...inBaseline, ...extras]);
  }

  // ── dnd-kit drag lifecycle ────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent): void {
    setDragState({
      phase: "dragging",
      activeId: String(active.id),
      overId: null,
    });

    // Announce for screen readers (spec §2.5)
    const activeSection = sections.find((s) => s.id === active.id);
    const name = activeSection
      ? stripHtml(activeSection.heading) ||
        `Section ${sections.findIndex((s) => s.id === active.id) + 1}`
      : "section";
    setLiveAnnouncement(
      `Picked up ${name}. Use arrow keys to move, Space to drop, Escape to cancel.`,
    );
  }

  function handleDragOver({ active, over }: DragOverEvent): void {
    if (!over) return;
    setDragState((prev) =>
      prev.phase === "dragging" ? { ...prev, overId: String(over.id) } : prev,
    );

    // Announce position for screen readers
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const activeIdx = sections.findIndex((s) => s.id === activeId);
    const overIdx = sections.findIndex((s) => s.id === overId);
    const beforeSection = overIdx > 0 ? sections[overIdx - 1] : null;
    const afterSection = sections[overIdx];
    const beforeName = beforeSection
      ? stripHtml(beforeSection.heading) || `Section ${overIdx}`
      : "the beginning";
    const afterName = afterSection
      ? stripHtml(afterSection.heading) || `Section ${overIdx + 1}`
      : "the end";
    const directionHint = activeIdx < overIdx ? "down" : "up";
    setLiveAnnouncement(
      `Moving ${directionHint}. Currently between ${beforeName} and ${afterName}.`,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    // Bug 1 fix: set idle SYNCHRONOUSLY so re-expansion begins within one
    // render cycle (<30ms). The DragOverlay's own dropAnimation (~220ms)
    // runs in parallel and does not need to be sequenced here.
    // Store wiring: reorderSections dispatches one history step matching
    // dnd-kit's arrayMove semantics — active moves to over's position.
    if (over && active.id !== over.id) {
      reorderSections(lessonId, String(active.id), String(over.id));
    }

    // Announce completion
    const activeSection = sections.find((s) => s.id === active.id);
    const name = activeSection
      ? stripHtml(activeSection.heading) || "section"
      : "section";
    setLiveAnnouncement(`Dropped ${name}.`);

    // Go idle immediately — no setTimeout, no 'dropping' phase.
    setDragState({ phase: "idle" });
  }

  function handleDragCancel(): void {
    setDragState({ phase: "idle" });
    setLiveAnnouncement("Drag cancelled.");
  }

  // ── Resource drag (native HTML5 — UNCHANGED) ──────────────────────
  // Resource drag remains HTML5 native and independent of dnd-kit.
  // Drops dispatch moveSectionResource → one history step.

  const handleResourceDragStart = useCallback(
    (sectionId: string, resource: SectionResource): void => {
      setResourceDrag({ sourceSectionId: sectionId, resource });
    },
    [],
  );

  const handleResourceDragEnd = useCallback((): void => {
    setResourceDrag(null);
    setOverSectionId(null);
  }, []);

  const handleResourceZoneDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetSectionId: string): void => {
      if (!resourceDrag) return;
      e.preventDefault();
      setOverSectionId(targetSectionId);
    },
    [resourceDrag],
  );

  const handleResourceZoneDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetSectionId: string): void => {
      e.preventDefault();
      if (!resourceDrag) return;

      const { sourceSectionId, resource } = resourceDrag;
      // Dispatch to store — mirrors the old inline map logic but routes
      // through history so resource moves are undoable.
      moveSectionResource(lessonId, sourceSectionId, targetSectionId, resource);
      setResourceDrag(null);
      setOverSectionId(null);
    },
    [lessonId, resourceDrag, moveSectionResource],
  );

  const handleResourceZoneDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>, sectionId: string): void => {
      const related = e.relatedTarget as Node | null;
      if (e.currentTarget.contains(related)) return;
      if (overSectionId === sectionId) setOverSectionId(null);
    },
    [overSectionId],
  );

  // ── Active section for DragOverlay ───────────────────────────────
  const activeSection =
    dragState.phase !== "idle"
      ? (sections.find((s) => s.id === dragState.activeId) ?? null)
      : null;
  const activeSectionIdx = activeSection
    ? sections.findIndex((s) => s.id === activeSection.id)
    : -1;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* ── aria-live region: screen-reader drag announcements (spec §2.5) ── */}
      <div
        id={announceRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {liveAnnouncement}
      </div>

      {/* ── Three-tier divergence indicator (spec §4.2) ─────────────── */}
      {isOrderDiverged && (
        <div className={styles.divergenceBar}>
          <span className={styles.divergenceIcon} aria-hidden="true">
            ↺
          </span>
          <span className={styles.divergenceLabel}>Custom order</span>
          <button
            type="button"
            className={styles.divergenceReset}
            onClick={resetToBaselineOrder}
            title="Reset to inherited order (Template → Master → Personal baseline)"
          >
            Reset to inherited order
          </button>
        </div>
      )}

      {/* ── dnd-kit DndContext wraps only the section list ──────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sectionIds}
          strategy={verticalListSortingStrategy}
        >
          <ol className={styles.list} aria-label="Lesson sections">
            {sections.map((section, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === sections.length - 1;

              return (
                <SortableSection
                  key={section.id}
                  section={section}
                  idx={idx}
                  isFirst={isFirst}
                  isLast={isLast}
                  density={density}
                  reducedMotion={prefersReducedMotion}
                  onPatch={patchSection}
                  onMoveUp={moveSectionUp}
                  onMoveDown={moveSectionDown}
                  onRemove={removeSection}
                  onAddResource={addResource}
                  onAddImage={addImageResource}
                  onAddNote={addNoteResource}
                  onDuplicate={duplicateSection}
                  onToggleWebsite={toggleWebsiteVisible}
                  websiteVisible={websiteVisible[section.id] ?? false}
                  canRemove={sections.length > 1}
                  isHovered={hoveredSectionId === section.id}
                  onMouseEnter={() => setHoveredSectionId(section.id)}
                  onMouseLeave={() =>
                    setHoveredSectionId((prev) =>
                      prev === section.id ? null : prev,
                    )
                  }
                  onFocusCapture={() => setHoveredSectionId(section.id)}
                  onBlurCapture={(e) => {
                    if (
                      !e.currentTarget.contains(e.relatedTarget as Node | null)
                    ) {
                      setHoveredSectionId((prev) =>
                        prev === section.id ? null : prev,
                      );
                    }
                  }}
                  overSectionId={overSectionId}
                  onResourceDragOver={handleResourceZoneDragOver}
                  onResourceDrop={handleResourceZoneDrop}
                  onResourceZoneDragLeave={handleResourceZoneDragLeave}
                  onResourceDragStart={handleResourceDragStart}
                  onResourceDragEnd={handleResourceDragEnd}
                  onRemoveResource={removeResource}
                  isResourceDrag={resourceDrag !== null}
                />
              );
            })}
          </ol>
        </SortableContext>

        {/* ── DragOverlay — floating chip rides the cursor (spec §7) ── */}
        <DragOverlay
          dropAnimation={
            prefersReducedMotion
              ? null
              : {
                  duration: DRAG_MOTION.drop.duration * 1000,
                  easing: Array.isArray(DRAG_MOTION.drop.ease)
                    ? `cubic-bezier(${DRAG_MOTION.drop.ease.join(",")})`
                    : String(DRAG_MOTION.drop.ease),
                }
          }
        >
          {activeSection && (
            <div className={styles.overlayChip} aria-hidden="true">
              <div className={styles.chip40Row}>
                <span className={styles.dragHandleOverlay}>
                  <GripVerticalIcon />
                </span>
                <span className={styles.chip40TypeIcon}>
                  <SectionTypeIcon section={activeSection} />
                </span>
                <span className={styles.chip40Heading}>
                  {stripHtml(activeSection.heading) || "Untitled section"}
                </span>
                <span className={styles.chip40Index}>
                  {activeSectionIdx + 1}
                </span>
                <span
                  className={[
                    styles.chip40Summary,
                    buildSummary(activeSection) === "Empty"
                      ? styles.chip40SummaryEmpty
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {buildSummary(activeSection)}
                </span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Add section — padlet-style centered pill (anchored chrome) ── */}
      <div className={styles.addSectionRow}>
        <button
          type="button"
          className={styles.addSectionBtn}
          onClick={addSection}
        >
          <AddIcon />
          Add section
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Strip HTML tags to extract plain text for chip labels / announcements. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Build the compact summary for a section chip (spec §4.3).
 * Text sections: word count. List sections: item count via resource count.
 * Empty sections show "Empty" in a muted style.
 */
function buildSummary(section: LessonSectionContent): string {
  const bodyText = stripHtml(section.body).trim();
  const resourceCount = section.resources.length;

  if (resourceCount > 0) {
    // List-style section — show resource count.
    return resourceCount === 1 ? "1 resource" : `${resourceCount} resources`;
  }

  if (bodyText.length > 0) {
    // Text section — approximate word count.
    const words = bodyText.split(/\s+/).filter(Boolean).length;
    return words === 1 ? "1 word" : `${words} words`;
  }

  return "Empty";
}

// ── Section type icon (spec §4.3) ────────────────────────────────────────
// Lucide-style SVG icons matched to section types inferred from heading/prompt.
// Gracefully falls back to a generic FileText icon.

function SectionTypeIcon({
  section,
}: {
  section: LessonSectionContent;
}): ReactNode {
  const heading = stripHtml(section.heading).toLowerCase();
  const prompt = (section.prompt || "").toLowerCase();
  const combined = `${heading} ${prompt}`;

  if (combined.includes("standard") || combined.includes("ccss")) {
    return <TargetIcon />;
  }
  if (
    combined.includes("resource") ||
    combined.includes("material") ||
    combined.includes("attach")
  ) {
    return <PaperclipSVGIcon />;
  }
  if (combined.includes("strateg")) {
    return <LightbulbIcon />;
  }
  if (
    combined.includes("accommodat") ||
    combined.includes("access") ||
    combined.includes("support")
  ) {
    return <AccessibilityIcon />;
  }
  if (combined.includes("list") || section.resources.length > 0) {
    return <ListIcon />;
  }
  // Default — generic text/directions section
  return <FileTextIcon />;
}

// ── Icons ────────────────────────────────────────────────────────────────
// Inline SVG icons, aria-hidden, consistent 16×16 rendered size.
// GripVertical replaces the old 6-dot DragIcon (Lucide GripVertical equiv).

function GripVerticalIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Lucide GripVertical — two columns of 3 dots */}
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function ChevronUpIcon(): ReactNode {
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
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RemoveIcon(): ReactNode {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AddIcon(): ReactNode {
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

function FileTextIcon(): ReactNode {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ListIcon(): ReactNode {
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
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function TargetIcon(): ReactNode {
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
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function PaperclipSVGIcon(): ReactNode {
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
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function LightbulbIcon(): ReactNode {
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
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function AccessibilityIcon(): ReactNode {
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
      <circle cx="12" cy="4" r="1" />
      <path d="M5 9l7-1 7 1" />
      <path d="M12 8v6" />
      <path d="M8 21l4-6 4 6" />
    </svg>
  );
}

// ── Resource type icon ────────────────────────────────────────────────────

function ResourceTypeIcon({
  type,
}: {
  type: SectionResource["type"];
}): ReactNode {
  switch (type) {
    case "slides":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "pdf":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    case "doc":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "image":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "youtube":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
      );
    case "website":
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}
