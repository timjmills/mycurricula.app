"use client";

// BoardsHome — the dedicated Boards page (/boards): the board home that replaces
// "Teach" as the primary board surface (the Wave 3 consolidation). It lifts the
// BoardLibraryModule out of the in-editor overlay into a first-class planner
// route — browse + search + the Personal / Team segments + templates — and adds
// a "New board" action plus open-to-edit navigation into the board editor.
//
// Identity mirrors TeachWorkspace (audit #18): flag OFF → the ME slug + the "g5"
// grade slug (byte-identical to the prototype); flag ON → the real auth uid +
// the resolved grade uuid (never a fixture slug in a uuid/RLS column).
//
// Opening a board navigates to the editor (/teach): a lesson-bound board
// deep-links its lesson; a lesson-less board (scratch / pulled / template) opens
// standalone — the editor resolves it by id (TeachWorkspace standalone mode).
// FORKING MODEL (CLAUDE.md §2): a published Team-Library board is SHARED, so it
// is pulled into a private copy BEFORE opening — the original is never edited.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Board } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { plannerClient } from "@/lib/planner/client";
import { teachClient as teach } from "@/lib/teach/client";
import { BoardCapError } from "@/lib/teach/queries";
import { ME } from "@/lib/mock/teachers";
import { BoardLibraryModule } from "@/components/teach/library";
import { TeachChooser } from "./TeachChooser";

const USE_SUPABASE = process.env.NEXT_PUBLIC_TEACH_USE_SUPABASE === "1";
const MOCK_GRADE_SLUG = "g5";

/** Robust cap-error detection: under the live flag Next.js redacts the error
 *  class across the Server Action boundary, so check `.name` as a fallback. */
function isCapError(err: unknown): boolean {
  return (
    err instanceof BoardCapError ||
    (err as { name?: string } | null)?.name === "BoardCapError"
  );
}

export function BoardsHome(): ReactNode {
  const router = useRouter();
  const { currentUser } = useAppState();
  const { showConsequence } = useConsequenceToast();

  // Owner identity (audit #18): the real auth uid under the flag, the ME slug
  // flag-OFF so the prototype path is byte-identical.
  const ownerId: string | null = USE_SUPABASE ? currentUser.id : ME.id;

  // Grade id: the mock slug flag-OFF; the resolved grade uuid under the flag
  // (undefined until the async resolve lands — the module waits on it).
  const [gradeId, setGradeId] = useState<string | undefined>(
    USE_SUPABASE ? undefined : MOCK_GRADE_SLUG,
  );
  useEffect(() => {
    if (!USE_SUPABASE) return; // flag OFF → mock slug drives grade, no resolve
    if (!ownerId) {
      setGradeId(undefined);
      return;
    }
    let alive = true;
    void plannerClient
      .getActiveGradeLevelId(ownerId)
      .then((id) => {
        if (alive) setGradeId(id ?? undefined);
      })
      .catch(() => {
        if (alive) setGradeId(undefined);
      });
    return () => {
      alive = false;
    };
  }, [ownerId]);

  // "Teach from a lesson" — open the editor on that lesson (lesson-bound mode);
  // the editor loads the lesson's board set. No board id: the lesson IS the seed.
  const teachFromLesson = useCallback(
    (lessonId: string): void => {
      router.push(`/teach?lesson=${encodeURIComponent(lessonId)}`);
    },
    [router],
  );

  // Navigate to a board in the editor. A lesson-bound board deep-links its lesson
  // so the editor loads that set; a lesson-less board opens standalone (id only).
  const navigateToBoard = useCallback(
    (board: Board): void => {
      const params = new URLSearchParams();
      if (board.masterLessonId != null) {
        params.set("lesson", board.masterLessonId);
      }
      params.set("board", board.id);
      router.push(`/teach?${params.toString()}`);
    },
    [router],
  );

  // Guards the team-board pull-copy against re-entrant double-clicks (a second
  // click before navigation would create a second copy + a second cap hit).
  const openingRef = useRef(false);
  const openBoard = useCallback(
    (board: Board): void => {
      // Forking model (CLAUDE.md §2): a published Team-Library board is SHARED.
      // Never open the original for editing — pull a private copy into My Boards
      // first, then open the copy. Boards the teacher owns open directly.
      if (board.libraryVisibility === "team") {
        if (ownerId == null || openingRef.current) return;
        openingRef.current = true;
        void (async () => {
          try {
            const copy = await teach.copyTeamBoardToMine(board.id, ownerId);
            navigateToBoard(copy); // navigate away — leave the ref set
          } catch (err) {
            openingRef.current = false;
            showConsequence({
              message: isCapError(err)
                ? "You're at the 50-board limit — delete a board to make room before opening a team board."
                : "Couldn't open that board — please try again.",
            });
          }
        })();
        return;
      }
      navigateToBoard(board);
    },
    [ownerId, navigateToBoard, showConsequence],
  );

  // "New board" — wires the previously-unused createBlankBoard + keepBoard: make
  // a fresh lesson-less board, keep it (the 50-board cap is enforced here), then
  // open it. A synchronous ref guard prevents a double-click from creating two
  // boards before React re-renders; the disabled button is the visible cue. If
  // the keep hits the cap, discard the ephemeral board so no orphan is left.
  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const newBlankBoard = useCallback(async (): Promise<void> => {
    if (creatingRef.current || ownerId == null || gradeId == null) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const board = await teach.createBlankBoard({
        ownerId,
        gradeLevelId: gradeId,
        masterLessonId: null,
        title: "Untitled board",
      });
      try {
        await teach.keepBoard(board.id);
      } catch (capErr) {
        // Roll back the ephemeral board so the cap failure leaves no orphan.
        await teach.deleteBoard(board.id).catch(() => {});
        throw capErr;
      }
      navigateToBoard(board); // navigate away — leave creating/ref set
    } catch (err) {
      creatingRef.current = false;
      setCreating(false);
      showConsequence({
        message: isCapError(err)
          ? "You're at the 50-board limit — delete a board to make room for a new one."
          : "Couldn't create a board — please try again.",
      });
    }
  }, [ownerId, gradeId, navigateToBoard, showConsequence]);

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TeachChooser
        onTeachLesson={teachFromLesson}
        onBlankBoard={newBlankBoard}
        creating={creating}
        canCreateBlank={ownerId != null && gradeId != null}
      />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <BoardLibraryModule
          gradeLevelId={gradeId}
          ownerId={ownerId}
          onOpenBoard={openBoard}
          onCreateBlank={
            ownerId != null && gradeId != null ? newBlankBoard : undefined
          }
          creating={creating}
        />
      </div>
    </div>
  );
}
