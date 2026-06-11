"use client";

// lesson-flow.tsx — the per-lesson PHASE editor ("lesson flow").
//
// REVISED 2026-06-11 per Documents/Claude Design/6.11.26
// design_handoff_daily_view §7 "Phases" (+ §6 center-column notes). This is a
// FULL REPLACE of the previous canonical-six-section presentation: the
// decorative pin/teardrop badges, the §3.1 hex pin palette, the vertical
// connector line, the helper-line stack, and the virtual Standards row are
// all GONE. The flow now renders ONLY store-backed sections, in store order,
// each as a bordered "phase" card:
//
//   .phase           → bordered card (1px --border, --r-md, --surface)
//   .phaseHead       → drag grip · title (+ "· N min") · status chip · del
//   .statusChip      → done/progress/idle pill; BUTTON cycling the status
//   body             → teachText reading rhythm (13px / 1.55), double-click
//                      to edit through the existing RichTextEditor flow
//   .phaseRes        → per-phase tagged resources as resChip rows
//                      (see phase-resources.tsx)
//   .addPhaseBtn     → dashed full-width "Add phase" after the last phase
//
// The Standards content that used to live in the virtual row now lives in a
// planning tab (built separately in components/daily/planning-tabs).
//
// PRESERVED from the previous implementation:
//   • Drag-reorder via dnd-kit — now ALL rows are sortable (no virtual row).
//   • Collapse-on-drag (lib/collapse-on-drag — every row compacts to a 40px
//     chip while a PHASE drag is active; cited pattern doc 5.18.26).
//   • Double-click-to-edit body through RichTextEditor (coalesced undo).
//   • Per-phase collapse + global Expand all / Collapse all.
//   • The "+ add" resource trigger routes into the shared ResourceComposer.
//   • LessonFlowProps unchanged (lessonId, modified, dockTarget) —
//     LessonDetail consumes it.
//   • `data-flow-section` / `data-flow-title` anchors on each row (the
//     agenda navigator scans them); NEW: `data-flow-minutes` +
//     `data-flow-status` ride along.
//
// NEW interactions (handoff §7):
//   • Rename-on-double-click of the phase title (plain-text inline input,
//     commits via editSection with a coalesce key).
//   • "· N min" is click-to-edit (inline number input; empty → null; null
//     renders NOTHING — never a dangling separator).
//   • The status chip is a button cycling idle → progress → done → idle via
//     editSection. Phase status NEVER touches lesson-level status and never
//     forks the lesson.
//   • Resource chips drag-reorder within a phase (editSection resources
//     patch) and across phases (moveSectionResource).
//
// Store wiring (planner-store): every structural operation dispatches a
// granular store action — one history step each. Text edits (body, title)
// pass a coalesce key so a typing burst collapses to a single undo step.
// UI-only state (drag, rename/minutes editing, per-phase collapsed) stays
// local; never persisted or undone.

import type { ReactNode, RefObject } from "react";
import { memo, useCallback, useId, useMemo, useRef, useState } from "react";
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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type {
  LessonSectionContent,
  SectionResource,
  SectionStatus,
} from "@/lib/lesson-flow";
import {
  type DragState,
  type Density,
  DRAG_MOTION,
  densityFor,
  useDndSensors,
} from "@/lib/collapse-on-drag";
import { usePlanner } from "@/lib/planner-store";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { stripHtml, escapeHtml } from "@/lib/html-text";
import { Button, Tooltip } from "@/components/ui";
import { RichTextEditor } from "@/components/rich-text";
import { PhaseResources, ResourceChipGhost } from "./phase-resources";
// ResourceComposer is the app-wide "Add resource" dialog shared with the
// Daily right rail. The per-phase "+ add" trigger opens this composer
// (pre-routed to the launching lesson + phase) — unchanged contract.
import { ResourceComposer } from "@/components/daily/ResourceComposer";
import type { ResourceComposerEditTarget } from "@/components/daily/ResourceComposer";
import styles from "./lesson-flow.module.css";

// ── Body placeholder text ────────────────────────────────────────────────
const BODY_PLACEHOLDER = "Write lesson plan for this phase…";

