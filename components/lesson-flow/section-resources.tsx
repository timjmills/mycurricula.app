"use client";

// section-resources.tsx — per-section Resources card with EXPANDED ⇄ MINIMIZED
// toggle, rebuilt to the 6.12.26 Resource & Notecard Redesign §2
// (Documents/Claude Design/6.12.26 design_handoff_ux_roadmap_and_resources/
// resource_redesign/surface-section.jsx + rn.css — the authoritative spec).
//
// Each section row gets its own resources card. The card has two states and
// the teacher flips between them with a small icon button at its top-right:
//
//   EXPANDED (artboard "Expanded · desktop"):
//     • "RESOURCES" eyebrow + minimize toggle (32px visual, ≥44 hit).
//     • The KEPT 2×2 colored slot grid (rn.css `.rn-slot.s1–.s4` token
//       fills — see PRIMARY_SLOT_FILLS): the first FOUR plain resources,
//       each slot with a
//       bottom-aligned label and a hover-revealed edit-notes pencil (32px
//       visual, ::after-inflated ≥44; always visible on touch).
//     • The NOTECARD COMPACT ROW (`.rn-noteRow`) — one ≥48px row per
//       notecard-ish resource: honey-50 fill, honey-200 border, 34px poster
//       thumb (poster image when present, else the honey notecard glyph),
//       title + "N media · notes" meta, edit + open-full-card buttons. This
//       REPLACES the old full-NotecardCard strip (redesign P3 — notecards
//       never enter the grid, and never dominate the section).
//     • "More resources" compact rows (`.rn-moreList`) for plain resources
//       beyond the four slots — 30px type-tinted icon tile + label + type
//       tag + edit-notes pencil.
//     • The dashed "+ Add resource" row (`.rn-addRes`, ≥44px) opening the
//       shared ResourceComposer via the existing onAdd seam.
//
//   MINIMIZED (artboard "Minimized quick access"):
//     • "RESOURCE QUICK ACCESS" eyebrow + expand toggle.
//     • One compact row per plain resource (same row recipe as "more
//       resources"), then the identical notecard row(s) — the notecard row
//       renders the same in both states so the card never "jumps shape"
//       when toggling — then the dashed "+ Add quick resource" row.
//
// Clicking a slot, a row, or a notecard row opens the shared ResourcePreview
// (which routes notecards to the fullscreen split view). No iframe ever
// renders inside a slot or row — slots are flat indexed tints; rows are
// type-tinted glyph tiles (the th-* token pairs); the only <img> is the
// notecard row's 34px poster, which falls through a chain — thumbnail →
// image-like poster url → honey glyph (never a broken image).
// Legacy url-less fixture rows render from type + label alone — the old
// synthetic-URL subtitle strings ("youtube.com/watch?v=…") are gone.
//
// State persistence (unchanged): the expanded ⇄ minimized state is stored
// per `(lessonId, sectionId)` in localStorage under
// `myc:resources-minimized:v1`. SSR-safe — the SSR pass defaults to
// expanded, then a useEffect hydrates the persisted value on mount and a
// `storage` listener keeps tabs in sync.
//
// Hard rules (spec / task brief):
//   • ALL color/type/spacing via var(--token) — including the 4 slot fills,
//     which rn.css paints with existing tokens (see PRIMARY_SLOT_FILLS).
//   • ≥44px tap targets on every action (hit-area inflation), WCAG AA
//     contrast, full keyboard access, prefers-reduced-motion honored.

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useId, useState } from "react";
import type { LessonResource } from "@/lib/types";
import type { SectionResource } from "@/lib/lesson-flow";
import { Tooltip } from "@/components/ui";
import { ResourcePreview } from "@/components/resources";
import { isSafeImgSrc } from "@/lib/resource-embed";
import {
  galleryCount,
  hasNotes,
  isNotecard,
  notecardPoster,
} from "@/lib/notecards";
import { ResourceTypePill } from "./resource-type-pill";
import styles from "./section-resources.module.css";

