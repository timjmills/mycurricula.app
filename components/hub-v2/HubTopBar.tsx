"use client";

// HubTopBar.tsx — the Planner Hub's hub-LOCAL sub-bar (Wave 8).
//
// Deliberately NOT the chrome bar: Back and the Personal/Team ModeSwitch live
// in the chrome ImmersiveBar (ChromeShell owns them). This bar carries only
// what belongs to the hub itself: the wordmark, a global search over the
// catalog, an autosave indicator, and a recents popover. The appearance gear
// is dropped entirely — the hub consumes the app's shared theme context, it
// does not fork a local appearance.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { searchEverything, useSearchData } from "@/lib/search-index";
import type { SearchResult } from "@/lib/search-index";
import { usePlanner } from "@/lib/planner-store";
import { stripHtml } from "@/lib/html-text";
import { useRecents, clearRecents } from "@/lib/hub-recents";
import { Tooltip } from "@/components/ui";
import type { SubjectId } from "@/lib/types";
import type { HubOpenDoc } from "./types";
import styles from "./hub.module.css";

export interface HubTopBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onOpenDoc: (doc: HubOpenDoc) => void;
}

function SearchIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function ClockIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function CheckIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function PlannerGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

export function HubTopBar({
  query,
  onQueryChange,
  onOpenDoc,
}: HubTopBarProps): ReactNode {
  const searchData = useSearchData();
  const { subjectById, lessons, units } = usePlanner();
  const allRecents = useRecents();

  // Purge recents whose target no longer exists / was archived, so a stale
  // entry can't open a blank doc (Codex W8 R3). Lessons: must be present +
  // not archived. Units: must exist for that subject (slugs are per-subject).
  const recents = useMemo(() => {
    const liveLesson = new Set(
      lessons.filter((l) => !l.archived).map((l) => l.id),
    );
    const liveUnit = new Set(units.map((u) => `${u.subject}:${u.id}`));
    return allRecents.filter((r) =>
      r.kind === "lesson"
        ? liveLesson.has(r.id)
        : liveUnit.has(`${r.sid}:${r.id}`),
    );
  }, [allRecents, lessons, units]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const recentRef = useRef<HTMLDivElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Lessons are the only document the hub opens, so the global search shows
  // ONLY lesson hits — surfacing standard/resource rows the hub can't open
  // would be a dead end (Codex W8 R1). The scoped engine query keeps it cheap.
  const results = useMemo<SearchResult[]>(() => {
    if (query.trim() === "") return [];
    return searchEverything(query, { source: "lesson" }, searchData).slice(0, 12);
  }, [query, searchData]);

  // Close popovers on outside click OR Escape (keyboard dismissal). Escape on
  // the search field returns focus there; on recents, to the clock trigger.
  useEffect(() => {
    if (!recentOpen && !searchFocused) return;
    function onDown(e: MouseEvent): void {
      const t = e.target as Node;
      if (recentRef.current && !recentRef.current.contains(t)) setRecentOpen(false);
      if (searchWrapRef.current && !searchWrapRef.current.contains(t)) {
        setSearchFocused(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      if (recentOpen) {
        setRecentOpen(false);
        recentRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
      if (searchFocused) {
        setSearchFocused(false);
        searchWrapRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [recentOpen, searchFocused]);

  function openLessonResult(r: SearchResult): void {
    // Results are lesson-source only (see `results` above), so every row opens
    // a LessonDoc. `SearchResult.id` is SOURCE-PREFIXED ("lesson:<lessonId>",
    // search-index.ts) — strip it, or the doc key doubles ("lesson:lesson:…")
    // and PlanPage can't resolve the lesson (opens a blank tab). Titles are
    // rich-text, so strip HTML for the tab/recents headline like every other
    // sink does.
    onOpenDoc({
      kind: "lesson",
      id: r.id.slice(r.source.length + 1),
      title: stripHtml(r.title),
      sid: r.subjectId ?? "",
    });
    onQueryChange("");
    setSearchFocused(false);
  }

  return (
    <div className={styles.top}>
      <div className={styles.ident}>
        <span className={styles.glyph}>
          <PlannerGlyph />
        </span>
        <span className={styles.wordmark}>Planner</span>
      </div>

      <div className={styles.spacer} />

      {/* Search */}
      <div
        className={styles.search}
        ref={searchWrapRef}
        onBlur={(e) => {
          // Close the results when focus leaves the search + results container
          // (e.g. Tab away) — not just on outside-click/Escape (Codex W8 R8).
          if (!searchWrapRef.current?.contains(e.relatedTarget as Node | null)) {
            setSearchFocused(false);
          }
        }}
      >
        <SearchIcon />
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          placeholder="Search lessons…"
          aria-label="Search lessons"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            onQueryChange(e.target.value);
            setSearchFocused(true);
          }}
          onFocus={() => setSearchFocused(true)}
        />
        {query !== "" && (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              onQueryChange("");
              setSearchFocused(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {searchFocused && results.length > 0 && (
          // Plain result list (not an ARIA combobox/listbox — see note): the
          // rows are ordinary Tab-reachable buttons. A labelled group names it.
          <div className={styles.searchPop} id={listId} role="group" aria-label="Search results">
            {results.map((r) => (
              <button
                key={`${r.source}:${r.id}`}
                type="button"
                className={styles.searchRow}
                onClick={() => openLessonResult(r)}
              >
                <span className={styles.searchRowTitle}>{stripHtml(r.title)}</span>
                <span className={styles.searchRowCrumb}>{r.breadcrumb}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Autosave — a static behaviour statement, not a per-save success claim
          (writes persist optimistically with no acknowledged-write signal). */}
      <Tooltip
        content="Your edits are saved automatically as you plan."
        side="bottom"
        tooltipId="hub-autosave"
      >
        <span className={styles.saved}>
          <CheckIcon />
          Autosaves
        </span>
      </Tooltip>

      {/* Recents */}
      <div className={styles.recentWrap} ref={recentRef}>
        <Tooltip content="Recently opened lessons and units" side="bottom" tooltipId="hub-recents">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Recently opened"
            aria-expanded={recentOpen}
            onClick={() => setRecentOpen((v) => !v)}
          >
            <ClockIcon />
          </button>
        </Tooltip>
        {recentOpen && (
          // Plain labelled popover of ordinary buttons — NOT an ARIA menu (we
          // don't implement the menu keyboard model; consistent with the tabs
          // + combobox simplifications).
          <div className={styles.recentPop} role="group" aria-label="Recent documents">
            <div className={styles.recentHead}>
              <span className={styles.recentHeadLabel}>Recent</span>
              {recents.length > 0 && (
                <button type="button" className={styles.recentClear} onClick={() => clearRecents()}>
                  Clear
                </button>
              )}
            </div>
            {recents.length === 0 ? (
              <p className={styles.recentEmpty}>Nothing opened yet.</p>
            ) : (
              recents.map((r) => {
                const subj = subjectById[r.sid as SubjectId];
                return (
                  <button
                    key={r.key}
                    type="button"
                    className={`cp-subj ${subj?.cls ?? ""} ${styles.recentRow}`}
                    onClick={() => {
                      // openDoc (in PlannerHub) re-fronts this entry in recents
                      // already, so no explicit pushRecent here.
                      onOpenDoc({ kind: r.kind, id: r.id, title: r.title, sid: r.sid });
                      setRecentOpen(false);
                    }}
                  >
                    <span className={styles.recentRail} />
                    <span className={styles.recentText}>
                      <span className={styles.recentTitle}>{r.title}</span>
                      <span className={styles.recentSub}>{r.sub}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