// ── Status chip vocabulary ───────────────────────────────────────────────
// Design-system sentence case ("In progress", NOT the prototype's
// "In Progress"). The cycle order is idle → progress → done → idle.
const STATUS_META: Record<
  SectionStatus,
  { label: string; next: SectionStatus }
> = {
  idle: { label: "Not started", next: "progress" },
  progress: { label: "In progress", next: "done" },
  done: { label: "Completed", next: "idle" },
};

// ── DnD id namespacing ───────────────────────────────────────────────────
// One DndContext carries BOTH phase rows and resource chips. Ids are
// namespaced so the drag handlers can branch:
//   <sectionId>            → a phase row (sections sortable)
//   res::<resourceId>      → a resource chip (per-phase sortable)
//   phaseres::<sectionId>  → a phase's chip-list droppable (empty-list target)
const RES_PREFIX = "res::";
const PHASE_RES_PREFIX = "phaseres::";

function isChipId(id: string): boolean {
  return id.startsWith(RES_PREFIX);
}

// ── Props ────────────────────────────────────────────────────────────────

export interface LessonFlowProps {
  /** The lesson whose phases this editor manages. */
  lessonId: string;
  /** Personal-modification flag (kept on the public contract; the flow
   *  itself paints no fork stripe). */
  modified?: boolean;
  /** Optional ref to the element the docked rich-text toolbar should center
   *  itself on. Forwarded unchanged to every RichTextEditor. */
  dockTarget?: RefObject<HTMLElement | null>;
  /** When set, every body RichTextEditor renders chromeless (no toolbar of
   *  its own) and registers with the shared rich-text command bus so the
   *  /daily sticky RtToolbar drives it. Chromeless supersedes dockTarget
   *  inside the editor. Default false. */
  chromeless?: boolean;
}

// ── SortablePhase ────────────────────────────────────────────────────────
// One phase card. The head's drag grip drives dnd-kit reorder; the title is
// rename-on-double-click; "· N min" is click-to-edit; the status chip cycles
// on click; the trash deletes the phase.

interface SortablePhaseProps {
  section: LessonSectionContent;
  index: number;
  density: Density;
  reducedMotion: boolean;
  lessonId: string;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onCycleStatus: (id: string, current: SectionStatus) => void;
  onCommitRename: (id: string, text: string) => void;
  onCommitMinutes: (id: string, raw: string) => void;
  onOpenComposer: (id: string) => void;
  onOpenNoteEditor: (
    sectionId: string,
    editResource: ResourceComposerEditTarget,
  ) => void;
  onRenameResource: (
    sectionId: string,
    resourceId: string,
    label: string,
  ) => void;
  onRemoveResource: (sectionId: string, resourceId: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  dockTarget?: RefObject<HTMLElement | null>;
  chromeless?: boolean;
  // Double-click-to-edit body (state owned by LessonFlow)
  editingBody: boolean;
  draftValue: string;
  onOpenBodyEditor: (id: string, e?: React.SyntheticEvent) => void;
  onDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

const SortablePhase = memo(function SortablePhase({
  section,
  index,
  density,
  reducedMotion,
  lessonId,
  canRemove,
  onRemove,
  onCycleStatus,
  onCommitRename,
  onCommitMinutes,
  onOpenComposer,
  onOpenNoteEditor,
  onRenameResource,
  onRemoveResource,
  isCollapsed,
  onToggleCollapsed,
  dockTarget,
  chromeless,
  editingBody,
  draftValue,
  onOpenBodyEditor,
  onCommitEdit,
  onCancelEdit,
  onDraftChange,
}: SortablePhaseProps): ReactNode {
  const titleText = stripHtml(section.heading) || "Untitled phase";
  const status: SectionStatus = section.status ?? "idle";
  const minutes = section.minutes ?? null;

  // Sanitize the phase body before it is injected via
  // dangerouslySetInnerHTML (audit #9 — stored XSS). Under the forking model
  // this body can come from another teacher, so it is untrusted.
  const safeBody = useMemo(
    () => sanitizeHtml(section.body ?? ""),
    [section.body],
  );

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

  // Body + resources are hidden in TWO independent cases: drag density is
  // compact (collapse-on-drag), or the teacher collapsed this phase.
  const bodyHidden = isCompact || isCollapsed;

  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: sortableTransition,
  };

  // ── Inline rename (title) ─────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const startRename = useCallback((e?: React.SyntheticEvent): void => {
    e?.stopPropagation();
    setRenaming(true);
  }, []);
  const commitRename = useCallback(
    (value: string): void => {
      setRenaming(false);
      const trimmed = value.trim();
      if (trimmed && trimmed !== titleText) {
        onCommitRename(section.id, trimmed);
      }
    },
    [section.id, titleText, onCommitRename],
  );

