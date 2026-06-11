"use client";

// LessonAgendaNav.tsx — the sticky lesson-phase navigator beside the
// lesson flow (6.11.26 design_handoff_daily_view §6 "Phase nav", mapped
// onto production's lesson-flow SECTIONS — the codebase's equivalent of
// the prototype's phases).
//
// STORE-DRIVEN (full-spec revision): the item list reads straight from
// the planner store via getSections(lessonId) — name, minutes, status,
// and order are the same rows <LessonFlow> renders, so the navigator
// follows add / remove / reorder / rename without scanning the DOM.
// (The earlier iteration scanned data-flow-* anchors with a
// MutationObserver; now that minutes/status live on the store rows the
// scan is unnecessary.) The rendered flow rows are still the SCROLL
// TARGETS, found by their `data-flow-section` anchors.
//
// Item anatomy (prototype .agendaItem): numbered circle · two-line text
// (name + "N min", the time line hidden when minutes is null — the
// optional-minutes rule, never a dangling separator) · chevron that
// rotates 90° on the active item. A phase whose status is "done" tints
// its number circle with the done tokens.
//
// Interactions:
//   • Click → smooth-scroll the phase to the top of the detail body
//     (instant under prefers-reduced-motion).
//   • Drag an item → reorder the phases (HTML5 drag, midpoint
//     insertion, live preview in LOCAL state; ONE reorderSections store
//     commit on drop). Keyboard users reorder phases through the flow's
//     dnd-kit grips — the nav drag is a pointer convenience.
//   • Double-click the name (or F2 on the focused item) → rename inline;
//     Enter/blur commits the heading through editSection (coalesced),
//     Escape cancels. Dragging is disabled while renaming.
//   • The dashed "Add phase" item appends a phase (addSection) and
//     scrolls to it once it renders.
//
// Scrollspy: a passive scroll listener (rAF-throttled) computes the
// section under the "reading line" — a quarter of the way down the
// scroll container. A scroll-position calculation, NOT an
// IntersectionObserver: collapsed section rows are only ~35px tall, so
// a threshold-transition observer can sit forever inside one tall
// section and never fire again. While a click-initiated smooth scroll
// is in flight the spy yields to the clicked choice (click lock).

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode, RefObject } from "react";
import { usePlanner } from "@/lib/planner-store";
import { stripHtml, escapeHtml } from "@/lib/html-text";
import { Tooltip } from "@/components/ui";
import styles from "./lesson-detail.module.css";

interface LessonAgendaNavProps {
  /** The scrollable detail-body container (cellRef in LessonDetail) —
   *  scrollspy root and scroll target. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The lesson whose phases this navigator lists. */
  lessonId: string;
}

/** Top offset (px) a clicked section settles at inside the container. */
const SCROLL_OFFSET = 12;

/** The reading line sits this fraction down the container — the section
 *  whose top has crossed it is the one the teacher is reading. */
const READING_LINE = 0.25;

