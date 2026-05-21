"use client";

// command-palette.tsx — ⌘/Ctrl+K command palette.
//
// A centered modal with a search input and a filtered results list. It
// searches across:
//   • Views — Weekly, Daily, Subject (8 subjects)
//   • Lessons — by title (plain-text match against usePlanner().lessons)
//
// Selecting a result navigates with router.push or updates app-state (for
// subject-scoped navigation). Arrow keys move through results; Enter
// activates the focused result; Esc closes.
//
// A11y contract — mirrors save-target-dialog.tsx:
//   • role="dialog" + aria-modal="true" + aria-labelledby the heading.
//   • Focus trap: Tab / Shift-Tab cycle inside the panel.
//   • On open: focus moves to the search input.
//   • On close: focus restores to the element that was focused before opening.
//   • Results list uses role="listbox" + role="option" for ARIA selection.
//
// Token rules: var(--token) only — no hard-coded hex or px font sizes.
// No new dependencies.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS } from "@/lib/mock";
import type { SubjectId } from "@/lib/types";
import styles from "./command-palette.module.css";

// ── Result shape ───────────────────────────────────────────────────────────────

type ResultKind = "view" | "subject" | "lesson";

interface PaletteResult {
  id: string;
  kind: ResultKind;
  label: string;
  /** Secondary label shown beside the primary label. */
  meta?: string;
  action: () => void;
}

// ── Static view results ────────────────────────────────────────────────────────

// The three primary views always appear first in the results list.
const VIEW_RESULTS: Omit<PaletteResult, "action">[] = [
  { id: "view-weekly", kind: "view", label: "Weekly planner", meta: "View" },
  { id: "view-daily", kind: "view", label: "Daily schedule", meta: "View" },
];

// One "Subject — <name>" entry per subject, so teachers can jump directly to
// the subject view for Math, Reading, etc.
const SUBJECT_VIEW_RESULTS: Omit<PaletteResult, "action">[] = SUBJECTS.map(
  (s) => ({
    id: `subject-${s.id}`,
    kind: "subject" as const,
    label: s.name,
    meta: "Subject",
  }),
);

// ── Text helpers ───────────────────────────────────────────────────────────────

/** Strip HTML tags to extract plain text for matching. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Case-insensitive substring match. */
function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

// ── Focus trap helper ─────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CommandPalette({
  open,
  onClose,
}: CommandPaletteProps): ReactNode {
  const headingId = useId();
  const listboxId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const router = useRouter();
  const { setSubjectView, setSearch } = useAppState();
  const { lessons } = usePlanner();

  // ── Build the full results list from the current query ───────────────────

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim();

    // View results — always included; filter by label.
    const views: PaletteResult[] = VIEW_RESULTS.filter(
      (r) => !q || matches(r.label, q),
    ).map((r) => ({
      ...r,
      action: () => {
        router.push(r.id === "view-weekly" ? "/weekly" : "/daily");
        onClose();
      },
    }));

    // Subject view results — filter by subject name.
    const subjectViews: PaletteResult[] = SUBJECT_VIEW_RESULTS.filter(
      (r) => !q || matches(r.label, q),
    ).map((r) => {
      const subjectId = r.id.replace("subject-", "") as SubjectId;
      return {
        ...r,
        action: () => {
          setSubjectView(subjectId);
          router.push(`/subject/${subjectId}`);
          onClose();
        },
      };
    });

    // Lesson results — match by plain-text title; cap at 12 so the list
    // stays digestible (most useful when the query is specific).
    const lessonResults: PaletteResult[] = lessons
      .filter((l) => {
        const plain = stripHtml(l.title);
        return !q || matches(plain, q);
      })
      .slice(0, 12)
      .map((l) => ({
        id: `lesson-${l.id}`,
        kind: "lesson" as const,
        label: stripHtml(l.title),
        meta: `Week ${l.week}`,
        action: () => {
          // Surface the lesson in the top-bar search and navigate to /weekly.
          setSearch(stripHtml(l.title));
          router.push("/weekly");
          onClose();
        },
      }));

    return [...views, ...subjectViews, ...lessonResults];
  }, [query, lessons, router, setSubjectView, setSearch, onClose]);

  // Reset selection whenever the results list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [results.length]);

  // ── Open / close effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActiveIndex(0);
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    } else {
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        const timer = setTimeout(() => prev.focus(), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [open]);

  // ── Keyboard handling ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;

        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          break;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;

        case "Enter":
          e.preventDefault();
          results[activeIndex]?.action();
          break;

        case "Tab": {
          // Focus trap — keep Tab / Shift-Tab inside the panel.
          const panel = panelRef.current;
          if (!panel) break;
          const focusable = Array.from(
            panel.querySelectorAll<HTMLElement>(FOCUSABLE),
          );
          if (focusable.length === 0) break;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
          break;
        }

        default:
          break;
      }
    },
    [onClose, results, activeIndex],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={styles.panel}
        onKeyDown={handleKeyDown}
      >
        {/* Visually hidden heading for screen readers */}
        <h2 id={headingId} className={styles.srOnly}>
          Command palette
        </h2>

        {/* Search input */}
        <div className={styles.inputRow}>
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Search views, subjects, lessons…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={
              results[activeIndex]
                ? `result-${results[activeIndex].id}`
                : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={styles.escBadge} aria-hidden="true">
            esc
          </kbd>
        </div>

        {/* Results list */}
        {results.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Results"
            className={styles.results}
          >
            {results.map((result, i) => (
              <li
                key={result.id}
                id={`result-${result.id}`}
                role="option"
                aria-selected={i === activeIndex}
                className={
                  i === activeIndex
                    ? `${styles.result} ${styles.resultActive}`
                    : styles.result
                }
                onMouseEnter={() => setActiveIndex(i)}
                onClick={result.action}
              >
                <ResultIcon kind={result.kind} />
                <span className={styles.resultLabel}>{result.label}</span>
                {result.meta && (
                  <span className={styles.resultMeta}>{result.meta}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer hint */}
        <div className={styles.footer} aria-hidden="true">
          <span className={styles.footerHint}>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>navigate</span>
          </span>
          <span className={styles.footerHint}>
            <kbd>↵</kbd>
            <span>select</span>
          </span>
          <span className={styles.footerHint}>
            <kbd>esc</kbd>
            <span>close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Inline icons ───────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={styles.searchIcon}
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <line
        x1="10.5"
        y1="10.5"
        x2="14"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResultIcon({ kind }: { kind: ResultKind }) {
  if (kind === "view") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        className={styles.resultIcon}
      >
        <rect
          x="1"
          y="1"
          width="5"
          height="5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="8"
          y="1"
          width="5"
          height="5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="1"
          y="8"
          width="5"
          height="5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="8"
          y="8"
          width="5"
          height="5"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (kind === "subject") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        className={styles.resultIcon}
      >
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  // lesson
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={styles.resultIcon}
    >
      <rect
        x="1.5"
        y="1.5"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="4"
        y1="5"
        x2="10"
        y2="5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="7.5"
        x2="10"
        y2="7.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="10"
        x2="7.5"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