  // ── Inline minutes edit ───────────────────────────────────────────────
  const [editingMinutes, setEditingMinutes] = useState(false);
  const commitMinutes = useCallback(
    (raw: string): void => {
      setEditingMinutes(false);
      onCommitMinutes(section.id, raw);
    },
    [section.id, onCommitMinutes],
  );

  // The collapse-on-drag chip (every row rides this when a PHASE drag is
  // active — chips don't trigger compact density).
  const chipContent = (
    <div className={styles.chip40Row}>
      <span className={styles.chip40Heading}>{titleText}</span>
    </div>
  );

  const statusMeta = STATUS_META[status];

  return (
    <li
      ref={setNodeRef}
      style={sortableStyle}
      className={[
        styles.row,
        isDragging ? styles.rowDragging : "",
        isCompact ? "" : styles.phase,
      ]
        .filter(Boolean)
        .join(" ")}
      // DOM anchors for the Daily view's agenda navigator
      // (components/daily/LessonAgendaNav) — it scans the rendered rows so
      // it never duplicates this file's phase resolution. NEW (6.11.26):
      // data-flow-minutes (absent when minutes is null — the optional-
      // minutes rule) and data-flow-status ride along for the agenda's
      // per-phase time + done-tint rendering.
      // tabIndex -1: the navigator moves focus here after a jump so
      // keyboard / screen-reader users continue from the phase they chose.
      data-flow-section={section.id}
      data-flow-title={titleText}
      data-flow-index={index + 1}
      data-flow-minutes={minutes ?? undefined}
      data-flow-status={status}
      tabIndex={-1}
    >
      {/* Drag-compact chip while a phase drag is in flight. */}
      {isCompact && chipContent}

      {!isCompact && (
        <>
          {/* ── Phase head — grip · title (+ min) · status chip · del ── */}
          <div className={styles.phaseHead}>
            {/* Drag grip — the dnd-kit activator. Kept as raw <button>:
                setActivatorNodeRef requires a DOM ref and Button does not
                expose forwardRef yet. */}
            <Tooltip
              content="Drag this phase up or down to reorder the lesson flow"
              side="top"
              tooltipId="lesson-flow-phase-drag"
            >
              <button
                type="button"
                ref={setActivatorNodeRef}
                className={styles.dragGrip}
                aria-label={`Drag to reorder phase ${index + 1}: ${titleText}`}
                title="Drag up or down to reorder this phase"
                {...listeners}
                {...attributes}
              >
                <GripVerticalIcon />
              </button>
            </Tooltip>

            {/* Title + optional "· N min". The title renames on
                double-click (or Enter/F2 when focused) per the handoff. */}
            <h3 className={styles.phaseTitle}>
              {renaming ? (
                <input
                  type="text"
                  className={styles.titleInput}
                  defaultValue={titleText}
                  autoFocus
                  aria-label={`Rename phase: ${titleText}`}
                  onBlur={(e) => commitRename(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename(e.currentTarget.value);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenaming(false);
                    }
                  }}
                />
              ) : (
                <Tooltip
                  content="Double-click to rename this phase"
                  side="top"
                  tooltipId="lesson-flow-phase-rename"
                >
                  <span
                    className={styles.phaseTitleText}
                    tabIndex={0}
                    role="button"
                    aria-label={`Phase ${index + 1}: ${titleText}. Press Enter to rename.`}
                    onDoubleClick={startRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "F2") startRename(e);
                    }}
                  >
                    {titleText}
                  </span>
                </Tooltip>
              )}

