"use client";

// TeachOverlays.tsx — the workspace's SHARED overlay layer (W11 integration).
//
// Board-settings popover, Help overlay, and the Board/Widget Library overlays
// render ONCE here — mounted by TeachWorkspace as a sibling of whichever skin
// the v2 flag selects — because BOTH skins open them (their open-state and
// setters ride the zones contract) and neither skin owns them. Rendering them
// inside a skin was the W11 integration bug this file fixes: the v2 shell's
// "More widgets…" / library / settings openers flipped state that nothing
// mounted. Every root here is position:fixed, so the move out of the v1 body
// is visually inert.
//
// The JSX (including the guarded library pull-copy handler with its cap-error
// surfacing) moved VERBATIM from TeachV1Zones — behavior is byte-identical;
// only the mount point changed.

import { useEffect, type ReactNode } from "react";

import { teachClient as teach } from "@/lib/teach/client";
import { TeachIcon } from "@/components/teach/widgets";
import { TeachHelpOverlay } from "./chrome";
import { BoardSettingsPopover } from "./board";
import { BoardLibraryModule, WidgetLibrary } from "./library";
import type { TeachZonesProps } from "./zones-contract";
import styles from "./TeachWorkspace.module.css";

export function TeachOverlays({
  state,
  dispatch,
  activeBoard,
  activeLessonId,
  ownerId,
  reloadBoards,
  boardsGradeLevelId,
  openingBoardRef,
  handleUseTemplate,
  widgets,
  resolvedPageId,
  onEditorIntent,
  showConsequence,
  boardSettingsOpen,
  setBoardSettingsOpen,
  helpOpen,
  setHelpOpen,
  libraryOverlay,
  setLibraryOverlay,
}: TeachZonesProps): ReactNode {
  // Esc closes the Library overlay (W11 QA: it was Close-button-only). Capture
  // phase + stopPropagation so it wins over lower layers (the v2 shell's
  // true-fullscreen handler defers to `libraryOverlay` via the contract, so the
  // top-layer-only rule holds from both sides). BoardSettingsPopover and
  // TeachHelpOverlay own their own Esc handling.
  useEffect(() => {
    if (!libraryOverlay) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setLibraryOverlay(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [libraryOverlay, setLibraryOverlay]);

  return (
    <>
      {/* Board-settings popover (audit G1) — rename / reorder hint / reset.
          (The CSS-grid `TeachingBoard`'s WidgetPicker + per-widget
          WidgetSettingsPopover were removed in the Wave 1 declutter — widget
          add/settings now flow through the BoardEditor's typed intents.) */}
      {boardSettingsOpen && activeBoard ? (
        <BoardSettingsPopover
          board={activeBoard}
          onClose={() => setBoardSettingsOpen(false)}
          reloadBoards={reloadBoards}
        />
      ) : null}

      {/* Help + shortcuts overlay (audit B2) — opened by the top-bar Help. */}
      <TeachHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Board / Widget Library overlays (5.31) — opened from the sub-bar. */}
      {libraryOverlay ? (
        <div
          className={styles.libraryOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={
            libraryOverlay === "boards" ? "Board library" : "Widget library"
          }
        >
          <div className={styles.libraryPanel}>
            <div className={styles.libraryHead}>
              <h2 className={styles.libraryTitle}>
                {libraryOverlay === "boards" ? "Board Library" : "Widget Library"}
              </h2>
              <button
                type="button"
                className={styles.libraryClose}
                onClick={() => setLibraryOverlay(null)}
                aria-label="Close library"
              >
                <TeachIcon name="x" size={20} />
              </button>
            </div>
            <div className={styles.libraryBody}>
              {libraryOverlay === "boards" ? (
                <BoardLibraryModule
                  gradeLevelId={boardsGradeLevelId}
                  onOpenBoard={(board) => {
                    // Ignore re-entrant clicks while a pull-copy is in flight so a
                    // double-click can't pull two copies / consume two cap slots
                    // (review Low). The overlay stays OPEN until the work succeeds
                    // (or a failure is surfaced) so a cap/RLS/network error is not
                    // swallowed (audit M9).
                    if (openingBoardRef.current) return;
                    openingBoardRef.current = true;
                    void (async () => {
                      try {
                        // A board already attached to a lesson (a My Board for a
                        // lesson) → just navigate to it.
                        if (board.masterLessonId != null) {
                          dispatch({
                            type: "selectLesson",
                            lessonId: board.masterLessonId,
                          });
                          dispatch({
                            type: "selectBoard",
                            boardId: board.id,
                          });
                          setLibraryOverlay(null);
                          return;
                        }
                        // Lesson-DETACHED library board (Team Library / a detached
                        // My Board): PULL A COPY INTO THE CURRENT LESSON (audit
                        // F11). selectLesson(null) would clear the workspace, so
                        // add a personal copy to the lesson in view + select it.
                        // Guarded on !sandbox: in the sandbox there is no real
                        // lesson to attach to (reloadBoards reads the sandbox
                        // scope), so a sandbox open falls through to the My Boards
                        // pull below (review Low: latent sandbox+lesson mismatch).
                        if (
                          activeLessonId != null &&
                          !state.sandbox &&
                          ownerId != null
                        ) {
                          const copy = await teach.copyBoardToLesson(
                            board.id,
                            activeLessonId,
                            ownerId,
                          );
                          await reloadBoards();
                          dispatch({ type: "selectBoard", boardId: copy.id });
                          setLibraryOverlay(null);
                          return;
                        }
                        // No lesson in view (e.g. sandbox) → fall back to pulling a
                        // detached copy into My Boards so the action still succeeds.
                        if (ownerId != null) {
                          await teach.copyTeamBoardToMine(board.id, ownerId);
                          setLibraryOverlay(null);
                        }
                      } catch (err) {
                        // Surface the failure (e.g. the board-cap limit) instead of
                        // a silent unhandled rejection; keep the overlay OPEN so the
                        // teacher can delete a board / pick another and retry
                        // (audit M9).
                        showConsequence({
                          message:
                            err instanceof Error &&
                            err.name === "BoardCapError"
                              ? err.message
                              : "Couldn't add that board just now — please try again.",
                        });
                      } finally {
                        openingBoardRef.current = false;
                      }
                    })();
                  }}
                  // Template-use creates ONE lesson-attached board + selects it
                  // directly (bypasses onOpenBoard's detach→copy branch, which
                  // would otherwise make a duplicate board).
                  onUseTemplate={handleUseTemplate}
                  // Finding 3 fix: thread the flag-aware owner id so library
                  // operations never use the hard-coded `ME.id` slug under
                  // the live flag.
                  ownerId={ownerId}
                />
              ) : (
                <WidgetLibrary
                  addedTypes={widgets.map((w) => w.type)}
                  onAddWidget={(type) => {
                    if (resolvedPageId) {
                      onEditorIntent({
                        type: "addWidget",
                        pageId: resolvedPageId,
                        widgetType: type,
                        canvas: { x: 64, y: 64, w: 320 },
                      });
                    }
                    setLibraryOverlay(null);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
