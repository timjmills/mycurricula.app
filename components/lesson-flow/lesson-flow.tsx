"use client";

// lesson-flow.tsx — the per-lesson section editor.
//
// Renders a lesson's sections as an ordered list of cards. Each card
// contains a styled heading (RichTextEditor, singleLine), a body
// (RichTextEditor, multi-line with the section prompt as placeholder),
// and a resources area showing attached chips with add/remove controls.
//
// Drag and drop uses native HTML5 DnD (same pattern as WeeklyGrid.tsx):
//   • Sections are reorderable by dragging their drag handles.
//   • Resources can be moved between section resource areas.
//
// The component is fully controlled — all mutations call `onChange` with
// an immutable rebuilt array; section order in local state is never used
// as the authoritative source.

import type { ReactNode } from "react";
import { useState } from "react";
import type { LessonSectionContent, SectionResource } from "@/lib/lesson-flow";
import { newLessonSection, newSectionResource } from "@/lib/lesson-flow";
import { RichTextEditor } from "@/components/rich-text";
import styles from "./lesson-flow.module.css";

// ── Props ────────────────────────────────────────────────────────────────

export interface LessonFlowProps {
  sections: LessonSectionContent[];
  onChange: (next: LessonSectionContent[]) => void;
}

// ── Drag state ───────────────────────────────────────────────────────────
// Two independent drag operations share this module:
//   1. Section drag — a whole section card is being repositioned.
//   2. Resource drag — a resource chip is being moved to a new section.

interface SectionDragState {
  kind: "section";
  /** Id of the section being dragged. */
  sectionId: string;
}

interface ResourceDragState {
  kind: "resource";
  /** Id of the section the resource came from. */
  sourceSectionId: string;
  /** The resource being moved. */
  resource: SectionResource;
}

type DragState = SectionDragState | ResourceDragState | null;

// ── LessonFlow ───────────────────────────────────────────────────────────

