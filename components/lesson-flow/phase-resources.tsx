"use client";

// phase-resources.tsx — per-phase tagged resources as resChip rows
// (6.11.26 design_handoff_daily_view §7). FULL REPLACE of the previous
// SectionResources tile/quick-access presentation.
//
// Anatomy (prototype CSS ~685-710, markup ~1178-1280):
//   .phaseRes      → block under the phase body; hairline top border.
//   .phaseResHead  → folder icon + "Resources" + .phaseResNote ("tagged to
//                    this phase") + the "+ Add" trigger (routes into the
//                    shared ResourceComposer, exactly as before).
//   .resChipList   → vertical stack of .resChip rows.
//   .resChip       → drag grip · 40×40 .resChipThumb (--rc tinted) ·
//                    .resChipMeta (title 13px/600 ellipsis; type line 11px
//                    muted) · .resChipOpen (30px bordered square — opens the
//                    shared ResourcePreview modal, the same open behavior the
//                    old tiles had) · .resChipDel (revealed on row hover).
//
// `--rc` per resource type maps to EXISTING bright tokens — the single
// source of truth is `resourceChipColor` below (exported for reuse).
//
// Editing:
//   • Title double-click (or Enter/F2 while focused) → inline rename input,
//     committed via the parent's editSectionResource path. Focus outline is
//     --brand-200 per the prototype's contenteditable focus rules (~284).
//   • Double-click anywhere else on the chip row → the existing
//     ResourceComposer note-editor dialog (notes + gallery), preserved.
//
// Drag: each chip is a dnd-kit sortable (id "res::<resourceId>") inside a
// per-phase SortableContext; the list is also a droppable
// ("phaseres::<sectionId>") so chips can land on an EMPTY phase. The shared
// DndContext + commit handlers live in lesson-flow.tsx; the drag ghost is
// <ResourceChipGhost> (the chip look, per the handoff).
//
// All color/type/spacing via var(--token) — no hex anywhere in this file.

import type { ReactNode } from "react";
import { memo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SectionResource } from "@/lib/lesson-flow";
import { Tooltip } from "@/components/ui";
import { ResourcePreview } from "@/components/resources";
import styles from "./phase-resources.module.css";

// ── Type → --rc color mapping (ONE exported helper) ─────────────────────
// Maps every resource type to an existing bright token. Used for the chip
// thumb tint (12% bg / 22% border / full-strength icon via color-mix).

export function resourceChipColor(type: SectionResource["type"]): string {
  switch (type) {
    case "slides":
      return "var(--brand-500)";
    case "youtube":
      return "var(--urgent)";
    case "doc":
    case "notecard":
      return "var(--done)";
    case "pdf":
      return "var(--writing-bright)";
    case "image":
      return "var(--grammar-bright)";
    case "website":
      return "var(--explorers-bright)";
    case "link":
    default:
      return "var(--reading-bright)";
  }
}

// ── Type line ("Slides · docs.google.com") ───────────────────────────────

const TYPE_NAMES: Record<SectionResource["type"], string> = {
  slides: "Slides",
  youtube: "Video",
  doc: "Doc",
  pdf: "PDF",
  image: "Image",
  website: "Website",
  link: "Link",
  notecard: "Notecard",
};

function typeLine(resource: SectionResource): string {
  const name = TYPE_NAMES[resource.type] ?? "Resource";
  if (resource.url) {
    try {
      const host = new URL(resource.url).hostname.replace(/^www\./, "");
      return `${name} · ${host}`;
    } catch {
      // Relative URL (e.g. an /api/resources/ upload) — name only.
      return name;
    }
  }
  return name;
}

// ── Props ────────────────────────────────────────────────────────────────

export interface PhaseResourcesProps {
  /** The phase (section) whose tagged resources render here. */
  sectionId: string;
  /** The resources tagged to this phase, in display order. */
  resources: SectionResource[];
  /** Open the shared ResourceComposer to add a resource to this phase. */
  onAdd?: () => void;
  /** Open the composer's note-editor on one of this phase's resources. */
  onEditNote?: (resource: SectionResource) => void;
  /** Commit an inline title rename. */
  onRenameResource: (resourceId: string, label: string) => void;
  /** Remove a resource chip from this phase. */
  onRemoveResource: (resourceId: string) => void;
}

