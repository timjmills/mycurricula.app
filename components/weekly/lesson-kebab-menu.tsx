"use client";

// lesson-kebab-menu.tsx — the four handoff destinations, on a Week lesson.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The v2 handoff answers a click on a Week lesson cell with a cursor-anchored
// popover, not a panel and not an expansion:
//
//   V2 Framework.md:416-417 — "Lesson cells. Subject-striped, click →
//   Plan/Teach menu, hover → a tinted dark-glass popup …"
//
// and the bundled mockup implements exactly four destinations — Plan · Teach ·
// Post · Planner (mockup :10834-10849), every one a route to a full surface.
//
// The user was shown that and chose a HYBRID, deliberately, in full knowledge
// that it departs from the handoff: the lesson body expands in place (their
// design), and the handoff's four destinations move onto this small control so
// the one-click routes survive. So the split of responsibility here is:
//
//   • body click  → expand in place        (the user's design, not the handoff's)
//   • this button → Plan/Teach/Post/Planner (the handoff's, kept faithful)
//
// Faithful to the handoff where the handoff speaks: the four destinations and
// their order, the subject-dot + lesson-title header, dismissal on
// outside-mousedown AND Escape (mockup :10716-10722), and the .14s
// open keyframe (source/views.css:600-601).
//
// ── Positioning ────────────────────────────────────────────────────────────
// position:fixed and anchored to the TRIGGER's rect, not to the cursor. The
// mockup anchors to the click point because its trigger is the whole cell;
// ours is a small button, and a cursor-anchored menu from a 28px target lands
// in a slightly different place each time. Anchoring to the button also makes
// the keyboard path work — Enter on the trigger fires a synthesized click with
// no coordinates at all, which would put a cursor-anchored menu at (0,0).
//
// Fixed positioning is what lets it escape the canvas's `overflow` scroll
// container; the same clamp the mockup uses keeps it inside the viewport.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import styles from "./lesson-kebab-menu.module.css";

// Menu box metrics — used for the viewport clamp. They match the CSS below;
// measuring instead would mean rendering off-screen first and reading back,
// which is a layout thrash for a box whose size is fixed by design.
const MENU_W = 178;
const MENU_H = 236;
const GAP = 6;

export interface LessonKebabMenuProps {
  lessonId: string;
  /** Shown in the menu header so the teacher can see which lesson they hit. */
  lessonTitle: string;
  /**
   * The subject's palette class (`subject.cls`). The header dot pulls the
   * subject colour through `.cp-subj` → `var(--c)`, exactly as the mockup's
   * `lm-dot` does with its inline subject var — never a hard-coded hue.
   */
  subjectClass: string;
  /**
   * Opens the full lesson planner. Comes from <OpenLessonEditorContext>, which
   * is null outside <WeeklyShell>; when it is null the Plan row is omitted
   * rather than rendered as a dead button.
   */
  onPlan: ((lessonId: string) => void) | null;
  /** Extra class for the trigger, so each canvas can place it in its own way. */
  triggerClassName?: string;
}

// ── Icons ─────────────────────────────────────────────────────────────────
// Traced from the mockup's own paths (:10837-10848) so the menu reads as the
// same control, not a lookalike.

const IconPlan = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M16 3v5h5M8 12h6M8 16h4" />
  </svg>
);

const IconTeach = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5l12 7-12 7z" />
  </svg>
);

const IconPost = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 14h5" />
  </svg>
);

const IconPlanner = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.6" />
    <rect x="14" y="3" width="7" height="7" rx="1.6" />
    <rect x="3" y="14" width="7" height="7" rx="1.6" />
    <rect x="14" y="14" width="7" height="7" rx="1.6" />
  </svg>
);

const IconKebab = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="12" cy="19" r="1.9" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────

