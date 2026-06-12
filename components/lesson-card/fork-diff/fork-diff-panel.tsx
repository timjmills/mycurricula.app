"use client";

// fork-diff-panel.tsx — the inline Master-vs-personal diff (UX roadmap item
// 01, "Fork diff view"). PROTOTYPE against the mock `Lesson.masterSnapshot`
// seam; Phase 1B re-points the snapshot at persisted fork lineage without
// changing this component.
//
// Spec (6.12.26 handoff, item 01):
//   • INLINE diff as the default — each divergent field renders old → new
//     inside the lesson-detail layout (this panel mounts in LessonDetail's
//     body and inside the legacy CompareToMaster modal shell). Removed
//     (Team) values sit on a --danger-tint row, added (personal) values on
//     --done-tint — SEMANTIC tokens, never subject colors.
//   • Side-by-side is a secondary per-row toggle for the LONG content
//     fields (objective, lesson-flow sections).
//   • Per-field revert is hover-revealed (the Weekly-card pattern), ≥44px
//     effective target, with a `required` tooltip (destructive).
//   • Footer: "Revert to Team version" (whole lesson) and "Propose to Team"
//     (switches editMode to "master" — the EXISTING flashing-then-persistent
//     banner is the safety mechanism; no confirm dialog, and Master is
//     never written directly from here).
//
// Store wiring & undo semantics:
//   • PERSONAL-MODE ONLY (M1): the panel renders nothing in Team-Curriculum
//     (master) editing mode. Per-field revert writes through editLesson /
//     moveLesson, whose persist tee targets the ACTIVE save target — in
//     master mode those writes would land on the SHARED master rows, but the
//     diff's whole contract is personal-scoped ("what did *I* change").
//     Entry points (card menu, LessonDetail header, ?compare=1) are gated
//     upstream; the early return here is the defense for any stale host.
//   • Whole-lesson revert dispatches the store's EXISTING restoreLesson
//     path, so the roadmap-02 undo toast ("Restored the team's version")
//     fires and the gesture is one undoable history step. restoreLesson is
//     snapshot-aware (roadmap-01 H1): when the lesson carries a
//     masterSnapshot the reducer restores the captured content fields AND
//     placement (via its moveLesson delegation) — the toast tells the truth
//     and one ⌘Z brings the whole fork back.
//   • Per-field CONTENT revert goes through editLesson — in Personal mode
//     it stays personal. editLesson never toasts BY DESIGN (the undo-toast
//     matrix excludes edit bursts), so per-field revert relies on ⌘Z / the
//     top-bar undo for its way back; we deliberately add no new toast kinds.
//   • Per-field SCHEDULING revert goes through moveLesson (M4) — NOT a bare
//     editLesson day/week patch: editLesson's persist tee forwards only the
//     content fields LessonPatch accepts, so a bare patch would move the
//     lesson locally yet silently never persist, and it would bypass
//     moveLesson's CellLayout pruning. The follow-up editLesson clears
//     `moved` (two dispatches → two ⌘Z steps; documented at the callsite).
//   • Per-field revert leaves `modified` set: the snapshot is PARTIAL
//     (directions, notes, resources, and tasks are not captured), so "every
//     field now matches the master" cannot be proven cheaply — and under
//     lazy-fork semantics the personal copy still exists, so the dashed
//     stripe staying on is the honest signal. The one cheap reconvergence we
//     CAN prove is placement: the snapshot fully captures day+week, so
//     reverting the scheduling row also clears `moved` and the move-arrow
//     resets immediately.

import { useMemo, useState } from "react";
import type { Lesson } from "@/lib/types";
import { diffLessonAgainstMaster, type FieldDiff } from "@/lib/fork-diff";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useOrderedWeekdays } from "@/lib/week-order";
import { Button, Tooltip } from "@/components/ui";
import styles from "./fork-diff-panel.module.css";

// Long content fields that earn the side-by-side toggle (item-01 spec).
const LONG_FIELDS: ReadonlySet<FieldDiff["field"]> = new Set([
  "objective",
  "sections",
]);

export interface ForkDiffPanelProps {
  /** The forked lesson — must carry a `masterSnapshot` (the panel renders
   *  nothing without one; gate entry points on canCompareWithTeam()). */
  lesson: Lesson;
  /** Close the panel (collapse the section / dismiss the host modal). */
  onClose: () => void;
}