// ── PhaseResources ───────────────────────────────────────────────────────

export const PhaseResources = memo(function PhaseResources({
  sectionId,
  resources,
  onAdd,
  onEditNote,
  onRenameResource,
  onRemoveResource,
}: PhaseResourcesProps): ReactNode {
  // The resource currently open in the shared enlarge preview, or null.
  const [previewResource, setPreviewResource] =
    useState<SectionResource | null>(null);

  // The whole list is a droppable so a chip can land on an EMPTY phase.
  const { setNodeRef, isOver } = useDroppable({
    id: `phaseres::${sectionId}`,
  });

  return (
    <div className={styles.phaseRes}>
      <p className={styles.phaseResHead}>
        <FolderIcon />
        Resources{" "}
        <span className={styles.phaseResNote}>tagged to this phase</span>
        <Tooltip
          content="Attach a link, file, video, or doc to this phase — opens the resource picker"
          side="top"
          tooltipId="lesson-flow-phase-add-resource"
        >
          <button
            type="button"
            className={styles.phaseResAdd}
            onClick={onAdd}
            disabled={!onAdd}
            aria-label="Add a resource to this phase"
            title="Add a resource to this phase"
          >
            <PlusGlyph />
            Add
          </button>
        </Tooltip>
      </p>

      <SortableContext
        items={resources.map((r) => `res::${r.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={[styles.resChipList, isOver ? styles.resChipListOver : ""]
            .filter(Boolean)
            .join(" ")}
          aria-label={`Resources tagged to this phase (${resources.length})`}
        >
          {resources.map((resource) => (
            <ResourceChip
              key={resource.id}
              resource={resource}
              onOpenPreview={() => setPreviewResource(resource)}
              onEditNote={onEditNote ? () => onEditNote(resource) : undefined}
              onRename={(label) => onRenameResource(resource.id, label)}
              onRemove={() => onRemoveResource(resource.id)}
            />
          ))}
          {resources.length === 0 && (
            <li className={styles.resChipEmpty}>
              No resources tagged yet — add one, or drag a chip here from
              another phase.
            </li>
          )}
        </ul>
      </SortableContext>

      {/* Shared enlarge preview — same open behavior the old tiles had. */}
      {previewResource && (
        <ResourcePreview
          resource={previewResource}
          onClose={() => setPreviewResource(null)}
        />
      )}
    </div>
  );
});

// ── ResourceChip — one .resChip row ──────────────────────────────────────

interface ResourceChipProps {
  resource: SectionResource;
  onOpenPreview: () => void;
  onEditNote?: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}

function ResourceChip({
  resource,
  onOpenPreview,
  onEditNote,
  onRename,
  onRemove,
}: ResourceChipProps): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `res::${resource.id}` });

  const [renaming, setRenaming] = useState(false);

  const commitRename = (value: string): void => {
    setRenaming(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== resource.label) onRename(trimmed);
  };

  const label = resource.label || (TYPE_NAMES[resource.type] ?? "Resource");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    "--rc": resourceChipColor(resource.type),
  } as React.CSSProperties;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[styles.resChip, isDragging ? styles.resChipDragging : ""]
        .filter(Boolean)
        .join(" ")}
      // Double-click on the row (outside the title) opens the existing
      // note-editor dialog — the dialog keeps owning notes + gallery.
      onDoubleClick={onEditNote}
    >
      {/* Drag grip — sortable activator. Raw <button>: setActivatorNodeRef
          needs a DOM ref. */}
      <Tooltip
        content="Drag to reorder this resource — or drop it on another phase to move it there"
        side="top"
        tooltipId="lesson-flow-chip-drag"
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.chipGrip}
          aria-label={`Drag to move resource: ${label}`}
          title="Drag to reorder or move this resource"
          onDoubleClick={(e) => e.stopPropagation()}
          {...listeners}
          {...attributes}
        >
          <GripVerticalIcon />
        </button>
      </Tooltip>

      {/* 40×40 type-tinted thumb. --rc is set on the row's inline style. */}
      <span className={styles.resChipThumb} aria-hidden="true">
        <ChipTypeIcon type={resource.type} />
      </span>

      {/* Title + type line. Title renames inline on double-click. */}
      <div className={styles.resChipMeta}>
        {renaming ? (
          <input
            type="text"
            className={styles.resChipTitleInput}
            defaultValue={label}
            autoFocus
            aria-label={`Rename resource: ${label}`}
            onBlur={(e) => commitRename(e.currentTarget.value)}
            onDoubleClick={(e) => e.stopPropagation()}
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
            content="Double-click to rename this resource — double-click the rest of the row to edit its notes"
            side="top"
            tooltipId="lesson-flow-chip-rename"
          >
            <div
              className={styles.resChipTitle}
              tabIndex={0}
              role="button"
              aria-label={`Resource: ${label}. Press Enter to rename.`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "F2") {
                  e.preventDefault();
                  setRenaming(true);
                }
              }}
            >
              {label}
            </div>
          </Tooltip>
        )}
        <div className={styles.resChipType}>{typeLine(resource)}</div>
      </div>

      {/* Open — 30px bordered square; shared ResourcePreview modal. */}
      <Tooltip
        content="Open this resource in a large preview"
        side="top"
        tooltipId="lesson-flow-chip-open"
      >
        <button
          type="button"
          className={styles.resChipOpen}
          onClick={onOpenPreview}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`Open ${label}`}
          title={`Open ${label}`}
        >
          <OpenIcon />
        </button>
      </Tooltip>

      {/* Delete — revealed on row hover / keyboard focus. Destructive →
          required tooltip (CLAUDE.md §4 always-on exception). */}
      <Tooltip
        content={`Remove "${label}" from this phase — the underlying file or link is not deleted, only untagged here`}
        side="left"
        required
      >
        <button
          type="button"
          className={styles.resChipDel}
          onClick={onRemove}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`Remove resource: ${label}`}
          title={`Remove resource: ${label}`}
        >
          <TrashIcon />
        </button>
      </Tooltip>
    </li>
  );
}

// ── ResourceChipGhost — the DragOverlay look for a chip in flight ────────
// Static chip (no controls) rendered inside lesson-flow's DragOverlay so a
// dragged resource keeps the chip silhouette per the handoff.

export function ResourceChipGhost({
  resource,
}: {
  resource: SectionResource;
}): ReactNode {
  const style = {
    "--rc": resourceChipColor(resource.type),
  } as React.CSSProperties;
  return (
    <div
      className={[styles.resChip, styles.resChipGhost].join(" ")}
      style={style}
      aria-hidden="true"
    >
      <span className={styles.chipGrip}>
        <GripVerticalIcon />
      </span>
      <span className={styles.resChipThumb}>
        <ChipTypeIcon type={resource.type} />
      </span>
      <div className={styles.resChipMeta}>
        <div className={styles.resChipTitle}>{resource.label}</div>
        <div className={styles.resChipType}>{typeLine(resource)}</div>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// 19px chip-thumb glyphs (stroke 1.8, prototype sizing) + small controls.
// All aria-hidden; color flows from the parent via currentColor.

function ChipTypeIcon({ type }: { type: SectionResource["type"] }): ReactNode {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "slides":
      // Monitor + stand (the prototype's Slides glyph).
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "youtube":
      // Video plate with a filled play triangle.
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "doc":
    case "notecard":
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h6" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M9 13h6M9 17h4" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      );
    case "website":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a13.5 13.5 0 0 1 3.5 9 13.5 13.5 0 0 1-3.5 9 13.5 13.5 0 0 1-3.5-9A13.5 13.5 0 0 1 12 3z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...common}>
          <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
        </svg>
      );
  }
}

/** Folder glyph — the phaseResHead lead-in (prototype path, 14px). */
function FolderIcon(): ReactNode {
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
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6l1.8 1.8h7.6A1.5 1.5 0 0 1 20 9.3v7.2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z" />
    </svg>
  );
}

/** Open-in-preview glyph — external-link arrows (prototype resChipOpen). */
function OpenIcon(): ReactNode {
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
      <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
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
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PlusGlyph(): ReactNode {
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
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
