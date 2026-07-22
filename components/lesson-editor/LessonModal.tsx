"use client";

// LessonModal.tsx — the centered, resizable lesson-editor popup (W3.8).
//
// One of the three hosts of the shared fill-in template (<LessonEditor>):
// Day-edit right pane · Week cell expand · THIS modal. Opened from the
// weekly cards' "Open in editor ⤢" affordance (and, in later sub-waves,
// from the Day view's openPlan seam).
//
// Anatomy (top to bottom — the bundle's `.pb-modal`, ~B:11112-11140):
//   • Glass scrim — full-viewport blur. Deliberately NO click-to-close
//     (locked W3.8 scope): the modal closes ONLY via the Exit button or
//     Esc. Teachers resize the modal by its bottom-right corner
//     (CSS resize:both, min 360×300, max 96vw/92vh) — a scrim click
//     mid-resize must never eat their work-in-progress.
//   • Header band — SOLID subject color (via the `cp-subj` palette
//     cascade, never a hex): uppercase "SUBJECT · TIME" line + the
//     lesson title (double-click / Enter / F2 to edit — LessonDetail's
//     title idiom; commits through editLesson with coalescing).
//   • Header right cluster — team-mode pill OR "Push to Team" button,
//     then Exit.
//   • Team banner — striped pink warning when the top-bar toggle is in
//     Team (master) mode. CLAUDE.md §2: visible friction, no confirm
//     dialogs.
//   • Body — meta chip row (Standard · subject · unit) + <LessonEditor
//     host="modal">.
//
// FORK SAFETY: this modal never auto-pushes to the team plan. Autosave
// inside <LessonEditor> is the store's lazy-fork write path (builder A's
// wiring); the ONLY store calls made here are editLesson (title) and
// setSaveTarget(id, "core") behind the explicit "Push to Team" button —
// which is a deliberate no-op in the store until the backend wave.
//
// ESC CONTRACT (innermost-first — mock defect #2 fix): the Esc listener
// is attached to `window` in the bubble phase — the OUTERMOST point on
// the propagation path — and ignores events whose `defaultPrevented` is
// already set. Any popover / menu / inline editor INSIDE the modal that
// consumes Escape must call `event.preventDefault()` when it handles the
// key (element-level React handlers and document-level listeners both
// run before a window bubble listener). The title editor's Escape-cancel
// below follows the same rule, as do A/B's section menus and the
// standards picker. An unconsumed Esc reaches the window and closes the
// modal.
//
// ACCESSIBILITY: the full save-target-dialog contract —
// role="dialog" + aria-modal + aria-labelledby the lesson title, focus
// moves into the dialog on open (the Exit button — the safe default),
// Tab / Shift-Tab are trapped inside the panel, and focus restores to
// the opener on close. Body scroll is locked while open (the
// StandardsTaggingPicker pattern).
//
// PORTAL: into `.cp-root`, NOT document.body — the modal's buttons rely
// on the `.cp-root button` resets and the `.cp-root` font cascade
// (tokens.css); rendering under bare <body> would lose them. See the
// long note in components/rich-text/rich-text-editor.tsx (~L1414).
//
// THEMING: the root carries the global `lm-modal` class and the scrim
// `lm-scrim` — both enrolled in app/themes.css §5 (surface theming
// contract) so the active theme's accent wash reaches them above the
// z-90 theme tint.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { LessonEditor } from "@/components/lesson-editor";
import { Button, Tooltip } from "@/components/ui";
import { RichTextEditor } from "@/components/rich-text";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { lessonTime } from "@/lib/mock";
import styles from "./LessonModal.module.css";

// ── Props ─────────────────────────────────────────────────────────────────

