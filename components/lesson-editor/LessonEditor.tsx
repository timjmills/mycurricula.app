"use client";

// LessonEditor.tsx — the W3.8 shared fill-in lesson template. ONE editor,
// hosted in three places (C mounts it): the lesson popup modal, the Week
// cell expand, and the Day-edit right pane. The `host` prop tweaks chrome
// (padding) only.
//
// What lives here (bundle: planbook-edit.jsx LessonSections, rebuilt on the
// app's real machinery):
//   • Section blocks (SectionBlock) — washed banner, chromeless rich-text
//     body, structured resource chips, focus footers.
//   • Drag-reorder BY THE BANNER via dnd-kit + lib/collapse-on-drag (the
//     LessonFlow pattern) — sections collapse to banners while dragging,
//     the footer dims, the dropped section "settles" (0.42s, disabled
//     under prefers-reduced-motion).
//   • Footer row: "+ Add section" · "Load preset ▾" · "Save as preset"
//     (copy is "preset" — bundle wins over the docs' "template").
//   • Permanent Lesson Resources section (D7) — an EDITOR-level guard, NOT
//     a reducer invariant (the sections data is shared with /daily
//     LessonFlow; a reducer invariant would spawn sections there): Delete
//     is hidden for resources-labeled sections, a preset load that lacks
//     one appends "Lesson Resources" (wash-indexed color per D2 —
//     deviating from the mock's subject-color inconsistency), and renaming
//     the last one away appends a fresh one (mock parity). A lesson whose
//     current sections lack a resources section keeps its structure until
//     a preset load introduces one — the editor never mutates a lesson
//     just for being opened.
//   • "+ Add standard" (exactly-"standards" section) → the real
//     StandardsTaggingPicker; on apply the tags persist via the
//     PlanningTabs pattern (editLesson standards/standardIds merge — the
//     store-level truth) AND a display line "<b>CODE</b> — desc" is
//     appended to the section body (D5: deliberate dual-write; the body
//     line is an authoring convenience, tagging is the source of truth).
//   • "+ Add resource ▾" (label includes "resource") → AddResourceMenu →
//     the shared ResourceComposer, section-scoped. Resources stay
//     STRUCTURED SectionResource[] (D1 — never inline HTML chips; the
//     sanitizer strips class attributes so a chip would unstyle anyway).
//   • FloatingBar (Builder B) — mounted once, scoped to this editor's
//     root; its resource button opens the section's add-resource menu.
//
// AUTOSAVE: every input dispatches through the planner store's EXISTING
// mutators (editSection / editLesson) with coalesce keys, so a typing burst
// is ONE undo step (700ms window) and every host of the same lesson
// re-renders live off the store. No parallel mutators, no localStorage
// broadcast (the mock's cc_pbsec_* channel is superseded by the store).
// Team/fork UI is the modal header's job (Builder C) — this editor renders
// no team pill/banner and NEVER calls setSaveTarget; the store's live save
// target already routes personal lazy-forks vs authorized team writes.

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useReducedMotion } from "framer-motion";
import type {
  LessonSectionContent,
  SectionTintScope,
} from "@/lib/lesson-flow";
import {
  DEFAULT_TINT_SCOPE,
  instantiateSections,
  resolveSectionWash,
  sectionWashToken,
} from "@/lib/lesson-flow";
import type { LessonTemplate } from "@/lib/lesson-templates";
import { usePlanner } from "@/lib/planner-store";
import { useDndSensors, densityFor, type DragState } from "@/lib/collapse-on-drag";
import { uid } from "@/lib/uid";
import { stripHtml, escapeHtml } from "@/lib/html-text";
import type { StandardsMap } from "@/lib/types";
import { Button, Tooltip } from "@/components/ui";
import { StandardsTaggingPicker } from "@/components/standards/StandardsTaggingPicker";
import { ResourceComposer } from "@/components/daily/ResourceComposer";
import { FloatingBar } from "./FloatingBar";
import { SectionBlock, isResourcesLabel } from "./SectionBlock";
import type { AddResourceRequest } from "./AddResourceMenu";
import {
  PresetMenu,
  readSavedPresets,
  writeSavedPresets,
  type SavedLessonPreset,
} from "./PresetMenu";
import styles from "./lesson-editor.module.css";