/** True when a resource should render as a notecard compact row (poster +
 *  meta + open-fullscreen) rather than occupying a slot / plain row: a
 *  dedicated notecard, anything with a gallery, or anything with rich notes.
 *  Notecards never enter the 2×2 grid (redesign P3). */
function isNotecardish(resource: LessonResource): boolean {
  return (
    isNotecard(resource) ||
    (resource.gallery?.length ?? 0) > 0 ||
    hasNotes(resource)
  );
}


// ── localStorage key + helpers ───────────────────────────────────────────
// One JSON blob `{ [lessonId:sectionId]: true }` records which (lesson,
// section) pairs are currently MINIMIZED. Missing key → expanded (default).
// `v1` suffix lets us bump the schema later without colliding with old data.

const LS_KEY = "myc:resources-minimized:v1";

/** Read the persisted minimized-map. SSR-safe: returns `{}` outside browser. */
function readMinimizedMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    // Malformed JSON or storage unavailable — swallow and start fresh.
    return {};
  }
}

/** Write a partial update to the persisted minimized-map. SSR-safe. */
function writeMinimized(key: string, minimized: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const current = readMinimizedMap();
    if (minimized) {
      current[key] = true;
    } else {
      delete current[key];
    }
    window.localStorage.setItem(LS_KEY, JSON.stringify(current));
  } catch {
    // Storage quota / private-mode failure — fail silently; the in-memory
    // state still drives the current view.
  }
}

// ── Props ────────────────────────────────────────────────────────────────

export interface SectionResourcesProps {
  /** The lesson this section belongs to — half of the persistence key. */
  lessonId: string;
  /** The section being rendered — half of the persistence key. */
  sectionId: string;
  /** The resources to surface in this section's panel, in display order.
   *  Sections are the CANONICAL owner of their resources (redesign P1) —
   *  this list arrives already deduped; nothing merges inside one section. */
  resources: SectionResource[];
  /** Fire the shared ResourceComposer to add a new resource to this section.
   *  Optional — when undefined the "+ Add" affordances render disabled. */
  onAdd?: () => void;
  /** Open the composer to add / edit notes (a body + extra gallery) on one of
   *  this section's resources. Optional — when undefined the note affordance
   *  is hidden. */
  onEditNote?: (resource: SectionResource) => void;
}

// ── rn.css `.rn-slot.s1–.s4` — primary 2×2 slot fills (TOKENS) ──────────
// The four slot fills per the 6.12.26 handoff's authoritative rn.css
// (resource_redesign/rn.css), which paints `.rn-slot.s1` … `.s4` with
// EXISTING tokens — so the older exact-hex exemption is obsolete. They are
// keyed by SLOT INDEX (0..3), not by resource type — the spec assigns each
// position its own pastel regardless of the resource it carries. The first
// resource lands in slot 0 (soft purple), the second in slot 1 (soft mint),
// etc. Beyond slot 3 resources fall through to the "More resources" list.
const PRIMARY_SLOT_FILLS: ReadonlyArray<string> = [
  "var(--wf-purple-bg)", // .rn-slot.s1 — soft purple
  "var(--board-tint-mint)", // .rn-slot.s2 — soft mint
  "var(--wf-green-bg)", // .rn-slot.s3 — soft green
  "var(--wf-orange-bg)", // .rn-slot.s4 — soft orange
];

// ── SectionResources ─────────────────────────────────────────────────────

/** Per-section resources card: expanded slot grid OR minimized quick-access
 *  list, with a top-right toggle and per-(lesson,section) persistence. */
