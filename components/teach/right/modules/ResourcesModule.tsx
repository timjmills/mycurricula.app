"use client";

// ResourcesModule.tsx — the Teach right panel's Resources module
// (docs/teach-view-plan.md §3.1, §6, T8).
//
// A Padlet-style grid/list of the ACTIVE lesson's resources. Unlike the Daily
// ResourcesPanel (which is glance-and-open), the Teach Resources module is the
// drag SOURCE for T8: every card carries a `TeachResourceDragData` payload so a
// teacher can drag it straight onto a board cell (Agent C resolves the drop).
//
// ── Data path (NO new fetch — plan §11.3) ────────────────────────────────────
// Resources are derived from the active lesson via the canonical helper chain:
//   getSections(activeLessonId)  →  lessonResources(sections)  →  toTeachResource
// so this module always agrees with the Daily/Weekly resource lists and the
// center canvas (which branches on TeachResource.kind).
//
// ── Card actions (plan §6) ───────────────────────────────────────────────────
// Each card's ⋯ / hover menu offers:
//   • Open in board   — embed onto the active board (dispatch via onEmbed; the
//                        center owns the actual placement — Phase 2 integration).
//   • Magnify (Open Large) — dispatch openResource → centerMode flips to
//                        "resource" full-bleed (Wave-0 reducer handles the flip).
//   • Open in new tab — window.open on the resource URL.
//   • Copy link       — navigator.clipboard.writeText on the resource URL.
//
// ── Chrome rules (CLAUDE.md §4) ──────────────────────────────────────────────
// Tailwind = layout only; every colour/type/radius via tokens. The resource-
// type pill draws its colour from the `--tag-*-bg`/`--tag-*-fg` family mapped
// per kind below — never an inline hex.

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { usePlanner } from "@/lib/planner-store";
import { lessonResources } from "@/lib/lesson-resources";
import { toTeachResource } from "@/lib/teach/toTeachResource";
import type { TeachResource } from "@/lib/types";
import type { TeachResourceDragData } from "@/lib/teach/types";
import { Button } from "@/components/ui";
import {
  SearchIcon,
  GridIcon,
  ListIcon,
  MoreIcon,
  MagnifyIcon,
  EmbedIcon,
  ExternalIcon,
  CopyLinkIcon,
  ResourceKindIcon,
} from "../icons";
import styles from "./ResourcesModule.module.css";

// ── Per-kind tag-token + label mapping (CLAUDE.md §4 — tokens only) ──────────
// Single source of truth for the type pill's short label + which `--tag-*`
// colour pair tints it. The pill background/foreground come straight from the
// design-token family; no kind invents a colour.

interface KindStyle {
  /** Uppercase short label rendered in the pill. */
  label: string;
  /** CSS-module modifier class that wires the --tag-*-bg / --tag-*-fg pair. */
  pillClass: string;
}

const KIND_STYLE: Record<TeachResource["kind"], KindStyle> = {
  slides: { label: "SLIDES", pillClass: "pillAmber" },
  pdf: { label: "PDF", pillClass: "pillRed" },
  doc: { label: "DOC", pillClass: "pillBlue" },
  image: { label: "IMAGE", pillClass: "pillPink" },
  video: { label: "VIDEO", pillClass: "pillRed" },
  tool: { label: "TOOL", pillClass: "pillGreen" },
  link: { label: "LINK", pillClass: "pillGray" },
};

// ── Filter chips ─────────────────────────────────────────────────────────────
// "All" + the three roll-up categories from the Daily ResourcesPanel, mapped to
// the Teach `kind` taxonomy: Slides, Handouts (pdf/doc/image), Tools
// (link/video/tool). Custom tags surface as additional chips derived from the
// resources' `tags` array so a future tagged dataset filters cleanly.

type FilterChip = {
  key: string;
  label: string;
  kinds?: TeachResource["kind"][];
};

