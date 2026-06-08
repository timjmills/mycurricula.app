"use client";

// BoardsModule — the teaching-board strip for the active lesson (plan §3.1,
// §4.1, §13.1, §4a). Wave 1 Agent B.
//
// Owns:
//   • board thumbnails for the active lesson, read from the `teach` repository
//     (lib/teach/queries.ts) — the ONLY data path for board content;
//   • board reorder via dnd-kit sortable (drag a thumbnail to re-sequence);
//   • Add Board;
//   • SHARE / PUSH-TO-TEAM — DESTRUCTIVE + team-wide. Pushing a personal set
//     to the team DISPLACES (overwrites) the existing team set (§13.1). It is
//     gated by an always-on `<Tooltip required>` AND a two-step consequence
//     confirmation, then fires `showConsequence` (lib/consequence-toast) naming
//     the team-wide effect with an Undo affordance;
//   • SANDBOX persistence (§4a) — when no lesson is attached, Save-to-new-lesson
//     / Pin-to-existing-lesson surface so sandbox work can be kept.
//
// PRIVACY (§11.4): boards carry STRUCTURE only — never student names. This
// module never reads/writes the local-only groups store; names live solely in
// lib/teach/use-teach-groups.ts.

import { type ReactNode, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, FutureControl, Tooltip } from "@/components/ui";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { teachClient as teach } from "@/lib/teach/client";
import type { Board } from "@/lib/types";
import type { TeachWorkspaceAction } from "@/components/teach/TeachWorkspace";
import { PlusIcon, ShareIcon, PinIcon } from "../icons";
import styles from "../TeachLeft.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface BoardsModuleProps {
  /** Active master lesson id, or null in sandbox mode. */
  activeLessonId: string | null;
  /** Active board id (drives the highlight). */
  activeBoardId: string | null;
  /** True when building boards without a lesson (sandbox, §4a). */
  sandbox: boolean;
  /** Dispatch onto the central workspace reducer. */
  dispatch: (action: TeachWorkspaceAction) => void;
  // ── Single source of truth (audit A1-left) ─────────────────────────────────
  // The board set is OWNED by TeachWorkspace and threaded down here, so the
  // sub-bar pills, footer count, center board, and this module never disagree.
  // This module no longer self-fetches; it mutates through the repo and then
  // calls `reloadBoards` so every surface updates together.
  /** The active lesson's board set (from TeachWorkspace.boards). */
  boards: readonly Board[];
  /** True while TeachWorkspace's first board load is in flight. */
  loading?: boolean;
  /** Grade level to seed new boards with (active board's grade). */
  gradeLevelId?: string;
  /** Re-read the active set after a mutating repo call (returns the fresh set). */
  reloadBoards: () => Promise<Board[]>;
  // ── Owner identity (Finding 3 fix) ─────────────────────────────────────────
  // Threaded from TeachWorkspace: `ME.id` under the mock flag, `currentUser.id`
  // (auth uid) under the live flag. Null briefly while the session resolves; all
  // repo calls guard on it so a non-uuid slug never reaches a uuid/RLS column.
  /** The current teacher's owner id (null while the auth session loads). */
  ownerId: string | null;
}

// ── A sortable board thumbnail row ─────────────────────────────────────────────

