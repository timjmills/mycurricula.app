// fork-diff-restore — the whole-lesson restore patch, extracted to a leaf so
// the planner store can import it WITHOUT dragging lib/fork-diff's
// sanitize-html → linkedom/dompurify chain into the (planner) layout graph.
// snapshotRestorePatch is a pure field-picker (no sanitizer, no DOM); keeping
// it co-located with the diff functions cost every light route (/catch-up,
// /home) ~30-45 kB gzip of unreachable-but-bundled sanitizer modules.
// lib/fork-diff re-exports it, so the public surface is unchanged.
//
// UPDATE: the original rationale ended "since the package sets no
// `sideEffects`". That is no longer true — package.json now declares
// `"sideEffects": ["**/*.css"]`, so webpack may drop modules whose exports go
// unused. This extraction is KEPT anyway, deliberately. The flag lets webpack
// skip a module only when ALL of its exports are unused; importing one function
// from lib/fork-diff still pulls that module in, and whether its
// sanitize-html/linkedom import then gets dropped depends on webpack's
// inner-graph analysis rather than on the flag. Removing the split would be an
// unverified bet, and it was not measured against a production build. Re-test
// before collapsing this back into lib/fork-diff.

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
