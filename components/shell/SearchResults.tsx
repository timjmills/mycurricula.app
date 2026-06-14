"use client";

// SearchResults.tsx — top-bar search overlay (W4-D2 frontend).
//
// A portal-rendered dropdown anchored under the top-bar search input. It is
// the visible companion to the W4-D2 backend in `lib/search-index.ts`:
//   1. `useSearchData()` bundles the four sources (lessons + standards +
//      resources + comments — comments is currently an empty array; see
//      "Comments deferral" in search-index.ts).
//   2. `searchEverything(query, filter, data)` returns ranked `SearchResult[]`.
//   3. This component renders those rows grouped by source, with a five-way
//      filter row (All · Lessons · Standards · Resources · Comments) at the
//      top.
//
// Anchoring (mirrored from NotificationBell.tsx):
//   The panel uses createPortal to document.body so it escapes the top bar's
//   `overflow-x: clip`. Position is computed from the input's
//   getBoundingClientRect() each open, then reflowed on resize/scroll.
//
// Open contract:
//   The panel is "open" when the parent passes `anchorRef.current` AND
//   `query.trim() !== ""` AND the user has not just dismissed it. Dismissal
//   happens via:
//     • Click outside the panel + input → close (Escape-free path).
//     • Escape key → close + clear the query (parent prop).
//     • Click a result row → router.push(link), close, clear the query.
//
// Comments group:
//   The comments source is stubbed empty in W4-D2 (see lib/search-index.ts).
//   When the active filter is "All" or "Comments" we still render a Comments
//   section header followed by a <FutureControl> button explaining when the
//   feature lands — so the filter pill itself never looks broken. The
//   <FutureControl> primitive is the canonical "coming after beta" treatment
//   (CLAUDE.md §4; FutureControl.tsx header).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EmptyState, FutureControl, ToggleGroup } from "@/components/ui";
import { ResourceTypeIcon } from "@/components/year/resource-icons";
import {
  searchEverything,
  useSearchData,
  type SearchFilter,
  type SearchResult,
  type SearchSource,
} from "@/lib/search-index";
import { SUBJECT_BY_ID } from "@/lib/mock/subjects";
import type { LessonResource, SubjectId } from "@/lib/types";
import styles from "./SearchResults.module.css";

// ── Position calculation ─────────────────────────────────────────────────
// The panel anchors under the search input, left-aligned to the input's left
// edge. It clamps into the viewport so it never sails off the right edge on
// a narrow screen.

const GAP = 6; // px between input and panel
const PANEL_WIDTH = 420; // mirrored from .panel width in module CSS
const VIEWPORT_MARGIN = 8;

interface PanelPlacement {
  top: number;
  left: number;
  width: number;
}

function computePlacement(rect: DOMRect): PanelPlacement {
  const vw = window.innerWidth;
  // Try to right-align under the input so the panel hangs leftward off the
  // input's right edge — keeps the panel close to where the cursor is and
  // matches the visual rhythm of NotificationBell. Clamp into viewport on
  // both edges.
  const desiredWidth = Math.min(PANEL_WIDTH, vw - VIEWPORT_MARGIN * 2);
  let left = rect.right - desiredWidth;
  left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(left, vw - desiredWidth - VIEWPORT_MARGIN),
  );
  return {
    top: rect.bottom + GAP,
    left,
    width: desiredWidth,
  };
}

// ── Public props ─────────────────────────────────────────────────────────

