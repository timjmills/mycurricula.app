"use client";

// command-palette.tsx — ⌘/Ctrl+K command palette.
//
// A centered modal with a search input and a filtered results list. It
// searches across:
//   • Views — Weekly, Daily, Schedule, Archive
//   • Subjects — the grade's OWN subjects (usePlanner().subjects)
//   • Lessons — by title (plain-text match against usePlanner().lessons)
//
// Selecting a result navigates with router.push or updates app-state (for
// subject-scoped navigation). Arrow keys move through results; Enter
// activates the focused result; Esc closes.
//
// SUBJECTS ARE REAL DATA, NOT A CONSTANT. This list used to be
// `SUBJECTS.map(...)` at MODULE scope — computed once from the lib/mock fixture
// at import time, never re-derived, and reachable by no feature flag. A school
// that teaches Science and History got a palette offering Math, UFLI, Grammar,
// Spelling and Explorers, each of which navigated to `/year?subject=<id>` for a
// subject it does not have, while its own subjects were unreachable. Module
// scope was the defect as much as the fixture was: a `const` derived from data
// can never react to the data changing. Read `subjects` off the store, inside
// the component, and let it re-derive.
//
// Data readiness — why the "No results" line is guarded:
//   Two of the four result sources are module constants (VIEW_RESULTS and the
//   three appearance axes), so they answer the instant a teacher types. The
//   LESSON and SUBJECT buckets come out of usePlanner(), which is empty for the
//   whole 11–16s Supabase hydrate. The denial is reached only when EVERY source
//   came back empty — i.e. exactly when the unknown sources are the ones that
//   decide the answer — so a teacher who opens ⌘K on arrival and types a lesson
//   title was told, definitively, that it does not exist. Since the palette has
//   no source filter, there is no reachable state in which the denial rests on
//   static data alone; the guard therefore covers the denial whole. See the
//   render branch for where it sits and why not one level up.
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
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { Skeleton } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import type { ThemeSetting } from "@/lib/theme";
import styles from "./command-palette.module.css";

// ── Result shape ───────────────────────────────────────────────────────────────

type ResultKind = "view" | "subject" | "lesson" | "appearance";

interface PaletteResult {
  id: string;
  kind: ResultKind;
  label: string;
  /** Secondary label shown beside the primary label. */
  meta?: string;
  /**
   * Extra search terms beyond the label — e.g. "dark mode" for Night,
   * "vibrant" for Mid-Vivid — so a teacher who searches by intent rather
   * than the exact name still finds the action.
   */
  keywords?: string[];
  /**
   * True when this result reflects the setting that is currently live (the
   * active theme / card style). Rendered as a leading check so the palette
   * shows the current choice without changing it. Navigation results
   * (views/subjects/lessons) never set this.
   */
  selected?: boolean;
  action: () => void;
}

// ── Static view results ────────────────────────────────────────────────────────

// The primary views + the utility surfaces re-homed off the retired left rail
// (Schedule, Archive — SideNav-retirement R1f). Each carries its route so the
// action is a plain router.push; keywords let intent searches ("timetable",
// "past years") land on the right row.
interface ViewResultDef extends Omit<PaletteResult, "action"> {
  href: string;
}
const VIEW_RESULTS: ViewResultDef[] = [
  {
    id: "view-weekly",
    kind: "view",
    label: "Weekly planner",
    meta: "View",
    href: "/weekly",
  },
  {
    id: "view-daily",
    kind: "view",
    label: "Daily schedule",
    meta: "View",
    href: "/daily",
  },
  {
    id: "view-schedule",
    kind: "view",
    label: "Schedule",
    meta: "View",
    keywords: ["timetable", "periods", "bell", "rotation"],
    href: "/schedule",
  },
  {
    id: "view-archive",
    kind: "view",
    label: "Archive",
    meta: "View",
    keywords: ["past years", "sealed", "rolled over", "curriculum archive"],
    href: "/archive",
  },
];

// ── Appearance options (theme) ───────────────────────────────────────────────
//
// Every app-wide theme is reachable from the palette, so a teacher can
// re-skin the app without leaving the keyboard. Labels mirror Settings →
// Appearance; keywords let intent-based searches ("dark", "vibrant") land on
// the right option. The id maps 1:1 to a ThemeSetting the action passes to
// setTheme. `selected` is computed at render time from live useTheme() state —
// these static rows only carry the keywords.

interface ThemeActionDef {
  theme: ThemeSetting;
  label: string;
  keywords: string[];
}

