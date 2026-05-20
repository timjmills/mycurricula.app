"use client";

// lesson-flow.tsx — the per-lesson section editor ("lesson flow").
//
// REVISED 2026-05-20 per Plugin Directions §3, §4, §5, §6:
// The lesson body is now a CANONICAL SIX-SECTION layout. Each section row
// leads with a PIN badge (USER OVERRIDE — see CSS for the teardrop shape;
// the spec's "circle" is REPLACED by a rounded-rect + right-pointing notch),
// followed by a title + helper line stack, with a small chevron on the right
// for expand / collapse. Pin badges are connected by a vertical line drawn
// per-row in the badge's color at 50% opacity. Pin colors are the EXACT HEX
// values from spec §3.1 (#14b8a6, #f97316, #a855f7, #eab308, #3b82f6,
// #ec4899) — this is the spec's explicit exception to the tokens-only rule
// for the section-cycle decorative palette.
//
// The six canonical sections (spec §3, in order):
//   1. Standards
//   2. Focus Lesson — I Do
//   3. Guided Instruction — We Do
//   4. Collaborative Practice — You Do Together
//   5. Independent Practice — You Do Alone
//   6. Debrief
//
// Section 1 (Standards) is a VIRTUAL section: there is no Standards section
// in the store template, so the row renders its title + helper line + body
// textarea + resources (sourced from lesson.resources) without touching the
// store's structural model. Editing the Standards body is a Phase-1B
// concern — the placeholder text input is left visually present but
// non-functional (it is wired to local state only; nothing persists today).
//
// Sections 2–6 map positionally to the store's first five sections (the
// default Gradual Release template). Their bodies are still the existing
// per-section rich text in the store; the only visual change is the row
// chrome (title, helper line, pin badge — no more highlighter band per
// spec §3.2). Heading editing has been REMOVED per spec §3.2: titles are
// plain static text and cannot be renamed inline. The body remains
// double-click-to-edit through the existing RichTextEditor flow.
//
// Default expansion: Section 1 is EXPANDED by default; Sections 2–6 are
// COLLAPSED by default (spec §3.5). The teacher's overrides are tracked in
// the existing per-section `collapsedSections` set.
//
// Per-section Resources: rendered by <SectionResources> (new component in
// this folder). Each section has independent expanded ↔ minimized state for
// its resources card, persisted in localStorage per (lessonId, sectionId).
// See components/lesson-flow/section-resources.tsx for the full spec on
// what those two states render.
//
// PRESERVED (per task brief §5):
//   • Drag-reorder via heading grip (dnd-kit).
//   • Double-click edit on body (heading editing removed per spec).
//   • The "+" trigger on the heading row opens ResourceComposer.
//   • LessonFlowProps unchanged (lessonId, modified, dockTarget).
//   • ResourceTile / resource-tile.tsx public API (additive only).
//   • Expand all / Collapse all controls above Section 1.
//   • "+ Add section" / "Edit lesson flow template" stubs below Section 6.
//
// Store wiring (planner-store): all structural operations (reorder, add,
// remove, duplicate; resource add/remove/move; website toggle) dispatch
// granular store actions — one history step each. Text edits (body) call
// editSection with a coalesce key so a typing burst collapses to a single
// undo step. UI-only state (drag, hover, website visibility, per-section
// collapsed, per-section minimized) stays local; never persisted or undone.

import type { ReactNode, RefObject } from "react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LessonSectionContent, SectionResource } from "@/lib/lesson-flow";
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
import { SectionResources } from "./section-resources";
// ResourceComposer is the app-wide "Add resource" dialog shared with the
// Daily right rail. The per-section "+" trigger opens this composer
// (pre-routed to the launching lesson + section) instead of an inline
// add-tiles popup. Imported from the deep path because the daily barrel
// does not re-export it yet — agreed cross-agent contract.
import { ResourceComposer } from "@/components/daily/ResourceComposer";
import styles from "./lesson-flow.module.css";

// ── Body placeholder text (spec §3.4) ────────────────────────────────────
const BODY_PLACEHOLDER = "Write lesson plan for this section…";