export interface LessonModalProps {
  /** The lesson to edit. The modal reads the live record from the planner
   *  store so cross-host edits (autosave broadcast) paint immediately. */
  lessonId: string;
  /** Close the modal (Exit button / Esc). The host owns the open state. */
  onClose: () => void;
  /** Read-only hosting (View-mode "Plan" opens). Hides title editing and
   *  the Push-to-Team button; forwarded to <LessonEditor>. */
  readOnly?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

// All standard keyboard-reachable elements — same query the
// save-target-dialog focus trap uses.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Strip HTML tags for plain-text contexts (aria-label, toast copy). The
 *  title may carry inline markup from a rich-text edit on another host.
 *  Mirrors weekly-lesson-card's isomorphic stripHtml projection. */
function stripHtml(html: string): string {
  return (html ?? "").slice(0, 2000).replace(/<[^>]*>/g, "");
}

/** How long the "✓ Marked for team push" confirmation state holds
 *  (bundle: 2200ms). */
const PUSHED_CONFIRM_MS = 2200;

/** The Exit button's accessible name — also the mount-focus query target
 *  (ui/Button spreads aria-label onto the real <button>, so this is the
 *  stable hook for finding it; Button exposes no ref prop). */
const EXIT_LABEL = "Exit the lesson editor";

// ── Component ─────────────────────────────────────────────────────────────

export function LessonModal({
  lessonId,
  onClose,
  readOnly = false,
}: LessonModalProps): ReactNode {
  const { lessons, subjectById, editLesson, setSaveTarget } = usePlanner();
  const { editMode } = useAppState();
  const { showConsequence } = useConsequenceToast();
  const titleId = useId();

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;

  const panelRef = useRef<HTMLDivElement>(null);
  // The element focused before the modal opened — restored on unmount so
  // keyboard users land back on the "Open in editor" affordance they came
  // from (save-target-dialog contract).
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Team (master) mode ──────────────────────────────────────────────────
  const team = editMode === "master";

  // ── Open / close lifecycle ──────────────────────────────────────────────
  // The host renders the modal only while open, so mount/unmount effects
  // carry the whole lifecycle: capture + restore opener focus, and lock
  // body scroll (StandardsTaggingPicker pattern).
  //
  // STRICT-MODE HAZARD (the W3.8 gate's live focus bug — root cause): dev
  // StrictMode runs this effect setup → cleanup → setup. The first version
  // restored the opener's focus from cleanup via setTimeout(…, 0); that
  // timer — scheduled by the FAKE unmount — fired AFTER the second setup's
  // rAF had focused the Exit button, yanking focus straight back to the
  // opener. Live symptom: focus never visibly entered the modal, and the
  // opener's tooltip stayed pinned over it. The rules now:
  //   • restore focus SYNCHRONOUSLY in cleanup — no timer can outlive its
  //     own setup/cleanup cycle and clobber the re-setup's work;
  //   • cancel the whole rAF chain (both frame ids + a flag);
  //   • never steal focus that has already moved inside the panel (don't
  //     fight an autofocusing child in the editor);
  //   • only restore to an opener still in the document (Esc used to
  //     double-fire with the shell's deselect listener, collapsing the
  //     card and unmounting the opener — see the modal-open guard on
  //     WeeklyShell's Esc-deselect effect).
  useEffect(() => {
    // Capture the opener FIRST — before any focus() this effect performs.
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Initial focus: the Exit button — the safe default (never a control
    // that starts an edit). Located by its accessible name because the
    // Button primitive exposes no ref prop. Double-rAF: frame 1 lets the
    // portal subtree paint; frame 2 runs after any same-frame focus work
    // by children so the don't-fight-an-autofocus check sees the settled
    // state.
    let cancelled = false;
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const panel = panelRef.current;
        if (!panel || panel.contains(document.activeElement)) return;
        panel
          .querySelector<HTMLElement>(`button[aria-label="${EXIT_LABEL}"]`)
          ?.focus();
      });
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the opener — synchronously (see hazard note
      // above) and only if it still exists in the document (a detached
      // opener would silently drop focus to <body>). Covers BOTH close
      // paths: the Exit button and the window Esc listener end in this
      // same unmount cleanup.
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        prev.focus();
      }
    };
  }, []);

  // ── Esc-to-close (innermost-first — see the header contract note) ──────
  // window bubble phase = outermost: element handlers AND document-level
  // listeners inside the modal all run first and preventDefault the Esc
  // they consume, so this only fires for a genuinely unclaimed Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Focus trap — Tab / Shift-Tab cycle inside the panel ────────────────
  // (save-target-dialog contract; Escape is handled by the window listener
  // above so nested consumers get first claim.)
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  // ── Title editing (LessonDetail's double-click idiom) ───────────────────
  // Pure local UI state; the draft commits to the store on blur via
  // editLesson with a coalesce key (typing burst = one undo step). NEVER
  // localStorage. Escape cancels — and preventDefaults so the window
  // listener above does not also close the modal (innermost-first).
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState<string>("");

  // A different lesson resets any open editor so a stale draft can never
  // bleed across records.
  useEffect(() => {
    setTitleEditing(false);
    setDraftTitle("");
  }, [lessonId]);

  const openTitleEditor = useCallback(
    (e?: SyntheticEvent): void => {
      if (readOnly || lesson === null) return;
      e?.stopPropagation();
      e?.preventDefault();
      setTitleEditing(true);
      setDraftTitle(lesson.title);
    },
    [readOnly, lesson],
  );

  const commitTitle = useCallback((): void => {
    // Guarded so a blur firing after an Escape-cancel can never re-commit
    // a stale draft (LessonDetail's commitEdit guard).
    if (!titleEditing) return;
    const trimmed = draftTitle.trim();
    if (lesson !== null && trimmed !== (lesson.title ?? "")) {
      editLesson(
        lessonId,
        { title: trimmed },
        { key: `lesson:${lessonId}:title`, ts: Date.now() },
      );
    }
    setTitleEditing(false);
    setDraftTitle("");
  }, [titleEditing, draftTitle, lesson, lessonId, editLesson]);

  const cancelTitle = useCallback((): void => {
    setTitleEditing(false);
    setDraftTitle("");
  }, []);

  // ── Push to Team ────────────────────────────────────────────────────────
  // Explicit push is the ONLY path to the shared plan (fork model). The
  // store action records the intent and is a deliberate no-op until the
  // backend wave — so the confirmation copy speaks in INTENT ("marked to
  // push"), never asserting a team-plan change that has not actually
  // happened yet (gate finding M3, §2 fork-truthfulness). The button flips
  // to "✓ Marked for team push" for 2.2s and the consequence toast names
  // the pending effect (W2-B8 pattern — the house fit for the bundle's
  // `cc-toast` event). When the backend write lands, restore the bundle's
  // completed-action copy ("Pushed to Team" / "moved to the shared plan").
  const [pushed, setPushed] = useState(false);
  const pushedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pushedTimerRef.current !== null) clearTimeout(pushedTimerRef.current);
    },
    [],
  );

  const handlePushToTeam = useCallback((): void => {
    if (lesson === null) return;
    setSaveTarget(lessonId, "core");
    setPushed(true);
    showConsequence({
      message: `"${stripHtml(lesson.title)}" is marked to push to the team curriculum — team sync arrives with the backend wave.`,
    });
    if (pushedTimerRef.current !== null) clearTimeout(pushedTimerRef.current);
    pushedTimerRef.current = setTimeout(
      () => setPushed(false),
      PUSHED_CONFIRM_MS,
    );
  }, [lesson, lessonId, setSaveTarget, showConsequence]);

  // ── Deleted-while-open guard ────────────────────────────────────────────
  // If the lesson disappears from the store (archived / deleted on another
  // surface via the live broadcast), close rather than render a husk.
  useEffect(() => {
    if (lesson === null) onClose();
  }, [lesson, onClose]);

  if (lesson === null || typeof document === "undefined") return null;

  const subj = subjectById[lesson.subject];
  const plainTitle = stripHtml(lesson.title);

  return createPortal(
    /* Scrim — NO onClick by design: Exit or Esc are the only closes. */
    <div className={`${styles.scrim} lm-scrim`}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        title="Lesson editor — plan this lesson in the full template. Close with the Exit button or Esc."
        className={`${styles.modal} lm-modal cp-subj ${subj.cls}`}
        onKeyDown={handleKeyDown}
      >
        {/* ── Sticky header block ────────────────────────────────────────
            The band (and the team banner when present) pins to the top of
            the modal's own scroll container so the title, mode pill,
            Push-to-Team, and Exit stay reachable in long lessons (gate
            finding #6). One wrapper keeps band + banner stuck TOGETHER
            without hard-coding the band's variable height. */}
        <div className={styles.msticky}>
          {/* ── Header band — solid subject color ─────────────────────────── */}
          <div className={styles.mhead}>
            <div className={styles.mheadLeft}>
              <div className={styles.msubj}>
                {subj.name} · {lessonTime(lesson)}
              </div>
              {/* Title — static text, double-click / Enter / F2 to edit
                (LessonDetail idiom). aria-labelledby target: the wrapper
                always contains the current title text, editing or not. */}
              <div id={titleId} className={styles.mtitle}>
                {titleEditing ? (
                  <TitleEditorShell
                    onCommit={commitTitle}
                    onCancel={cancelTitle}
                  >
                    <div className={styles.titleEditor}>
                      <RichTextEditor
                        value={draftTitle}
                        onChange={setDraftTitle}
                        autoFocus
                        singleLine
                        placeholder="Lesson title…"
                        ariaLabel="Edit lesson title"
                      />
                    </div>
                  </TitleEditorShell>
                ) : readOnly ? (
                  <span className={styles.titleText}>{plainTitle}</span>
                ) : (
                  <Tooltip
                    content="Double-click or press Enter to rename this lesson — saved automatically as you type elsewhere in the editor."
                    side="bottom"
                    tooltipId="lesson-modal-title-edit"
                  >
                    <span
                      className={styles.titleText}
                      tabIndex={0}
                      role="button"
                      aria-label="Edit lesson title"
                      onDoubleClick={openTitleEditor}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "F2")
                          openTitleEditor(e);
                      }}
                    >
                      {plainTitle}
                    </span>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* ── Right cluster: team pill / push-to-team, then Exit ───────── */}
            <div className={styles.mheadr}>
              {team ? (
                /* required:true — the team-mode explanation is on the
                 high-consequence always-on list (CLAUDE.md §4). */
                <Tooltip
                  content="You are editing the team curriculum — changes affect every teacher."
                  side="bottom"
                  required
                >
                  <span className={styles.teamPill}>● Team curriculum</span>
                </Tooltip>
              ) : (
                !readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`${styles.headBtn} ${pushed ? styles.headBtnDone : ""}`}
                    onClick={handlePushToTeam}
                    tooltip="Mark this lesson to push to the shared team curriculum — it moves from your personal copy to the team plan everyone sees once team sync lands (backend wave)"
                  >
                    {pushed ? "✓ Marked for team push" : "Push to Team"}
                  </Button>
                )
              )}
              <Button
                variant="ghost"
                size="sm"
                className={styles.headBtn}
                aria-label={EXIT_LABEL}
                onClick={onClose}
                tooltip="Exit the lesson editor (Esc) — edits are already saved as you type"
              >
                Exit
              </Button>
            </div>
          </div>

          {/* ── Team-mode banner — striped, persistent, no confirm dialog ──── */}
          {team && (
            <div className={styles.teamBanner} role="status">
              Heads up — changes here affect the whole team.
            </div>
          )}
        </div>

        {/* ── Body: meta chips + the shared fill-in template ─────────────── */}
        <div className={styles.mbody}>
          <div className={styles.mmeta}>
            {lesson.standards.length > 0 && (
              <span>Standard {lesson.standards[0]}</span>
            )}
            <span>{subj.name}</span>
            <span>{lesson.unit || "Planned"}</span>
          </div>
          <LessonEditor lessonId={lessonId} host="modal" readOnly={readOnly} />
        </div>
      </div>
    </div>,
    // Portal target: .cp-root, not document.body — see the header note.
    document.querySelector(".cp-root") ?? document.body,
  );
}

// ── TitleEditorShell ──────────────────────────────────────────────────────
// Thin shell owning the two gestures RichTextEditor does not expose as
// props — the RichEditorWrapper pattern from LessonDetail / WeeklyLessonCard:
//   • Escape           → cancel (discard the draft). preventDefault +
//                        stopPropagation so the modal's window-level Esc
//                        listener never sees an unclaimed event
//                        (innermost-first contract).
//   • blur out of area → commit. relatedTarget checks keep the editor open
//                        while focus moves within the shell or into the
//                        portaled floating toolbar (role="toolbar").

function TitleEditorShell({
  onCommit,
  onCancel,
  children,
}: {
  onCommit: () => void;
  onCancel: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      onBlur={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;
        if (next?.closest('[role="toolbar"]')) return;
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}