const BASE_CHIPS: readonly FilterChip[] = [
  { key: "all", label: "All" },
  { key: "slides", label: "Slides", kinds: ["slides"] },
  { key: "handouts", label: "Handouts", kinds: ["pdf", "doc", "image"] },
  { key: "tools", label: "Tools", kinds: ["link", "video", "tool"] },
] as const;

/** Does this resource pass the active chip? Tag chips (key = `tag:<t>`) match
 *  the resource's `tags`; kind chips match the kind set; "all" passes all. */
function acceptByChip(resource: TeachResource, chipKey: string): boolean {
  if (chipKey === "all") return true;
  if (chipKey.startsWith("tag:")) {
    return resource.tags.includes(chipKey.slice(4));
  }
  const chip = BASE_CHIPS.find((c) => c.key === chipKey);
  if (!chip?.kinds) return true;
  return chip.kinds.includes(resource.kind);
}

type ViewMode = "grid" | "list";

// ── One draggable resource card ──────────────────────────────────────────────
// The card is the T8 drag source: `useDraggable` attaches the
// `TeachResourceDragData` payload the board cell narrows on. The ⋯ menu's
// buttons stopPropagation so opening the menu / clicking an action never starts
// a drag.

interface ResourceCardProps {
  resource: TeachResource;
  /** Stable dnd id — unique within the module. */
  dragId: string;
  view: ViewMode;
  /** Embed onto the active board (T8 keyboard/explicit path). */
  onEmbed: (resource: TeachResource) => void;
  /** Magnify — flip the center to full-bleed resource mode. */
  onMagnify: (resource: TeachResource) => void;
  /** Open the resource URL in a new tab. */
  onOpenExternal: (resource: TeachResource) => void;
  /** Copy the resource URL to the clipboard. */
  onCopyLink: (resource: TeachResource) => void;
}

