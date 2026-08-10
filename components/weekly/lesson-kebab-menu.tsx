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
// ONE ROW DIVERGES, and only in its wording: the fourth. The handoff carries the
// lesson into a library overlay; this app's equivalent surface (/planner) takes
// no lesson, so the row is labelled for the place it actually goes. The reason
// sits at the row itself, next to the code it explains.
//
// ── The forking group (added 2026-08-09) ───────────────────────────────────
// The four destinations above are the handoff's. The two rows BELOW them are
// not — they are ported from the v1 card menu
// (components/lesson-card/context-menu.tsx, "Group 3: forking"), because the
// v2 Week canvases had no door to them at all.
//
// The Week canvas is picked off `data-frame`: paper → WeekColumns →
// WeeklyLessonCard, which carries the v1 <LessonContextMenu> and its forking
// items; glass (THE DEFAULT) → WeekA and color → WeekC, which render this
// menu and nothing else. So on the frame most teachers actually see, "Compare
// with Team Curriculum" — the way into the fork diff, the surface that answers
// "what did I change?" — was menu-unreachable. 9ad2ca1 fixed the panel's HOST
// and named this as the remaining half of the job:
//
//   "re-homing the forking items onto the v2 canvases is its own job."
//
// Both rows reuse the EXISTING wiring, verbatim — no new forking logic:
//   • Compare  → the self-contained push + requestCompare() pair that
//     context-menu.tsx:344-360 uses. <ForkDiffHost> (a singleton in the
//     planner layout) hears both and re-applies its own gates, so every host
//     of this menu gets the diff for free.
//   • Restore  → usePlanner().restoreLesson(id), the same call
//     weekly-lesson-card.tsx:1861 makes for the v1 menu's "restore-master".
//     <UndoToastBridge> supplies the "Restored the team's version" toast and
//     the ⌘Z step; nothing extra is needed here.
//
// Gating mirrors v1 exactly rather than improving on it — same predicate, same
// omit-never-grey rule — so the two menus can never disagree about whether an
// action is offered.
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
//
// …AND FIXED POSITIONING ALONE WAS NOT ENOUGH (found live, 2026-08-09). The
// menu is rendered inside the lesson TILE, and a WeekA/WeekC tile animates
// `transform` on hover. A transformed ancestor becomes the containing block for
// its `position: fixed` descendants, so for the life of that transition the
// menu stopped resolving against the viewport and resolved against the tile
// instead. Measured: the menu's top oscillated between 602px and 779px on
// consecutive animation frames — the clamp was computing the right number and
// the browser was applying it to a different origin.
//
// The consequences were all real and all invisible from the code: the menu
// hung ~177px lower than it was told to, so a tile in the lower half of the
// week put its last rows BELOW the fold with no way to reach them, and the box
// moved every frame while the pointer sat on the tile — which is exactly where
// the pointer is after clicking the ⋮. This predates the forking rows (the
// four-row menu has it too); it only became load-bearing when the menu grew
// tall enough for the offset to push rows off-screen.
//
// So the menu is now a REAL portal to document.body, which is what "escape the
// container" always meant. React portals keep React-tree event bubbling, so the
// stopPropagation below is still required and still correct, and `contains()`
// in the dismissal handler still works because that is native DOM containment
// within the portal node.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Tooltip } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { canCompareWithTeam, requestCompare } from "@/lib/fork-diff";
import styles from "./lesson-kebab-menu.module.css";

// Menu box metrics — used for the viewport clamp. They match the CSS below;
// measuring instead would mean rendering off-screen first and reading back,
// which is a layout thrash for a box whose size is fixed by design.
//
// The HEIGHT is computed per open, not a constant, because the row count is
// conditional: the two forking rows appear only on a lesson that has actually
// been forked. The old fixed 236 would clamp a six-row menu as if it were two
// rows shorter, and near the bottom of the viewport the last row would sit off
// screen.
//
// Each term is the CSS value it names, and the sum was CHECKED against a live
// measurement rather than derived and trusted — a six-row menu measures 339px,
// which is what these add up to. The header is the term that had to be
// measured: 26 was the arithmetic from .title's padding and font-size, and the
// real line box is 4px taller. (.menu also carries a max-height + overflow
// backstop, so a future drift degrades to scrolling rather than to rows that
// cannot be reached.)
const MENU_W = 178;
const MENU_PAD = 12; // .menu padding, 6px top + 6px bottom
const MENU_HEADER_H = 30; // .title — measured line box, not the paper sum
const MENU_ROW_H = 48; // .menu.menu button min-height
const MENU_DIVIDER_H = 9; // .divider — 1px rule inside 4px margins
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