export interface SearchResultsProps {
  /** The current query, sourced from useAppState().search. */
  query: string;
  /** Ref to the search input so the panel can anchor + click-outside ignore it. */
  anchorRef: RefObject<HTMLInputElement | null>;
  /**
   * Called when the user dismisses the panel via Escape OR by clicking a
   * result row. The TopBar uses this to clear the query (which also collapses
   * the input on the next blur). Click-outside does NOT call this — the
   * teacher might want to come back and refine.
   */
  onDismiss: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function SearchResults({
  query,
  anchorRef,
  onDismiss,
}: SearchResultsProps): ReactNode {
  const router = useRouter();
  const data = useSearchData();

  // SSR safety — createPortal needs a real document. Mirror the gate used in
  // NotificationBell: render nothing on the server pass, then flip on after
  // useEffect runs so the portal target is guaranteed to exist.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Local filter state — null === "All".
  const [filter, setFilter] = useState<SearchSource | null>(null);

  // User-dismissed-this-query state. The panel reopens whenever the query
  // changes (the teacher is typing again); clicking outside dismisses it
  // until the next keystroke. Without this latch, the panel would pop back
  // open if the user clicked outside and then refocused the input.
  const [dismissedForQuery, setDismissedForQuery] = useState<string | null>(
    null,
  );
  useEffect(() => {
    // Reset the dismissal latch when the query changes — every new keystroke
    // means the teacher wants results again.
    setDismissedForQuery(null);
  }, [query]);

  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trim once — every downstream check uses the trimmed query.
  const trimmedQuery = query.trim();
  const isOpen =
    mounted && trimmedQuery !== "" && dismissedForQuery !== trimmedQuery;

  // ── Compute results ───────────────────────────────────────────────────
  // searchEverything is a pure function; useMemo is the right level of
  // caching. The filter state participates so changing chips re-runs the
  // engine (which short-circuits other sources internally — cheap).
  const filterObj = useMemo<SearchFilter>(
    () => ({ source: filter }),
    [filter],
  );
  const results = useMemo<SearchResult[]>(
    () => (isOpen ? searchEverything(trimmedQuery, filterObj, data) : []),
    [isOpen, trimmedQuery, filterObj, data],
  );

  // Group results by source so we can render them as labelled sections.
  // Order is fixed (lesson → standard → resource → comment) so the panel's
  // visual rhythm stays consistent regardless of which source produced hits.
  const grouped = useMemo(() => {
    const out: Record<SearchSource, SearchResult[]> = {
      lesson: [],
      standard: [],
      resource: [],
      comment: [],
    };
    for (const r of results) out[r.source].push(r);
    return out;
  }, [results]);

  // ── Placement ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setPlacement(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPlacement(computePlacement(anchor.getBoundingClientRect()));
  }, [isOpen, anchorRef]);

  // Reposition on viewport changes while open.
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setPlacement(computePlacement(anchor.getBoundingClientRect()));
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, anchorRef]);

  // ── Click-outside close ───────────────────────────────────────────────
  // Uses mousedown so the close fires before any would-be click target
  // receives focus — matches the SchedulePanel / NotificationBell pattern.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      setDismissedForQuery(trimmedQuery);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [isOpen, anchorRef, trimmedQuery]);

  // ── Escape closes + clears query ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onDismiss]);

  // ── Row click → route + dismiss ───────────────────────────────────────
  const handleResultClick = useCallback(
    (result: SearchResult) => {
      router.push(result.link);
      onDismiss();
    },
    [router, onDismiss],
  );

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const totalLiveResults = results.length;
  // Whether to render the Comments "coming after beta" stand-in. Only when
  // the active filter shows the comments group AND no comment hits landed.
  const showCommentsStandIn =
    (filter === null || filter === "comment") &&
    grouped.comment.length === 0;
  // "No matches anywhere" only fires when EVERY source bucket is empty AND
  // we're not surfacing the comments stand-in (because that counts as
  // something to show the teacher).
  const isCompletelyEmpty =
    totalLiveResults === 0 &&
    (filter === "lesson" ||
      filter === "standard" ||
      filter === "resource" ||
      (filter === null && !showCommentsStandIn));

  const positionStyle: CSSProperties =
    placement !== null
      ? {
          top: placement.top,
          left: placement.left,
          width: placement.width,
        }
      : { top: -9999, left: -9999, opacity: 0 };

  return createPortal(
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Search results"
      className={styles.panel}
      style={positionStyle}
      // Stop mousedown from bubbling to the click-outside handler.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Filter row ────────────────────────────────────────────────── */}
      <div className={styles.filterRow}>
        <ToggleGroup<"all" | SearchSource>
          options={[
            {
              value: "all",
              label: "All",
              title: "Show results from every source",
            },
            {
              value: "lesson",
              label: "Lessons",
              title: "Only lesson titles, objectives, and subjects",
            },
            {
              value: "standard",
              label: "Standards",
              title: "Only CCSS codes and descriptions",
            },
            {
              value: "resource",
              label: "Resources",
              title: "Only attached resources — slides, docs, PDFs, links",
            },
            {
              value: "comment",
              label: "Comments",
              title:
                "Only team comments — coming after beta when the comments store ships",
            },
          ]}
          value={filter ?? "all"}
          onChange={(next) => setFilter(next === "all" ? null : next)}
          variant="subtle"
          size="sm"
          ariaLabel="Filter search results by source"
        />
      </div>

      {/* ── Result body ──────────────────────────────────────────────── */}
      <div className={styles.body}>
        {isCompletelyEmpty ? (
          <EmptyState
            size="sm"
            heading="No matches"
            body="Try shorter terms or check spelling."
          />
        ) : (
          <>
            {(filter === null || filter === "lesson") &&
              grouped.lesson.length > 0 && (
                <SearchGroup
                  label="Lessons"
                  count={grouped.lesson.length}
                  results={grouped.lesson}
                  onResultClick={handleResultClick}
                />
              )}
            {(filter === null || filter === "standard") &&
              grouped.standard.length > 0 && (
                <SearchGroup
                  label="Standards"
                  count={grouped.standard.length}
                  results={grouped.standard}
                  onResultClick={handleResultClick}
                />
              )}
            {(filter === null || filter === "resource") &&
              grouped.resource.length > 0 && (
                <SearchGroup
                  label="Resources"
                  count={grouped.resource.length}
                  results={grouped.resource}
                  onResultClick={handleResultClick}
                />
              )}
            {showCommentsStandIn && (
              <section className={styles.group} aria-label="Comments">
                <header className={styles.groupHeader}>
                  <span className={styles.groupLabel}>Comments</span>
                </header>
                <div className={styles.commentsStandIn}>
                  <FutureControl
                    label="Comments search — coming after beta"
                    tooltip="Lesson + Unit Comments will become searchable when the comments document store ships (Phase 1B alongside Supabase)."
                    variant="ghost"
                    size="sm"
                    tooltipSide="top"
                  />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Group section ────────────────────────────────────────────────────────

interface SearchGroupProps {
  label: string;
  count: number;
  results: SearchResult[];
  onResultClick: (result: SearchResult) => void;
}

function SearchGroup({
  label,
  count,
  results,
  onResultClick,
}: SearchGroupProps): ReactNode {
  return (
    <section className={styles.group} aria-label={label}>
      <header className={styles.groupHeader}>
        <span className={styles.groupLabel}>{label}</span>
        <span className={styles.groupCount}>{count}</span>
      </header>
      <div className={styles.rowList} role="presentation">
        {results.map((result) => (
          <SearchResultRow
            key={result.id}
            result={result}
            onClick={() => onResultClick(result)}
          />
        ))}
      </div>
    </section>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

interface SearchResultRowProps {
  result: SearchResult;
  onClick: () => void;
}

function SearchResultRow({
  result,
  onClick,
}: SearchResultRowProps): ReactNode {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  // Snippet is already truncated by the engine, but we cap once more at 80
  // chars per the W4-D2 brief so dropdown rows stay single-paragraph tidy.
  const snippet = result.snippet
    ? truncateAt(result.snippet, 80)
    : undefined;
  return (
    <div
      role="option"
      tabIndex={0}
      aria-selected="false"
      className={styles.row}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.rowIcon} aria-hidden="true">
        <RowIcon result={result} />
      </span>
      <div className={styles.rowBody}>
        <span className={styles.rowTitle}>{result.title}</span>
        <span className={styles.rowBreadcrumb}>{result.breadcrumb}</span>
        {snippet && <span className={styles.rowSnippet}>{snippet}</span>}
      </div>
    </div>
  );
}

function truncateAt(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

// ── Row icon ─────────────────────────────────────────────────────────────
// One icon per source. Lessons get a subject monogram tinted via .cp-subj;
// standards get a code-tag glyph; resources get the ResourceTypeIcon (uses
// the resource's provider/type — we synthesize a minimal LessonResource
// shape from what the engine stashed in the result row); comments get a
// chat-bubble.

function RowIcon({ result }: { result: SearchResult }): ReactNode {
  if (result.source === "lesson") {
    const subjectId = result.subjectId as SubjectId | undefined;
    const subject = subjectId ? SUBJECT_BY_ID[subjectId] : undefined;
    const monogram = subject?.icon ?? "L";
    // The .cp-subj.<subjectId> class drives the subject color tinting per
    // CLAUDE.md §4 — never hard-code a subject color.
    return (
      <span
        className={`cp-subj ${subjectId ?? ""} ${styles.subjectChip}`}
        aria-hidden="true"
      >
        {monogram}
      </span>
    );
  }
  if (result.source === "standard") {
    return <StandardTagIcon />;
  }
  if (result.source === "resource") {
    // We don't have the original LessonResource here — the engine flattened
    // it down to the SearchResult shape. Reconstruct just enough of the
    // LessonResource contract so ResourceTypeIcon can pick a glyph from the
    // result's matchedField + snippet. matchedField tells us what tripped
    // the match; the engine indexes provider + type + mimeType + label, so
    // when it WAS the provider/type we can resurface it here.
    // Fallback path: a generic file icon (ResourceTypeIcon's default).
    const synth: LessonResource = {
      // Minimum LessonResource: label + type (required); provider is
      // optional. We don't have access to the original — pass no provider so
      // the icon falls through to its type-based mapping. Result rows carry
      // no first-class `type` field, but the engine builds resource
      // breadcrumbs as "<subject> · Week <n> · <type>"; we extract the
      // trailing token for richer iconing.
      label: result.title,
      type: extractResourceTypeFromBreadcrumb(result.breadcrumb),
    };
    return (
      <span className={styles.resourceIcon} aria-hidden="true">
        <ResourceTypeIcon resource={synth} />
      </span>
    );
  }
  // comment
  return <CommentBubbleIcon />;
}

/** The engine's resource breadcrumb is "<subject> · Week <n> · <type>" — pull
 *  the trailing type token so ResourceTypeIcon can pick the right glyph. */
function extractResourceTypeFromBreadcrumb(
  breadcrumb: string,
): LessonResource["type"] {
  const tail = breadcrumb.split(" · ").slice(-1)[0]?.trim() ?? "";
  // Whitelist against the LessonResource["type"] union — anything else falls
  // through to the engine's default "file" treatment via the cast.
  const known = [
    "pdf",
    "doc",
    "slides",
    "image",
    "youtube",
    "website",
    "link",
    "file",
  ] as const;
  return (known as readonly string[]).includes(tail)
    ? (tail as LessonResource["type"])
    : ("file" as LessonResource["type"]);
}

function StandardTagIcon(): ReactNode {
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
      {/* Tag silhouette */}
      <path d="M20.59 13.41 13 21a2 2 0 0 1-2.83 0L3 13.83V3h10.83Z" />
      <circle cx="7.5" cy="7.5" r="1.25" />
    </svg>
  );
}

function CommentBubbleIcon(): ReactNode {
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
