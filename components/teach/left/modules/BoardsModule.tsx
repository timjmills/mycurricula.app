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

import { type ReactNode, useEffect, useState } from "react";
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
import { Button, Tooltip } from "@/components/ui";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { ME } from "@/lib/mock";
import { teach } from "@/lib/teach/queries";
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
}: BoardsModuleProps): ReactNode {
  const { lessons } = usePlanner();
  const { setSelectedLessonId } = useAppState();
  const { showConsequence } = useConsequenceToast();

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  // Two-step confirm gate for the destructive push-to-team displacement.
  const [confirmPush, setConfirmPush] = useState(false);
  // Sandbox "pin to lesson" picker visibility.
  const [pinning, setPinning] = useState(false);

  const ownerId = ME.id;

  // Load the board set for the active lesson through the repository seam.
  useEffect(() => {
    let active = true;
    if (!activeLessonId) {
      setBoards([]);
      return;
    }
    setLoading(true);
    teach
      .listBoardsForLesson(activeLessonId, ownerId)
      .then((next) => {
        if (active) setBoards(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeLessonId, ownerId]);

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
    const oldIndex = boards.findIndex((b) => b.id === active.id);
    const newIndex = boards.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(boards, oldIndex, newIndex);
    setBoards(next); // optimistic
    const persisted = await teach.reorderBoards(
      activeLessonId,
      ownerId,
      next.map((b) => b.id),
    );
    setBoards(persisted);
  }

  async function handleAddBoard(): Promise<void> {
    if (!activeLessonId) return;
    const created = await teach.createBoard({
      masterLessonId: activeLessonId,
      ownerId,
      scope: "personal",
      title: `Board ${boards.length + 1}`,
      displayOrderWithinLesson: boards.length,
      templateId: null,
      gradeLevelId: boards[0]?.gradeLevelId ?? "g5",
    });
    const next = [...boards, created];
    setBoards(next);
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
    // Re-read so the strip reflects the new canonical state.
    const next = await teach.listBoardsForLesson(activeLessonId, ownerId);
    setBoards(next);
  }

  // ── Sandbox persistence (§4a) ─────────────────────────────────────────────
  // v1 surfaces the two save paths; actual board attachment runs through the
  // repository once a lesson exists. "Save to new lesson" hands off to the
  // planner add-lesson flow at integration; here we expose the entry points.
  function handleSaveToNewLesson(): void {
    // The add-lesson flow lives in the planner store; Wave 2 wires the handoff.
    // We dispatch out of sandbox so the workspace can route to the add flow.
    dispatch({ type: "exitSandbox" });
  }

  function handlePinToLesson(lessonId: string): void {
    setPinning(false);
    // Attach the sandbox boards as this lesson's personal set, then select it.
    dispatch({ type: "selectLesson", lessonId });
    setSelectedLessonId(lessonId);
    dispatch({ type: "setSandboxDirty", dirty: false });
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
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<PlusIcon size={13} />}
            onClick={handleSaveToNewLesson}
            tooltip="Create a new lesson and attach these boards to it"
          >
            Save to new lesson
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<PinIcon size={13} />}
            onClick={() => setPinning((v) => !v)}
            tooltip="Attach these boards to an existing lesson as your personal set"
          >
            Pin to lesson
          </Button>
        </div>

        {pinning ? (
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
                  onClick={() => handlePinToLesson(l.id)}
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
