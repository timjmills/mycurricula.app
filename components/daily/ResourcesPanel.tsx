"use client";

// ResourcesPanel.tsx — the Daily view right-rail "Resources" panel.
//
// A WHITE card at the top of the right rail that gives a teacher a quick,
// Padlet-style glance at the resources tied to the lesson they have open.
// Two presentation modes share a single filtered set:
//
//   • grid (default) — a 2-column responsive grid of subject-tinted tiles.
//     Each tile reuses <ResourceTile> from "@/components/lesson-flow" — the
//     same component the LessonFlow editor renders — so the visual
//     vocabulary stays one shared family across surfaces. We layer a small
//     "···" overflow menu button on top of each tile via a thin wrapper;
//     ResourceTile itself is NOT modified.
//
//   • list — a compact stack of inline rows: type icon + label + small
//     type tag, useful when the rail is narrow or the resource set is long.
//
// ── Resource aggregation (the load-bearing bit) ─────────────────────────
// The panel shows the lesson's COMBINED resources: the lesson-level array
// (`lesson.resources`) PLUS every section's per-section resources, sourced
// from the planner store via `usePlanner().getSections(lessonId)`. The
// union deduplicates on resource id so the same item authored once in a
// section's "+" popup appears here exactly once. This means adding a
// resource inside a SECTION of the lesson flow immediately surfaces here
// too — there is no duplicate state, only a derived view.
//
// The lesson-level resources don't carry a stable id (the type is just
// `{ type, label }`), so we synthesize one — `lesson:<lessonId>:res:<i>`
// — purely for React keys and the ResourceTile contract (which expects a
// SectionResource shape with `id`). The resources sourced from sections
// keep their real `id` so a section-edit elsewhere preserves React
// identity here.
//
// ── Category tabs ───────────────────────────────────────────────────────
// "All" + three roll-up categories: Slides, Handouts (pdf / doc / image),
// Tools (website / link / youtube). The filter applies to the combined
// list; the head count chip reports the visible total relative to the
// full combined total so the teacher never sees a count that disagrees
// with the tab they picked.
//
// ── Read-only for now ────────────────────────────────────────────────────
// Editing resources lives inside the LessonFlow section editor on the
// detail pane. This rail panel is glance-and-open; the "···" overflow
// button is a stub for Phase 1A — a click-target visible in the design
// without a backing menu yet.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────
//   • Tailwind = layout only. All color / radii / type sizes via tokens.
//   • Subject color is carried only through the tile artwork (.cp-subj
//     cascade, supplied by the parent rail wrapper). The panel chrome
//     itself stays neutral.
//   • The panel container is a white CARD: var(--paper) fill, 1px
//     var(--ink-150) hairline border, var(--shadow-card) lift.

import { useCallback, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Lesson, LessonResource } from "@/lib/types";
import type { SectionResource } from "@/lib/lesson-flow";
import { ResourceTile } from "@/components/lesson-flow";
import { usePlanner } from "@/lib/planner-store";
import { lessonResources } from "@/lib/lesson-resources";
import { DRAG_MOTION } from "@/lib/collapse-on-drag";
import { Button } from "@/components/ui";
import type { PanelDragHandleProps } from "./RightRail";
import {
  ResourceComposer,
  fileToCapturedItem,
  type CapturedItem,
} from "./ResourceComposer";
import styles from "./ResourcesPanel.module.css";

// ── Grip + chevron + back icons (rail-driven controls) ──────────────────
// Rendered only when ResourcesPanel is mounted inside <RightRail>, which
// supplies the dragHandleProps + onToggleCollapsed bundle. The grip is the
// SOLE drag activator for the panel — clicking anywhere else on the
// header (or the body) never starts a reorder.

// Back-chevron for the "Back to week" affordance — left-pointing ‹ arrow.
function BackIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function GripVerticalIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

