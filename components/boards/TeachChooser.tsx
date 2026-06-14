"use client";

// TeachChooser — the Teach Boards landing chooser (/boards). A teacher arriving
// to teach picks how to start: "Teach from a lesson" (a focus-trapped modal
// picker that opens the editor on that lesson) or a "Blank teach board" (a fresh
// lesson-less board). Below this, the page lists the teacher's saved boards
// (BoardLibraryModule).
//
// The lesson picker is a portaled, focus-trapped modal so it overlays cleanly
// regardless of the planner's nested layout. The list is searchable +
// subject-filterable and capped (the curriculum can hold 1000+ day-level
// lessons), with a "search to narrow" hint when more match than are shown.
// Tokens only; subject colour comes from the .cp-subj cascade (var(--c)).
//
// A11y mirrors the app's conventions: the subject filter is a proper roving
// radiogroup (useRovingRadio — same hook the appearance pickers use), the lesson
// list is a semantic <ul>/<li>, and the dialog uses the shared useFocusTrap
// (focus-on-open + Tab containment + focus restore) + Esc-to-close.

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { SubjectId } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { SUBJECTS } from "@/lib/mock/subjects";
import { useFocusTrap } from "@/components/teach/board/useFocusTrap";
import { useRovingRadio } from "@/components/appearance/use-roving-radio";
import { Button } from "@/components/ui";
import styles from "./TeachChooser.module.css";

/** Max lesson rows rendered at once (bounds the DOM for big curricula). */
const MAX_VISIBLE = 60;

/** Canonical subject order (matches Weekly / Catch-up) for chips + sorting. */
const SUBJECT_RANK = new Map(SUBJECTS.map((s, i) => [s.id, i]));

export interface TeachChooserProps {
  /** Open the editor to teach a specific lesson. */
  onTeachLesson: (lessonId: string) => void;
  /** Create + open a fresh blank board. */
  onBlankBoard: () => void;
  /** Blank-board creation is in flight. */
  creating?: boolean;
  /** Blank board can be created (owner + grade resolved). */
  canCreateBlank?: boolean;
}