function BoardRow({
  board,
  index,
  active,
  onSelect,
}: {
  board: Board;
  index: number;
  active: boolean;
  onSelect: () => void;
}): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: board.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // A two-cell sketch tinted from board tints — alternates so the strip reads
  // as distinct boards; empty boards render muted cells.
  const empty = board.widgets.length === 0;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      className={[
        styles.boardRow,
        active ? styles.boardRowActive : "",
        isDragging ? styles.boardDragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      title="Switch the center to this teaching board (drag to reorder)"
      {...attributes}
      {...listeners}
      aria-pressed={active}
    >
      <span
        className={[styles.boardNum, active ? styles.boardNumActive : ""]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span
        className={[styles.boardLabel, active ? styles.boardLabelActive : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {board.title}
      </span>
      <span className={styles.boardThumb} aria-hidden="true">
        <span
          className={empty ? styles.boardThumbEmpty : styles.boardThumbCell}
        />
        <span
          className={empty ? styles.boardThumbEmpty : styles.boardThumbCellAlt}
        />
      </span>
    </button>
  );
}

// ── Module ─────────────────────────────────────────────────────────────────────

export function BoardsModule({
  activeLessonId,
  activeBoardId,
  sandbox,
  dispatch,
  boards,
  loading = false,
  gradeLevelId,
  reloadBoards,
  ownerId,
}: BoardsModuleProps): ReactNode {
  const { lessons } = usePlanner();
  const { setSelectedLessonId } = useAppState();
  const { showConsequence } = useConsequenceToast();

  // Two-step confirm gate for the destructive push-to-team displacement.
  const [confirmPush, setConfirmPush] = useState(false);
  // Sandbox "pin to lesson" picker visibility.
  const [pinning, setPinning] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleSelectBoard(boardId: string): void {
    dispatch({ type: "selectBoard", boardId });
  }

  async function handleReorder(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeLessonId) return;
    // Guard: never call the repo with a null owner (auth not yet resolved or mock
    // path misconfigured); drop the reorder silently so nothing throws.
    if (!ownerId) return;
    const oldIndex = boards.findIndex((b) => b.id === active.id);
    const newIndex = boards.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Persist the new order through the repo, then reload TeachWorkspace's set
    // so the pills, footer count, and center board all re-sequence together.
    const next = arrayMove([...boards], oldIndex, newIndex);
    await teach.reorderBoards(
      activeLessonId,
      ownerId,
      next.map((b) => b.id),
    );
    await reloadBoards();
  }

  async function handleAddBoard(): Promise<void> {
    if (!activeLessonId) return;
    // Guard: owner must be resolved before we write a new board row (audit
    // finding #18 — slug in a uuid/RLS column breaks row-level security).
    if (!ownerId) return;
    const created = await teach.createBoard({
      masterLessonId: activeLessonId,
      ownerId,
      scope: "personal",
      title: `Board ${boards.length + 1}`,
      displayOrderWithinLesson: boards.length,
      templateId: null,
      gradeLevelId: gradeLevelId ?? boards[0]?.gradeLevelId ?? "g5",
    });
    await reloadBoards();
    dispatch({ type: "selectBoard", boardId: created.id });
  }

  // ── Push-to-team (DESTRUCTIVE + team-wide displacement, §13.1) ────────────
  async function handlePushToTeam(): Promise<void> {
    if (!activeLessonId || boards.length === 0) return;
    setConfirmPush(false);
    await teach.pushBoardsToTeam(
      activeLessonId,
      boards.map((b) => b.id),
    );
    // Name the team-wide effect with an Undo affordance (consequence toast).
    showConsequence({
      message:
        "Your boards are now the team set for this lesson — they replaced the previous team boards for everyone.",
      // No automatic rollback wired in v1 (the previous team set was displaced
      // server-side); the toast still surfaces the consequence per CLAUDE.md §4.
    });
    // Re-read TeachWorkspace's set so every surface reflects the new state.
    await reloadBoards();
  }

  // ── Sandbox persistence (§4a) ─────────────────────────────────────────────
  // The sandbox boards are repo-backed (they hang off the SANDBOX_LESSON_ID
  // sentinel in TeachWorkspace), so persisting them is a real copy through the
  // repository — nothing is silently discarded.
  //
  // Pending pin target: when the chosen lesson already has a personal set we
  // surface a displacement confirm (§13.1, personal-scoped) before overwriting.
  const [pendingPin, setPendingPin] = useState<{
    lessonId: string;
    title: string;
  } | null>(null);

  /** Copy the current sandbox boards (passed in via `boards`) onto a target
   *  lesson as the teacher's PERSONAL set, replacing any existing personal set
   *  for that lesson. Returns the id of the first created board (to select). */
  async function copySandboxBoardsToLesson(
    lessonId: string,
  ): Promise<string | null> {
    // Guard: owner must be resolved; if not, bail (auth not yet available).
    if (!ownerId) return null;
    // ATOMIC + FULL-PAGE replacement (audit F5). Replace the lesson's personal set
    // with copies of the sandbox boards in ONE repo call. The old impl deleted the
    // existing set then re-created each board from `src.widgets` only — which (a)
    // lost any non-page-0 pages/widgets of a multi-page sandbox board, and (b) was
    // non-atomic, so a failure mid-loop could leave the teacher with a half-wiped
    // personal set. `replacePersonalSetForLesson` deletes + inserts FULL-PAGE
    // copies atomically (teach_replace_lesson_set, validated + transactional), so
    // it is all-or-nothing and preserves every page. Returns the new set in order;
    // the first board is the one to select.
    const replaced = await teach.replacePersonalSetForLesson(
      lessonId,
      ownerId,
      boards.map((b) => b.id),
    );
    return replaced[0]?.id ?? null;
  }

  /** Finalize a pin: copy boards onto the lesson, exit sandbox, select it. */
  async function finalizePin(lessonId: string): Promise<void> {
    setPinning(false);
    setPendingPin(null);
    const firstBoardId = await copySandboxBoardsToLesson(lessonId);
    // Leave sandbox and land on the lesson; TeachWorkspace re-loads its boards.
    dispatch({ type: "exitSandbox" });
    dispatch({ type: "selectLesson", lessonId });
    setSelectedLessonId(lessonId);
    if (firstBoardId) dispatch({ type: "selectBoard", boardId: firstBoardId });
    showConsequence({
      message:
        "Your sandbox boards are now your personal set for this lesson — any earlier personal boards for it were replaced.",
    });
  }

  async function handlePinToLesson(lessonId: string): Promise<void> {
    // Guard: bail if the owner hasn't resolved yet (auth not available).
    if (!ownerId) return;
    // Warn before overwriting an existing personal set for the chosen lesson.
    const existing = await teach.listBoardsForLesson(lessonId, ownerId);
    const hasPersonal = existing.some(
      (b) => b.scope === "personal" && b.ownerId === ownerId,
    );
    if (hasPersonal) {
      const title =
        lessons.find((l) => l.id === lessonId)?.title ?? "this lesson";
      setPendingPin({ lessonId, title });
      return;
    }
    await finalizePin(lessonId);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Sandbox mode: no repo-backed boards yet — show the keep-it actions (§4a).
  if (sandbox || !activeLessonId) {
    return (
      <div>
        <div className={styles.sandboxBadge}>Sandbox · not saved</div>
        <p className={styles.muted}>
          You&rsquo;re building boards without a lesson. Keep them by saving to
          a new lesson, or pinning them to an existing one.
        </p>
        <div className={styles.boardActions}>
          {/* Save-to-new-lesson needs a "create blank lesson" planner API that
              isn't safely reachable in v1 (only duplicateLesson exists), so it
              is honestly marked "Soon" rather than silently discarding work.
              Pin-to-existing-lesson is the working persistence path below. */}
          <FutureControl
            label="Save to new lesson"
            leadingIcon={<PlusIcon size={13} />}
            tooltip="Create a new lesson from these boards — coming after beta. For now, pin them to an existing lesson to keep them."
            tooltipSide="top"
          />
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<PinIcon size={13} />}
            onClick={() => setPinning((v) => !v)}
            disabled={boards.length === 0}
            tooltip="Attach these boards to an existing lesson as your personal set"
          >
            Pin to lesson
          </Button>
        </div>

        {pendingPin ? (
          <div
            className={styles.boardActions}
            style={{ marginTop: "var(--r-8)" }}
          >
            <Tooltip
              required
              side="top"
              content={`Replace your personal boards for "${pendingPin.title}" with these sandbox boards`}
            >
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void finalizePin(pendingPin.lessonId)}
              >
                Replace personal boards
              </Button>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPendingPin(null)}
            >
              Cancel
            </Button>
          </div>
        ) : pinning ? (
          <div style={{ marginTop: "var(--r-8)" }}>
            <div className={styles.metaLabel}>Pin to which lesson?</div>
            {lessons
              .filter((l) => l.archived !== true)
              .slice(0, 20)
              .map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={styles.lessonRow}
                  onClick={() => void handlePinToLesson(l.id)}
                  title="Attach the sandbox boards to this lesson (replaces your personal set for it)"
                >
                  <span className={styles.lessonRowTitle}>{l.title}</span>
                  <span className={styles.lessonRowMeta}>
                    {l.subject.toUpperCase()} · Wk {l.week}
                  </span>
                </button>
              ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Teaching Boards</span>
      </div>

      {loading && boards.length === 0 ? (
        <p className={styles.muted}>Loading boards…</p>
      ) : (
        <DndContext
          // Stable id → deterministic dnd-kit `DndDescribedBy-<id>` across
          // SSR/CSR (see TeachWorkspace's DndContext for the full rationale).
          id="teach-boards-dnd"
          sensors={sensors}
          onDragEnd={handleReorder}
        >
          <SortableContext
            items={boards.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {boards.map((board, index) => (
              <BoardRow
                key={board.id}
                board={board}
                index={index}
                active={board.id === activeBoardId}
                onSelect={() => handleSelectBoard(board.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        className={styles.addBtn}
        onClick={handleAddBoard}
        title="Add a new teaching board to this lesson"
      >
        <PlusIcon size={12} /> Add board
      </button>

      {/* Share / push-to-team — destructive + team-wide. Per CLAUDE.md §4 the
          tooltip is ALWAYS-ON (`required`) — it ignores per-id dismissal and
          the global off switch. Button's `tooltip` prop can't carry `required`,
          so we wrap the trigger in <Tooltip required> directly. A two-step
          confirm gates the displacement before it applies; the consequence
          toast then names the team-wide effect (handlePushToTeam). */}
      <div className={styles.boardActions}>
        {confirmPush ? (
          <>
            <Tooltip
              required
              side="top"
              content="Overwrite the team's boards for this lesson with yours — this affects every teacher"
            >
              <Button
                size="sm"
                variant="destructive"
                onClick={handlePushToTeam}
              >
                Replace team boards
              </Button>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmPush(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Tooltip
            required
            side="top"
            content="Share these boards with the team — this REPLACES the lesson's current team boards for everyone"
          >
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<ShareIcon size={13} />}
              disabled={boards.length === 0}
              onClick={() => setConfirmPush(true)}
            >
              Share with team
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