// Small plus icon used in the panel header's "Add resource" button.
// Mirrors the stroked Lucide-style vocabulary of the other inline icons —
// kept tight at 14px so it reads alongside the grip + count chip.
function PlusIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronToggleIcon({ collapsed }: { collapsed: boolean }): ReactNode {
  // A single chevron that flips direction by CSS rotation — collapsed
  // points right (▶), expanded points down (▼). aria-hidden so the
  // surrounding button label carries semantics.
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transition: "transform 0.15s ease-out",
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Category tabs ────────────────────────────────────────────────────────

type ResourceCategory = "all" | "slides" | "handouts" | "tools";

interface CategoryTab {
  /** Stable id used as the active key + React key. */
  key: ResourceCategory;
  /** Visible tab label. */
  label: string;
  /**
   * Resource types this tab includes. "all" passes every type — its
   * `types` is empty to mean "no filter applied". A small accept fn keeps
   * the predicate one place.
   */
  types: readonly LessonResource["type"][];
}

const TABS: readonly CategoryTab[] = [
  { key: "all", label: "All", types: [] },
  { key: "slides", label: "Slides", types: ["slides"] },
  // "Handouts" rolls up the printable / saved artifacts — what a teacher
  // physically hands out or pulls onto the projector.
  { key: "handouts", label: "Handouts", types: ["pdf", "doc", "image"] },
  // "Tools" rolls up the external interactive surfaces — websites, deep
  // links, and embedded video.
  { key: "tools", label: "Tools", types: ["website", "link", "youtube"] },
] as const;

/** Does this resource pass the active category's filter? */
function acceptByCategory(
  resource: LessonResource,
  category: ResourceCategory,
): boolean {
  if (category === "all") return true;
  const tab = TABS.find((t) => t.key === category);
  if (!tab) return true;
  return tab.types.includes(resource.type);
}

// ── Grid/list view toggle ────────────────────────────────────────────────

type ViewMode = "grid" | "list";

// Small inline icons for the toggle. Same Lucide-style outline idiom as
// the rest of the repo so the visual vocabulary stays consistent.

function GridIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="20" y2="18" />
      <line x1="4" y1="6" x2="4.01" y2="6" />
      <line x1="4" y1="12" x2="4.01" y2="12" />
      <line x1="4" y1="18" x2="4.01" y2="18" />
    </svg>
  );
}

// ── Resource list row (two-line, "quick access" style) ──────────────────
// In list mode each resource renders as a wide button row that mirrors
// Image 17 ("Resource quick access"):
//   • a 32×32 pastel SQUARE chip on the left, carrying the same per-type
//     pastel as the grid tiles (so the two modes feel paired);
//   • a two-line text block — bold label on line 1, small ink-500 URL
//     preview on line 2;
//   • a small COLORED TYPE TAG pill on the right (uppercase short label,
//     stronger pastel fill, deeper text).
//
// The row is a button so keyboard navigation reaches every resource. Click
// opens the resource link in a new tab. Since these are synthetic Phase-1A
// fixtures, the URLs are derived plausibly from the type via `synthUrl()`
// (see below) — `window.open` is still called so the affordance is real
// and the design reads as complete; a real backend will swap the derived
// URL for the resource's stored href without changing this row.

// ── Per-type tag mapping ────────────────────────────────────────────────
// Single source of truth for the list view's left chip + right pill:
//   • `label` — uppercase short tag rendered in the right-side pill.
//   • `tagClass` — CSS-module class on .resourceRow that drives the
//     pastel pair for the LEFT chip AND the RIGHT pill (defined in
//     ResourcesPanel.module.css; mirrors the resource-tile per-type tints
//     so the two surfaces share a visual vocabulary).
//
// "Video"/youtube is mapped to heliotrope rather than --hl-violet because
// the heliotrope token is actually purple (#c977ff) and reads as "video"
// the way YouTube's brand red already lives on the grid frame; --hl-violet
// is a hot-pink and would clash with the document tag.

interface TypeTag {
  /** Uppercase short label rendered in the right-side pill. */
  label: string;
  /** CSS-module modifier class added to the .resourceRow root. */
  tagClass: string;
}