// The two forking rows are NOT in the handoff's menu, so there is no path to
// trace. Both are drawn in the same 24-box, 2px round-capped stroke idiom as
// the four above so the menu still reads as one control.

/** Two panels side by side — "your version next to the team's". */
const IconCompare = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="7" height="16" rx="1.6" />
    <rect x="14" y="4" width="7" height="16" rx="1.6" />
  </svg>
);

/** Counter-clockwise arrow — the standard "revert" glyph. */
const IconRestore = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 12a8.5 8.5 0 1 0 2.9-6.4L3 8.4" />
    <path d="M3 3.4v5h5" />
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
  // The forking rows need the LESSON, not just its id — `modified`, `moved`
  // and `masterSnapshot` decide whether either row is offered — plus the
  // restore action itself. Both come from the store rather than from new
  // props, deliberately: `restoreLesson` would have forced a <PlannerProvider>
  // dependency on this component whichever way the lesson arrived, and every
  // host of this menu (WeekA, WeekC, WeeklyLessonCard) already calls
  // usePlanner() itself. So this adds no constraint its callers did not
  // already carry, and it keeps the three canvases' callsites untouched.
  //
  // The one thing it DOES cost: this component is no longer droppable outside
  // a <PlannerProvider>. It is not rendered anywhere outside one today (the
  // Settings → Appearance preview mounts <LessonCard>, not these hosts), but a
  // future callsite outside the planner tree would throw from usePlanner.
  const { lessons, restoreLesson } = usePlanner();
  const { editMode } = useAppState();
  const lesson = useMemo(
    () => lessons.find((l) => l.id === lessonId) ?? null,
    [lessons, lessonId],
  );

  // PERSONAL-MODE ONLY, exactly as v1 gates them (context-menu.tsx:325/345):
  // both rows are about a teacher's own fork, and in Team-Curriculum mode the
  // displayed lesson IS the shared version — there is no personal overlay to
  // compare against or discard. Never greyed; fully omitted (the audit rule).
  const personalMode = editMode !== "master";
  const canCompare =
    personalMode && lesson !== null && canCompareWithTeam(lesson);
  // v1's predicate is `modified`, NOT `modified || moved` — so a moved-ONLY
  // fork can be compared but not restored. Mirrored rather than corrected: the
  // two menus must not disagree about what is offered, and widening the gate
  // is a behaviour change for the v1 surface too.
  const canRestore = personalMode && lesson?.modified === true;
  const forkRows = (canCompare ? 1 : 0) + (canRestore ? 1 : 0);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = pos !== null;

  const close = useCallback((): void => setPos(null), []);

  // Anchor below-right of the trigger, clamped into the viewport — the same
  // Math.max(8, Math.min(…)) clamp the mockup applies (:10835). The height is
  // derived from the rows that will actually render (see the metric constants).
  const openMenu = useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const rows = (onPlan ? 4 : 3) + forkRows;
    const menuH =
      MENU_PAD +
      MENU_HEADER_H +
      rows * MENU_ROW_H +
      (forkRows > 0 ? MENU_DIVIDER_H : 0);
    setPos({
      x: Math.max(
        8,
        Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8),
      ),
      y: Math.max(8, Math.min(r.bottom + GAP, window.innerHeight - menuH - 8)),
    });
  }, [onPlan, forkRows]);

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

  // ── Scroll / resize dismissal ──────────────────────────────────────────────
  // THE PORTAL'S COST, PAID HERE. `pos` is computed once, at open, from the
  // trigger's rect. While the menu lived inside the tile it moved with the
  // tile for free; portalled to document.body it does not, so a scroll or a
  // resize leaves it parked at stale viewport coordinates — visually detached
  // from its lesson AND still clickable, which is the dangerous half: the row
  // acts on the lesson it was opened for, while sitting over a different one.
  //
  // CLOSE, not reposition. Repositioning keeps the menu glued to the trigger
  // but does not fix the case that actually bites: the tile scrolls out of the
  // canvas's own overflow and the menu is left pointing at a lesson that is no
  // longer on screen. Handling that needs visibility testing on top of the
  // reposition, whereas closing removes the entire failure mode — and a scroll
  // is already a strong signal the teacher's attention has moved on. It also
  // matches the outside-mousedown dismissal that sits directly above.
  //
  // CAPTURE PHASE, AND IT IS LOAD-BEARING. Scroll events DO NOT BUBBLE, and
  // the document in this app never scrolls. On /weekly the element that moves
  // the tile is not even #main-content (which has scrollHeight ===
  // clientHeight here) — it is the Week canvas's OWN overflow div, the same
  // container position:fixed exists to escape. So the obvious
  // `window.addEventListener("scroll", …)` would never fire for the only
  // scroll that matters: a listener that looks correct, passes review, and is
  // inert. `capture: true` on the document catches the event on the way DOWN
  // to whichever nested container scrolled.
  //
  // Measured live rather than reasoned about, with both listeners installed at
  // once and the real container scrolled (scripts/tmp/probe-kebab-scroll.mjs):
  // capture fired once, bubble never fired. The probe also asserts the
  // container actually moved first — the run before it did not, and a silent
  // "nothing scrolled" reads exactly like "the listener is dead".
  //
  // SCROLLING THE MENU ITSELF IS NOT A DISMISSAL. A capture listener on the
  // document hears EVERY scroll in the page, including the menu's own — and
  // this menu can legitimately scroll: `.menu` carries max-height:
  // calc(100vh - 16px) + overflow-y: auto as the backstop for the height
  // prediction. On a short viewport that backstop engages, and without this
  // guard a teacher scrolling down to reach the last rows would close the menu
  // on the way. The forking rows are the LAST two, so Compare and Restore
  // would be precisely the actions made unreachable — the guard's absence
  // would have undone this whole change on exactly the surface it targets.
  //
  // `contains` includes the node itself, so this covers a scroll ON the menu
  // and one inside any future nested scroller within it. The Node check also
  // lets `resize` share the handler: its target is `window`, never a Node, so
  // a resize always falls through to close.
  //
  // `resize` is a genuine window event and needs no capture.
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: Event): void => {
      const t = e.target;
      if (t instanceof Node && menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, close]);

  // Move focus into the menu on open so the keyboard path continues where the
  // eye does. useEffect, NOT useLayoutEffect: this component renders on the
  // server (it sits inside the Week canvases' SSR output), and React warns on
  // every useLayoutEffect in a server render. The menu only ever exists after
  // a client click, so the post-paint timing costs nothing here.
  //
  // `preventScroll` matters now that a scroll closes the menu (see above).
  // focus() otherwise scrolls the focused element into view, and a browser that
  // decided this button needed scrolling would fire the very event that shuts
  // the menu — it would open and vanish in the same tick. Nothing is lost by
  // suppressing it: the menu is position:fixed and already clamped inside the
  // viewport, so there is never anything to scroll it into view FROM.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
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
        // The summary a screen reader hears before opening. It has to name the
        // forking rows when they exist, or the control promises three things
        // and delivers five — but it EXTENDS the existing phrase rather than
        // replacing it, so the label stays stable for the unedited lesson that
        // is the common case (and for the tests that key on that prefix).
        aria-label={`Open, teach, or post “${lessonTitle}”${
          forkRows > 0 ? " — or compare and restore your copy" : ""
        }`}
        title={`Open, teach, or post “${lessonTitle}”${
          forkRows > 0 ? " — or compare and restore your copy" : ""
        }`}
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

      {/* `open` is client-only state (it starts null and only a click sets it),
          so document.body is always there by the time this branch runs — the
          server render never reaches createPortal. The typeof guard is belt for
          any future non-DOM renderer, not a live case. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
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
            // Still required WITH the React portal: React replays events along
            // the REACT tree, not the DOM tree, so a click in here would reach
            // the tile's onClick and toggle the expansion behind the menu.
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
              <button type="button" onClick={() => go(() => onPlan(lessonId))}>
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
            {/* The mockup's fourth row carries the lesson INTO its library
              overlay — `setLesson(menu.lesson); setLibOpen(true)` (mockup
              :10843) — so in the handoff all four rows are lesson-scoped.
              Ours cannot be: /planner takes no query params anywhere in the
              app (app/(planner)/planner/page.tsx renders <PlannerHub/> with no
              props, and PlannerHub reads no URL), so there is no lesson-scoped
              route to link to. Inventing one is a feature, not a menu fix.

              So the row says what it does. It keeps the handoff's icon and
              position, and takes the app's own name for the destination
              ("Planner hub" — ViewTitle.tsx:41, CLAUDE.md §8's route map), which
              reads as a place rather than as something done to this lesson. The
              title spells out the scope for the teacher who expects the header's
              lesson to travel with them (Codex gate, Medium). When /planner
              grows a lesson deep link, this becomes a one-line change back. */}
            <button
              type="button"
              title="Open the Planner hub — browse the whole plan. It does not open this lesson."
              onClick={() => go(() => router.push("/planner"))}
            >
              <IconPlanner />
              Planner hub
            </button>

            {/* ── Forking ────────────────────────────────────────────────────
              Ported from the v1 card menu so the default (glass) frame has a
              door to them at all. Both rows are omitted, never disabled, when
              they do not apply — so on an unedited lesson the menu is exactly
              the four handoff destinations it has always been.

              LAST, and after a rule, for two reasons. They are a different
              KIND of action from the four above (those go somewhere; these act
              on this lesson's relationship to the team plan), and the menu
              autofocuses its first button on open — a tooltip-bearing row in
              that position would pop a bubble every single time the menu is
              opened, because <Tooltip> shows on focus with no delay. Keeping
              the tipped rows out of first position is what makes the tips
              quiet. (Which is also why Plan/Teach/Post are still untipped: it
              is a real §4 gap, but closing it needs the autofocus question
              answered first, and that is not this change.) */}
            {forkRows > 0 && (
              <div className={styles.divider} role="separator" />
            )}

            {canCompare && (
              <Tooltip
                content="See exactly what you changed — every field where your copy differs from the Team Curriculum, with a revert for each one"
                side="right"
                tooltipId="week-kebab-compare-team"
              >
                <button
                  type="button"
                  onClick={() =>
                    go(() => {
                      // Both halves, exactly as context-menu.tsx:348-358 does
                      // them. The push is the durable, shareable door; the event
                      // is what makes it work when the App Router has not
                      // committed the URL yet, or when the target lesson is
                      // already the selected one. <ForkDiffHost> consumes both.
                      router.push(
                        `/daily?lesson=${encodeURIComponent(lessonId)}&compare=1`,
                      );
                      requestCompare(lessonId);
                    })
                  }
                >
                  <IconCompare />
                  Compare
                </button>
              </Tooltip>
            )}

            {canRestore && (
              // `required` — this discards the teacher's personal edits to the
              // lesson, which puts it in CLAUDE.md §4's always-on class. It is
              // undoable (one ⌘Z, and <UndoToastBridge> raises the "Restored the
              // team's version" toast), but a teacher must not be able to turn
              // OFF the tip that tells them what the row does.
              <Tooltip
                content="Discard your personal edits to this lesson and go back to the Team Curriculum version. You can undo it."
                side="right"
                required
              >
                <button
                  type="button"
                  // The same store action the v1 menu's "restore-master" runs
                  // (weekly-lesson-card.tsx:1861) — one dispatch, one history
                  // step, toast supplied by the bridge in the planner layout.
                  onClick={() => go(() => restoreLesson(lessonId))}
                >
                  <IconRestore />
                  {/* One word, like every row above it. "Restore team version"
                    was the first draft and it WRAPPED to two lines in the 178px
                    box (measured: a 56px row against 48px everywhere else),
                    which both broke the row rhythm and made the height
                    prediction under-count. The pair "Compare" / "Restore" reads
                    unambiguously as a pair, and the thing they act on is named
                    in both tooltips and in the trigger's own label. */}
                  Restore
                </button>
              </Tooltip>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