function ResourceCard({
  resource,
  dragId,
  view,
  onEmbed,
  onMagnify,
  onOpenExternal,
  onCopyLink,
}: ResourceCardProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);

  const dragData: TeachResourceDragData = useMemo(
    () => ({ kind: "resource", resource }),
    [resource],
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: dragData,
  });

  const kindStyle = KIND_STYLE[resource.kind] ?? KIND_STYLE.link;
  const label = resource.label || resource.kind;

  // The overflow menu — shared between grid + list. Closes after any action.
  const act = useCallback(
    (fn: (r: TeachResource) => void) => (): void => {
      fn(resource);
      setMenuOpen(false);
    },
    [resource],
  );

  const menu = menuOpen ? (
    <div
      className={styles.menu}
      role="menu"
      aria-label={`Actions for ${label}`}
    >
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={act(onEmbed)}
      >
        <EmbedIcon /> Open in board
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${styles.menuItem} ${styles.menuItemAccent}`}
        onClick={act(onMagnify)}
      >
        <MagnifyIcon /> Magnify (Open Large)
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={act(onOpenExternal)}
      >
        <ExternalIcon /> Open in new tab
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={act(onCopyLink)}
      >
        <CopyLinkIcon /> Copy link
      </button>
    </div>
  ) : null;

  // The ⋯ trigger — stopPropagation so it never starts a drag.
  const overflowBtn = (
    <Button
      variant="icon"
      iconAriaLabel={`More actions for ${label}`}
      className={styles.cardMenuBtn}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      tooltip={`Actions for "${label}" — embed it on the board, open it large, or copy its link`}
      onClick={(e) => {
        e.stopPropagation();
        setMenuOpen((o) => !o);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MoreIcon />
    </Button>
  );

  if (view === "list") {
    return (
      <div
        className={`${styles.listRow} ${isDragging ? styles.dragging : ""}`}
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        title={`${kindStyle.label} — ${label}. Drag onto a board cell to embed it.`}
      >
        <span
          className={`${styles.listChip} ${styles[kindStyle.pillClass] ?? ""}`}
          aria-hidden="true"
        >
          <ResourceKindIcon kind={resource.kind} size={15} />
        </span>
        <span className={styles.listLabel}>{label}</span>
        <span className={`${styles.pill} ${styles[kindStyle.pillClass] ?? ""}`}>
          {kindStyle.label}
        </span>
        <span className={styles.cardMenuWrap}>
          {overflowBtn}
          {menu}
        </span>
      </div>
    );
  }

  // Grid card.
  return (
    <div
      className={`${styles.card} ${isDragging ? styles.dragging : ""}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={`${kindStyle.label} — ${label}. Drag onto a board cell to embed it.`}
    >
      <span
        className={`${styles.pill} ${styles.cardPill} ${
          styles[kindStyle.pillClass] ?? ""
        }`}
      >
        {kindStyle.label}
      </span>
      <span className={styles.cardMenuWrap}>
        {overflowBtn}
        {menu}
      </span>
      <div
        className={`${styles.thumb} ${styles[kindStyle.pillClass] ?? ""}`}
        aria-hidden="true"
      >
        <ResourceKindIcon kind={resource.kind} size={28} />
      </div>
      <div className={styles.cardTitle}>{label}</div>
      {/* Quick magnify affordance bottom-right — the most common single-click
          action, also reachable from the ⋯ menu. */}
      <Button
        variant="icon"
        iconAriaLabel={`Open ${label} large`}
        className={styles.cardMagnifyBtn}
        tooltip="Open this resource full-screen on the board (Open Large)"
        onClick={(e) => {
          e.stopPropagation();
          onMagnify(resource);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MagnifyIcon />
      </Button>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ResourcesModuleProps {
  /** Active lesson id — resources are derived from its sections. Null in an
   *  empty sandbox; the module shows its empty state. */
  activeLessonId: string | null;
  /** Embed a resource onto the active board (T8 explicit/keyboard path).
   *  Optional — when omitted the menu item is a no-op-safe stub. */
  onEmbedResource?: (resource: TeachResource) => void;
  /** Magnify a resource — flips the center to full-bleed. Wired to the
   *  workspace reducer's `openResource` by the panel/integration. */
  onMagnifyResource: (resource: TeachResource) => void;
}

// ── ResourcesModule ──────────────────────────────────────────────────────────

export function ResourcesModule({
  activeLessonId,
  onEmbedResource,
  onMagnifyResource,
}: ResourcesModuleProps): ReactNode {
  const { getSections } = usePlanner();
  const [view, setView] = useState<ViewMode>("grid");
  const [chip, setChip] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Derive the lesson's resources via the canonical chain. Re-derives only when
  // the lesson or its sections change. We keep the SectionResource's stable
  // `id` paired with the projected TeachResource — `TeachResource` itself
  // doesn't surface `id` in its type (it extends the id-less LessonResource),
  // so the pairing is the source of React keys + dnd ids.
  const resources = useMemo<{ id: string; resource: TeachResource }[]>(() => {
    if (!activeLessonId) return [];
    return lessonResources(getSections(activeLessonId)).map((r) => ({
      id: r.id,
      resource: toTeachResource(r),
    }));
  }, [activeLessonId, getSections]);

  // Custom-tag chips derived from the resources' tags (deduped, sorted).
  const tagChips = useMemo<FilterChip[]>(() => {
    const tags = new Set<string>();
    for (const { resource } of resources)
      for (const t of resource.tags) tags.add(t);
    return [...tags].sort().map((t) => ({ key: `tag:${t}`, label: t }));
  }, [resources]);

  const chips = useMemo<FilterChip[]>(
    () => [...BASE_CHIPS, ...tagChips],
    [tagChips],
  );

  // Apply the active chip + the search query (matches label, case-insensitive).
  const visible = useMemo<{ id: string; resource: TeachResource }[]>(() => {
    const q = query.trim().toLowerCase();
    return resources.filter(({ resource: r }) => {
      if (!acceptByChip(r, chip)) return false;
      if (q && !(r.label || r.kind).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [resources, chip, query]);

  const handleOpenExternal = useCallback((resource: TeachResource): void => {
    if (typeof window === "undefined") return;
    if (!resource.url) return;
    window.open(resource.url, "_blank", "noopener,noreferrer");
  }, []);

  const handleCopyLink = useCallback((resource: TeachResource): void => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    if (!resource.url) return;
    void navigator.clipboard.writeText(resource.url).catch(() => {
      // Clipboard blocked (permissions / insecure context) — silently no-op;
      // the resource is still draggable + openable.
    });
  }, []);

  const handleEmbed = useCallback(
    (resource: TeachResource): void => {
      onEmbedResource?.(resource);
    },
    [onEmbedResource],
  );

  const totalCount = resources.length;
  const hasLesson = activeLessonId !== null;

  return (
    <div className={styles.root}>
      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search resources…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search this lesson's resources"
          disabled={!hasLesson}
        />
      </div>

      {/* ── Grid / list toggle ──────────────────────────────────────────── */}
      <div
        className={styles.viewToggle}
        role="group"
        aria-label="Resource view mode"
      >
        <Button
          variant="icon"
          iconAriaLabel="Grid view"
          aria-pressed={view === "grid"}
          className={`${styles.viewBtn} ${
            view === "grid" ? styles.viewBtnActive : ""
          }`}
          onClick={() => setView("grid")}
          tooltip="Show resources as visual tiles you can drag onto the board"
        >
          <GridIcon />
        </Button>
        <Button
          variant="icon"
          iconAriaLabel="List view"
          aria-pressed={view === "list"}
          className={`${styles.viewBtn} ${
            view === "list" ? styles.viewBtnActive : ""
          }`}
          onClick={() => setView("list")}
          tooltip="Show resources as a compact list — best for scanning many items"
        >
          <ListIcon />
        </Button>
      </div>

      {/* ── Filter chips ────────────────────────────────────────────────── */}
      <div className={styles.chips} role="group" aria-label="Filter resources">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`${styles.chip} ${
              chip === c.key ? styles.chipActive : ""
            }`}
            aria-pressed={chip === c.key}
            onClick={() => setChip(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* ── Body: grid, list, or empty state ────────────────────────────── */}
      <div className={styles.body}>
        {!hasLesson ? (
          <p className={styles.empty}>
            Select a lesson to see its resources here.
          </p>
        ) : totalCount === 0 ? (
          <p className={styles.empty}>No resources on this lesson yet.</p>
        ) : visible.length === 0 ? (
          <p className={styles.empty}>No resources match your filter.</p>
        ) : view === "grid" ? (
          <div className={styles.grid}>
            {visible.map(({ id, resource }) => (
              <ResourceCard
                key={`${activeLessonId}:${id}`}
                dragId={`teach-res:${activeLessonId}:${id}`}
                resource={resource}
                view="grid"
                onEmbed={handleEmbed}
                onMagnify={onMagnifyResource}
                onOpenExternal={handleOpenExternal}
                onCopyLink={handleCopyLink}
              />
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map(({ id, resource }) => (
              <ResourceCard
                key={`${activeLessonId}:${id}`}
                dragId={`teach-res:${activeLessonId}:${id}`}
                resource={resource}
                view="list"
                onEmbed={handleEmbed}
                onMagnify={onMagnifyResource}
                onOpenExternal={handleOpenExternal}
                onCopyLink={handleCopyLink}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer count — mirrors the prototype's "N resources" line. */}
      {hasLesson && totalCount > 0 && (
        <p className={styles.count}>
          {visible.length === totalCount
            ? `${totalCount} resource${totalCount === 1 ? "" : "s"}`
            : `${visible.length} of ${totalCount} resources`}
        </p>
      )}
    </div>
  );
}
