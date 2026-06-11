"use client";

// LessonAgendaNav.tsx — the sticky lesson-section navigator beside the
// lesson flow (6.11.26 design_handoff_daily_view §6 "Phase nav", mapped
// onto production's lesson-flow SECTIONS — the codebase's equivalent of
// the prototype's phases).
//
// DOM-driven by design: <LessonFlow> owns the canonical section list
// (store rows + the virtual Standards row, drag-reorderable, renameable),
// so rather than duplicating that resolution logic the navigator scans
// the rendered rows via their `data-flow-section` / `data-flow-title`
// anchors (set in components/lesson-flow/lesson-flow.tsx) and follows
// every add / remove / reorder / rename through a MutationObserver.
//
// Scrollspy: a passive scroll listener (rAF-throttled) computes the
// section under the "reading line" — a quarter of the way down the
// scroll container. A scroll-position calculation, NOT an
// IntersectionObserver: collapsed section rows are only ~35px tall, so
// a threshold-transition observer can sit forever inside one tall
// section and never fire again. Clicking an item smooth-scrolls its
// section to the top of the container (instant under
// prefers-reduced-motion).

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import styles from "./lesson-detail.module.css";

interface AgendaItem {
  /** The row id from data-flow-section — stable scroll target handle. */
  id: string;
  title: string;
}

interface LessonAgendaNavProps {
  /** The scrollable detail-body container (cellRef in LessonDetail) —
   *  scan root, scrollspy root, and scroll target. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Re-scan key — section rows remount when the lesson changes. */
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
  const [items, setItems] = useState<AgendaItem[]>([]);
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

  /** Scan the rendered lesson-flow rows into the agenda item list. */
  const rescan = useCallback((): void => {
    const root = scrollRef.current;
    if (!root) return;
    const rows = Array.from(
      root.querySelectorAll<HTMLElement>("[data-flow-section]"),
    );
    const next: AgendaItem[] = rows.map((el) => ({
      id: el.dataset.flowSection ?? "",
      title: el.dataset.flowTitle ?? "Section",
    }));
    setItems((prev) =>
      prev.length === next.length &&
      prev.every((p, i) => p.id === next[i]!.id && p.title === next[i]!.title)
        ? prev
        : next,
    );
    updateActive();
  }, [scrollRef, updateActive]);

  // Initial scan + follow LessonFlow mutations (add / remove / reorder /
  // rename) through a debounced MutationObserver, + the rAF-throttled
  // scrollspy listener. Re-runs when the selected lesson changes (the
  // flow remounts via its key).
  useEffect(() => {
    // A lesson switch invalidates any in-flight click lock — without
    // this, the post-rescan updateActive would be suppressed and the
    // highlight would point at the previous lesson's section id.
    clickLockUntilRef.current = 0;
    rescan();
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

    let t: ReturnType<typeof setTimeout> | null = null;
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        if (t !== null) clearTimeout(t);
        t = setTimeout(rescan, 150);
      });
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-flow-title"],
      });
    }

    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("scrollend", onScrollEnd);
      if (raf) cancelAnimationFrame(raf);
      mo?.disconnect();
      if (t !== null) clearTimeout(t);
    };
  }, [rescan, updateActive, lessonId, scrollRef]);

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

  // Always render the <nav> element (even before the post-mount scan
  // fills `items`) so the workspace grid's first track stays occupied —
  // otherwise the lesson flow paints one frame squeezed into the 184px
  // navigator column.
  return (
    <nav className={styles.agendaNav} aria-label="Lesson sections">
      {items.map((item, i) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.agendaItem} ${active ? styles.agendaItemActive : ""}`}
            aria-current={active ? "true" : undefined}
            onClick={() => scrollToSection(item.id)}
            title={`Jump to ${item.title}`}
          >
            <span className={styles.agendaNum} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.agendaName}>{item.title}</span>
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
          </button>
        );
      })}
    </nav>
  );
}