export const SectionResources = memo(function SectionResources({
  lessonId,
  sectionId,
  resources,
  onAdd,
  onEditNote,
}: SectionResourcesProps): ReactNode {
  // Persistence key combining lesson + section ids.
  const storageKey = `${lessonId}:${sectionId}`;

  // The resource currently open in the shared click-to-enlarge modal (a slot
  // / row click or a notecard row's open affordance), or null when closed.
  // ResourcePreview routes notecards to the fullscreen split view itself.
  const [previewResource, setPreviewResource] =
    useState<SectionResource | null>(null);

  // ── State + post-mount hydration (SSR-safe) ─────────────────────────
  // We DELIBERATELY start with `minimized: false` so the server-rendered HTML
  // matches the initial client render (no hydration mismatch). A `useEffect`
  // below then reads localStorage and flips the state to the persisted value.
  const [minimized, setMinimized] = useState<boolean>(false);

  useEffect(() => {
    // Mount-time hydration: pull the persisted flag if any.
    const map = readMinimizedMap();
    if (map[storageKey] === true) {
      setMinimized(true);
    }
    // Cross-tab sync: when another tab updates the same localStorage key,
    // mirror the change for this (lesson, section).
    function handleStorage(e: StorageEvent): void {
      if (e.key !== LS_KEY) return;
      const next = readMinimizedMap();
      setMinimized(next[storageKey] === true);
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  // Toggle the minimized flag and persist it. Wrapped in useCallback so the
  // header button reference is stable across renders.
  const toggle = useCallback((): void => {
    setMinimized((prev) => {
      const next = !prev;
      writeMinimized(storageKey, next);
      return next;
    });
  }, [storageKey]);

  // Notecard-ish resources render as compact notecard rows BELOW the grid;
  // plain single-media resources keep the 2×2 / list layout. Order within
  // each bucket is preserved.
  const notecards = resources.filter((r) => isNotecardish(r));
  const plain = resources.filter((r) => !isNotecardish(r));

  // Split the PLAIN pool into the primary 2×2 grid (first 4) and the
  // "More resources" tail (everything else).
  const primary = plain.slice(0, 4);
  const more = plain.slice(4);

  // A stable id for ARIA wiring (header → body section).
  const bodyId = useId();

  // The notecard compact rows — IDENTICAL in both states (the artboard's
  // "the card never jumps shape when toggling" note). Replaces the old
  // full-card NotecardCard strip.
  const noteRows =
    notecards.length > 0 ? (
      <div className={styles.noteRows}>
        {notecards.map((res) => (
          <NotecardRow
            key={res.id}
            resource={res}
            onOpen={() => setPreviewResource(res)}
            onEditNote={onEditNote ? () => onEditNote(res) : undefined}
          />
        ))}
      </div>
    ) : null;

  // The dashed add-resource row — shared chrome; only the label differs.
  const addRow = (
    <Tooltip
      content={
        minimized
          ? "Attach a quick link, file, or video to this section — opens the resource composer"
          : "Attach a link, file, video, or doc to this section — opens the resource composer"
      }
      tooltipId="lesson-flow.section-resources.add"
      side="top"
    >
      <button
        type="button"
        className={styles.addRes}
        onClick={onAdd}
        disabled={!onAdd}
        aria-label={
          minimized
            ? "Add a quick resource to this section"
            : "Add a resource to this section"
        }
      >
        <PlusIcon />
        {minimized ? "Add quick resource" : "Add resource"}
      </button>
    </Tooltip>
  );

  // The shared enlarge modal — mounted once, opened from any slot / row.
  const preview = previewResource ? (
    <ResourcePreview
      resource={previewResource}
      onClose={() => setPreviewResource(null)}
    />
  ) : null;

  // ── Minimized state — "Resource quick access" ───────────────────────
  if (minimized) {
    return (
      <section className={styles.card} aria-labelledby={`${bodyId}-header`}>
        <header className={styles.head}>
          <h3 id={`${bodyId}-header`} className={styles.eyebrow}>
            Resource quick access
          </h3>
          <ToggleButton minimized={true} onClick={toggle} />
        </header>

        {/* Compact rows — one per PLAIN resource (same recipe as the
            expanded card's "more resources" rows). */}
        {plain.length > 0 ? (
          <ul
            id={bodyId}
            className={styles.rowList}
            aria-label="Resources for this section"
          >
            {plain.map((res) => (
              <CompactRow
                key={res.id}
                resource={res}
                onActivate={() => setPreviewResource(res)}
                onEditNote={onEditNote ? () => onEditNote(res) : undefined}
              />
            ))}
          </ul>
        ) : notecards.length === 0 ? (
          <p className={styles.empty}>No resources yet.</p>
        ) : null}

        {/* Notecard rows — identical to the expanded state's. */}
        {noteRows}

        {addRow}
        {preview}
      </section>
    );
  }

  // ── Expanded state — 2×2 slot grid + notecard rows + more list ──────
  return (
    <section className={styles.card} aria-labelledby={`${bodyId}-header`}>
      <header className={styles.head}>
        <h3 id={`${bodyId}-header`} className={styles.eyebrow}>
          Resources
        </h3>
        <ToggleButton minimized={false} onClick={toggle} />
      </header>

      {/* Primary 2×2 slot grid of PLAIN resources. Missing slots simply
          don't render — we never paint empty placeholder slots. Notecards
          never enter the grid (P3) — the 2×2 keeps its rhythm. */}
      {primary.length > 0 && (
        <div
          id={bodyId}
          className={styles.grid}
          role="list"
          aria-label="Primary resources"
        >
          {primary.map((res, idx) => (
            <SlotCard
              key={res.id}
              resource={res}
              fill={PRIMARY_SLOT_FILLS[idx] ?? PRIMARY_SLOT_FILLS[0]}
              onActivate={() => setPreviewResource(res)}
              onEditNote={onEditNote ? () => onEditNote(res) : undefined}
            />
          ))}
        </div>
      )}

      {/* Notecard compact rows — under the grid, never inside it. */}
      {noteRows}

      {/* "More resources" — compact rows for plain resources beyond the
          four slots. */}
      {more.length > 0 && (
        <ul className={styles.moreList} aria-label="More resources">
          {more.map((res) => (
            <CompactRow
              key={res.id}
              resource={res}
              onActivate={() => setPreviewResource(res)}
              onEditNote={onEditNote ? () => onEditNote(res) : undefined}
            />
          ))}
        </ul>
      )}

      {addRow}
      {preview}
    </section>
  );
});

// ── SlotCard — one of the 4 colored 2×2 grid slots ───────────────────────
// A flat indexed-tint slot (the rn.css `.rn-slot.sN` token fill),
// bottom-aligned label, and a
// hover-revealed edit-notes pencil pinned top-right. The slot's main area is
// a button opening the shared ResourcePreview. No thumbnail, no iframe —
// the slot fill IS the design.

function SlotCard({
  resource,
  fill,
  onActivate,
  onEditNote,
}: {
  resource: SectionResource;
  /** The rn.css `.rn-slot.sN` token fill (a `var(--token)` string) for this
   *  slot index (see PRIMARY_SLOT_FILLS). */
  fill: string;
  /** Open this resource in the shared enlarge preview. */
  onActivate?: () => void;
  /** Open the composer to add / edit notes on this resource. */
  onEditNote?: () => void;
}): ReactNode {
  return (
    <div
      className={styles.slot}
      // Inline `background` carries the slot's rn.css token fill — this is
      // the only place the slot color is applied. The inline style is the
      // SOURCE OF TRUTH for the `.rn-slot.sN` colors.
      style={{ background: fill }}
      role="listitem"
    >
      <button
        type="button"
        className={styles.slotMain}
        onClick={onActivate}
        disabled={!onActivate}
        aria-label={`Open ${resource.label}`}
      >
        <span className={styles.slotLabel}>{resource.label}</span>
      </button>
      {onEditNote && (
        <Tooltip
          content="Add or edit notes for this resource — opens the note editor"
          tooltipId="lesson-flow.section-resources.slot-edit"
          side="top"
        >
          <button
            type="button"
            className={styles.slotEdit}
            onClick={(e) => {
              e.stopPropagation();
              onEditNote();
            }}
            aria-label={`Add or edit notes for ${resource.label}`}
          >
            <PencilIcon />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

// ── NotecardRow — the compact notecard row (replaces the full-card strip) ──
// ≥48px row: 34px poster thumb (fallback chain: thumbnail → image-like
// poster url → honey notecard glyph), title + "N media · notes" meta, an
// edit-notes pencil, and an open-full-card button. The row body opens the
// fullscreen too.

function NotecardRow({
  resource,
  onOpen,
  onEditNote,
}: {
  resource: SectionResource;
  /** Open the notecard fullscreen (via the shared ResourcePreview routing). */
  onOpen: () => void;
  /** Open the composer to edit this notecard. */
  onEditNote?: () => void;
}): ReactNode {
  const label = resource.label || "Notecard";
  const poster = notecardPoster(resource);

  // Poster fallback CHAIN (mirrors the panel's TileThumb in
  // ResourcesPanel.tsx): try the poster's explicit thumbnail first; if it is
  // unsafe or fails to load, fall to the poster's own url (only when the
  // poster is image-like AND the url passes the safety gate); when both are
  // exhausted the honey glyph renders. The failure set describes specific
  // srcs — when the poster's srcs change (teacher fixed a link, a thumbnail
  // landed) retry instead of staying demoted until remount.
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setFailedSrcs(new Set());
  }, [poster?.thumbnailUrl, poster?.url]);

  const candidates: string[] = [];
  if (poster) {
    if (isSafeImgSrc(poster.thumbnailUrl)) candidates.push(poster.thumbnailUrl);
    if (
      (poster.type === "image" || poster.provider === "image") &&
      isSafeImgSrc(poster.url)
    ) {
      candidates.push(poster.url);
    }
  }
  const posterSrc = candidates.find((c) => !failedSrcs.has(c));

  // Meta line: "N media · notes" (each part only when present).
  const count = galleryCount(resource);
  const metaParts: string[] = [];
  if (count > 0) metaParts.push(`${count} media`);
  if (hasNotes(resource)) metaParts.push("notes");
  const meta = metaParts.join(" · ");

  return (
    <div className={styles.noteRow}>
      <button
        type="button"
        className={styles.noteRowMain}
        onClick={onOpen}
        aria-label={`Open notecard: ${label}`}
      >
        <span className={styles.notePoster} aria-hidden="true">
          {posterSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterSrc}
              alt=""
              loading="lazy"
              className={styles.notePosterImg}
              onError={() =>
                setFailedSrcs((prev) => new Set(prev).add(posterSrc))
              }
            />
          ) : (
            <NotecardIcon />
          )}
        </span>
        <span className={styles.noteBody}>
          <span className={styles.noteTitle}>{label}</span>
          {meta && <span className={styles.noteMeta}>{meta}</span>}
        </span>
      </button>
      {onEditNote && (
        <Tooltip
          content="Edit this notecard's notes or media — opens the note editor"
          tooltipId="lesson-flow.section-resources.note-edit"
          side="top"
        >
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.noteEditBtn}`}
            onClick={onEditNote}
            aria-label={`Edit notecard: ${label}`}
          >
            <PencilIcon />
          </button>
        </Tooltip>
      )}
      <Tooltip
        content="Open the full card — flip through its media and read the notes"
        tooltipId="lesson-flow.section-resources.note-open"
        side="top"
      >
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onOpen}
          aria-label={`Open full card: ${label}`}
        >
          <EnlargeIcon />
        </button>
      </Tooltip>
    </div>
  );
}

// ── CompactRow — one "more resources" / quick-access row ─────────────────
// 30px type-tinted icon tile (th-* token pairs), truncating label, uppercase
// type tag, and the edit-notes pencil. The icon + label open the preview.

function CompactRow({
  resource,
  onActivate,
  onEditNote,
}: {
  resource: SectionResource;
  onActivate?: () => void;
  onEditNote?: () => void;
}): ReactNode {
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.rowMain}
        onClick={onActivate}
        disabled={!onActivate}
        // The icon tile + type tag are aria-hidden, so fold a short human
        // type word into the accessible name — screen-reader users get the
        // type signal sighted users get from the tinted tile.
        aria-label={`Open ${resource.label} (${typeWordFor(resource.type)})`}
      >
        <span
          className={styles.rowIc}
          data-kind={thKindFor(resource.type)}
          aria-hidden="true"
        >
          <RowTypeIcon type={resource.type} />
        </span>
        <span className={styles.rowLabel}>{resource.label}</span>
      </button>
      <ResourceTypePill type={resource.type} />
      {onEditNote && (
        <Tooltip
          content="Add or edit notes for this resource — opens the note editor"
          tooltipId="lesson-flow.section-resources.row-edit"
          side="left"
        >
          <button
            type="button"
            className={styles.iconBtn}
            onClick={(e) => {
              e.stopPropagation();
              onEditNote();
            }}
            aria-label={`Add or edit notes for ${resource.label}`}
          >
            <PencilIcon />
          </button>
        </Tooltip>
      )}
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Map a resource type to its th-* tinted-tile colorway (the rn.css `th-*`
 *  pairs, expressed as tokens in the CSS module). */
type ThKind = "slides" | "pdf" | "doc" | "image" | "link" | "youtube";

function thKindFor(type: SectionResource["type"]): ThKind {
  switch (type) {
    case "youtube":
      return "youtube";
    case "slides":
      return "slides";
    case "pdf":
      return "pdf";
    case "doc":
      return "doc";
    case "image":
      return "image";
    case "website":
    case "link":
    default:
      return "link";
  }
}

/** Short human type word folded into a compact row's accessible name (the
 *  row's icon tile + type tag are aria-hidden, so without this the type is
 *  invisible to screen-reader users). */
function typeWordFor(type: SectionResource["type"]): string {
  switch (type) {
    case "youtube":
      return "video";
    case "slides":
      return "slides";
    case "pdf":
      return "PDF";
    case "doc":
      return "document";
    case "image":
      return "image";
    case "website":
    case "link":
    default:
      return "link";
  }
}

// ── ToggleButton — the expanded/minimized swap control ──────────────────
// The spec's header icon button: 32px visual, ::after-inflated ≥44, the
// diagonal-arrows glyph in both states (the tooltip + aria carry direction).

function ToggleButton({
  minimized,
  onClick,
}: {
  minimized: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <Tooltip
      content={
        minimized
          ? "Expand to the full resource grid for this section"
          : "Minimize to the compact quick-access list — useful when the lesson body is the focus"
      }
      tooltipId="lesson-flow.section-resources.toggle"
      side="top"
    >
      <button
        type="button"
        className={styles.iconBtn}
        onClick={onClick}
        aria-label={minimized ? "Expand resources" : "Minimize resources"}
        // aria-pressed reflects the minimized state — pressed=true when
        // minimized; the label conveys the transition direction.
        aria-pressed={minimized}
      >
        <EnlargeIcon />
      </button>
    </Tooltip>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// All inline SVGs from the handoff's icon set (rn-shared.jsx — Lucide-family
// 24×24, ~2px stroke). aria-hidden; stroked with currentColor so the parent
// CSS controls color. Sizing comes from the CSS module's svg rules.

/** Pencil — the add/edit-notes affordance. */
function PencilIcon(): ReactNode {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

/** Diagonal out-arrows — expand / open-full-card / toggle affordance. */
function EnlargeIcon(): ReactNode {
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
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

/** "+" glyph for the dashed add-resource row. */
function PlusIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Notecard glyph — the honey poster fallback for a notes-only card. */
function NotecardIcon(): ReactNode {
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
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  );
}

/** Type glyph centered in a compact row's 30px tinted icon tile. */
function RowTypeIcon({ type }: { type: SectionResource["type"] }): ReactNode {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15.2V8.8L15.2 12z" />
        </svg>
      );
    case "slides":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M12 17v4M8 21h8" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      );
    case "website":
    case "link":
    default:
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
      );
  }
}