export function LessonKebabMenu({
  lessonId,
  lessonTitle,
  subjectClass,
  onPlan,
  triggerClassName,
}: LessonKebabMenuProps): ReactNode {
  const router = useRouter();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = pos !== null;

  const close = useCallback((): void => setPos(null), []);

  // Anchor below-right of the trigger, clamped into the viewport — the same
  // Math.max(8, Math.min(…)) clamp the mockup applies (:10835).
  const openMenu = useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      x: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
      y: Math.max(8, Math.min(r.bottom + GAP, window.innerHeight - MENU_H - 8)),
    });
  }, []);

  // Dismissal — outside MOUSEDOWN (not click) and Escape, per the mockup.
  // mousedown matters: a click listener fires after the press has already
  // moved focus and, on a press that starts inside and ends outside, would
  // close on a drag the teacher did not mean as a dismissal.
  //
  // Escape is captured on the menu's own subtree AND the document, because
  // focus moves into the menu on open; a listener only on the trigger would
  // stop hearing the key it exists to catch.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent): void => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (menuRef.current?.contains(t)) return;
      // A press on the trigger is a TOGGLE, and its own onClick handles that.
      // Closing here too would close-then-reopen, so the menu never shuts.
      if (triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // Stop it here so the same press doesn't ALSO reach WeeklyShell's
      // document-level Esc handler and clear the lesson selection — one Esc,
      // one dismissal (the innermost-first rule the shell already follows for
      // the lesson editor).
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  // Move focus into the menu on open so the keyboard path continues where the
  // eye does. useEffect, NOT useLayoutEffect: this component renders on the
  // server (it sits inside the Week canvases' SSR output), and React warns on
  // every useLayoutEffect in a server render. The menu only ever exists after
  // a client click, so the post-paint timing costs nothing here.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("button")?.focus();
  }, [open]);

  const go = useCallback(
    (action: () => void): void => {
      close();
      action();
    },
    [close],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${triggerClassName ?? ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Open, teach, or post “${lessonTitle}”`}
        title={`Open, teach, or post “${lessonTitle}”`}
        // stopPropagation, not just preventDefault: this button sits INSIDE
        // the lesson tile, whose own click toggles the expansion. Without it,
        // opening the menu would also expand or collapse the card underneath.
        // (`fromInteractive` on the tile already covers this, but that guard
        // lives in the parent and this component must be safe to drop onto a
        // parent that does not have it.)
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else openMenu();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <IconKebab />
      </button>

      {open && (
        <div
          ref={menuRef}
          // Deliberately NOT role="menu". That role promises assistive tech an
          // application-style menu — roving focus, ArrowUp/ArrowDown, Home/End,
          // focus containment — and this popover implements none of it (Codex
          // gate, Medium). A group of ordinary buttons that Tab moves through
          // is what it actually is, so that is what it says it is. If the
          // roving-focus model is built later, the roles come back with it.
          role="group"
          aria-label={`Actions for ${lessonTitle}`}
          className={`cp-root ${styles.menu}`}
          style={{ left: pos.x, top: pos.y }}
          // The menu is portalled by position:fixed, not by React, so clicks
          // inside it still bubble through the tile in the React tree.
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`cp-subj ${subjectClass} ${styles.title}`}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.titleText}>{lessonTitle}</span>
          </div>

          {/* Plan is omitted, not disabled, when the opener is unavailable —
              a row that looks live and does nothing is worse than one absent
              row, and this only happens outside <WeeklyShell>. */}
          {onPlan && (
            <button
              type="button"
              onClick={() => go(() => onPlan(lessonId))}
            >
              <IconPlan />
              Plan
            </button>
          )}
          <button
            type="button"
            className={styles.teach}
            onClick={() => go(() => router.push(`/teach?lesson=${lessonId}`))}
          >
            <IconTeach />
            Teach
          </button>
          <button
            type="button"
            onClick={() => go(() => router.push(`/post?lesson=${lessonId}`))}
          >
            <IconPost />
            Post
          </button>
          {/* The mockup's fourth row opens its lesson LIBRARY overlay
              (`setLibOpen(true)`). This app has no such overlay; /planner —
              the Planner Hub — is the surface that answers the same question
              ("where does this sit in the plan?"), so the row keeps the
              handoff's label and position and routes to the real equivalent
              rather than being dropped. */}
          <button
            type="button"
            onClick={() => go(() => router.push("/planner"))}
          >
            <IconPlanner />
            Planner
          </button>
        </div>
      )}
    </>
  );
}