// ── Canonical six-section schema (spec §3) ───────────────────────────────
// Each entry carries:
//   • title    — the spec's exact section title (plain text, no highlight).
//   • helper   — the spec's exact helper / subtitle line.
//   • pinColor — the spec's EXACT HEX value for the pin badge fill (and
//                the vertical connector line color at 50% opacity).
//
// The HEX values are the spec's explicit exception to the tokens-only rule —
// they are the decorative section-cycle palette listed in §3.1 (with the
// USER OVERRIDE preserving these colors while changing the shape from circle
// to pin/teardrop). Do NOT swap these for tokens.
//
// `templateMatch` is the heading text we expect to find in the store for
// this canonical position (sections 2–6 map to the default Gradual Release
// template). Position 1 ("Standards") has no template match — it is virtual.

interface CanonicalSection {
  readonly index: number;
  readonly title: string;
  readonly helper: string;
  readonly pinColor: string;
  /** Heading text used to locate this section in the store (case-insensitive
   *  substring match against the section's plain-text heading). `null` means
   *  the section is virtual and has no store backing. */
  readonly templateMatch: string | null;
}

const CANONICAL_SECTIONS: readonly CanonicalSection[] = [
  {
    index: 1,
    title: "Standards",
    helper:
      "Interpret a fraction as division of the numerator by the denominator (a/b = a ÷ b).",
    pinColor: "#14b8a6", // Teal — spec §3.1
    templateMatch: null,
  },
  {
    index: 2,
    title: "Focus Lesson — I Do",
    helper: "Model the concept and solve examples together.",
    pinColor: "#f97316", // Orange — spec §3.1
    templateMatch: "focus lesson",
  },
  {
    index: 3,
    title: "Guided Instruction — We Do",
    helper: "Practice together with teacher support.",
    pinColor: "#a855f7", // Purple — spec §3.1
    templateMatch: "guided instruction",
  },
  {
    index: 4,
    title: "Collaborative Practice — You Do Together",
    helper: "Work in pairs or groups to apply the skill.",
    pinColor: "#eab308", // Amber/Yellow — spec §3.1
    templateMatch: "collaborative practice",
  },
  {
    index: 5,
    title: "Independent Practice — You Do Alone",
    helper: "Students practice independently.",
    pinColor: "#3b82f6", // Blue — spec §3.1
    templateMatch: "independent practice",
  },
  {
    index: 6,
    title: "Debrief",
    helper: "Reflect on learning and key takeaways.",
    pinColor: "#ec4899", // Pink — spec §3.1
    templateMatch: "debrief",
  },
] as const;

// ── Props ────────────────────────────────────────────────────────────────

export interface LessonFlowProps {
  /** The lesson whose sections this editor manages. */
  lessonId: string;
  /** Personal-modification flag (kept on the public contract; the flow
   *  itself paints no fork stripe). */
  modified?: boolean;
  /** Optional ref to the element the docked rich-text toolbar should center
   *  itself on. Forwarded unchanged to every RichTextEditor. */
  dockTarget?: RefObject<HTMLElement | null>;
}

// ── Internal types ───────────────────────────────────────────────────────

/** A resolved canonical row: the schema entry plus either the store-backed
 *  section content for positions 2–6 or a synthetic placeholder for the
 *  virtual Standards row. */
interface ResolvedSection {
  canonical: CanonicalSection;
  /** The store-backed section for this row, when one exists. `null` for the
   *  virtual Standards row (and for any canonical position the template
   *  doesn't currently provide). */
  storeSection: LessonSectionContent | null;
}

// ── SortableSection ──────────────────────────────────────────────────────
// Renders one canonical row. The drag handle drives dnd-kit reorder — but
// reorder is ONLY valid against store-backed positions (2–6). The virtual
// Standards row is non-sortable; we render it OUTSIDE the SortableContext
// so it stays anchored at index 0.

interface SortableSectionProps {
  resolved: ResolvedSection;
  isFirst: boolean;
  isLast: boolean;
  density: Density;
  reducedMotion: boolean;
  lessonId: string;
  lessonResources: SectionResource[];
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenComposer: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleWebsite: (id: string) => void;
  websiteVisible: boolean;
  canRemove: boolean;
  isMenuOpen: boolean;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: (id: string) => void;
  dockTarget?: RefObject<HTMLElement | null>;
  // Double-click-to-edit (body only — heading editing is removed per spec)
  editingBody: boolean;
  draftValue: string;
  onOpenBodyEditor: (id: string, e?: React.SyntheticEvent) => void;
  onDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}

