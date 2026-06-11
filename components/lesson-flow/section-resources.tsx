"use client";

// section-resources.tsx — per-section Resources area with EXPANDED ⇄ MINIMIZED
// toggle (docs/historical/5.20.26 Plugin Directions §4).
//
// Each section row gets its own resources card. The card has two states and
// the teacher flips between them with a small icon button at its top-right:
//
//   EXPANDED (§4.2) — a Reference-A card:
//     • "RESOURCES" header label + minimize toggle.
//     • Primary 2×2 grid of colored thumbnail cards (large icon + truncated
//       title). The first FOUR resources in the section's pool populate the
//       grid; specific spec fills (purple / teal / green / peach) per
//       position. If fewer than four are available the missing slots simply
//       don't render — no placeholder card.
//     • "+ Add resource" centered link.
//     • "More resources" sub-panel — a stacked list of the remaining
//       resources (icon + title + colored TYPE PILL on the right) with a
//       "Show more v" affordance.
//
//   MINIMIZED (§4.3) — a "Resource quick access" card:
//     • Paperclip icon + label header + expand toggle.
//     • One row per resource — a colored 22×22 type icon square on the
//       left, the title + URL preview in the middle, and a TYPE PILL on
//       the right. 1px ink-100 dividers between rows.
//     • Footer: "+ Add quick resource" link on a 1px dashed top border.
//
// State persistence (spec §4.1 / acceptance §10):
//   The expanded ⇄ minimized state is stored per `(lessonId, sectionId)` in
//   `localStorage` under the key `myc:resources-minimized:v1`. SSR-safe:
//   we never touch `localStorage` during the initial render (the SSR pass
//   defaults to expanded), then a `useEffect` reads the persisted value on
//   mount and hydrates the actual state. This avoids hydration mismatch.
//   The same effect wires a `storage` listener so a tab-to-tab toggle stays
//   in sync.
//
// Hard rules (spec / task brief):
//   • EXACT HEX values per spec §4.2 for the 4 primary card fills.
//   • EXACT HEX values per spec §4.3 for the minimized icon-square colors.
//   • ALL other color/type/spacing via var(--token).
//   • ≥44px tap targets on primary actions, WCAG AA contrast, full keyboard
//     access, prefers-reduced-motion honored via the CSS module.

import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useId, useState } from "react";
import type { LessonResource } from "@/lib/types";
import type { SectionResource } from "@/lib/lesson-flow";
import { Button, FutureControl, Tooltip } from "@/components/ui";
import { ResourceEmbed, ResourcePreview } from "@/components/resources";
import { NotecardCard } from "@/components/notecards";
import { hasNotes, isNotecard } from "@/lib/notecards";
import { ResourceTypePill } from "./resource-type-pill";
import styles from "./section-resources.module.css";

/** True when a resource should render as a notecard (flip gallery + notes)
 *  rather than a plain thumbnail: a dedicated notecard, anything with a
 *  gallery, or anything with rich notes. */
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
  /** The resources to surface in this section's panel, in display order. */
  resources: SectionResource[];
  /** Fire the shared ResourceComposer to add a new resource to this section.
   *  Optional — when undefined the "+ Add" affordances render disabled. */
  onAdd?: () => void;
  /** Open the composer to add / edit notes (a body + extra gallery) on one of
   *  this section's resources. Optional — when undefined the note affordance
   *  is hidden. */
  onEditNote?: (resource: SectionResource) => void;
}

// ── Spec §4.2 — primary 2×2 card fills (EXACT HEX VALUES) ───────────────
// The four slot fills per Reference A's Section 1 expanded card. They are
// keyed by SLOT INDEX (0..3), not by resource type — the spec assigns each
// position its own pastel regardless of the resource it carries. The first
// resource lands in slot 0 (soft purple), the second in slot 1 (soft teal),
// etc. Beyond slot 3 resources fall through to the "More resources" list.
const PRIMARY_SLOT_FILLS: ReadonlyArray<string> = [
  "#f3e8ff", // soft purple — slot 1
  "#ccfbf1", // soft teal   — slot 2
  "#dcfce7", // soft green  — slot 3
  "#fed7aa", // soft peach  — slot 4
];

// ── SectionResources ─────────────────────────────────────────────────────