/** Ordered section editor for a single lesson's content. */
export function LessonFlow({ sections, onChange }: LessonFlowProps): ReactNode {
  // Local drag state — only the in-progress gesture; not persistent data.
  const [drag, setDrag] = useState<DragState>(null);
  // Which section's resource drop zone is currently highlighted.
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  // Which section card is the drop target for reordering.
  const [overCardId, setOverCardId] = useState<string | null>(null);

  // ── Mutation helpers ─────────────────────────────────────────────────

  /** Replace one section in the array by id. */
  function patchSection(
    id: string,
    patch: Partial<LessonSectionContent>,
  ): void {
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /** Append a blank section to the list. */
  function addSection(): void {
    onChange([...sections, newLessonSection()]);
  }

  /** Remove a section by id. Guard: keep at least one section. */
  function removeSection(id: string): void {
    if (sections.length <= 1) return;
    onChange(sections.filter((s) => s.id !== id));
  }

  /** Append a fresh resource to a section's resource list. */
  function addResource(sectionId: string): void {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    patchSection(sectionId, {
      resources: [...section.resources, newSectionResource()],
    });
  }

  /** Remove a resource from a section's resource list. */
  function removeResource(sectionId: string, resourceId: string): void {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    patchSection(sectionId, {
      resources: section.resources.filter((r) => r.id !== resourceId),
    });
  }

  // ── Section drag-and-drop ─────────────────────────────────────────────

  function handleSectionDragStart(sectionId: string): void {
    setDrag({ kind: "section", sectionId });
  }

  function handleSectionDragEnd(): void {
    setDrag(null);
    setOverCardId(null);
  }

  /** A section card is being dragged over another section card. */
  function handleCardDragOver(
    e: React.DragEvent<HTMLLIElement>,
    targetId: string,
  ): void {
    if (!drag) return;
    if (drag.kind === "section") {
      e.preventDefault();
      setOverCardId(targetId);
      return;
    }
    // Resource drag hovering over a card — clear card highlight.
    setOverCardId(null);
  }

  /** Drop a section onto the target position. */
  function handleCardDrop(
    e: React.DragEvent<HTMLLIElement>,
    targetId: string,
  ): void {
    e.preventDefault();
    if (!drag) return;

    if (drag.kind === "section") {
      const fromId = drag.sectionId;
      if (fromId === targetId) {
        setDrag(null);
        setOverCardId(null);
        return;
      }
      // Reorder: remove the source, splice it before the target.
      const next = [...sections];
      const fromIdx = next.findIndex((s) => s.id === fromId);
      const toIdx = next.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onChange(next);
      setDrag(null);
      setOverCardId(null);
      return;
    }

    // A resource was dropped onto a section card body area — handled by
    // the resource drop zone instead; ignore here.
    setDrag(null);
    setOverCardId(null);
  }

  function handleCardDragLeave(): void {
    setOverCardId(null);
  }

  // ── Resource drag-and-drop ────────────────────────────────────────────

  function handleResourceDragStart(
    sectionId: string,
    resource: SectionResource,
  ): void {
    setDrag({ kind: "resource", sourceSectionId: sectionId, resource });
  }

  function handleResourceDragEnd(): void {
    setDrag(null);
    setOverSectionId(null);
  }

  function handleResourceZoneDragOver(
    e: React.DragEvent<HTMLDivElement>,
    targetSectionId: string,
  ): void {
    if (!drag || drag.kind !== "resource") return;
    e.preventDefault();
    setOverSectionId(targetSectionId);
  }

  function handleResourceZoneDrop(
    e: React.DragEvent<HTMLDivElement>,
    targetSectionId: string,
  ): void {
    e.preventDefault();
    if (!drag || drag.kind !== "resource") return;

    const { sourceSectionId, resource } = drag;

    // Build the next sections array immutably.
    const next = sections.map((sec) => {
      if (sec.id === sourceSectionId && sec.id !== targetSectionId) {
        // Remove from source.
        return {
          ...sec,
          resources: sec.resources.filter((r) => r.id !== resource.id),
        };
      }
      if (sec.id === targetSectionId) {
        // Append to target (no-op if already in this section and we choose
        // to keep it in place; we still reorder it to the end).
        const without = sec.resources.filter((r) => r.id !== resource.id);
        return { ...sec, resources: [...without, resource] };
      }
      return sec;
    });

    onChange(next);
    setDrag(null);
    setOverSectionId(null);
  }

  function handleResourceZoneDragLeave(): void {
    setOverSectionId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      <ol className={styles.list} aria-label="Lesson sections">
        {sections.map((section, idx) => {
          const isDraggingThis =
            drag?.kind === "section" && drag.sectionId === section.id;
          const isDropTarget =
            drag?.kind === "section" && overCardId === section.id;
          const isResourceTarget =
            drag?.kind === "resource" && overSectionId === section.id;

          return (
            <li
              key={section.id}
              className={[
                styles.card,
                isDraggingThis ? styles.cardDragging : "",
                isDropTarget ? styles.cardDropTarget : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onDragOver={(e) => handleCardDragOver(e, section.id)}
              onDrop={(e) => handleCardDrop(e, section.id)}
              onDragLeave={handleCardDragLeave}
            >
              {/* ── Section header: drag handle + index + remove ── */}
              <div className={styles.cardHeader}>
                {/* Drag handle — mouse-first per spec; keyboard reorder
                    falls through to keyboard-only affordances. */}
                <button
                  type="button"
                  className={styles.dragHandle}
                  draggable
                  onDragStart={() => handleSectionDragStart(section.id)}
                  onDragEnd={handleSectionDragEnd}
                  aria-label={`Drag to reorder section ${idx + 1}`}
                  title="Drag to reorder"
                >
                  <DragIcon />
                </button>

                <span className={styles.sectionIndex} aria-hidden="true">
                  {idx + 1}
                </span>

                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.removeBtn}`}
                  onClick={() => removeSection(section.id)}
                  disabled={sections.length <= 1}
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
                  onChange={(html) =>
                    patchSection(section.id, { heading: html })
                  }
                  singleLine
                  placeholder="Section heading…"
                  ariaLabel={`Heading for section ${idx + 1}`}
                />
              </div>

              {/* ── Section body ── */}
              <div className={styles.bodyRow}>
                <RichTextEditor
                  value={section.body}
                  onChange={(html) => patchSection(section.id, { body: html })}
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
                onDragOver={(e) => handleResourceZoneDragOver(e, section.id)}
                onDrop={(e) => handleResourceZoneDrop(e, section.id)}
                onDragLeave={handleResourceZoneDragLeave}
              >
                {/* Existing resource chips */}
                {section.resources.length > 0 && (
                  <ul
                    className={styles.resourceChips}
                    aria-label="Attached resources"
                  >
                    {section.resources.map((res) => (
                      <li
                        key={res.id}
                        className={styles.chip}
                        draggable
                        onDragStart={() =>
                          handleResourceDragStart(section.id, res)
                        }
                        onDragEnd={handleResourceDragEnd}
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
                          onClick={() => removeResource(section.id, res.id)}
                          aria-label={`Remove resource: ${res.label || res.type}`}
                          title="Remove resource"
                        >
                          <RemoveIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add resource affordance */}
                <button
                  type="button"
                  className={styles.addResourceBtn}
                  onClick={() => addResource(section.id)}
                >
                  <AddIcon />
                  Add resource
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── Add section ─────────────────────────────────────────────── */}
      <button
        type="button"
        className={styles.addSectionBtn}
        onClick={addSection}
      >
        <AddIcon />
        Add section
      </button>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// Inline SVG icons, aria-hidden, consistent 16×16 rendered size.

function DragIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Six-dot drag handle grid */}
      <circle cx="9" cy="7" r="1.5" />
      <circle cx="15" cy="7" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="17" r="1.5" />
      <circle cx="15" cy="17" r="1.5" />
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

// ── Resource type icon ────────────────────────────────────────────────────
// Small pictogram for each resource category; drives the chip's leading icon.

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
