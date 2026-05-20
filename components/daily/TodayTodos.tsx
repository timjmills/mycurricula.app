"use client";

// TodayTodos.tsx — the Daily view right-rail "To-do List" panel.
//
// Planning doc §5.3 / §5.11: the Daily view surfaces a glanceable, today-
// scoped slice of to-dos with completion checkboxes and a quick-add input.
// Full to-do MANAGEMENT — filtering, scoping, tagging, bulk actions —
// lives in the dedicated to-do slide-out panel, NOT here (CLAUDE.md §3:
// each surface one job).
//
// So this panel deliberately stays small: check items off, quick-add a new
// one. Both mutations are prototype-local (component state only) — there is
// no to-do store yet. Checking/adding here never touches lessons or the
// forking model.
//
// ── Visual treatment (Image 13) ──────────────────────────────────────────
// A WHITE card identical in framing to the Resources and Shoutbox cards
// in the rail: var(--paper) fill, var(--ink-150) hairline border, soft
// var(--shadow-card) lift. The head row shows the title "To-do List" with
// a small green-tinted badge counting OPEN items (not done). Each row
// pairs a custom checkbox with the task title — completed items fill the
// box solid green with a white check and mute + strike-through the title.
// Below the list, a quiet "+ Add a to-do" link/button toggles a small
// inline composer.
//
// Data: the TODOS mock. The mock to-dos are not day-scoped, so — matching
// the existing TodayDashboard strip — we show the "today" bucket regardless
// of which day tab is active. Tags render as small color dots (tag color is
// the only color in the panel besides the green done state).

import { useState, useCallback, useRef } from "react";
import type { ReactNode, FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TODOS, TAG_BY_ID } from "@/lib/mock";
import type { Todo } from "@/lib/types";
import { DRAG_MOTION } from "@/lib/collapse-on-drag";
import type { PanelDragHandleProps } from "./RightRail";
import styles from "./TodayTodos.module.css";

// ── Grip + chevron icons (rail-driven controls) ──────────────────────────
// Rendered only when TodayTodos is mounted inside <RightRail>, which
// supplies the dragHandleProps + onToggleCollapsed bundle. The grip is
// the SOLE drag activator for the panel — dragging the to-do rows, the
// quick-add input, or anywhere else in the panel never starts a reorder.

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

function ChevronToggleIcon({ collapsed }: { collapsed: boolean }): ReactNode {
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

// ── Checkbox ─────────────────────────────────────────────────────────────
// Two-state SVG (done / not-done). Local rather than imported so this
// panel owns its own presentation; matches the inline-SVG idiom used by
// DailyView's LessonCheckbox.

function TodoCheck({ done }: { done: boolean }): ReactNode {
  if (done) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="14" height="14" rx="4" fill="var(--done)" />
        <path
          d="M3.4 7l2.6 2.6 4.6-4.6"
          stroke="var(--paper)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="0.7"
        y="0.7"
        width="12.6"
        height="12.6"
        rx="3.5"
        stroke="var(--ink-300)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

// ── One to-do row ────────────────────────────────────────────────────────

interface TodoRowProps {
  todo: Todo;
  onToggle: (id: string) => void;
}

function TodoRow({ todo, onToggle }: TodoRowProps): ReactNode {
  // Resolve tag ids to tag objects; a stale id is dropped, not crashed.
  const tags = todo.tags
    .map((id) => TAG_BY_ID[id])
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <li className={styles.item}>
      {/* The whole row left side is the toggle — ≥44px tall touch target. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={todo.done}
        className={styles.toggle}
        onClick={() => onToggle(todo.id)}
      >
        <span className={styles.check}>
          <TodoCheck done={todo.done} />
        </span>
        <span
          className={`${styles.itemTitle} ${
            todo.done ? styles.itemTitleDone : ""
          }`}
        >
          {todo.title}
        </span>
      </button>

      {/* Tag dots — tag color carries the tag's identity (info, not decor). */}
      {tags.length > 0 && (
        <span className={styles.tags} aria-hidden="true">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={styles.tagDot}
              style={{ background: tag.fg }}
              title={tag.label}
            />
          ))}
        </span>
      )}

      {/* Team vs personal scope marker — a quiet text chip, no color. */}
      {todo.scope === "team" && <span className={styles.scope}>Team</span>}
    </li>
  );
}

// ── Plus glyph ───────────────────────────────────────────────────────────