              {/* "· N min" — only when minutes is set (never a dangling
                  separator). Click to edit inline. */}
              {editingMinutes ? (
                <input
                  type="number"
                  min={0}
                  className={styles.minInput}
                  defaultValue={minutes ?? ""}
                  autoFocus
                  aria-label={`Phase length in minutes for ${titleText} — leave empty for no time`}
                  onBlur={(e) => commitMinutes(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitMinutes(e.currentTarget.value);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingMinutes(false);
                    }
                  }}
                />
              ) : minutes != null ? (
                <Tooltip
                  content="Planned length of this phase — click to change the minutes"
                  side="top"
                  tooltipId="lesson-flow-phase-minutes"
                >
                  <button
                    type="button"
                    className={styles.min}
                    onClick={() => setEditingMinutes(true)}
                    aria-label={`Planned length: ${minutes} minutes. Activate to edit.`}
                  >
                    · {minutes} min
                  </button>
                </Tooltip>
              ) : null}
            </h3>

            {/* Right side — status chip, collapse chevron, hover trash. */}
            <div className={styles.phaseHeadRight}>
              <Tooltip
                content="Track this phase while you teach — tap to cycle Not started → In progress → Completed"
                side="top"
                tooltipId="lesson-flow-phase-status"
              >
                <button
                  type="button"
                  className={styles.statusChip}
                  data-status={status}
                  onClick={() => onCycleStatus(section.id, status)}
                  aria-label={`Phase status: ${statusMeta.label}. Activate to mark ${STATUS_META[statusMeta.next].label}.`}
                >
                  {statusMeta.label}
                </button>
              </Tooltip>

              {/* Collapse chevron — preserved behavior; `v` when expanded,
                  `>` when collapsed. */}
              <Button
                variant="icon"
                size="sm"
                className={styles.collapseChevron}
                onClick={() => onToggleCollapsed(section.id)}
                aria-expanded={!isCollapsed}
                iconAriaLabel={
                  isCollapsed
                    ? `Expand phase: ${titleText}`
                    : `Collapse phase: ${titleText}`
                }
                tooltip={
                  isCollapsed
                    ? `Expand ${titleText} to see its plan and tagged resources`
                    : `Collapse ${titleText} to its heading so you can scan the whole lesson`
                }
              >
                <ChevronRightIcon collapsed={isCollapsed} />
              </Button>

              {/* Delete — hover-revealed (also visible on keyboard focus).
                  Destructive → required tooltip (CLAUDE.md §4 always-on
                  exception). Disabled on the last remaining phase. */}
              <Tooltip
                content={
                  canRemove
                    ? `Delete the "${titleText}" phase and everything in it — this affects the whole plan and can be undone with Ctrl+Z`
                    : "A lesson keeps at least one phase — add another phase before deleting this one"
                }
                side="left"
                required
              >
                <button
                  type="button"
                  className={styles.phaseDel}
                  onClick={() => onRemove(section.id)}
                  disabled={!canRemove}
                  aria-label={`Delete phase: ${titleText}`}
                  title={
                    canRemove
                      ? `Delete phase: ${titleText}`
                      : "A lesson keeps at least one phase"
                  }
                >
                  <TrashIcon />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Body + tagged resources — collapse to head-only ── */}
          <AnimatePresence initial={false}>
            {!bodyHidden && (
              <motion.div
                key="phase-body"
                initial={
                  reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                }
                animate={
                  reducedMotion
                    ? { opacity: 1 }
                    : { height: "auto", opacity: 1 }
                }
                exit={
                  reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
                }
                transition={collapseTransition}
                style={reducedMotion ? undefined : { overflow: "hidden" }}
              >
                {/* Body — teachText reading rhythm; double-click (or
                    Enter/F2) opens the RichTextEditor. */}
                <div className={styles.phaseBody}>
                  {editingBody ? (
                    <RichEditorWrapper
                      onCommit={onCommitEdit}
                      onCancel={onCancelEdit}
                      fill
                    >
                      <RichTextEditor
                        value={draftValue}
                        onChange={onDraftChange}
                        autoFocus
                        placeholder={BODY_PLACEHOLDER}
                        ariaLabel={`Plan for phase: ${titleText}`}
                        dockTarget={dockTarget}
                        chromeless={chromeless}
                      />
                    </RichEditorWrapper>
                  ) : stripHtml(section.body) ? (
                    <div
                      className={styles.teachText}
                      tabIndex={0}
                      role="button"
                      aria-label={`Edit plan for phase: ${titleText}`}
                      onDoubleClick={(e) => onOpenBodyEditor(section.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "F2")
                          onOpenBodyEditor(section.id, e);
                      }}
                      title={`Double-click or press Enter to edit ${titleText}`}
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: safeBody }}
                    />
                  ) : (
                    <div
                      className={[styles.teachText, styles.bodyEmpty].join(" ")}
                      tabIndex={0}
                      role="button"
                      aria-label={`Add a plan for phase: ${titleText}`}
                      onDoubleClick={(e) => onOpenBodyEditor(section.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "F2")
                          onOpenBodyEditor(section.id, e);
                      }}
                      title={`Double-click or press Enter to edit ${titleText}`}
                    >
                      {BODY_PLACEHOLDER}
                    </div>
                  )}
                </div>

                {/* Per-phase tagged resources — resChip rows. */}
                <PhaseResources
                  sectionId={section.id}
                  resources={section.resources}
                  onAdd={() => onOpenComposer(section.id)}
                  onEditNote={(resource) =>
                    onOpenNoteEditor(section.id, {
                      lessonId,
                      sectionId: section.id,
                      resourceId: resource.id,
                      resource,
                    })
                  }
                  onRenameResource={(resourceId, label) =>
                    onRenameResource(section.id, resourceId, label)
                  }
                  onRemoveResource={(resourceId) =>
                    onRemoveResource(section.id, resourceId)
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </li>
  );
});