export function TeachChooser({
  onTeachLesson,
  onBlankBoard,
  creating = false,
  canCreateBlank = true,
}: TeachChooserProps): ReactNode {
  const { lessons, subjectById } = usePlanner();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | "all">("all");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pickGuardRef = useRef(false); // single-flight: one navigation per open

  // Focus-on-open + Tab containment + focus-restore, only while the modal is up.
  useFocusTrap({
    containerRef: dialogRef,
    initialFocusRef: searchRef,
    active: picking,
  });

  // Subjects actually present in the lessons, in CANONICAL order (filter chips).
  const subjects = useMemo(() => {
    const seen = new Set<SubjectId>();
    for (const l of lessons) seen.add(l.subject);
    return SUBJECTS.filter((s) => seen.has(s.id));
  }, [lessons]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lessons
      .filter((l) => subjectFilter === "all" || l.subject === subjectFilter)
      .filter(
        (l) =>
          !q ||
          l.title.toLowerCase().includes(q) ||
          l.objective.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          (SUBJECT_RANK.get(a.subject) ?? 99) -
            (SUBJECT_RANK.get(b.subject) ?? 99) ||
          a.week - b.week ||
          a.title.localeCompare(b.title),
      );
  }, [lessons, query, subjectFilter]);

  const visible = matches.slice(0, MAX_VISIBLE);
  const overflow = matches.length - visible.length;

  // Subject-filter roving radiogroup (WAI-ARIA): "all" + the present subjects.
  const radioValues = useMemo(
    () => ["all", ...subjects.map((s) => s.id)],
    [subjects],
  );
  const roving = useRovingRadio({
    values: radioValues,
    selected: subjectFilter,
    onSelect: (v) => setSubjectFilter(v as SubjectId | "all"),
  });

  const openPicker = useCallback(() => setPicking(true), []);
  const closePicker = useCallback(() => setPicking(false), []);

  const pick = useCallback(
    (lessonId: string) => {
      if (pickGuardRef.current) return; // guard against a double-click race
      pickGuardRef.current = true;
      setPicking(false);
      onTeachLesson(lessonId); // navigates away (unmounts) — leave the guard set
    },
    [onTeachLesson],
  );

  // Esc closes (Tab containment is owned by useFocusTrap).
  const onDialogKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePicker();
      }
    },
    [closePicker],
  );

  const blankDisabled = !canCreateBlank || creating;

  return (
    <section className={styles.chooser} aria-label="Start teaching">
      <h1 className={styles.title}>Teach Boards</h1>
      <p className={styles.prompt}>What do you want to teach from?</p>

      <div className={styles.cards}>
        <button
          type="button"
          className={styles.card}
          onClick={openPicker}
          aria-haspopup="dialog"
        >
          <span className={styles.cardIcon} aria-hidden="true">
            📖
          </span>
          <span className={styles.cardTitle}>Teach from a lesson</span>
          <span className={styles.cardSub}>
            Open a board ready to present one of your lessons
          </span>
        </button>

        <button
          type="button"
          className={styles.card}
          onClick={onBlankBoard}
          disabled={blankDisabled}
          title={
            !canCreateBlank
              ? "Setting up your boards — one moment…"
              : undefined
          }
        >
          <span className={styles.cardIcon} aria-hidden="true">
            ✏️
          </span>
          <span className={styles.cardTitle}>
            {creating ? "Creating…" : "Blank teach board"}
          </span>
          <span className={styles.cardSub}>
            Start a fresh board with nothing on it yet
          </span>
        </button>
      </div>

      {picking && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.scrim}
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closePicker();
              }}
            >
              <div
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="teach-from-lesson-title"
                onKeyDown={onDialogKeyDown}
              >
                <div className={styles.dialogHead}>
                  <h2
                    id="teach-from-lesson-title"
                    className={styles.dialogTitle}
                  >
                    Which lesson do you want to teach?
                  </h2>
                  <button
                    type="button"
                    className={styles.close}
                    aria-label="Close"
                    onClick={closePicker}
                  >
                    ✕
                  </button>
                </div>

                <label className={styles.searchRow}>
                  <span className={styles.srOnly}>Search lessons</span>
                  <input
                    ref={searchRef}
                    type="search"
                    className={styles.search}
                    placeholder="Search lessons by title or objective"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>

                <div
                  className={styles.filters}
                  role="radiogroup"
                  aria-label="Filter by subject"
                  {...roving.getGroupProps()}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={subjectFilter === "all"}
                    className={`${styles.chip} ${
                      subjectFilter === "all" ? styles.chipActive : ""
                    }`}
                    onClick={() => setSubjectFilter("all")}
                    {...roving.getOptionProps("all")}
                  >
                    All subjects
                  </button>
                  {subjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={subjectFilter === s.id}
                      className={`cp-subj ${s.cls} ${styles.chip} ${
                        subjectFilter === s.id ? styles.chipActive : ""
                      }`}
                      onClick={() => setSubjectFilter(s.id)}
                      {...roving.getOptionProps(s.id)}
                    >
                      <span className={styles.chipDot} aria-hidden="true" />
                      {s.name}
                    </button>
                  ))}
                </div>

                {visible.length === 0 ? (
                  <p className={styles.empty}>
                    No lessons match — try a different search or subject.
                  </p>
                ) : (
                  <ul className={styles.list}>
                    {visible.map((l) => {
                      const subj = subjectById[l.subject];
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            className={`cp-subj ${l.subject} ${styles.lessonRow}`}
                            onClick={() => pick(l.id)}
                          >
                            <span className={styles.stripe} aria-hidden="true" />
                            <span className={styles.lessonMain}>
                              <span className={styles.lessonTitle}>
                                {l.title}
                              </span>
                            </span>
                            <span className={styles.lessonMeta}>
                              {subj?.name ?? l.subject} · Week {l.week}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {overflow > 0 ? (
                  <p className={styles.overflow}>
                    Showing {visible.length} of {matches.length} — search to
                    narrow.
                  </p>
                ) : null}

                <div className={styles.dialogFoot}>
                  <Button variant="secondary" size="sm" onClick={closePicker}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