export function LessonAgendaNav({
  scrollRef,
  lessonId,
}: LessonAgendaNavProps): ReactNode {
  const { getSections, reorderSections, editSection, addSection } =
    usePlanner();
  const sections = getSections(lessonId);

  const [activeId, setActiveId] = useState<string | null>(null);
  // While a click-initiated smooth scroll is in flight, the spy yields to
  // the clicked choice — otherwise the reading-line calculation would
  // immediately override it (short lessons can't bring their last
  // sections up to the line).
  const clickLockUntilRef = useRef(0);

  /** Effective CSS zoom on the scroll container. The detail card renders
   *  at `zoom: 0.8` (see lesson-detail.module.css .root), and modern
   *  browsers return getBoundingClientRect() in ZOOMED viewport px while
   *  scrollTop / clientHeight / scrollTo() stay in unzoomed local px —
   *  every rect delta must be divided by this factor before mixing the
   *  two spaces. */
  const effectiveZoom = (root: HTMLElement): number => {
    const ratio = root.getBoundingClientRect().width / root.offsetWidth;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  };

  /** Compute the active section from the live scroll position: the LAST
   *  row whose top edge is above the reading line (or the first row when
   *  none has crossed it yet). Scrolled to the very bottom of an
   *  OVERFLOWING body → the last section wins, so short trailing
   *  sections are still reachable (the overflow gate keeps a
   *  non-scrolling lesson from pinning the last item). */
  const updateActive = useCallback((): void => {
    if (Date.now() < clickLockUntilRef.current) return;
    const root = scrollRef.current;
    if (!root) return;
    const rows = Array.from(
      root.querySelectorAll<HTMLElement>("[data-flow-section]"),
    );
    if (rows.length === 0) return;
    const overflows = root.scrollHeight > root.clientHeight + 2;
    let current: HTMLElement;
    if (
      overflows &&
      root.scrollTop + root.clientHeight >= root.scrollHeight - 2
    ) {
      current = rows[rows.length - 1]!;
    } else {
      const z = effectiveZoom(root);
      const rootTop = root.getBoundingClientRect().top;
      // Local-space reading line vs. local-space row offsets.
      const line = root.clientHeight * READING_LINE;
      current = rows[0]!;
      for (const row of rows) {
        const localTop = (row.getBoundingClientRect().top - rootTop) / z;
        if (localTop <= line) current = row;
        else break;
      }
    }
    const id = current.dataset.flowSection;
    if (id) setActiveId(id);
  }, [scrollRef]);

  // Scrollspy wiring + initial highlight. Re-runs when the selected
  // lesson changes (the flow remounts via its key) and when the phase
  // list changes shape (add / remove / reorder moves the row positions).
  const sectionsKey = sections.map((s) => s.id).join("|");
  useEffect(() => {
    // A lesson switch invalidates any in-flight click lock — without
    // this, the post-switch updateActive would be suppressed and the
    // highlight would point at the previous lesson's section id.
    clickLockUntilRef.current = 0;
    updateActive();
    const root = scrollRef.current;
    if (!root) return;

    let raf = 0;
    const onScroll = (): void => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateActive();
      });
    };
    const onScrollEnd = (): void => {
      // A click-initiated smooth scroll finished — release the lock so
      // the spy resumes (the time-based lock is the Safari fallback,
      // which doesn't ship scrollend).
      clickLockUntilRef.current = 0;
      updateActive();
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("scrollend", onScrollEnd);
    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("scrollend", onScrollEnd);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [updateActive, lessonId, sectionsKey, scrollRef]);

  const scrollToSection = useCallback(
    (id: string): void => {
      const root = scrollRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(
        `[data-flow-section="${CSS.escape(id)}"]`,
      );
      if (!el) return;
      // Rect deltas are in zoomed viewport px; scrollTo wants local px.
      const z = effectiveZoom(root);
      const top =
        (el.getBoundingClientRect().top - root.getBoundingClientRect().top) /
          z +
        root.scrollTop -
        SCROLL_OFFSET;
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // The spy yields until the smooth scroll settles — scrollend
      // releases the lock early; the timestamp is the fallback ceiling
      // for browsers without scrollend.
      clickLockUntilRef.current = Date.now() + (reduced ? 150 : 1200);
      root.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      setActiveId(id);
      // Move keyboard / screen-reader reading position to the section a
      // teacher just navigated to — without this, Tab from the nav lands
      // back at the top of the flow. Rows carry tabIndex={-1}.
      el.focus({ preventScroll: true });
    },
    [scrollRef],
  );

  // ── Drag-to-reorder ───────────────────────────────────────────────────
  // The drag previews in LOCAL state (dragOrder) so the store sees ONE
  // reorderSections commit — one undo step — when the item drops.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const storeOrder = sections.map((s) => s.id);
  const displayOrder = dragOrder ?? storeOrder;
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  function handleNavDragOver(e: DragEvent<HTMLElement>): void {
    if (!dragId) return;
    e.preventDefault();
    // The nav lays out vertically (sticky rail) or horizontally (narrow
    // strip) — pick the midpoint axis from the live flex direction.
    const horizontal =
      getComputedStyle(e.currentTarget).flexDirection === "row";
    // First item (in display order) whose midpoint is past the pointer —
    // the dragged item inserts before it (or at the end).
    let before: string | null = null;
    for (const id of displayOrder) {
      if (id === dragId) continue;
      const el = itemRefs.current.get(id);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      const mid = horizontal ? b.left + b.width / 2 : b.top + b.height / 2;
      const pointer = horizontal ? e.clientX : e.clientY;
      if (pointer < mid) {
        before = id;
        break;
      }
    }
    const rest = displayOrder.filter((id) => id !== dragId);
    const idx = before ? rest.indexOf(before) : rest.length;
    const next = [...rest];
    next.splice(idx, 0, dragId);
    // No-op guard — avoid a render per dragover event when nothing moved.
    if (next.every((id, i) => id === displayOrder[i])) return;
    setDragOrder(next);
  }

  function handleDragEnd(): void {
    if (dragId && dragOrder) {
      const to = dragOrder.indexOf(dragId);
      // reorderSections = arrayMove(from index of activeId, to index of
      // overId) on the store order — the id currently at the target
      // index is exactly the `overId` that produces the previewed order.
      const overId = storeOrder[to];
      if (overId && overId !== dragId) {
        reorderSections(lessonId, dragId, overId);
      }
    }
    setDragId(null);
    setDragOrder(null);
  }

  // ── Rename-on-double-click ────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);

  function commitRename(id: string, value: string): void {
    setRenamingId(null);
    const section = sectionById.get(id);
    if (!section) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === stripHtml(section.heading)) return;
    editSection(
      lessonId,
      id,
      { heading: escapeHtml(trimmed) },
      { key: `section:${lessonId}:${id}:heading`, ts: Date.now() },
    );
  }

  // ── Add phase — append, then scroll to the new row once it renders ──
  const pendingAddRef = useRef(false);
  const prevCountRef = useRef(sections.length);
  useEffect(() => {
    const grew = sections.length > prevCountRef.current;
    prevCountRef.current = sections.length;
    if (!grew || !pendingAddRef.current) return;
    pendingAddRef.current = false;
    const last = sections[sections.length - 1];
    if (last) scrollToSection(last.id);
  }, [sections, scrollToSection]);

  function handleAddPhase(): void {
    pendingAddRef.current = true;
    addSection(lessonId, "New phase");
  }

  // Always render the <nav> element (even for an empty section list) so
  // the workspace grid's first track stays occupied — otherwise the
  // lesson flow paints one frame squeezed into the 184px navigator
  // column.
  return (
    <nav
      className={styles.agendaNav}
      aria-label="Lesson phases"
      onDragOver={handleNavDragOver}
    >
      {displayOrder.map((id, i) => {
        const section = sectionById.get(id);
        if (!section) return null;
        const title = stripHtml(section.heading) || "Untitled phase";
        const minutes = section.minutes ?? null;
        const active = id === activeId;
        const done = section.status === "done";
        const renaming = id === renamingId;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) itemRefs.current.set(id, el);
              else itemRefs.current.delete(id);
            }}
            role="button"
            tabIndex={0}
            className={[
              styles.agendaItem,
              active ? styles.agendaItemActive : "",
              done ? styles.agendaItemDone : "",
              dragId === id ? styles.agendaItemDragging : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={active ? "true" : undefined}
            aria-label={`Phase ${i + 1}: ${title}${
              minutes != null ? `, ${minutes} minutes` : ""
            }${done ? ", completed" : ""}`}
            draggable={!renaming}
            onDragStart={(e) => {
              setDragId(id);
              try {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", `agenda:${id}`);
              } catch {
                // Some engines throw on setData with custom types.
              }
            }}
            onDragEnd={handleDragEnd}
            onClick={() => {
              if (!renaming) scrollToSection(id);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              setRenamingId(id);
            }}
            onKeyDown={(e) => {
              if (renaming) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scrollToSection(id);
              } else if (e.key === "F2") {
                e.preventDefault();
                setRenamingId(id);
              }
            }}
            title={`Jump to ${title} — double-click to rename, drag to reorder`}
          >
            <span className={styles.agendaNum} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.agendaText}>
              {renaming ? (
                <input
                  type="text"
                  className={styles.agendaNameInput}
                  defaultValue={title}
                  autoFocus
                  aria-label={`Rename phase: ${title}`}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={(e) => commitRename(id, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename(id, e.currentTarget.value);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <span className={styles.agendaName}>{title}</span>
              )}
              {minutes != null && (
                <span className={styles.agendaTime}>{minutes} min</span>
              )}
            </span>
            <span className={styles.agendaChev} aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </div>
        );
      })}

      {/* Dashed "Add phase" — appends through the same store action the
          flow's footer button uses, then scrolls to the new phase. */}
      <Tooltip
        content="Add a new phase to the end of this lesson — it appears in the flow and here in the navigator"
        side="bottom"
        tooltipId="lesson-detail-agenda-add-phase"
      >
        <button
          type="button"
          className={styles.agendaAdd}
          onClick={handleAddPhase}
        >
          <span className={styles.agendaAddIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          Add phase
        </button>
      </Tooltip>
    </nav>
  );
}