// ── LessonFlow ───────────────────────────────────────────────────────────

export function LessonFlow({
  lessonId,
  dockTarget,
  chromeless = false,
}: LessonFlowProps): ReactNode {
  const {
    lessons,
    getSections,
    reorderSections,
    editSection,
    addSection: storeAddSection,
    removeSection: storeRemoveSection,
    editSectionResource,
    removeSectionResource,
    moveSectionResource,
  } = usePlanner();

  // Authoritative phases from the store, in store order.
  const sections = getSections(lessonId);

  // Resolve the lesson object (needed by the ResourceComposer).
  const lesson = lessons.find((l) => l.id === lessonId);

  // ── Motion / DnD ────────────────────────────────────────────────────
  const prefersReducedMotion = useReducedMotion() ?? false;
  const sensors = useDndSensors();
  // dragState tracks PHASE drags only (it drives collapse-on-drag density);
  // a chip drag rides `activeChip` and never compacts the layout.
  const [dragState, setDragState] = useState<DragState>({ phase: "idle" });
  const [activeChip, setActiveChip] = useState<SectionResource | null>(null);
  const density = densityFor(dragState);

  // ── Per-phase collapsed state ───────────────────────────────────────
  // Default: every phase EXPANDED (the handoff renders all phases open).
  // The teacher's overrides persist for the session; reset on lesson change.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );

  const prevLessonIdRef = useRef(lessonId);
  if (prevLessonIdRef.current !== lessonId) {
    prevLessonIdRef.current = lessonId;
    setCollapsedSections(new Set());
  }

  // ── Body editor state ───────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");

  // Coalesced patch: a typing burst = one undo step.
  const patchSectionBody = useCallback(
    (id: string, body: string): void => {
      editSection(
        lessonId,
        id,
        { body },
        { key: `section:${lessonId}:${id}:body`, ts: Date.now() },
      );
    },
    [lessonId, editSection],
  );

  const openBodyEditor = useCallback(
    (sectionId: string, e?: React.SyntheticEvent): void => {
      e?.stopPropagation();
      e?.preventDefault();
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return;
      setEditTarget(sectionId);
      setEditDraft(section.body ?? "");
    },
    [sections],
  );

  const commitBodyEdit = useCallback((): void => {
    if (!editTarget) return;
    const section = sections.find((s) => s.id === editTarget);
    const original = section?.body ?? "";
    if (editDraft !== original) {
      patchSectionBody(editTarget, editDraft);
    }
    setEditTarget(null);
    setEditDraft("");
  }, [editTarget, editDraft, sections, patchSectionBody]);

  const cancelBodyEdit = useCallback((): void => {
    setEditTarget(null);
    setEditDraft("");
  }, []);

  // ── Phase management ────────────────────────────────────────────────
  // "New phase" is the 6.11.26 spec title (sentence case, not the store
  // default "New section").
  function addPhase(): void {
    storeAddSection(lessonId, "New phase");
  }

  const removePhase = useCallback(
    (id: string): void => {
      storeRemoveSection(lessonId, id);
      setCollapsedSections((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setEditTarget((prev) => (prev === id ? null : prev));
    },
    [lessonId, storeRemoveSection],
  );

  // ── Status cycle — phase-level ONLY ─────────────────────────────────
  // Never touches lesson-level status, never forks the lesson: this is a
  // plain editSection patch on the section row.
  const cycleStatus = useCallback(
    (sectionId: string, current: SectionStatus): void => {
      editSection(lessonId, sectionId, { status: STATUS_META[current].next });
    },
    [lessonId, editSection],
  );

  // ── Rename — plain-text heading commit (coalesced) ──────────────────
  const commitRename = useCallback(
    (sectionId: string, text: string): void => {
      editSection(
        lessonId,
        sectionId,
        { heading: escapeHtml(text) },
        { key: `section:${lessonId}:${sectionId}:heading`, ts: Date.now() },
      );
    },
    [lessonId, editSection],
  );

  // ── Minutes commit — empty → null (no time shown) ───────────────────
  const commitMinutes = useCallback(
    (sectionId: string, raw: string): void => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        editSection(lessonId, sectionId, { minutes: null });
        return;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) return; // ignore invalid input
      // Clamp to a sane ceiling — an absurd value (99999999) would distort
      // the phase head and the agenda navigator's time line.
      editSection(lessonId, sectionId, {
        minutes: Math.min(999, Math.round(n)),
      });
    },
    [lessonId, editSection],
  );

  // ── Resource chip actions ───────────────────────────────────────────
  const renameResource = useCallback(
    (sectionId: string, resourceId: string, label: string): void => {
      editSectionResource(lessonId, sectionId, resourceId, { label });
    },
    [lessonId, editSectionResource],
  );

  const removeResource = useCallback(
    (sectionId: string, resourceId: string): void => {
      removeSectionResource(lessonId, sectionId, resourceId);
    },
    [lessonId, removeSectionResource],
  );

  // ── ResourceComposer state ──────────────────────────────────────────
  const [composerTarget, setComposerTarget] = useState<{
    sectionId: string;
    editResource?: ResourceComposerEditTarget;
  } | null>(null);

  const handleOpenComposer = useCallback((sectionId: string): void => {
    setComposerTarget({ sectionId });
  }, []);

  const handleOpenNoteEditor = useCallback(
    (sectionId: string, editResource: ResourceComposerEditTarget): void => {
      setComposerTarget({ sectionId, editResource });
    },
    [],
  );

  const closeComposer = useCallback((): void => {
    setComposerTarget(null);
  }, []);

  // ── Per-phase collapse toggle + global controls ─────────────────────
  const toggleCollapsed = useCallback((sectionId: string): void => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback((): void => {
    setCollapsedSections(new Set(sections.map((s) => s.id)));
  }, [sections]);

  const expandAll = useCallback((): void => {
    setCollapsedSections(new Set());
  }, []);

  const allCollapsed =
    sections.length > 0 && sections.every((s) => collapsedSections.has(s.id));
  const noneCollapsed = collapsedSections.size === 0;

  // ── aria-live for drag announcements ────────────────────────────────
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const announceRegionId = useId();

  const sortableIds = useMemo(() => sections.map((s) => s.id), [sections]);

  // Normalize ANY droppable id to the phase that owns it — a chip id maps
  // to the section carrying that resource; a phaseres:: id maps to its
  // section; a bare section id maps to itself.
  const ownerSectionOf = useCallback(
    (overId: string): string | null => {
      if (overId.startsWith(RES_PREFIX)) {
        const rid = overId.slice(RES_PREFIX.length);
        return (
          sections.find((s) => s.resources.some((r) => r.id === rid))?.id ??
          null
        );
      }
      if (overId.startsWith(PHASE_RES_PREFIX)) {
        return overId.slice(PHASE_RES_PREFIX.length);
      }
      return sections.some((s) => s.id === overId) ? overId : null;
    },
    [sections],
  );

  // ── dnd-kit drag lifecycle ─────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent): void {
    const id = String(active.id);
    if (isChipId(id)) {
      const rid = id.slice(RES_PREFIX.length);
      const src = sections.find((s) => s.resources.some((r) => r.id === rid));
      const resource = src?.resources.find((r) => r.id === rid) ?? null;
      setActiveChip(resource);
      setLiveAnnouncement(
        "Picked up resource. Drop it on another position or phase to move it; Escape cancels.",
      );
      return;
    }
    setDragState({ phase: "dragging", activeId: id, overId: null });
    setLiveAnnouncement(
      "Picked up phase. Use arrow keys to move, Space to drop, Escape to cancel.",
    );
  }

  function handleDragOver({ over }: DragOverEvent): void {
    if (!over) return;
    setDragState((prev) =>
      prev.phase === "dragging" ? { ...prev, overId: String(over.id) } : prev,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    const id = String(active.id);

    // ── Resource chip drop ─────────────────────────────────────────
    if (isChipId(id)) {
      setActiveChip(null);
      if (!over) {
        setLiveAnnouncement("Drag cancelled.");
        return;
      }
      const rid = id.slice(RES_PREFIX.length);
      const src = sections.find((s) => s.resources.some((r) => r.id === rid));
      const resource = src?.resources.find((r) => r.id === rid);
      const targetSectionId = ownerSectionOf(String(over.id));
      if (!src || !resource || !targetSectionId) return;

      if (targetSectionId === src.id) {
        // Within-phase reorder — one editSection step with the moved array.
        const overId = String(over.id);
        if (overId.startsWith(RES_PREFIX)) {
          const overRid = overId.slice(RES_PREFIX.length);
          if (overRid !== rid) {
            const from = src.resources.findIndex((r) => r.id === rid);
            const to = src.resources.findIndex((r) => r.id === overRid);
            if (from !== -1 && to !== -1) {
              editSection(lessonId, src.id, {
                resources: arrayMove(src.resources, from, to),
              });
            }
          }
        }
      } else {
        // Cross-phase move — appends to the target phase's list.
        moveSectionResource(lessonId, src.id, targetSectionId, resource);
      }
      setLiveAnnouncement("Dropped.");
      return;
    }

    // ── Phase drop ─────────────────────────────────────────────────
    if (over && id !== String(over.id)) {
      const target = ownerSectionOf(String(over.id));
      if (target && target !== id) {
        reorderSections(lessonId, id, target);
      }
    }
    setLiveAnnouncement("Dropped.");
    setDragState({ phase: "idle" });
  }

  function handleDragCancel(): void {
    setDragState({ phase: "idle" });
    setActiveChip(null);
    setLiveAnnouncement("Drag cancelled.");
  }

  // Heading shown in the phase DragOverlay chip.
  const draggedHeading =
    dragState.phase !== "idle"
      ? stripHtml(
          sections.find((s) => s.id === dragState.activeId)?.heading ?? "",
        ) || "Phase"
      : "";

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* aria-live drag announcements. */}
      <div
        id={announceRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={styles.srOnly}
      >
        {liveAnnouncement}
      </div>

      {/* ── Flow header: global expand/collapse ─────────────────────── */}
      <div className={styles.flowHeader}>
        <div
          className={styles.globalToggles}
          role="group"
          aria-label="Expand or collapse all phases"
        >
          <Button
            variant="ghost"
            size="sm"
            className={styles.globalToggleBtn}
            onClick={expandAll}
            disabled={noneCollapsed}
            tooltip="Open every phase of this lesson at once — useful when reviewing the full plan before teaching"
          >
            Expand all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={styles.globalToggleBtn}
            onClick={collapseAll}
            disabled={allCollapsed}
            tooltip="Collapse every phase to its heading — useful when reordering or scanning the lesson outline"
          >
            Collapse all
          </Button>
        </div>
      </div>

      {/* ── The phase stack ───────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <ol className={styles.list} aria-label="Lesson phases">
            {sections.map((section, idx) => (
              <SortablePhase
                key={section.id}
                section={section}
                index={idx}
                density={density}
                reducedMotion={prefersReducedMotion}
                lessonId={lessonId}
                canRemove={sections.length > 1}
                onRemove={removePhase}
                onCycleStatus={cycleStatus}
                onCommitRename={commitRename}
                onCommitMinutes={commitMinutes}
                onOpenComposer={handleOpenComposer}
                onOpenNoteEditor={handleOpenNoteEditor}
                onRenameResource={renameResource}
                onRemoveResource={removeResource}
                isCollapsed={collapsedSections.has(section.id)}
                onToggleCollapsed={toggleCollapsed}
                dockTarget={dockTarget}
                chromeless={chromeless}
                editingBody={editTarget !== null && editTarget === section.id}
                draftValue={editTarget === section.id ? editDraft : ""}
                onOpenBodyEditor={openBodyEditor}
                onDraftChange={setEditDraft}
                onCommitEdit={commitBodyEdit}
                onCancelEdit={cancelBodyEdit}
              />
            ))}
          </ol>
        </SortableContext>

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
          {activeChip ? (
            <ResourceChipGhost resource={activeChip} />
          ) : dragState.phase !== "idle" ? (
            <div className={styles.overlayChip} aria-hidden="true">
              <div className={styles.chip40Row}>
                <span className={styles.chip40Heading}>{draggedHeading}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── "Add phase" — dashed full-width button after the last phase.
           The "Edit lesson flow / template" stub that used to live here has
           been removed — the Templates menu now lives in the Daily agenda
           section head (built in LessonDetail). */}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.addPhaseBtn}
          onClick={addPhase}
          title="Append a new phase to this lesson plan"
        >
          <AddIcon />
          Add phase
        </button>
      </div>

      {/* ── ResourceComposer — shared "Add resource" / "Add note" dialog ──
          Render-gated on the resolved lesson: the composer evaluates
          lesson fields before its own `open` early-return, so an
          unresolvable lessonId must not reach it at all. */}
      {lesson && (
        <ResourceComposer
          open={composerTarget !== null}
          lesson={lesson}
          mode={composerTarget?.editResource ? "notecard" : "resource"}
          editResource={composerTarget?.editResource}
          initialSectionId={composerTarget?.sectionId}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}

// ── RichEditorWrapper ────────────────────────────────────────────────────
// Thin shell hosting RichTextEditor for body edits. Commits on focusout,
// cancels on Escape. Identical contract to the previous version.

function RichEditorWrapper({
  onCommit,
  onCancel,
  children,
  fill = false,
}: {
  onCommit: () => void;
  onCancel: () => void;
  children: ReactNode;
  fill?: boolean;
}): ReactNode {
  return (
    <div
      className={[styles.richEditorWrap, fill ? styles.richEditorWrapFill : ""]
        .filter(Boolean)
        .join(" ")}
      onBlur={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;
        if (next?.closest('[role="toolbar"]')) return;
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}

// stripHtml / escapeHtml live in lib/html-text.ts — ONE escape/decode
// contract shared with the agenda navigator's rename-in-place, so a rename
// through either surface round-trips identically.

// ── Icons ────────────────────────────────────────────────────────────────

function ChevronRightIcon({ collapsed }: { collapsed: boolean }): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={collapsed ? styles.chevronCollapsed : styles.chevronExpanded}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function AddIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
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

function GripVerticalIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="5" r="1.6" />
      <circle cx="15" cy="5" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="15" cy="19" r="1.6" />
    </svg>
  );
}

/** Trash glyph for the phase delete button (prototype .phaseDel, 15px). */
function TrashIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
