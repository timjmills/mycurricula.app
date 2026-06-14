"use client";

// OpenInBoardDialog — "open this card in a board" (Wave 4 #11). The owner's rule
// is ASK EACH TIME: a small modal offers "New board with this card" vs "Add to
// an existing board" (then a board picker), or Cancel. The actual writes live in
// lib/teach/open-in-board.ts; this owns the choice + navigation into the editor.
//
// Identity mirrors BoardsHome/TeachWorkspace (audit #18): flag OFF → the ME slug
// + "g5"; flag ON → the real auth uid + resolved grade uuid.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { plannerClient } from "@/lib/planner/client";
import { teachClient as teach } from "@/lib/teach/client";
import { BoardCapError } from "@/lib/teach/queries";
import { boardResourceHref } from "@/lib/teach/boardToResource";
import {
  addResourceToBoard,
  createBoardWithResource,
} from "@/lib/teach/open-in-board";
import { ME } from "@/lib/mock/teachers";
import type { Board, LessonResource } from "@/lib/types";
import { Button } from "@/components/ui";
import styles from "./OpenInBoardDialog.module.css";

const USE_SUPABASE = process.env.NEXT_PUBLIC_TEACH_USE_SUPABASE === "1";
const MOCK_GRADE_SLUG = "g5";

/** Cap-error detection robust to the live Server-Action redaction (mirrors
 *  BoardsHome): the class is lost across the boundary, so fall back to `.name`. */
function isCapError(err: unknown): boolean {
  return (
    err instanceof BoardCapError ||
    (err as { name?: string } | null)?.name === "BoardCapError"
  );
}

export interface OpenInBoardDialogProps {
  /** The card to open into a board. */
  resource: LessonResource;
  /** The lesson this card belongs to (null → a lesson-less board). */
  lessonId: string | null;
  /** Close the dialog (Cancel / Esc / scrim / after navigation). */
  onClose: () => void;
}

export function OpenInBoardDialog({
  resource,
  lessonId,
  onClose,
}: OpenInBoardDialogProps): ReactNode {
  const router = useRouter();
  const { currentUser } = useAppState();
  const { showConsequence } = useConsequenceToast();

  const ownerId: string | null = USE_SUPABASE ? currentUser.id : ME.id;
  const [gradeId, setGradeId] = useState<string | undefined>(
    USE_SUPABASE ? undefined : MOCK_GRADE_SLUG,
  );
  useEffect(() => {
    if (!USE_SUPABASE || !ownerId) return;
    let alive = true;
    void plannerClient
      .getActiveGradeLevelId(ownerId)
      .then((id) => alive && setGradeId(id ?? undefined))
      .catch(() => alive && setGradeId(undefined));
    return () => {
      alive = false;
    };
  }, [ownerId]);

  const [view, setView] = useState<"choose" | "pick">("choose");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<Board[] | null>(null);
  const guardRef = useRef(false); // single-flight across the async create/add
  const panelRef = useRef<HTMLDivElement>(null);
  const label = resource.label || "this card";

  // Focus the first action on open (run once — don't re-focus on every state
  // change, which would yank focus mid-interaction).
  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>("button")
      ?.focus({ preventScroll: true });
  }, []);

  // Esc closes — but NOT mid-flight (a create/add is in progress and would still
  // navigate after the await; let it finish or let the user wait).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!busy) onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // "New board" needs a resolved grade (it creates a board); "Add to existing"
  // does NOT (it reuses the target board's grade), so they gate independently.
  const canCreate = ownerId != null && gradeId != null;
  const canAddExisting = ownerId != null;
  // Flag-ON only: the grade couldn't resolve, so New-board is blocked — say so
  // instead of leaving a silent disabled button. (Flag-OFF seeds "g5" sync.)
  const gradeUnresolved = ownerId != null && gradeId == null;

  // "New board with this card".
  const handleNew = useCallback((): void => {
    if (guardRef.current || ownerId == null || gradeId == null) return;
    guardRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        const board = await createBoardWithResource({
          resource,
          ownerId,
          gradeLevelId: gradeId,
          lessonId,
        });
        router.push(boardResourceHref(board.id, lessonId)); // navigate away
        onClose();
      } catch (err) {
        guardRef.current = false;
        setBusy(false);
        showConsequence({
          message: isCapError(err)
            ? "You're at the 50-board limit — delete a board to make room for a new one."
            : "Couldn't create a board — please try again.",
        });
      }
    })();
  }, [ownerId, gradeId, lessonId, resource, router, onClose, showConsequence]);

  // Enter the "add to existing" picker — load the candidate boards once.
  const handleChooseExisting = useCallback((): void => {
    if (ownerId == null) return;
    setView("pick");
    if (existing != null) return;
    void (async () => {
      try {
        const boards = lessonId
          ? await teach.listBoardsForLesson(lessonId, ownerId)
          : await teach.listMyBoards(ownerId);
        setExisting(boards);
      } catch {
        setExisting([]); // fail soft — the picker shows its empty state
      }
    })();
  }, [ownerId, lessonId, existing]);

  // Add the card to the chosen board, then open it.
  const handleAddTo = useCallback(
    (board: Board): void => {
      if (guardRef.current) return;
      guardRef.current = true;
      setBusy(true);
      void (async () => {
        try {
          await addResourceToBoard({ board, resource });
          router.push(boardResourceHref(board.id, lessonId)); // navigate away
          onClose();
        } catch {
          guardRef.current = false;
          setBusy(false);
          showConsequence({ message: "Couldn't add to that board — please try again." });
        }
      })();
    },
    [resource, lessonId, router, onClose, showConsequence],
  );

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-in-board-title"
      >
        <h2 id="open-in-board-title" className={styles.title}>
          Open <span className={styles.titleEm}>{label}</span> in a board
        </h2>

        {view === "choose" ? (
          <div className={styles.choices}>
            <Button
              variant="primary"
              disabled={!canCreate || busy}
              loading={busy}
              onClick={handleNew}
            >
              New board with this card
            </Button>
            <Button
              variant="secondary"
              disabled={!canAddExisting || busy}
              onClick={handleChooseExisting}
            >
              Add to an existing board…
            </Button>
            {gradeUnresolved ? (
              <p className={styles.note}>
                Couldn&apos;t find your active grade — reload to create a new
                board. You can still add this card to an existing board.
              </p>
            ) : null}
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className={styles.pick}>
            {existing == null ? (
              <p className={styles.note}>Loading your boards…</p>
            ) : existing.length === 0 ? (
              <p className={styles.note}>
                No boards to add to yet — go back and create a new one.
              </p>
            ) : (
              <ul className={styles.boardList}>
                {existing.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={styles.boardRow}
                      disabled={busy}
                      onClick={() => handleAddTo(b)}
                    >
                      {b.title?.trim() ? b.title : "Untitled board"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.pickActions}>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setView("choose")}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