// v2 theme set (lockstep with lib/theme.tsx APP_THEMES).
const THEME_ACTIONS: readonly ThemeActionDef[] = [
  {
    theme: "clear",
    label: "Theme: Clear",
    keywords: ["light", "resting", "default"],
  },
  {
    theme: "night",
    label: "Theme: Night",
    keywords: ["dark", "dark mode", "low light"],
  },
  {
    theme: "honey",
    label: "Theme: Honey",
    keywords: ["gold", "amber", "warm"],
  },
  { theme: "blossom", label: "Theme: Blossom", keywords: ["pink"] },
  { theme: "mint", label: "Theme: Mint", keywords: ["green"] },
  { theme: "sky", label: "Theme: Sky", keywords: ["blue"] },
  {
    theme: "off",
    label: "Theme: Off (Photo)",
    keywords: ["photo", "ungraded", "original"],
  },
  {
    theme: "system",
    label: "Theme: Follow system",
    keywords: ["auto", "device", "os", "automatic"],
  },
];

// The v1 "Card style" and "Color intensity" command groups were REMOVED
// 2026-08-07 with the data-palette retirement: `data-style` never reached the
// v2 DOM (those commands changed nothing a teacher could see since the
// cutover), and the subject-colour emission no longer branches on the palette
// type (lib/palette.tsx). A command that reports success and changes no
// pixels is the false-success class this repo has a standing ruling against.
// The setters live on in lib/theme.tsx for the flag-OFF v1 path until that
// path is deleted.

// ── Text helpers ───────────────────────────────────────────────────────────────

/** Strip HTML tags to extract plain text for matching. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Case-insensitive substring match. */
function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

