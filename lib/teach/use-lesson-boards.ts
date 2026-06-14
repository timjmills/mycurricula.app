"use client";

// lib/teach/use-lesson-boards.ts — the active teacher's boards for a lesson.
//
// Wave 4 (#9): surfaces a lesson's learning boards as resources OUTSIDE the
// Teach workspace (the daily Resources panel), where the boards aren't already
// loaded. It wraps `teachClient.listBoardsForLesson` — a PURE read (the old
// first-open default-set seed was removed, see mock-source.ts §setForLesson), so
// it is safe to fire on mere lesson view without creating anything.
//
// Owner identity mirrors TeachWorkspace / BoardsHome (audit #18): the ME slug
// flag-OFF (byte-identical to the prototype), the real auth uid under the flag.

import { useEffect, useState } from "react";
import { useAppState } from "@/lib/app-state";
import { teachClient } from "@/lib/teach/client";
import { ME } from "@/lib/mock/teachers";
import type { Board } from "@/lib/types";

const USE_SUPABASE = process.env.NEXT_PUBLIC_TEACH_USE_SUPABASE === "1";

/** The teacher's EFFECTIVE board set for a lesson (their personal set where one
 *  exists, otherwise the team set — `setForLesson` semantics). Returns `[]` until
 *  resolved, when `lessonId` is null, or on any read error (never throws — a
 *  failed board read must not break the resources panel). */
export function useLessonBoards(lessonId: string | null): Board[] {
  const { currentUser } = useAppState();
  const ownerId: string | null = USE_SUPABASE ? currentUser.id : ME.id;
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    if (!lessonId || !ownerId) {
      setBoards([]);
      return;
    }
    let alive = true;
    void teachClient
      .listBoardsForLesson(lessonId, ownerId)
      .then((bs) => {
        if (alive) setBoards(bs);
      })
      .catch((err) => {
        // Fail soft — a board read failure must never break the resources
        // panel; it just shows no boards. Log so the failure isn't invisible
        // in the field (the panel itself gives no other signal).
        if (alive) setBoards([]);
        console.warn("useLessonBoards: failed to load boards for lesson", err);
      });
    return () => {
      alive = false;
    };
  }, [lessonId, ownerId]);

  return boards;
}