function PlusIcon(): ReactNode {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5.5 1v9M1 5.5h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── TodayTodos ───────────────────────────────────────────────────────────

interface TodayTodosProps {
  /**
   * Whether the panel BODY (list + composer) is collapsed to its header
   * only. Optional — when omitted the panel renders fully expanded with
   * no chevron.
   */
  collapsed?: boolean;
  /** Flip the collapsed state. Rendered as a chevron button in the header. */
  onToggleCollapsed?: () => void;
  /**
   * dnd-kit wiring supplied by <RightRail>. When provided the panel
   * renders a grip button in its header that is the SOLE drag activator
   * for reorder. The quick-add input and to-do rows remain fully
   * interactive.
   */
  dragHandleProps?: PanelDragHandleProps;
}

export function TodayTodos({
  collapsed = false,
  onToggleCollapsed,
  dragHandleProps,
}: TodayTodosProps = {}): ReactNode {
  // Local working copy seeded from the "today" bucket. Toggling and adding
  // mutate this copy only — there is no to-do store in the prototype yet.
  const [todos, setTodos] = useState<Todo[]>(() =>
    TODOS.filter((t) => t.due === "today"),
  );
  const [draft, setDraft] = useState("");
  // Whether the "+ Add a to-do" link has been expanded into the composer.
  // Keeping this collapsed by default keeps the card calm at rest; the
  // teacher opts in when they have something to add.
  const [composerOpen, setComposerOpen] = useState(false);
  const localSeq = useRef(0);

  // Count of OPEN items — the green badge in the head reads the
  // teacher's remaining work for the day. (Switched from done/total to
  // remaining-only on the redesign — matches Image 13.)
  const openCount = todos.filter((t) => !t.done).length;

  // Toggle one item's done state.
  const handleToggle = useCallback((id: string): void => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }, []);

  // Quick-add stub: append a personal, untagged, due-today item.
  const handleSubmit = useCallback(
    (e: FormEvent): void => {
      e.preventDefault();
      const title = draft.trim();
      if (title.length === 0) return;
      localSeq.current += 1;
      setTodos((prev) => [
        ...prev,
        {
          id: `todo-local-${localSeq.current}`,
          scope: "personal",
          title,
          tags: [],
          due: "today",
          done: false,
        },
      ]);
      setDraft("");
      // Stay open so the teacher can pile up several quick-adds in a
      // row without re-tapping the link each time.
    },
    [draft],
  );

  // Reduced-motion-safe collapse animation. Same idiom as ResourcesPanel.
  const reducedMotion = useReducedMotion() ?? false;
  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  // The body — list + quick-add affordance — is what collapses. The
  // header (title + green count badge + grip + chevron) stays put even
  // when collapsed so the open-count is always glanceable.
  const bodyContent = (
    <>
      {/* ── List ───────────────────────────────────────────────────── */}
      {todos.length > 0 ? (
        <ul className={styles.list}>
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Nothing due today.</p>
      )}

      {/* ── Quick-add affordance ───────────────────────────────────── */}
      {/* Collapsed → a quiet "+ Add a to-do" link.
          Expanded → the small inline composer.
          Full management still lives in the to-do slide-out panel. */}
      {!composerOpen ? (
        <button
          type="button"
          className={styles.addLink}
          onClick={() => setComposerOpen(true)}
        >
          <span className={styles.addLinkIcon} aria-hidden="true">
            <PlusIcon />
          </span>
          Add a to-do
        </button>
      ) : (
        <form className={styles.composer} onSubmit={handleSubmit}>
          <span className={styles.composerIcon} aria-hidden="true">
            <PlusIcon />
          </span>
          <input
            type="text"
            className={styles.composerInput}
            placeholder="Add a to-do…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Escape closes without adding, matching the chat composer's
              // gentle dismissal. Tab-out also closes via onBlur, below.
              if (e.key === "Escape") {
                setDraft("");
                setComposerOpen(false);
              }
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- user opt-in via "+ Add a to-do"
            autoFocus
            aria-label="Add a to-do"
          />
          <button
            type="submit"
            className={styles.composerAdd}
            disabled={draft.trim().length === 0}
            aria-label="Add to-do"
          >
            Add
          </button>
        </form>
      )}
    </>
  );

  return (
    <section className={styles.panel} aria-label="Today's to-dos">
      {/* ── Head: optional grip + title + green count badge + chevron ─── */}
      <header className={styles.head}>
        {/* Drag grip — only rendered when the rail wires the bundle.
            Activator + listeners scope drag to this button alone. */}
        {dragHandleProps && (
          <button
            type="button"
            ref={dragHandleProps.ref}
            {...(dragHandleProps.attributes ?? {})}
            {...(dragHandleProps.listeners ?? {})}
            className={styles.gripBtn}
            aria-label={dragHandleProps.label ?? "Drag to reorder To-do List"}
            title="Drag to reorder"
          >
            <GripVerticalIcon />
          </button>
        )}
        <h3 className={styles.title}>To-do List</h3>
        {/* Green open-count badge — stays in the header even when
            collapsed so the teacher's remaining-work glance is always
            available. */}
        <span className={styles.count} aria-label={`${openCount} open to-dos`}>
          {openCount}
        </span>
        {/* Chevron collapse toggle — pushed to the far right. */}
        {onToggleCollapsed && (
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? "Expand To-do List panel"
                : "Collapse To-do List panel"
            }
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronToggleIcon collapsed={collapsed} />
          </button>
        )}
      </header>

      {/* ── Collapsible body ───────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="todos-body"
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
    </section>
  );
}