const TYPE_TAGS: Record<LessonResource["type"], TypeTag> = {
  slides: { label: "PPT", tagClass: "rowSlides" },
  pdf: { label: "PDF", tagClass: "rowPdf" },
  doc: { label: "DOCX", tagClass: "rowDoc" },
  image: { label: "IMG", tagClass: "rowImage" },
  youtube: { label: "VIDEO", tagClass: "rowVideo" },
  website: { label: "WEB", tagClass: "rowWeb" },
  link: { label: "LINK", tagClass: "rowLink" },
};

// ── Synthetic URL preview ────────────────────────────────────────────────
// Resources don't carry a stored URL yet (Phase 1A is frontend-only), so
// the list view fabricates a plausible-looking URL string per type — the
// same domain pattern a teacher would see if the data were real. Helps the
// row read like Image 17's "Resource quick access" without lying about
// data shape: the second line is clearly a preview, not a live link.
function synthUrl(type: LessonResource["type"], label: string): string {
  // Best-effort slug from the resource label — lowercase, hyphenated,
  // truncated. Falls back to a generic stem so an empty label still
  // produces a believable URL fragment.
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "resource";
  switch (type) {
    case "slides":
      return `docs.google.com/presentation/d/${slug}`;
    case "pdf":
    case "doc":
    case "image":
      return `drive.google.com/file/d/${slug}`;
    case "youtube":
      return `youtube.com/watch?v=${slug}`;
    case "website":
    case "link":
    default:
      // If the label itself already looks like a URL, surface it; else
      // emit a neutral em-dash so the line still reads as "no URL yet"
      // rather than fabricating a domain we can't justify.
      if (/^https?:\/\//i.test(label) || /^[\w.-]+\.[a-z]{2,}/i.test(label)) {
        return label
          .replace(/^https?:\/\//i, "")
          .replace(/^www\./i, "")
          .slice(0, 48);
      }
      return "—";
  }
}

// ── Paperclip glyph for the "Resource quick access" list header ─────────
function PaperclipIcon(): ReactNode {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.48-8.48l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function ResourceTypeIcon({
  type,
}: {
  type: LessonResource["type"];
}): ReactNode {
  // Pared-back outline icons sized for inline rows. Matches the
  // ResourceTile small-icon vocabulary so the two modes feel paired.
  const common = {
    width: 14,
    height: 14,
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
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
      );
    case "website":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

function ResourceListRow({
  resource,
}: {
  resource: SectionResource;
}): ReactNode {
  // Pull the type-tag descriptor; every kind in LessonResource["type"] is
  // covered in TYPE_TAGS, so the fallback is just defensive.
  const tag: TypeTag = TYPE_TAGS[resource.type] ?? {
    label: resource.type.toUpperCase(),
    tagClass: "rowLink",
  };
  const label = resource.label || resource.type;
  const url = synthUrl(resource.type, label);

  // Phase 1A: open the synthetic URL in a new tab as the click affordance.
  // No real resource exists behind it; a real backend will replace the
  // synthesized href with the stored one without changing this handler.
  const handleClick = (): void => {
    if (typeof window === "undefined") return;
    const href = url === "—" ? null : `https://${url}`;
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      className={`${styles.resourceRow} ${styles[tag.tagClass] ?? ""}`}
      aria-label={`${tag.label}: ${label}`}
      title={label}
      onClick={handleClick}
    >
      {/* Left chip — 32×32 pastel SQUARE with the type glyph centered.
          The pastel pair comes from the .row<Type> class on this button. */}
      <span className={styles.resourceRowChip} aria-hidden="true">
        <ResourceTypeIcon type={resource.type} />
      </span>
      {/* Two-line text block: bold label on top, small URL preview below. */}
      <span className={styles.resourceRowText}>
        <span className={styles.resourceRowLabel}>{label}</span>
        <span className={styles.resourceRowUrl}>{url}</span>
      </span>
      {/* Right pill — uppercase TYPE TAG (PPT / PDF / DOCX / IMG / VIDEO /
          WEB / LINK). Same per-type pastel as the chip, slightly stronger. */}
      <span className={styles.resourceRowTag}>{tag.label}</span>
    </button>
  );
}

// ── Tile overflow ("···") wrapper ────────────────────────────────────────
// The Padlet-style "···" overflow button sits at the top-right of every
// tile. ResourceTile already lays its own collapse/remove controls there
// (top: 6px, right: 6px); we DON'T edit ResourceTile, so this wrapper
// overlays a separate "···" chip a little above those — same chip
// vocabulary, distinct affordance. Phase 1A: it is a stub that does
// nothing on click; mouse + keyboard reach work so the design reads as
// complete in the static screenshot AND can be wired later without
// changing the shape.

function OverflowIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Three filled dots — the universal "more actions" affordance. */}
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

interface TileWithOverflowProps {
  resource: SectionResource;
  /**
   * When >1 the tile renders a photo-stack visual: 2–3 small offset shadow
   * cards behind the main tile plus a small count badge over the tile's
   * top-left corner. The underlying resource is still a single LessonResource
   * — the stack is panel-side metadata so the planner store doesn't need a
   * native stack shape. (See onStackClick for the "add more photos" flow.)
   */
  stackCount?: number;
  /** Fired when a stack tile is clicked — opens the composer in append mode. */
  onStackClick?: () => void;
}

function TileWithOverflow({
  resource,
  stackCount,
  onStackClick,
}: TileWithOverflowProps): ReactNode {
  // ResourceTile requires onCollapse + onRemove; this panel is read-only,
  // so both are no-ops — edits live in the LessonFlow section editor on
  // the detail pane. Declared at module scope below so referential equality
  // stays stable across tile renders.
  const isStack = (stackCount ?? 1) > 1;
  return (
    <div
      className={`${styles.tileWrap} ${isStack ? styles.tileWrapStack : ""}`}
      // For a stack the wrapper is clickable so a teacher can hit anywhere
      // on the tile to add more photos. For a regular tile the wrapper is
      // presentational — ResourceTile + the "···" button handle their own
      // interactions and we don't intercept clicks.
      onClick={isStack && onStackClick ? onStackClick : undefined}
      role={isStack ? "button" : undefined}
      tabIndex={isStack ? 0 : undefined}
      aria-label={
        isStack ? `Photo stack — ${stackCount} photos. Add more.` : undefined
      }
      onKeyDown={(e) => {
        if (!isStack || !onStackClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStackClick();
        }
      }}
    >
      {/* Stack ghosts: 2 small offset shadow cards behind the main tile.
          Pure CSS — they sit at negative z so ResourceTile renders above. */}
      {isStack && (
        <>
          <span className={styles.stackGhost1} aria-hidden="true" />
          <span className={styles.stackGhost2} aria-hidden="true" />
        </>
      )}
      <ResourceTile resource={resource} onCollapse={noop} onRemove={noop} />
      {/* Photo-stack count badge — small chip in the top-left corner
          indicating how many photos are bundled into the stack. */}
      {isStack && (
        <span
          className={styles.stackBadge}
          aria-hidden="true"
          title={`${stackCount} photos`}
        >
          {stackCount}
        </span>
      )}
      {/* The "···" overflow button — visual stub for Phase 1A. Sits over
          the tile's top-right corner; positioning is tuned so it lands
          clear of ResourceTile's collapse + remove chips (which sit at
          top: 6px right: 6px / 36px). Hidden on a stack tile because the
          whole wrapper IS the click target there. */}
      {!isStack && (
        <Button
          variant="icon"
          iconAriaLabel={`More actions for ${resource.label || resource.type}`}
          className={styles.tileMenuBtn}
          onClick={(e) => {
            // The stub click is contained — don't bubble into a future
            // tile-click handler when one lands.
            e.stopPropagation();
          }}
        >
          <OverflowIcon />
        </Button>
      )}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────

interface ResourcesPanelProps {
  /** The currently-selected lesson, or null if none is selected. Drives
   *  aggregation in day mode; ignored in week mode (the panel aggregates
   *  across `lessons` instead). */
  lesson: Lesson | null;
  /**
   * Whether the panel BODY (tabs + grid/list) is collapsed to its header
   * only. Optional — when omitted the panel renders fully expanded with
   * no chevron and behaves identically to the standalone component.
   */
  collapsed?: boolean;
  /** Flip the collapsed state. Rendered as a chevron button in the header. */
  onToggleCollapsed?: () => void;
  /**
   * dnd-kit wiring supplied by <RightRail>. When provided the panel
   * renders a grip button in its header that is the SOLE drag activator
   * for reorder. When omitted there is no grip.
   */
  dragHandleProps?: PanelDragHandleProps;
  /**
   * Aggregation scope.
   *   • "day"  (default) — existing behavior: combine `lesson.resources`
   *                        with every section's resources for the selected
   *                        lesson, deduplicated on id.
   *   • "week"           — combine resources across EVERY lesson supplied
   *                        in `lessons` (used by the Weekly view shell).
   *
   * Omitting the prop preserves the original day-mode contract.
   */
  mode?: "day" | "week";
  /**
   * Lessons to aggregate across in week mode. Required only when
   * `mode === "week"`; ignored otherwise. Each lesson's resources are
   * unioned (lesson-level + every section's resources) with the same
   * dedup-on-id rule as day mode.
   */
  lessons?: Lesson[];
  /**
   * Active week number, used to title the panel in week mode (e.g.
   * "Resources · Week 12"). Ignored in day mode. Optional — defaults to
   * undefined so callers that don't know the week (e.g. standalone
   * day-mode embeds) need not supply it.
   */
  week?: number;
  /**
   * Called when the teacher clicks "Back to week" in the panel header.
   * Only rendered when this prop is supplied AND the panel is in
   * lesson-scoped day mode (i.e. when `lesson` is non-null). Intended
   * for the Weekly view where a lesson card can be deselected to revert
   * the Resources panel to week-aggregate scope.
   */
  onClearLesson?: () => void;
}

// ── ResourcesPanel ───────────────────────────────────────────────────────

export function ResourcesPanel({
  lesson,
  collapsed = false,
  onToggleCollapsed,
  dragHandleProps,
  mode = "day",
  lessons,
  week,
  onClearLesson,
}: ResourcesPanelProps): ReactNode {
  // Panel-local UI state. Default tab "all"; default view "grid" (matches
  // the design and the LessonFlow editor's default for the same data).
  // Renamed from `mode` to `viewMode` so it doesn't collide with the
  // public `mode: "day" | "week"` prop above — the local presentation
  // toggle and the aggregation scope are independent concerns.
  const [category, setCategory] = useState<ResourceCategory>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // ── Composer + drag-drop state ───────────────────────────────────────
  // The "+" trigger in the panel header and a drop of one-or-more files
  // onto the panel both open the shared ResourceComposer. `pendingItems`
  // carries the dropped files into the composer as pre-captured chips so
  // the teacher just confirms routing + Adds. `isDragOver` drives a soft
  // drop-target outline on the panel while files are being dragged over it.
  const [composerOpen, setComposerOpen] = useState<boolean>(false);
  const [pendingItems, setPendingItems] = useState<CapturedItem[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Routing destination for the composer. In day mode it's the selected
  // lesson; in week mode we fall back to the first lesson in the week (the
  // teacher can re-route via the composer's pickers). When neither yields a
  // lesson, the composer stays disabled.
  const composerLesson: Lesson | null = lesson ?? lessons?.[0] ?? null;

  const openComposer = useCallback((): void => {
    setComposerOpen(true);
  }, []);

  const closeComposer = useCallback((): void => {
    setComposerOpen(false);
    setPendingItems([]);
  }, []);

  // ── Multi-file drag-drop on the panel ────────────────────────────────
  // Accepts native HTML5 drags carrying File items (a folder-or-file drag
  // from the OS). preventDefault on dragOver is required to enable a drop;
  // dragLeave clears the visual hint only when the pointer truly exits the
  // panel (not when it crosses an internal child).
  const handleDragOver = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setIsDragOver(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0 || composerLesson === null) return;
      const items = files.map((f) => fileToCapturedItem(f));
      setPendingItems(items);
      setComposerOpen(true);
    },
    [composerLesson],
  );

  // Pull the lesson's section content from the planner store so the
  // aggregation reacts to section-resource edits in real time. We read
  // getSections from the store as a STABLE callback (planner-store
  // memoizes it on the sections record), and call it inside the
  // aggregation useMemo so the only dependencies are `lesson` and
  // `getSections` — avoiding the "conditional value changes every
  // render" lint warning that derived `sections` outside the memo would
  // produce.
  const { getSections } = usePlanner();

  // ── Aggregation ──────────────────────────────────────────────────────
  // DAY mode:
  //   Derive the lesson's resources from the CANONICAL helper
  //   `lessonResources(sections)` (lib/lesson-resources.ts). This is the
  //   single source of truth shared with the weekly card and the daily
  //   lesson detail, so all three surfaces always agree on the same list
  //   (audit finding BUG-006). The sections are read from the planner
  //   store via `getSections(lesson.id)` so section-resource edits
  //   anywhere in the UI are reflected here immediately.
  //
  // WEEK mode:
  //   Same canonical helper applied across EVERY lesson in `lessons`.
  //   Lessons keep their original order (the consumer is responsible for
  //   ordering by day / subject); within each lesson resources appear in
  //   section order. Deduplication on resource id is still applied — the
  //   same resource authored in two lessons surfaces once per lesson
  //   (the synthesized `lesson:<id>:res:<i>` key is already lesson-scoped)
  //   so a week-aggregate glance is accurate.
  const combined = useMemo<SectionResource[]>(() => {
    /**
     * Push one lesson's resources into `out` via the canonical helper,
     * deduplicating on id. Lesson-level resources (no native id on the
     * type) receive a synthesized id so React keys + dedup both work.
     */
    function appendLesson(
      l: Lesson,
      seen: Set<string>,
      out: SectionResource[],
    ): void {
      // Section-level resources — the canonical source per BUG-006.
      const sectionRefs = lessonResources(getSections(l.id));
      for (const r of sectionRefs) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      }
      // Lesson-level resources (Lesson.resources) — synthesize an id so
      // they participate in the same dedup contract as section resources.
      // These come AFTER section resources so section edits are the
      // primary edit surface; lesson-level entries are a legacy fallback
      // that will migrate to sections as the data model matures.
      l.resources.forEach((r, i) => {
        const id = `lesson:${l.id}:res:${i}`;
        if (seen.has(id)) return;
        seen.add(id);
        out.push({ ...r, id });
      });
    }

    const seen = new Set<string>();
    const out: SectionResource[] = [];

    if (mode === "week") {
      // Week mode — aggregate across every supplied lesson. An empty
      // `lessons` array (or undefined) renders the empty state.
      for (const l of lessons ?? []) {
        appendLesson(l, seen, out);
      }
      return out;
    }

    // Day mode — bail when nothing is selected.
    if (!lesson) return [];
    appendLesson(lesson, seen, out);
    return out;
  }, [mode, lesson, lessons, getSections]);

  // Filtered subset for the active tab.
  const visibleResources = useMemo<SectionResource[]>(
    () => combined.filter((r) => acceptByCategory(r, category)),
    [combined, category],
  );

  // Counts for the head + the "no <tab>" empty-state copy. The head's
  // badge always shows the FULL combined count — it's the panel's
  // "how much is in here?" answer and should stay stable as the teacher
  // flips tabs. The empty-state copy uses the per-tab count to phrase
  // its message.
  const totalCount = combined.length;
  const visibleCount = visibleResources.length;

  // Reduced-motion-safe collapse: opacity-only fade under prefers-reduced-
  // motion, height + opacity otherwise. Mirrors the same idiom lesson-flow
  // uses for its section-body collapse.
  const reducedMotion = useReducedMotion() ?? false;
  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  // ── Empty-state + tab-visibility helpers ─────────────────────────────
  // Day mode keys off `lesson` to decide "nothing selected" vs. "selected
  // but empty"; week mode keys off the supplied `lessons` array length.
  // Centralizing these once keeps the JSX below readable and the day-mode
  // contract identical to the original.
  const isWeek = mode === "week";
  const hasContext = isWeek ? (lessons?.length ?? 0) > 0 : lesson !== null;
  const emptyContextCopy = isWeek
    ? "No lessons in this week yet."
    : "Select a lesson to see resources.";
  const emptyAllCopy = isWeek
    ? "No resources in this week."
    : "No resources on this lesson.";
  const emptyCategoryScope = isWeek ? "in this week" : "on this lesson";

  // The body block — tabs + content — is what collapses; the header (and
  // its grip + chevron) stays put. Computed once so AnimatePresence keeps
  // one stable child to fade between mount + unmount.
  const bodyContent = (
    <>
      {/* ── Category tabs ──────────────────────────────────────────── */}
      {/* Hidden when there is no context (no selected lesson in day mode,
          no lessons in week mode) — the empty-state line below carries
          the panel's whole message in that case. */}
      {hasContext && (
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Resource category"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={category === tab.key}
              className={`${styles.tab} ${
                category === tab.key ? styles.tabActive : ""
              }`}
              onClick={() => setCategory(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Body: grid, list, or empty state ───────────────────────── */}
      {!hasContext ? (
        <p className={styles.empty}>{emptyContextCopy}</p>
      ) : totalCount === 0 ? (
        <p className={styles.empty}>{emptyAllCopy}</p>
      ) : visibleCount === 0 ? (
        // The tab filtered everything out — surface that clearly so the
        // teacher doesn't read "no resources" and mistrust the count chip.
        <p className={styles.empty}>
          No {TABS.find((t) => t.key === category)?.label.toLowerCase()}{" "}
          {emptyCategoryScope}.
        </p>
      ) : viewMode === "grid" ? (
        // Grid mode — ResourceTile thumbnails wrapped with the "···"
        // overflow stub. The tile body itself is unmodified; the wrapper
        // only adds the Padlet-style menu chip.
        <div className={styles.grid}>
          {visibleResources.map((resource) => (
            <TileWithOverflow key={resource.id} resource={resource} />
          ))}
        </div>
      ) : (
        // List mode — "Resource quick access" stack: a small chrome label
        // above two-line rows (label + synthetic URL preview + type tag).
        <div className={styles.listWrap}>
          <div className={styles.listHeader} aria-hidden="true">
            <PaperclipIcon />
            <span>Resource quick access</span>
          </div>
          <ul className={styles.list}>
            {visibleResources.map((resource) => (
              <li key={resource.id} className={styles.listItem}>
                <ResourceListRow resource={resource} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <section
      className={[styles.panel, isDragOver ? styles.panelDragOver : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        isWeek
          ? "Week resources"
          : lesson !== null
            ? `Resources for ${lesson.title}`
            : "Lesson resources"
      }
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Card head: optional grip + title + count + add + grid/list + chevron ── */}
      <header className={styles.head}>
        {/* Drag grip — rendered only when RightRail supplies the bundle.
            Its activator ref + listeners scope drag activation to this
            button alone, so the rest of the header (mode toggle, count
            chip) stays click-through. ≥44px touch target via padding. */}
        {dragHandleProps && (
          <button
            type="button"
            ref={dragHandleProps.ref}
            {...(dragHandleProps.attributes ?? {})}
            {...(dragHandleProps.listeners ?? {})}
            className={styles.gripBtn}
            aria-label={dragHandleProps.label ?? "Drag to reorder Resources"}
            title="Drag to reorder"
          >
            <GripVerticalIcon />
          </button>
        )}
        {/* "Back to week" affordance — shown only when the panel is
            lesson-scoped on the Weekly view (i.e. `onClearLesson` is
            supplied AND a lesson is selected). Clicking it clears the
            weekly card selection so the panel reverts to the week
            aggregate. Uses a chevron-left + label combination so it
            reads as a navigation back-action, not a destructive button. */}
        {!isWeek && lesson !== null && onClearLesson && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.backBtn}
            onClick={onClearLesson}
            aria-label="Back to week resources"
            leadingIcon={<BackIcon />}
          />
        )}
        {/* Headline:
            • Week mode: "Resources · Week 12" (or just "Resources").
            • Day mode with a selected lesson: "Resources · <lesson title>"
              (truncated via CSS ellipsis so the head doesn't overflow).
            • Day mode with no selection: "Resources". */}
        <h3
          className={styles.title}
          title={!isWeek && lesson !== null ? lesson.title : undefined}
        >
          {isWeek && typeof week === "number"
            ? `Resources · Week ${week}`
            : !isWeek && lesson !== null
              ? `Resources · ${lesson.title}`
              : "Resources"}
        </h3>
        {/* Small neutral count chip on the right of the title — only
            shown once there's context (a selected lesson in day mode, or
            at least one lesson in the week in week mode), so an empty
            rail head reads as "no context yet" rather than "0 resources".
            Stays visible in the collapsed state so the teacher still
            sees "how much is in here" at a glance. */}
        {hasContext && (
          <span className={styles.count} aria-label={`${totalCount} resources`}>
            {totalCount}
          </span>
        )}
        {/* "+" Add-resource button — opens the shared ResourceComposer
            for `composerLesson` (the selected lesson in day mode, or the
            first lesson of the week in week mode). Hidden when there is
            no lesson to route to, so the rail head reads as "no context
            yet" rather than offering a control that can't act. */}
        {composerLesson && (
          <Button
            variant="icon"
            iconAriaLabel="Add a resource to this lesson"
            className={styles.addBtn}
            onClick={openComposer}
            aria-haspopup="dialog"
            aria-expanded={composerOpen}
          >
            <PlusIcon />
          </Button>
        )}
        {/* The list/grid toggle is anchored to the right of the head
            row. Hidden when there are zero combined resources — the body
            below shows a single empty-state line in that case and a view
            toggle would be meaningless. Kept visible even when collapsed
            so the teacher's chosen view is still legible at a glance. */}
        {hasContext && totalCount > 0 && (
          <div
            className={styles.modeToggle}
            role="group"
            aria-label="Resource view mode"
          >
            <Button
              variant="icon"
              iconAriaLabel="List view"
              aria-pressed={viewMode === "list"}
              className={`${styles.modeBtn} ${
                viewMode === "list" ? styles.modeBtnActive : ""
              }`}
              onClick={() => setViewMode("list")}
            >
              <ListIcon />
            </Button>
            <Button
              variant="icon"
              iconAriaLabel="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`${styles.modeBtn} ${
                viewMode === "grid" ? styles.modeBtnActive : ""
              }`}
              onClick={() => setViewMode("grid")}
            >
              <GridIcon />
            </Button>
          </div>
        )}
        {/* Chevron collapse toggle — flush right, after every other
            header control. Rendered only when RightRail wires the
            onToggleCollapsed callback. */}
        {onToggleCollapsed && (
          <Button
            variant="icon"
            iconAriaLabel={
              collapsed ? "Expand Resources panel" : "Collapse Resources panel"
            }
            className={styles.collapseBtn}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
          >
            <ChevronToggleIcon collapsed={collapsed} />
          </Button>
        )}
      </header>

      {/* ── Collapsible body ───────────────────────────────────────── */}
      {/* AnimatePresence is mounted unconditionally so the height 0→auto
          (or opacity-only under reduced motion) enter + exit animations
          actually play around the collapsed → expanded transition. */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="resources-body"
            className={styles.body}
            initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={
              reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }
            }
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={collapseTransition}
            style={reducedMotion ? undefined : { overflow: "hidden" }}
          >
            {bodyContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared Padlet-style add-resource composer — opens from the "+"
          button in the header OR from a multi-file drop onto the panel.
          `composerLesson` is the routing default (selected lesson in day
          mode; first week lesson in week mode); the teacher can re-route
          via the composer's pickers. `initialItems` pre-populates the
          captured-items strip when files were dropped onto the panel. */}
      {composerLesson && (
        <ResourceComposer
          open={composerOpen}
          lesson={composerLesson}
          initialItems={pendingItems.length > 0 ? pendingItems : undefined}
          onClose={closeComposer}
        />
      )}
    </section>
  );
}

// A shared no-op used for the read-only ResourceTile callbacks. Declared
// once so the React tree doesn't see a fresh function identity per render
// and trigger unnecessary tile re-renders.
function noop(): void {}