// Focus footers survive a brief blur (button presses, selection drags) —
// the bundle's grace window.
const BLUR_GRACE_MS = 160;

export interface LessonEditorProps {
  lessonId: string;
  /** Where the editor is mounted — tweaks chrome (padding) only. */
  host: "modal" | "week-expand" | "day-pane";
  /** Fields non-editable, menus hidden. */
  readOnly?: boolean;
}

/** Build the permanent "Lesson Resources" section (D7). Wash-indexed color
 *  per D2 — a deliberate deviation from the mock, which gave the ensured
 *  section the SUBJECT color while every other section got a wash. */
function makeResourcesSection(index: number): LessonSectionContent {
  return {
    id: uid("lsec"),
    templateSectionId: null,
    heading: "Lesson Resources",
    prompt: "",
    body: "",
    resources: [],
    minutes: null,
    status: "idle",
    color: sectionWashToken(index),
    tintScope: DEFAULT_TINT_SCOPE,
  };
}

function hasResourcesSection(sections: LessonSectionContent[]): boolean {
  return sections.some((s) => isResourcesLabel(s.heading));
}

export function LessonEditor({
  lessonId,
  host,
  readOnly = false,
}: LessonEditorProps): ReactNode {
  const {
    getLesson,
    getSections,
    setSections,
    reorderSections,
    editSection,
    removeSection,
    duplicateSection,
    removeSectionResource,
    editLesson,
    describeStandard,
    mergeStandards,
  } = usePlanner();

  const lesson = getLesson(lessonId);
  const sections = getSections(lessonId);

  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;

  // ── Focus tracking (per-section footers, ~160ms blur grace) ───────────
  const [activeSec, setActiveSec] = useState<string | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleFieldFocus = useCallback((sectionId: string) => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setActiveSec(sectionId);
  }, []);
  const handleFieldBlur = useCallback((sectionId: string) => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      // Keyboard path (audit re-pass): when the grace expires, focus may
      // legitimately sit INSIDE the same section — e.g. Tab moved it from
      // the field onto a footer button. Only clear once focus has truly
      // left the section's subtree; the footer wrappers re-arm the tracker
      // via their own onFocus/onBlur, so a later exit still clears.
      const root = rootRef.current?.querySelector(
        `[data-section-id="${CSS.escape(sectionId)}"]`,
      );
      if (root && root.contains(document.activeElement)) {
        blurTimerRef.current = null;
        return;
      }
      setActiveSec((cur) => (cur === sectionId ? null : cur));
      blurTimerRef.current = null;
    }, BLUR_GRACE_MS);
  }, []);

  // ── Drag-reorder (collapse-on-drag pattern) ───────────────────────────
  const sensors = useDndSensors();
  const [dragState, setDragState] = useState<DragState>({ phase: "idle" });
  const [settleId, setSettleId] = useState<string | null>(null);
  // Keyboard-activated drags SKIP the collapse (W3.8 gate fix, live-debugged):
  // dnd-kit snapshots the active item's collision rect at LIFT — for a
  // keyboard drag that snapshot is the pre-collapse (expanded, ~300px) rect,
  // while the droppables re-measure post-collapse (the whole list shrinks
  // beneath it). The stale rect's center then sits BELOW every collapsed
  // banner, so the initial `over` resolves to the LAST section, ArrowDown
  // finds no candidate further down (no-op), and Space drops the section to
  // the end. Pointer drags are immune (live pointer coordinates track the
  // real geometry), so the collapse — which exists for pointer ergonomics —
  // stays for them and is simply not applied while a keyboard drag is live.
  const [kbDrag, setKbDrag] = useState(false);
  const density = densityFor(dragState);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setKbDrag(e.activatorEvent instanceof KeyboardEvent);
    setDragState({
      phase: "dragging",
      activeId: String(e.active.id),
      overId: null,
    });
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDragState({ phase: "idle" });
      setKbDrag(false);
      const activeId = String(e.active.id);
      const overId = e.over ? String(e.over.id) : null;
      if (overId && overId !== activeId) {
        reorderSections(lessonId, activeId, overId);
        // Post-drop settle (0.42s wash pulse) — suppressed under reduced
        // motion (the CSS also guards, this avoids the stale class).
        if (!reducedMotion) {
          setSettleId(activeId);
          setTimeout(() => setSettleId(null), 440);
        }
      }
    },
    [lessonId, reorderSections, reducedMotion],
  );

  const handleDragCancel = useCallback(() => {
    setDragState({ phase: "idle" });
    setKbDrag(false);
  }, []);

  const draggingSection =
    dragState.phase === "dragging"
      ? sections.find((s) => s.id === dragState.activeId)
      : undefined;

  // ── Section mutations (all through EXISTING store mutators) ───────────

  const handleBodyChange = useCallback(
    (sectionId: string, html: string) => {
      // Autosave per keystroke; the coalesce key folds the burst into one
      // undo step and other hosts of this lesson re-render live.
      editSection(
        lessonId,
        sectionId,
        { body: html },
        { key: `section:${lessonId}:${sectionId}:body`, ts: Date.now() },
      );
    },
    [editSection, lessonId],
  );

  const handlePatchAppearance = useCallback(
    (
      sectionId: string,
      patch: { color?: string; tintScope?: SectionTintScope },
    ) => {
      editSection(lessonId, sectionId, patch, {
        key: `section:${lessonId}:${sectionId}:appearance`,
        ts: Date.now(),
      });
    },
    [editSection, lessonId],
  );

  const handleRenameCommit = useCallback(
    (sectionId: string, text: string) => {
      const heading = escapeHtml(text);
      const next = sections.map((s) =>
        s.id === sectionId ? { ...s, heading } : s,
      );
      // D7 mock parity: renaming the ONLY resources section away appends a
      // fresh "Lesson Resources". One setSections keeps rename + append a
      // single undo step; the plain-rename path stays a coalesced
      // editSection (patch only what changed — heading; minutes/status/
      // color all survive because editSection spreads the patch).
      if (hasResourcesSection(sections) && !hasResourcesSection(next)) {
        setSections(lessonId, [
          ...next,
          makeResourcesSection(next.length),
        ]);
        return;
      }
      editSection(
        lessonId,
        sectionId,
        { heading },
        { key: `section:${lessonId}:${sectionId}:heading`, ts: Date.now() },
      );
    },
    [sections, setSections, editSection, lessonId],
  );

  const handleAddSection = useCallback(() => {
    // Explicit section object (not the reducer's addSection) so the new
    // section carries its round-robin wash + null minutes, mock parity
    // ("New section", wash by index).
    const next: LessonSectionContent = {
      id: uid("lsec"),
      templateSectionId: null,
      heading: "New section",
      prompt: "",
      body: "",
      resources: [],
      minutes: null,
      status: "idle",
      color: sectionWashToken(sections.length),
      tintScope: DEFAULT_TINT_SCOPE,
    };
    setSections(lessonId, [...sections, next]);
  }, [sections, setSections, lessonId]);

  // ── Presets ────────────────────────────────────────────────────────────
  const [savedRevision, setSavedRevision] = useState(0);

  const finishPresetLoad = useCallback(
    (next: LessonSectionContent[]) => {
      // D7: a preset load that lacks a resources section gets the permanent
      // "Lesson Resources" appended, in the SAME undoable step.
      const ensured = hasResourcesSection(next)
        ? next
        : [...next, makeResourcesSection(next.length)];
      setSections(lessonId, ensured);
    },
    [setSections, lessonId],
  );

  const handleLoadBuiltin = useCallback(
    (template: LessonTemplate) => {
      // D6: built-ins are the house LESSON_TEMPLATES (15), instantiated the
      // same way LessonDetail loads a flow — replacing the mock's 4 samples.
      finishPresetLoad(instantiateSections(template));
    },
    [finishPresetLoad],
  );

  const handleLoadSaved = useCallback(
    (preset: SavedLessonPreset) => {
      // Saved presets are STRUCTURE-only: headings/colors/tint/minutes with
      // EMPTY bodies (deliberate deviation — the mock froze typed content
      // into its presets; a preset is a shape, not a copy of one lesson).
      const next = preset.sections.map((s, i) => ({
        id: uid("lsec"),
        templateSectionId: null,
        heading: escapeHtml(s.heading),
        prompt: "",
        body: "",
        resources: [],
        minutes: s.minutes ?? null,
        status: "idle" as const,
        color: resolveSectionWash(s.color, i),
        tintScope: s.tintScope ?? DEFAULT_TINT_SCOPE,
      }));
      finishPresetLoad(next);
    },
    [finishPresetLoad],
  );

  const handleSaveCurrent = useCallback(
    (name: string) => {
      const preset: SavedLessonPreset = {
        name,
        sections: sections.map((s, i) => ({
          heading: stripHtml(s.heading).trim() || "Section",
          color: resolveSectionWash(s.color, i),
          tintScope: s.tintScope ?? DEFAULT_TINT_SCOPE,
          minutes: s.minutes ?? null,
        })),
      };
      const next = [
        ...readSavedPresets().filter((p) => p.name !== name),
        preset,
      ];
      writeSavedPresets(next);
      setSavedRevision((r) => r + 1);
    },
    [sections],
  );

  // ── Standards (D5 dual-write) ──────────────────────────────────────────
  const [stdPickerFor, setStdPickerFor] = useState<string | null>(null);

  const initialDescriptions = useMemo((): StandardsMap => {
    if (!lesson) return {};
    const map: StandardsMap = {};
    for (const code of lesson.standards) map[code] = describeStandard(code);
    return map;
  }, [lesson, describeStandard]);

  const handleStandardsApply = useCallback(
    (codes: string[], descriptions: StandardsMap, ids: string[] | null) => {
      const sectionId = stdPickerFor;
      setStdPickerFor(null);
      if (!lesson) return;
      // Store-level truth FIRST — the PlanningTabs host-persistence pattern:
      // merge wording so describeStandard resolves instantly, then persist
      // the tag set (exact ids when known — codes are unique only PER
      // framework) through the coalesced editLesson contract.
      mergeStandards(descriptions);
      editLesson(
        lesson.id,
        ids ? { standards: codes, standardIds: ids } : { standards: codes },
        { key: `lesson:${lesson.id}:standards`, ts: Date.now() },
      );
      // D5 — authoring convenience: append a display line per NEWLY tagged
      // code to the section body. The body line is presentation only; the
      // lesson's standards/standardIds above are the source of truth.
      const target = sectionId
        ? sections.find((s) => s.id === sectionId)
        : undefined;
      const added = codes.filter((c) => !lesson.standards.includes(c));
      if (target && added.length > 0) {
        const rows = added
          .map((code) => {
            const desc = descriptions[code] ?? describeStandard(code);
            return `<div><b>${escapeHtml(code)}</b> — ${escapeHtml(desc)}</div>`;
          })
          .join("");
        editSection(
          lessonId,
          target.id,
          { body: (target.body ?? "") + rows },
          { key: `section:${lessonId}:${target.id}:body`, ts: Date.now() },
        );
      }
    },
    [
      stdPickerFor,
      lesson,
      sections,
      mergeStandards,
      editLesson,
      editSection,
      describeStandard,
      lessonId,
    ],
  );

  // ── Add resource (menu → shared ResourceComposer) ──────────────────────
  // The menu-open state is host-owned so the FloatingBar's resource button
  // can open a section's menu too (B's onAddResource contract).
  const [resourceMenuFor, setResourceMenuFor] = useState<string | null>(null);
  const [composer, setComposer] = useState<AddResourceRequest | null>(null);

  const handleToggleResourceMenu = useCallback((sectionId: string) => {
    setResourceMenuFor((cur) => (cur === sectionId ? null : sectionId));
  }, []);
  const handleCloseResourceMenu = useCallback(() => {
    setResourceMenuFor(null);
  }, []);
  const handleOpenComposer = useCallback((request: AddResourceRequest) => {
    setComposer(request);
  }, []);
  const handleFloatingBarAddResource = useCallback(
    (sectionId: string) => {
      setResourceMenuFor(sectionId);
    },
    [],
  );

  const handleDelete = useCallback(
    (sectionId: string) => {
      removeSection(lessonId, sectionId);
    },
    [removeSection, lessonId],
  );
  const handleDuplicate = useCallback(
    (sectionId: string) => {
      duplicateSection(lessonId, sectionId);
    },
    [duplicateSection, lessonId],
  );
  const handleRemoveResource = useCallback(
    (sectionId: string, resourceId: string) => {
      removeSectionResource(lessonId, sectionId, resourceId);
    },
    [removeSectionResource, lessonId],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  // Keyboard drags keep the full layout (see the kbDrag comment above).
  const reordering = density === "compact" && !kbDrag;
  const canDelete = sections.length > 1 && !readOnly;

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${reordering ? styles.reordering : ""}`}
      data-host={host}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        // Droppables re-measure during the drag: the pointer-drag collapse
        // reshapes every block at lift, and default lift-time-only rects
        // would leave pointer collisions resolving against stale geometry.
        // (Keyboard drags additionally SKIP the collapse entirely — dnd-kit
        // snapshots the ACTIVE item's collision rect at lift, which Always
        // cannot refresh; see the kbDrag comment above for the live-debugged
        // failure this prevents.)
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sectionIds}
          strategy={verticalListSortingStrategy}
        >
          {sections.map((section, index) => (
            <SectionBlock
              key={section.id}
              section={section}
              index={index}
              readOnly={readOnly}
              isActive={activeSec === section.id}
              settling={settleId === section.id}
              resourceMenuOpen={resourceMenuFor === section.id}
              onToggleResourceMenu={handleToggleResourceMenu}
              onCloseResourceMenu={handleCloseResourceMenu}
              onOpenComposer={handleOpenComposer}
              onOpenStandards={setStdPickerFor}
              onFieldFocus={handleFieldFocus}
              onFieldBlur={handleFieldBlur}
              onBodyChange={handleBodyChange}
              onRenameCommit={handleRenameCommit}
              onPatchAppearance={handlePatchAppearance}
              onDuplicate={handleDuplicate}
              onDelete={canDelete ? handleDelete : undefined}
              onRemoveResource={handleRemoveResource}
            />
          ))}
        </SortableContext>
        {/* Collapsed-banner ghost riding the pointer while reordering. */}
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {draggingSection ? (
            <div
              className={styles.ghost}
              style={
                {
                  "--rc": `var(${resolveSectionWash(
                    draggingSection.color,
                    sections.findIndex((s) => s.id === draggingSection.id),
                  )})`,
                } as CSSProperties
              }
            >
              {stripHtml(draggingSection.heading).trim() || "Section"}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Footer row (dims + disables while reordering via CSS) ─────── */}
      {!readOnly && (
        <div className={styles.footer}>
          <Tooltip
            content="Add a blank section to the end of this lesson"
            tooltipId="lesson-editor-add-section"
          >
            <Button
              variant="secondary"
              size="sm"
              className={styles.addSec}
              onClick={handleAddSection}
            >
              + Add section
            </Button>
          </Tooltip>
          <PresetMenu
            onLoadBuiltin={handleLoadBuiltin}
            onLoadSaved={handleLoadSaved}
            onSaveCurrent={handleSaveCurrent}
            savedRevision={savedRevision}
          />
        </div>
      )}

      {/* ── Selection-driven floating rich-text bar (Builder B) ────────── */}
      {!readOnly && (
        <FloatingBar
          scopeRef={rootRef}
          lessonId={lessonId}
          onAddResource={handleFloatingBarAddResource}
        />
      )}

      {/* ── Standards picker (host-persisted, D5 dual-write on apply) ──── */}
      {lesson && stdPickerFor !== null && (
        <StandardsTaggingPicker
          open
          initialCodes={lesson.standards}
          initialIds={lesson.standardIds}
          initialDescriptions={initialDescriptions}
          onClose={() => setStdPickerFor(null)}
          onApply={handleStandardsApply}
        />
      )}

      {/* ── Shared ResourceComposer, section-scoped (D1: structured) ───── */}
      {lesson && composer !== null && (
        <ResourceComposer
          open
          lesson={lesson}
          mode={composer.mode}
          initialSectionId={composer.sectionId}
          initialItems={composer.initialItems}
          lockRouting
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}
