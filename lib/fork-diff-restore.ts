// fork-diff-restore — the whole-lesson restore patch, extracted to a leaf so
// the planner store can import it WITHOUT dragging lib/fork-diff's
// sanitize-html → linkedom/dompurify chain into the (planner) layout graph.
// snapshotRestorePatch is a pure field-picker (no sanitizer, no DOM); keeping
// it co-located with the diff functions cost every light route (/catch-up,
// /home) ~30-45 kB gzip of unreachable-but-bundled sanitizer modules, since
// the package sets no `sideEffects` and webpack keeps whole modules.
// lib/fork-diff re-exports it, so the public surface is unchanged.

import type { Lesson, LessonMasterSnapshot } from "@/lib/types";

/**
 * The content fields the store's `restoreLesson` reducer writes back when
 * reverting a fork to the team's version — exactly the snapshot-captured
 * Lesson fields (title, objective, preview, standards). Placement (day/week)
 * is deliberately NOT included: the reducer routes placement through its
 * moveLesson delegation so CellLayout pruning and moved-flag handling stay
 * consistent with every other move. Pure and unit-tested; the planner-store
 * reducer is the consumer.
 */
export function snapshotRestorePatch(
  snapshot: LessonMasterSnapshot,
): Pick<Lesson, "title" | "objective" | "preview" | "standards"> {
  return {
    title: snapshot.title,
    objective: snapshot.objective,
    preview: snapshot.preview,
    // Fresh array — the restored lesson must never share the snapshot's
    // array identity (a later in-place standards edit would silently
    // corrupt the captured master values).
    standards: [...snapshot.standards],
  };
}