/** Match a label OR any of its keyword aliases against the query. */
function matchesAny(label: string, keywords: string[], query: string): boolean {
  return matches(label, query) || keywords.some((k) => matches(k, query));
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

/**
 * The mount gate and the query state. Everything a teacher actually reads
 * lives in <CommandPaletteBody>; this half owns only what has to survive the
 * palette closing and reopening — the query to reset, and the element to hand
 * focus back to.
 *
 * The split is not cosmetic. The empty/loading decision below is a function of
 * the query, and the query is component state that no test can reach: the
 * palette seeds it in an effect, and react-dom/server runs no effects, so an
 * outside-in render can only ever exercise the empty query — under which every
 * static source matches and the branch under test is unreachable. Making the
 * body a controlled component is the smallest change that lets a test type
 * "Fractions" (see tests/command-palette-empty.test.ts). Same reason
 * SearchResults split into <SearchResultsBody> (commit 75d99df).
 */
export function CommandPalette({
  open,
  onClose,
}: CommandPaletteProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState("");

  // ── Open / close effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      // activeIndex is no longer reset here: it lives in the body, which
      // unmounts on close, so reopening remounts it at 0 on its own.
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

  if (!open) return null;

  return (
    <CommandPaletteBody
      query={query}
      onQueryChange={setQuery}
      onClose={onClose}
      inputRef={inputRef}
    />
  );
}

// ── Body ───────────────────────────────────────────────────────────────────────

export interface CommandPaletteBodyProps {
  /** The live search text. Controlled — the mount gate owns the state so it
   *  can reset the query when the palette reopens. */
  query: string;
  onQueryChange: (next: string) => void;
  onClose: () => void;
  /** Owned by the gate, which focuses the input on open. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * The panel itself: build the results from the query, render them, and decide
 * what to say when nothing comes back. Split out of <CommandPalette> so this —
 * the half with a correctness contract — can be rendered directly in a test.
 */
export function CommandPaletteBody({
  query,
  onQueryChange,
  onClose,
  inputRef,
}: CommandPaletteBodyProps): ReactNode {
  const headingId = useId();
  const listboxId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  const router = useRouter();
  const { setSubjectView, setSearch } = useAppState();
  // `subjects` is the GRADE'S subject list, not a fixture — see the header note.
  const { lessons, subjects } = usePlanner();
  // Read alongside `lessons`, not instead of it: the list above still renders
  // whatever the store has produced so far, and this only decides what to say
  // when it has produced nothing.
  const dataState = usePlannerDataState();
  const { theme, setTheme } = useTheme();

  // ── Build the full results list from the current query ───────────────────

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim();

    // View results — always included; filter by label OR keyword aliases.
    const views: PaletteResult[] = VIEW_RESULTS.filter(
      (r) => !q || matchesAny(r.label, r.keywords ?? [], q),
    ).map(({ href, ...r }) => ({
      ...r,
      action: () => {
        router.push(href);
        onClose();
      },
    }));

    // Subject view results — one row per subject the grade actually teaches,
    // filtered by name. Derived here rather than at module scope so it tracks
    // the store: a school's subjects arrive with the hydrate and can change
    // under the teacher (workspace switch, a subject added in Settings).
    // The id travels on the subject object, so no parsing it back out of a
    // DOM id — the round-trip that made the old list look like a constant.
    const subjectViews: PaletteResult[] = subjects
      .filter((s) => !q || matches(s.name, q))
      .map((s) => ({
        id: `subject-${s.id}`,
        kind: "subject" as const,
        label: s.name,
        meta: "Subject",
        action: () => {
          setSubjectView(s.id);
          // Curriculum view merged into Yearly — land on /year focused on the
          // subject (TimelineYear reads ?subject= and drills the scope).
          router.push(`/year?subject=${encodeURIComponent(s.id)}`);
          onClose();
        },
      }));

    // Appearance results — apply an app-wide theme or card style without
    // leaving the keyboard. Each closes the palette on select (like every
    // other action) and marks the currently-live option with a check.
    const themeResults: PaletteResult[] = THEME_ACTIONS.filter(
      (t) => !q || matchesAny(t.label, t.keywords, q),
    ).map((t) => ({
      id: `theme-${t.theme}`,
      kind: "appearance" as const,
      label: t.label,
      meta: "Theme",
      keywords: t.keywords,
      selected: theme === t.theme,
      action: () => {
        setTheme(t.theme);
        onClose();
      },
    }));

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

    return [...views, ...subjectViews, ...themeResults, ...lessonResults];
  }, [
    query,
    lessons,
    subjects,
    router,
    setSubjectView,
    setSearch,
    onClose,
    theme,
    setTheme,
  ]);

  // Reset selection whenever the results list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [results.length]);

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
            onChange={(e) => onQueryChange(e.target.value)}
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
                {result.selected && (
                  // Visible "Current" text IS the accessible name — no
                  // aria-label (prohibited on generic spans, inconsistently
                  // honored). The check icon is decorative.
                  <span className={styles.resultCurrent}>
                    <CheckIcon />
                    Current
                  </span>
                )}
                {result.meta && (
                  <span className={styles.resultMeta}>{result.meta}</span>
                )}
              </li>
            ))}
          </ul>
        ) : dataState === "pending" ? (
          // The fork above is deliberately NOT gated on readiness — hoisting
          // this branch over it would strand "weekly", "night", "math" and
          // every other statically-answerable query behind 11–16s of skeleton,
          // replacing a correct instant answer with a wait. The guard belongs
          // here, in the one branch whose claim the store cannot yet back.
          //
          // Bare <Skeleton> rather than <PlannerEmpty>: this slot is a single
          // centered line inside a fixed-width modal, which is the bespoke
          // shape PlannerEmpty's own header points at the primitive for. Two
          // short bars read as "a result or two is coming", not as a rewritten
          // panel. The label is what a screen-reader user hears in place of
          // the denial — without it the lie would simply move into the a11y
          // layer.
          <div className={styles.empty}>
            <Skeleton lines={2} size="sm" label="Loading your plan…" />
          </div>
        ) : dataState === "error" ? (
          // A failed hydrate leaves the same empty document as a pending one,
          // so denying here would blame the teacher's search for a backend
          // outage. Copy mirrors <PlannerEmpty>'s error state verbatim so the
          // two surfaces cannot drift into describing one outage two ways.
          <div className={styles.empty}>
            Couldn’t load your plan. Check your connection and reload. Your
            saved work is safe.
          </div>
        ) : (
          // Settled — every source has spoken, so the negative is now a fact.
          // Keeping this reachable is half the contract: a palette that only
          // ever skeletons would pass every "the lie is gone" check while
          // never answering a genuine miss.
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
  if (kind === "appearance") {
    // A painter's palette — signals "appearance / theme" without leaning on
    // any one theme's color (stroke inherits currentColor like its siblings).
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        className={styles.resultIcon}
      >
        <path
          d="M7 1.25c3.17 0 5.75 2.35 5.75 5.25 0 1.66-1.42 2.75-3 2.75h-1.1c-.66 0-1.15.55-1.15 1.18 0 .3.13.55.27.79.14.24.28.5.28.79 0 .67-.55 1.05-1.2 1.05C3.83 14.75 1.25 12.15 1.25 7S3.83 1.25 7 1.25Z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <circle cx="4.4" cy="6.4" r="0.95" fill="currentColor" />
        <circle cx="7" cy="4.6" r="0.95" fill="currentColor" />
        <circle cx="9.6" cy="6.4" r="0.95" fill="currentColor" />
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

// Small check used on the appearance rows to flag the currently-live theme /
// card style. Decorative — the "Current setting" text carries the meaning for
// screen readers.
function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