/** Per-section resources area: expanded thumbnail grid OR minimized list,
 *  with a top-right toggle and per-(lesson,section) persistence. */
export const SectionResources = memo(function SectionResources({
  lessonId,
  sectionId,
  resources,
  onAdd,
  onEditNote,
}: SectionResourcesProps): ReactNode {
  // Persistence key combining lesson + section ids.
  const storageKey = `${lessonId}:${sectionId}`;

  // The resource currently open in the shared click-to-enlarge modal (a tile
  // click or a notecard's enlarge/fullscreen affordance), or null when closed.
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

  // Notecard resources (gallery + notes) render as full NotecardCards at the
  // top of the card; plain single-media resources keep the spec's 2×2 / list
  // layout below. Order within each bucket is preserved.
  const notecards = resources.filter((r) => isNotecardish(r));
  const plain = resources.filter((r) => !isNotecardish(r));

  // Split the PLAIN pool into the primary 2×2 grid (first 4) and the
  // "More resources" tail (everything else).
  const primary = plain.slice(0, 4);
  const more = plain.slice(4);

  // A stable id for ARIA wiring (header → body section).
  const bodyId = useId();

  // The notecard strip — shared between the expanded + minimized states. Each
  // card's enlarge / fullscreen opens the shared preview (notecard split view).
  const notecardStrip =
    notecards.length > 0 ? (
      <div className={styles.notecardStrip}>
        {notecards.map((res) => (
          <div key={res.id} className={styles.notecardItem}>
            <NotecardCard
              resource={res}
              onEnlarge={() => setPreviewResource(res)}
              onOpenFullscreen={() => setPreviewResource(res)}
            />
            {onEditNote && (
              <div className={styles.notecardActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditNote(res)}
                  tooltip="Edit this card's notes or add more media — opens the note editor"
                >
                  Edit note
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    ) : null;

  // The shared enlarge modal — mounted once, opened from any tile / notecard.
  const preview = previewResource ? (
    <ResourcePreview
      resource={previewResource}
      onClose={() => setPreviewResource(null)}
    />
  ) : null;

  // ── Minimized state — "Resource quick access" card ──────────────────
  if (minimized) {
    return (
      <section
        className={styles.card}
        aria-labelledby={`${bodyId}-mini-header`}
      >
        <header className={styles.miniHeader}>
          <span className={styles.miniHeaderIcon} aria-hidden="true">
            <PaperclipIcon />
          </span>
          <h3 id={`${bodyId}-mini-header`} className={styles.miniHeaderLabel}>
            Resource quick access
          </h3>
          <ToggleButton minimized={true} onClick={toggle} />
        </header>

        {/* Notecards first (full cards with flip gallery + notes). */}
        {notecardStrip}

        {/* List rows — one per PLAIN resource. The 22×22 icon square uses the
            per-type fill from spec §4.3 (exact hex). */}
        {plain.length > 0 ? (
          <ul
            id={bodyId}
            className={styles.miniList}
            aria-label="Resources for this section"
          >
            {plain.map((res) => (
              <MinimizedRow
                key={res.id}
                resource={res}
                onActivate={() => setPreviewResource(res)}
                onEditNote={onEditNote ? () => onEditNote(res) : undefined}
              />
            ))}
          </ul>
        ) : notecards.length === 0 ? (
          <p className={styles.miniEmpty}>No resources yet.</p>
        ) : null}

        {/* Footer — "+ Add quick resource". The dashed top border lives in
            CSS, not as a separate <hr>, so it tracks the card's padding. */}
        <Button
          variant="ghost"
          size="sm"
          className={styles.miniAddBtn}
          onClick={onAdd}
          disabled={!onAdd}
          aria-label="Add a quick resource to this section"
          tooltip="Attach a quick link, file, or video to this section — students see it on the published lesson"
          leadingIcon={<PlusGlyph />}
        >
          Add quick resource
        </Button>
        {preview}
      </section>
    );
  }

  // ── Expanded state — 2×2 grid + "More resources" list ──────────────
  return (
    <section className={styles.card} aria-labelledby={`${bodyId}-header`}>
      <header className={styles.expandedHeader}>
        <h3 id={`${bodyId}-header`} className={styles.expandedHeaderLabel}>
          Resources
        </h3>
        <ToggleButton minimized={false} onClick={toggle} />
      </header>

      {/* Notecards first (full cards with flip gallery + notes). */}
      {notecardStrip}

      {/* Primary 2×2 grid of PLAIN resources. Missing slots simply don't
          render — we never paint empty placeholder cards (the spec only
          describes the four populated slots; quieter to omit unfilled ones). */}
      {primary.length > 0 && (
        <div
          id={bodyId}
          className={styles.primaryGrid}
          role="list"
          aria-label="Primary resources"
        >
          {primary.map((res, idx) => (
            <PrimaryCard
              key={res.id}
              resource={res}
              fill={PRIMARY_SLOT_FILLS[idx] ?? PRIMARY_SLOT_FILLS[0]}
              onActivate={() => setPreviewResource(res)}
              onEditNote={onEditNote ? () => onEditNote(res) : undefined}
            />
          ))}
        </div>
      )}

      {/* Centered "+ Add resource" link beneath the grid. */}
      <Button
        variant="ghost"
        size="sm"
        className={styles.expandedAddBtn}
        onClick={onAdd}
        disabled={!onAdd}
        aria-label="Add a resource to this section"
        tooltip="Attach a link, file, video, or doc to this section — opens the resource picker"
        leadingIcon={<PlusGlyph />}
      >
        Add resource
      </Button>

      {/* "More resources" sub-panel — only mounted when there are extras. */}
      {more.length > 0 && (
        <div className={styles.moreSection}>
          <h4 className={styles.moreHeaderLabel}>More resources</h4>
          <ul className={styles.moreList} aria-label="More resources">
            {more.map((res) => (
              <MoreRow
                key={res.id}
                resource={res}
                onActivate={() => setPreviewResource(res)}
                onEditNote={onEditNote ? () => onEditNote(res) : undefined}
              />
            ))}
          </ul>
          {/* "Show more" — placeholder for Phase 1A (the "more" list is
              already fully visible). FutureControl gives it the canonical
              "coming after beta" treatment so it never reads as a broken
              live button. */}
          <FutureControl
            label="Show more"
            trailingIcon={<ShowMoreChevron />}
            tooltip="Show more — coming after beta. Will paginate the resource list when sections grow long."
            className={styles.showMoreBtn}
          />
        </div>
      )}
      {preview}
    </section>
  );
});

// ── PrimaryCard — one of the 4 colored 2×2 grid cards ───────────────────

function PrimaryCard({
  resource,
  fill,
  onActivate,
  onEditNote,
}: {
  resource: SectionResource;
  fill: string;
  /** Open this resource in the shared enlarge preview. */
  onActivate?: () => void;
  /** Open the composer to add / edit notes on this resource. */
  onEditNote?: () => void;
}): ReactNode {
  // A small "note" affordance pinned to the card corner (when wired). Stops
  // propagation so it never also triggers the card's enlarge.
  const noteBtn = onEditNote ? (
    <Tooltip
      content="Add formatted notes or extra media to this resource — opens the note editor"
      side="top"
    >
      <button
        type="button"
        className={styles.noteChip}
        onClick={(e) => {
          e.stopPropagation();
          onEditNote();
        }}
        aria-label={`Add or edit notes for ${resource.label}`}
      >
        <NoteGlyph />
      </button>
    </Tooltip>
  ) : null;

  // When a real URL is attached, the embed primitive owns the card interior —
  // the colored card chrome (the §4.2 fill) still wraps it so the slot color
  // stays load-bearing. We pass onClick to the embed so a click opens the
  // unified ResourcePreview (instead of the per-type lightbox). Otherwise we
  // fall back to the synthetic glyph render in a button that opens the preview.
  if (resource.url) {
    return (
      <article
        className={styles.primaryCard}
        style={{ background: fill }}
        role="listitem"
      >
        <ResourceEmbed
          resource={resource}
          variant="tile"
          onClick={onActivate}
        />
        {noteBtn}
      </article>
    );
  }
  return (
    <article
      className={styles.primaryCard}
      // Inline `background` carries the spec's exact hex fill — this is the
      // only place the slot color is applied, so a teacher cannot accidentally
      // reorder it via CSS. The inline style is the SOURCE OF TRUTH for the
      // §4.2 colors.
      style={{ background: fill }}
      role="listitem"
    >
      <button
        type="button"
        className={styles.primaryCardButton}
        onClick={onActivate}
        disabled={!onActivate}
        aria-label={`Open ${resource.label}`}
      >
        <span className={styles.primaryCardIcon} aria-hidden="true">
          <PrimaryCardIcon type={resource.type} />
        </span>
        <span className={styles.primaryCardTitle}>{resource.label}</span>
      </button>
      {noteBtn}
    </article>
  );
}

// ── MoreRow — one row of the "More resources" sub-panel ─────────────────
// The icon + title form a button that opens the shared enlarge preview; the
// type pill and an optional "note" chip sit alongside.

function MoreRow({
  resource,
  onActivate,
  onEditNote,
}: {
  resource: SectionResource;
  onActivate?: () => void;
  onEditNote?: () => void;
}): ReactNode {
  return (
    <li className={styles.moreRow}>
      <button
        type="button"
        className={styles.moreRowMain}
        onClick={onActivate}
        disabled={!onActivate}
        aria-label={`Open ${resource.label}`}
      >
        {resource.url ? (
          <span className={styles.moreRowIcon}>
            <ResourceEmbed resource={resource} variant="row" />
          </span>
        ) : (
          <span className={styles.moreRowIcon} aria-hidden="true">
            <MoreRowIcon type={resource.type} />
          </span>
        )}
        <span className={styles.moreRowTitle}>{resource.label}</span>
      </button>
      <ResourceTypePill type={resource.type} />
      {onEditNote && <RowNoteButton resource={resource} onClick={onEditNote} />}
    </li>
  );
}

// ── MinimizedRow — one row of the "Resource quick access" list ──────────

function MinimizedRow({
  resource,
  onActivate,
  onEditNote,
}: {
  resource: SectionResource;
  onActivate?: () => void;
  onEditNote?: () => void;
}): ReactNode {
  return (
    <li className={styles.miniRow}>
      <button
        type="button"
        className={styles.miniRowMain}
        onClick={onActivate}
        disabled={!onActivate}
        aria-label={`Open ${resource.label}`}
      >
        {resource.url ? (
          <span
            className={styles.miniRowIconSquare}
            data-kind={miniKindFor(resource.type)}
          >
            <ResourceEmbed resource={resource} variant="row" />
          </span>
        ) : (
          <span
            className={styles.miniRowIconSquare}
            data-kind={miniKindFor(resource.type)}
            aria-hidden="true"
          >
            <MiniRowIcon type={resource.type} />
          </span>
        )}
        <span className={styles.miniRowStack}>
          <span className={styles.miniRowTitle}>{resource.label}</span>
          <span className={styles.miniRowSubtitle}>
            {resource.url
              ? realHostname(resource.url)
              : urlPreviewFor(resource)}
          </span>
        </span>
      </button>
      <ResourceTypePill type={resource.type} />
      {onEditNote && <RowNoteButton resource={resource} onClick={onEditNote} />}
    </li>
  );
}

// ── RowNoteButton — the "add/edit note" chip shared by the list rows ────────

function RowNoteButton({
  resource,
  onClick,
}: {
  resource: SectionResource;
  onClick: () => void;
}): ReactNode {
  return (
    <Tooltip
      content="Add formatted notes or extra media to this resource — opens the note editor"
      side="left"
    >
      <button
        type="button"
        className={styles.noteChip}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={`Add or edit notes for ${resource.label}`}
      >
        <NoteGlyph />
      </button>
    </Tooltip>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** The 4 minimized icon-square colorways from spec §4.3. The kind maps a
 *  stored resource type to the corresponding square fill (video/docx/pdf/
 *  link). Other types fall through to LINK styling per spec. */
type MiniKind = "video" | "docx" | "pdf" | "link";

function miniKindFor(type: SectionResource["type"]): MiniKind {
  switch (type) {
    case "youtube":
      return "video";
    case "doc":
      return "docx";
    case "pdf":
      return "pdf";
    case "website":
    case "link":
    default:
      return "link";
  }
}

/** Build a quick URL/source preview for the minimized row's subtitle. The
 *  prototype's `SectionResource` doesn't carry a URL, so we synthesize a
 *  source string from the type (mirrors the spec's seed data examples:
 *  "youtube.com/watch?v=…", "drive.google.com/…"). */
function urlPreviewFor(res: SectionResource): string {
  switch (res.type) {
    case "youtube":
      return "youtube.com/watch?v=…";
    case "doc":
      return "drive.google.com/…";
    case "pdf":
      return "drive.google.com/…";
    case "slides":
      return "docs.google.com/presentation/…";
    case "image":
      return "drive.google.com/…";
    case "website":
      return "example.com";
    case "link":
    default:
      return "linked resource";
  }
}

/** Extract the bare hostname from a real URL for the minimized row's subtitle.
 *  Strips a leading `www.` so the line reads cleanly. Falls back to the
 *  synthetic link-preview string if the URL fails to parse. */
function realHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return urlPreviewFor({ type: "link" } as SectionResource);
  }
}

// ── ToggleButton — the expanded/minimized swap control ──────────────────
// Button variant="icon" carries the touch target, focus ring, and disabled
// state. aria-pressed passes through {...rest} to the native <button>.

function ToggleButton({
  minimized,
  onClick,
}: {
  minimized: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <Button
      variant="icon"
      size="sm"
      className={styles.toggleBtn}
      onClick={onClick}
      iconAriaLabel={minimized ? "Expand resources" : "Minimize resources"}
      tooltip={
        minimized
          ? "Switch to the full 2x2 resource grid for this section"
          : "Switch to the compact quick-access list — useful when the lesson body is the focus"
      }
      // Spec §4.1: aria-pressed reflects the minimized state — pressed=true
      // when minimized; the label and glyph convey the transition direction.
      aria-pressed={minimized}
    >
      {minimized ? <ExpandGlyph /> : <MinimizeGlyph />}
    </Button>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// All small inline SVGs, aria-hidden. Stroked with currentColor so the parent
// CSS controls color.

/** Two arrows pointing inward — minimize affordance. */
function MinimizeGlyph(): ReactNode {
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
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/** Two arrows pointing outward — expand affordance. */
function ExpandGlyph(): ReactNode {
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
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/** "+" glyph used in both "Add resource" affordances. */
function PlusGlyph(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/** Note / pencil-on-card glyph for the "add/edit note" affordance. */
function NoteGlyph(): ReactNode {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** Paperclip — the minimized header's lead-in glyph. */
function PaperclipIcon(): ReactNode {
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
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/** Chevron used by "Show more". Points DOWN. */
function ShowMoreChevron(): ReactNode {
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** The LARGE icon centered on each primary card. Three glyphs are used per
 *  spec §4.2 (play / paperclip / document); the resource type drives which. */
function PrimaryCardIcon({
  type,
}: {
  type: SectionResource["type"];
}): ReactNode {
  // Spec §4.2 explicitly pairs slot icons with the seed resources. We resolve
  // by type so a swap of seed data still picks the right glyph:
  //   youtube       → play
  //   slides/doc/pdf → document
  //   link/website  → paperclip
  //   image         → paperclip (fallback — no image glyph in the spec)
  switch (type) {
    case "youtube":
      return (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          {/* Solid play triangle on a circle backdrop. */}
          <circle cx="12" cy="12" r="11" fillOpacity="0" />
          <polygon points="9 6 19 12 9 18" />
        </svg>
      );
    case "slides":
    case "pdf":
    case "doc":
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
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
    case "website":
    case "link":
    default:
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      );
  }
}

/** 16px neutral-gray icon used in the "More resources" rows (spec §4.2). */
function MoreRowIcon({ type }: { type: SectionResource["type"] }): ReactNode {
  switch (type) {
    case "youtube":
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
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
      );
    case "pdf":
    case "doc":
    case "slides":
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
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "image":
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
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "website":
    case "link":
    default:
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
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

/** Icon centered inside the minimized row's 22×22 colored square (spec §4.3).
 *  Stroke color comes from the CSS module per `data-kind`, so this just
 *  renders the glyph outline; the square supplies the color. */
function MiniRowIcon({ type }: { type: SectionResource["type"] }): ReactNode {
  // Stroke is currentColor; the square's CSS sets `color` per data-kind so
  // the glyph picks up the spec's stroke color (e.g. #db2777 for video).
  switch (type) {
    case "youtube":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          {/* Filled play triangle — the YouTube tell at small size. */}
          <polygon points="6 4 20 12 6 20" />
        </svg>
      );
    case "doc":
    case "pdf":
    case "slides":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "image":
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "website":
    case "link":
    default:
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
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