export function ForkDiffPanel({ lesson, onClose }: ForkDiffPanelProps) {
  const { editLesson, moveLesson, restoreLesson, getSections } = usePlanner();
  const { editMode, setEditMode } = useAppState();

  // Weekday names resolve through the CONFIGURED school week — injected
  // into the pure diff engine, never hard-coded (CLAUDE.md hard rule).
  const days = useOrderedWeekdays();

  // Per-row view mode: field → side-by-side on. Inline is the default.
  const [sideBySide, setSideBySide] = useState<Record<string, boolean>>({});

  const snapshot = lesson.masterSnapshot;

  // Live lesson-flow sections are store-owned; flatten them to plain-ish
  // text ONLY when the snapshot captured a master sections text to compare
  // against (the diff engine strips/sanitizes both sides).
  const currentSectionsText =
    snapshot?.sections != null
      ? getSections(lesson.id)
          .map((s) => `${s.heading} ${s.body}`)
          .join(" ")
      : undefined;

  const diffs = useMemo(
    () =>
      snapshot
        ? diffLessonAgainstMaster(lesson, snapshot, {
            dayLabel: (d) => days[d]?.longLabel ?? `Day ${d + 1}`,
            currentSectionsText,
          })
        : [],
    [lesson, snapshot, days, currentSectionsText],
  );

  // Defensive: entry points are gated on canCompareWithTeam(), but a stale
  // mount (e.g. the lesson was just whole-reverted) must render nothing.
  if (!snapshot) return null;

  // PERSONAL-MODE GATE (M1, defense-in-depth — see the header comment).
  // Every entry point already requires editMode === "personal", but the
  // reverts below write with the ACTIVE save target, so a master-mode mount
  // must never reach them: in Team-Curriculum mode the diff simply does not
  // offer itself.
  if (editMode !== "personal") return null;

  // ── Per-field revert ─────────────────────────────────────────────────────
  // A content edit via editLesson (stays personal in Personal mode). No
  // toast — editLesson is excluded from the undo-toast matrix by design —
  // so the way back is ⌘Z / the top-bar undo (one history step per revert).
  function revertField(diff: FieldDiff): void {
    if (!snapshot) return;
    // Per-field coalesce key: re-clicking the SAME field's revert inside the
    // coalesce window stays one history step (idempotent), but reverting two
    // DIFFERENT fields back-to-back stays two separate ⌘Z steps — they must
    // not collapse under editLesson's default per-lesson patch key.
    const coalesce = {
      key: `lesson:${lesson.id}:fork-revert:${diff.field}`,
      ts: Date.now(),
    };
    switch (diff.field) {
      case "title":
      case "objective":
      case "preview":
        editLesson(lesson.id, { [diff.field]: snapshot[diff.field] }, coalesce);
        break;
      case "standards":
        editLesson(lesson.id, { standards: [...snapshot.standards] }, coalesce);
        break;
      case "scheduling":
        // (M4) Placement goes down the store's MOVE path, never a bare
        // editLesson day/week patch: editLesson's persist tee
        // (planner-store ~"updateLesson" note) forwards only the content
        // fields the source's LessonPatch accepts — a bare patch would move
        // the lesson locally yet silently never persist, and would skip
        // moveLesson's CellLayout pruning. moveLesson is the store's plain
        // move verb AND tees persist("moveLesson") with the resolved slot;
        // relocateLesson(id, target, false) runs the same reducer but is
        // not teed, so moveLesson it is. We do NOT dispatch the
        // snapshot-aware restoreLesson here — it would also revert CONTENT,
        // and a scheduling-only revert must keep the teacher's text edits.
        //
        // Placement reconvergence IS cheaply provable (the snapshot fully
        // captures day+week), so the follow-up edit clears `moved` — the
        // move-arrow / stripe state resets immediately; `modified` stays
        // as-is (see header). `moved` is not a LessonPatch field, so its
        // tee is dropped by the source (flag-only, reducer-local). Cost:
        // two dispatches → two ⌘Z steps for this one gesture — accepted
        // for the prototype; a dedicated "revertPlacement" action would be
        // store-surface growth the Phase 1B lineage work obsoletes.
        moveLesson(lesson.id, { day: snapshot.day, week: snapshot.week });
        editLesson(lesson.id, { moved: null }, coalesce);
        break;
      case "sections":
        // Lesson-flow sections live in the store's sections record, not on
        // the Lesson row — no single-field editLesson patch exists. The
        // revert button is not rendered for this row (see below).
        break;
    }
  }

  // ── Whole-lesson revert ──────────────────────────────────────────────────
  // The store's restore path — snapshot-aware since roadmap-01 H1: content
  // AND placement come back in one undoable step, and the roadmap-02 bridge
  // toasts "Restored the team's version" (now honestly).
  function revertWholeLesson(): void {
    restoreLesson(lesson.id);
    onClose();
  }

  // ── Propose to Team ──────────────────────────────────────────────────────
  // Switches the app into Team-Curriculum (master) editing — the EXISTING
  // flashing-then-persistent red banner is the deliberate safety mechanism
  // (CLAUDE.md §2: no confirm dialogs). Nothing is written to Master here;
  // the teacher edits the master copy explicitly under the banner.
  function proposeToTeam(): void {
    // Defensive guard (L8): the personal-mode gate above means this panel —
    // and therefore this button — never renders in master mode, so the
    // check is unreachable today; it stays so a future host that bypasses
    // the gate can't fire a redundant mode switch from master mode.
    if (editMode !== "personal") return;
    setEditMode("master");
    onClose();
  }

  return (
    <section
      className={styles.panel}
      aria-label="Compare with Team Curriculum"
      // Panel-level title — the touch path for "what is this panel?"
      // (CLAUDE.md §4: named panels carry a title on their root).
      title="Compare with Team Curriculum — every field where your personal copy differs from the team's version, with per-field and whole-lesson revert"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>Compared with the Team Curriculum</h3>
          <p className={styles.sub}>
            {diffs.length === 0
              ? "No differences in the captured fields."
              : `${diffs.length} field${diffs.length === 1 ? "" : "s"} differ — the team's value first, yours second.`}
          </p>
        </div>
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel="Close comparison"
          className={styles.closeBtn}
          onClick={onClose}
          tooltip="Close the comparison without changing anything"
        >
          ×
        </Button>
      </div>

      {/* ── Diff rows ───────────────────────────────────────────────────── */}
      {diffs.length === 0 ? (
        <p className={styles.empty}>
          Your copy matches the captured team snapshot. (Fields the snapshot
          does not capture — directions, notes, resources — may still differ;
          Phase 1B&apos;s persisted lineage closes that gap.)
        </p>
      ) : (
        <ul className={styles.rows}>
          {diffs.map((diff) => {
            const split = sideBySide[diff.field] === true;
            const masterValue = (
              <div className={`${styles.value} ${styles.removed}`}>
                <span className={styles.valueTag}>Team</span>
                <span
                  className={`${styles.valueText} ${diff.master ? "" : styles.valueEmpty}`}
                >
                  {diff.master || "(empty)"}
                </span>
              </div>
            );
            const personalValue = (
              <div className={`${styles.value} ${styles.added}`}>
                <span className={styles.valueTag}>Yours</span>
                <span
                  className={`${styles.valueText} ${diff.personal ? "" : styles.valueEmpty}`}
                >
                  {diff.personal || "(empty)"}
                </span>
              </div>
            );
            return (
              <li key={diff.field} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles.fieldLabel}>{diff.label}</span>

                  {/* Side-by-side toggle — long fields only (spec). */}
                  {LONG_FIELDS.has(diff.field) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={split}
                      onClick={() =>
                        setSideBySide((prev) => ({
                          ...prev,
                          [diff.field]: !split,
                        }))
                      }
                      tooltip={
                        split
                          ? "Stack the two versions back above each other (old → new)"
                          : "Show the team's version and yours next to each other — easier for long text"
                      }
                    >
                      {split ? "Inline" : "Side by side"}
                    </Button>
                  )}

                  {/* Per-field revert — hover-revealed (also always visible
                      on touch + revealed on keyboard focus), `required`
                      tooltip because it discards the teacher's words for
                      this field. Sections have no single-field store patch
                      yet, so that row offers no surgical revert. */}
                  {diff.field !== "sections" && (
                    <Tooltip
                      required
                      content={`Replace your ${diff.label.toLowerCase()} with the team's version — just this field, the rest of your edits stay. Undo with ⌘Z.`}
                      side="left"
                    >
                      <button
                        type="button"
                        className={styles.revertBtn}
                        aria-label={`Revert ${diff.label.toLowerCase()} to the team's version`}
                        onClick={() => revertField(diff)}
                      >
                        <span aria-hidden="true">↩</span> Revert this field
                      </button>
                    </Tooltip>
                  )}
                </div>

                {split ? (
                  <div className={styles.columns}>
                    {masterValue}
                    {personalValue}
                  </div>
                ) : (
                  <>
                    {masterValue}
                    {personalValue}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div className={styles.footer}>
        <p className={styles.footNote}>
          Proposing opens Team Curriculum editing — the team-wide banner applies
          before anything changes for others.
        </p>
        <Tooltip
          required
          content="Drop your personal fork and go back to the team's version of this lesson — undoable from the toast or ⌘Z"
        >
          <Button variant="secondary" size="md" onClick={revertWholeLesson}>
            Revert to Team version
          </Button>
        </Tooltip>
        <Tooltip
          required
          content="Switch to editing the team's curriculum so you can bring your changes to everyone — the red banner flow applies (changes there affect the whole team)"
        >
          <Button variant="primary" size="md" onClick={proposeToTeam}>
            Propose to Team
          </Button>
        </Tooltip>
      </div>
    </section>
  );
}