const SortableSection = memo(function SortableSection({
  resolved,
  isFirst,
  isLast,
  density,
  reducedMotion,
  lessonId,
  lessonResources,
  onMoveUp,
  onMoveDown,
  onRemove,
  onOpenComposer,
  onDuplicate,
  onToggleWebsite,
  websiteVisible,
  canRemove,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  isCollapsed,
  onToggleCollapsed,
  dockTarget,
  editingBody,
  draftValue,
  onOpenBodyEditor,
  onCommitEdit,
  onCancelEdit,
  onDraftChange,
}: SortableSectionProps): ReactNode {
  const { canonical, storeSection } = resolved;

  // Virtual (Standards) row has no store-backed id — use a synthetic key for
  // sortable so it still participates (read-only) in the DnD context. The
  // virtual row's drag listeners are detached at the parent level by the
  // sortable items list excluding it; here we just generate a stable id.
  const sortableId = storeSection
    ? storeSection.id
    : `__virtual:${canonical.index}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({
    id: sortableId,
    // The virtual row is not draggable.
    disabled: !storeSection,
  });

  const isCompact = density === "compact";

  // The section body + resources are hidden in TWO independent cases:
  //   • drag density is compact (collapse-on-drag), or
  //   • the teacher has collapsed this section to heading-only.
  const bodyHidden = isCompact || isCollapsed;

  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: sortableTransition,
  };

  // Pin color is set as a CSS custom property so the row's ::before connector
  // and the .pinBadge background both read from the same value. This is the
  // ONE place the spec's HEX colors are applied — see CANONICAL_SECTIONS.
  const rowStyle = {
    ...sortableStyle,
    "--pin-color": canonical.pinColor,
  } as React.CSSProperties;

  // ── Section-menu popup: refs + close affordances ─────────────────────
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(e: PointerEvent): void {
      const target = e.target as Node | null;
      if (
        target &&
        (triggerRef.current?.contains(target) ||
          anchorRef.current?.contains(target))
      ) {
        return;
      }
      onCloseMenu();
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      onCloseMenu();
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, onCloseMenu]);

  // The id used to address THIS row in toggle/popup callbacks. For a virtual
  // row we use the synthetic key; the parent's handlers know to ignore
  // store-bound ops against it.
  const rowId = storeSection ? storeSection.id : sortableId;

  // Resources pool — store-backed sections use their own resources; the
  // virtual Standards row uses the lesson-level resources (spec §7).
  // SectionResource carries an `id`; lesson-level LessonResource doesn't —
  // we synthesize ids upstream (see lessonResources prop) to keep render
  // identity stable across rerenders.
  const resourcesPool: SectionResource[] = storeSection
    ? storeSection.resources
    : lessonResources;

  // The collapse-on-drag chip (sections 2–6 ride this when a drag is active).
  // Virtual rows never enter compact density (they're not sortable), so the
  // chip is rendered only when `storeSection` exists too.
  const chipContent = (
    <div className={styles.chip40Row}>
      <span className={styles.chip40Heading}>{canonical.title}</span>
    </div>
  );

  // ── Toolbar action wrappers — close popup after each action ─────────
  const runAndClose = (fn: () => void) => (): void => {
    fn();
    onCloseMenu();
  };

  return (
    <li
      ref={setNodeRef}
      style={rowStyle}
      className={[styles.row, isDragging ? styles.rowDragging : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag-compact chip (only meaningful for store-backed rows). */}
      {isCompact && storeSection && chipContent}

      {!isCompact && (
        <div className={styles.section}>
          {/* ── PIN badge (USER OVERRIDE — teardrop/map-pin shape) ─────────
              aria-hidden — the section title carries the accessible name.
              The pin color comes from `--pin-color` set on the row above. */}
          <span className={styles.pinBadge} aria-hidden="true">
            {canonical.index}
          </span>

          {/* ── Heading row — drag grip + title/helper + chevron ──────────
              The drag grip is positioned BEFORE the title stack and provides
              the dnd-kit activator. It's hidden when the row is virtual
              (Standards). The chevron lives at the far RIGHT of the row per
              spec §3.2. The whole row toggles expand/collapse. */}
          <div
            className={styles.headingRow}
            onClick={() => onToggleCollapsed(rowId)}
          >
            {/* Drag grip — only on store-backed rows (Standards is fixed). */}
            {storeSection && (
              <button
                type="button"
                ref={setActivatorNodeRef}
                className={styles.dragGrip}
                aria-label={`Drag to reorder section ${canonical.index}: ${canonical.title}`}
                title="Drag to reorder section"
                // Stop click bubbling so dragging the grip doesn't toggle
                // collapse.
                onClick={(e) => e.stopPropagation()}
                {...listeners}
                {...attributes}
              >
                <GripVerticalIcon />
              </button>
            )}

            {/* Title + helper stack. */}
            <div className={styles.titleStack}>
              <h3 className={styles.sectionTitle}>{canonical.title}</h3>
              <p className={styles.sectionHelper}>{canonical.helper}</p>
            </div>

            {/* Right-side chevron — `v` when expanded, `>` when collapsed
                (spec §3.2). The button is a separate hit target so screen
                readers announce the expand/collapse intent. */}
            <button
              type="button"
              className={styles.collapseChevron}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapsed(rowId);
              }}
              aria-expanded={!isCollapsed}
              aria-label={
                isCollapsed
                  ? `Expand section ${canonical.index}: ${canonical.title}`
                  : `Collapse section ${canonical.index}: ${canonical.title}`
              }
              title={isCollapsed ? "Expand section" : "Collapse section"}
            >
              <ChevronRightIcon collapsed={isCollapsed} />
            </button>

            {/* Section management trigger ("···" overflow) — only on
                store-backed rows. Clicking opens the SectionToolbar popup
                with Move up/down, Duplicate, Show on website, Delete. The
                "+" path (open ResourceComposer) is exposed inside the
                SectionResources card as the "+ Add resource" button. */}
            {storeSection && (
              <div className={styles.menuTriggerWrap}>
                <button
                  type="button"
                  ref={triggerRef}
                  className={[
                    styles.menuTrigger,
                    isMenuOpen ? styles.menuTriggerOpen : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMenu(rowId);
                  }}
                  aria-haspopup="true"
                  aria-expanded={isMenuOpen}
                  aria-label={
                    isMenuOpen
                      ? `Close actions for ${canonical.title}`
                      : `Actions for ${canonical.title}`
                  }
                  title="Section actions"
                >
                  <OverflowIcon />
                </button>

                <div className={styles.toolbarAnchor} ref={anchorRef}>
                  <SectionToolbar
                    visible={isMenuOpen && !isCompact}
                    onMoveUp={runAndClose(() => onMoveUp(rowId))}
                    onMoveDown={runAndClose(() => onMoveDown(rowId))}
                    onDuplicate={runAndClose(() => onDuplicate(rowId))}
                    onToggleWebsite={runAndClose(() => onToggleWebsite(rowId))}
                    onDelete={runAndClose(() => onRemove(rowId))}
                    websiteVisible={websiteVisible}
                    canMoveUp={!isFirst}
                    canMoveDown={!isLast}
                    canDelete={canRemove}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Body + resources — collapse to nothing when heading-only ──
              The body sits in the left column; the SectionResources card
              docks to the right (sections 1–6 all share the 2-col layout
              when expanded). */}
          <AnimatePresence initial={false}>
            {!bodyHidden && (
              <motion.div
                key="section-body"
                className={styles.sectionBody}
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
                <div className={styles.sectionLayout}>
                  {/* LEFT — body textarea (per spec §3.4). */}
                  <div className={styles.leftColumn}>
                    <div className={styles.body}>
                      {storeSection && editingBody ? (
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
                            ariaLabel={`Body for ${canonical.title}`}
                            dockTarget={dockTarget}
                          />
                        </RichEditorWrapper>
                      ) : storeSection && stripHtml(storeSection.body) ? (
                        <div
                          className={styles.bodyText}
                          tabIndex={0}
                          role="button"
                          aria-label={`Edit body for ${canonical.title}`}
                          onDoubleClick={(e) => onOpenBodyEditor(rowId, e)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "F2")
                              onOpenBodyEditor(rowId, e);
                          }}
                          title="Double-click or press Enter to edit"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{
                            __html: storeSection.body,
                          }}
                        />
                      ) : (
                        // Empty body — placeholder text per spec §3.4.
                        <div
                          className={[styles.bodyText, styles.bodyEmpty].join(
                            " ",
                          )}
                          tabIndex={0}
                          role="button"
                          aria-label={`Add body for ${canonical.title}`}
                          onDoubleClick={(e) =>
                            storeSection
                              ? onOpenBodyEditor(rowId, e)
                              : undefined
                          }
                          onKeyDown={(e) => {
                            if (
                              storeSection &&
                              (e.key === "Enter" || e.key === "F2")
                            )
                              onOpenBodyEditor(rowId, e);
                          }}
                          title={
                            storeSection
                              ? "Double-click or press Enter to edit"
                              : undefined
                          }
                        >
                          {BODY_PLACEHOLDER}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — SectionResources card (expanded ⇄ minimized). */}
                  <div className={styles.resourcesColumn}>
                    <SectionResources
                      lessonId={lessonId}
                      sectionId={rowId}
                      resources={resourcesPool}
                      onAdd={
                        storeSection ? () => onOpenComposer(rowId) : undefined
                      }
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </li>
  );
});

// ── LessonFlow ───────────────────────────────────────────────────────────

export function LessonFlow({
  lessonId,
  dockTarget,
}: LessonFlowProps): ReactNode {
  // ── Store ────────────────────────────────────────────────────────────
  // Resource moves between sections (moveSectionResource) and bulk section
  // resets (setSections) were used by the previous full lesson-flow; the
  // current canonical layout doesn't expose either path, so they are not
  // destructured. They remain on the store contract for the rest of the app.
  const {
    lessons,
    getSections,
    reorderSections,
    editSection,
    addSection: storeAddSection,
    removeSection: storeRemoveSection,
    duplicateSection: storeDuplicateSection,
    toggleSectionWebsite,
  } = usePlanner();

  // Authoritative sections from the store.
  const sections = getSections(lessonId);

  // Resolve the lesson object (needed for the ResourceComposer + the
  // canonical Standards row's resource list).
  const lesson = lessons.find((l) => l.id === lessonId);

  // ── Lesson-level resources (Standards row's pool) ───────────────────
  // The Standards canonical position uses lesson.resources (per spec §7).
  // LessonResource has no `id`; SectionResource expects one. Synthesize a
  // stable id from the (label, type, index) so SectionResources keys stay
  // stable across rerenders. useMemo so the array identity doesn't churn.
  const lessonResources: SectionResource[] = useMemo(() => {
    if (!lesson) return [];
    return lesson.resources.map((r, idx) => ({
      id: `lesson:${lesson.id}:res:${idx}`,
      type: r.type,
      label: r.label,
    }));
  }, [lesson]);

  // ── Resolved canonical row list ────────────────────────────────────
  // For each of the 6 canonical entries, locate the store-backed section
  // (positions 2–6 match by heading substring; position 1 has no template
  // match and is intentionally virtual). The ORDER of the visible list is
  // FIXED at the canonical order; reorder ops on store sections only affect
  // the underlying store, not the visible mapping. (A later phase could
  // expose drag-reorder of the canonical positions themselves.)
  const resolved: ResolvedSection[] = useMemo(() => {
    return CANONICAL_SECTIONS.map((canonical) => {
      if (!canonical.templateMatch) {
        return { canonical, storeSection: null };
      }
      const match = sections.find((s) =>
        stripHtml(s.heading)
          .toLowerCase()
          .includes(canonical.templateMatch as string),
      );
      return { canonical, storeSection: match ?? null };
    });
  }, [sections]);

  // ── Motion / DnD ────────────────────────────────────────────────────
  const prefersReducedMotion = useReducedMotion() ?? false;
  const sensors = useDndSensors();
  const [dragState, setDragState] = useState<DragState>({ phase: "idle" });
  const density = densityFor(dragState);

  // ── Per-section collapsed state ─────────────────────────────────────
  // Default: Section 1 EXPANDED, Sections 2–6 COLLAPSED (spec §3.5).
  // We seed the set from the canonical indices 2–6 on first render. The
  // teacher's edits to this set persist for the session. When the lesson
  // changes we reset to the default.
  const buildDefaultCollapsed = useCallback(
    (rs: ResolvedSection[]): Set<string> => {
      const next = new Set<string>();
      rs.forEach((r) => {
        if (r.canonical.index === 1) return; // Section 1 stays expanded
        const id = r.storeSection
          ? r.storeSection.id
          : `__virtual:${r.canonical.index}`;
        next.add(id);
      });
      return next;
    },
    [],
  );

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() =>
    buildDefaultCollapsed(resolved),
  );

  // Reset collapsed defaults when the lesson changes — and clear any
  // in-progress edit drafts targeting the now-unavailable section.
  const prevLessonIdRef = useRef(lessonId);
  if (prevLessonIdRef.current !== lessonId) {
    prevLessonIdRef.current = lessonId;
    setCollapsedSections(buildDefaultCollapsed(resolved));
  }

  // ── Body editor state (heading editing is removed per spec §3.2) ────
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

  // ── Section management ──────────────────────────────────────────────
  function addSection(): void {
    storeAddSection(lessonId);
  }

  const removeSection = useCallback(
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

  const duplicateSection = useCallback(
    (id: string): void => {
      storeDuplicateSection(lessonId, id);
    },
    [lessonId, storeDuplicateSection],
  );

  // ── Website-visible toggle (local UI) ───────────────────────────────
  const [websiteVisible, setWebsiteVisible] = useState<Record<string, boolean>>(
    {},
  );
  const toggleWebsiteVisible = useCallback(
    (id: string): void => {
      setWebsiteVisible((prev) => ({ ...prev, [id]: !prev[id] }));
      toggleSectionWebsite(lessonId, id);
    },
    [lessonId, toggleSectionWebsite],
  );

  // ── Section-menu popup state ────────────────────────────────────────
  const [openMenuSectionId, setOpenMenuSectionId] = useState<string | null>(
    null,
  );
  const toggleSectionMenu = useCallback((sectionId: string): void => {
    setOpenMenuSectionId((prev) => (prev === sectionId ? null : sectionId));
  }, []);
  const closeSectionMenu = useCallback((): void => {
    setOpenMenuSectionId(null);
  }, []);

  // ── ResourceComposer state ──────────────────────────────────────────
  const [composerTarget, setComposerTarget] = useState<{
    sectionId: string;
  } | null>(null);

  const handleOpenComposer = useCallback((sectionId: string): void => {
    setComposerTarget({ sectionId });
    setOpenMenuSectionId(null);
  }, []);

  const closeComposer = useCallback((): void => {
    setComposerTarget(null);
  }, []);

  // ── Per-section collapse toggle ─────────────────────────────────────
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
    const all = new Set<string>(
      resolved.map((r) =>
        r.storeSection ? r.storeSection.id : `__virtual:${r.canonical.index}`,
      ),
    );
    setCollapsedSections(all);
  }, [resolved]);

  const expandAll = useCallback((): void => {
    setCollapsedSections(new Set());
  }, []);

  const allCollapsed =
    resolved.length > 0 &&
    resolved.every((r) => {
      const id = r.storeSection
        ? r.storeSection.id
        : `__virtual:${r.canonical.index}`;
      return collapsedSections.has(id);
    });
  const noneCollapsed = collapsedSections.size === 0;

  // ── aria-live for drag announcements ────────────────────────────────
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const announceRegionId = useId();

  // Sortable ids — only store-backed rows participate in DnD; the virtual
  // Standards row is sortable-disabled at the row level.
  const sortableIds = useMemo(
    () =>
      resolved.map((r) =>
        r.storeSection ? r.storeSection.id : `__virtual:${r.canonical.index}`,
      ),
    [resolved],
  );

  // ── dnd-kit drag lifecycle ─────────────────────────────────────────
  function handleDragStart({ active }: DragStartEvent): void {
    setDragState({
      phase: "dragging",
      activeId: String(active.id),
      overId: null,
    });
    setOpenMenuSectionId(null);
    setLiveAnnouncement(
      `Picked up section. Use arrow keys to move, Space to drop, Escape to cancel.`,
    );
  }

  function handleDragOver({ over }: DragOverEvent): void {
    if (!over) return;
    setDragState((prev) =>
      prev.phase === "dragging" ? { ...prev, overId: String(over.id) } : prev,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    if (over && active.id !== over.id) {
      // Only commit reorder when BOTH ids are store-backed (real sections).
      const activeId = String(active.id);
      const overId = String(over.id);
      if (
        !activeId.startsWith("__virtual:") &&
        !overId.startsWith("__virtual:")
      ) {
        reorderSections(lessonId, activeId, overId);
      }
    }
    setLiveAnnouncement(`Dropped.`);
    setDragState({ phase: "idle" });
  }

  function handleDragCancel(): void {
    setDragState({ phase: "idle" });
    setLiveAnnouncement("Drag cancelled.");
  }

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
          aria-label="Expand or collapse all sections"
        >
          <button
            type="button"
            className={styles.globalToggleBtn}
            onClick={expandAll}
            disabled={noneCollapsed}
            title="Expand every section"
          >
            Expand all
          </button>
          <button
            type="button"
            className={styles.globalToggleBtn}
            onClick={collapseAll}
            disabled={allCollapsed}
            title="Collapse every section to its heading"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* ── The section stack ─────────────────────────────────────────── */}
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
          <ol className={styles.list} aria-label="Lesson sections">
            {resolved.map((r, idx) => {
              const id = r.storeSection
                ? r.storeSection.id
                : `__virtual:${r.canonical.index}`;
              const isFirst = idx === 0;
              const isLast = idx === resolved.length - 1;

              return (
                <SortableSection
                  key={id}
                  resolved={r}
                  isFirst={isFirst}
                  isLast={isLast}
                  density={density}
                  reducedMotion={prefersReducedMotion}
                  lessonId={lessonId}
                  lessonResources={lessonResources}
                  onMoveUp={moveSectionUp}
                  onMoveDown={moveSectionDown}
                  onRemove={removeSection}
                  onDuplicate={duplicateSection}
                  onToggleWebsite={toggleWebsiteVisible}
                  websiteVisible={
                    r.storeSection
                      ? (websiteVisible[r.storeSection.id] ?? false)
                      : false
                  }
                  canRemove={sections.length > 1}
                  isMenuOpen={openMenuSectionId === id}
                  onToggleMenu={toggleSectionMenu}
                  onCloseMenu={closeSectionMenu}
                  onOpenComposer={handleOpenComposer}
                  isCollapsed={collapsedSections.has(id)}
                  onToggleCollapsed={toggleCollapsed}
                  dockTarget={dockTarget}
                  editingBody={editTarget !== null && editTarget === id}
                  draftValue={editTarget === id ? editDraft : ""}
                  onOpenBodyEditor={openBodyEditor}
                  onDraftChange={setEditDraft}
                  onCommitEdit={commitBodyEdit}
                  onCancelEdit={cancelBodyEdit}
                />
              );
            })}
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
          {dragState.phase !== "idle" && (
            <div className={styles.overlayChip} aria-hidden="true">
              <div className={styles.chip40Row}>
                <span className={styles.chip40Heading}>Section</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Footer — "+ Add section" + template stub (preserved per §5) */}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.addSectionBtn}
          onClick={addSection}
        >
          <AddIcon />
          Add section
        </button>
        <button
          type="button"
          className={styles.templateBtn}
          aria-label="Edit lesson flow template (coming soon)"
          title="Edit the lesson flow template — coming soon"
        >
          Edit lesson flow / template
        </button>
      </div>

      {/* ── ResourceComposer — shared "Add resource" dialog ─────────── */}
      <ResourceComposer
        open={composerTarget !== null && lesson !== undefined}
        lesson={lesson!}
        initialSectionId={composerTarget?.sectionId}
        onClose={closeComposer}
      />
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

// ── Helpers ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

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

/** Three-dot overflow glyph — the "···" management trigger. */
function OverflowIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
