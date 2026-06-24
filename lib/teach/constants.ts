// lib/teach/constants.ts — leaf constants for the Teach data layer.
//
// Pure leaf: this module imports NOTHING from the Teach data layer, so it can be
// imported by the repository seam (queries.ts) AND by the data sources
// (mock-source.ts / supabase-source.ts) without forming a runtime circular
// import. It mirrors ./limits, which exists for the same reason. Consumers
// should keep importing these values from the seam — `queries.ts` re-exports
// them so the documented single-import-site contract holds.

/**
 * Sentinel master-lesson id for the EPHEMERAL sandbox set (plan §4a). The Teach
 * UI uses this opaque string as the repo key for "boards built without a lesson
 * attached" — `listBoardsForLesson(SANDBOX_LESSON_ID, owner)` /
 * `createBoard({ masterLessonId: SANDBOX_LESSON_ID, … })` return/insert the
 * teacher's lesson-LESS ephemeral personal boards. It is NOT a real lesson:
 *   - the MOCK source treats it as an ordinary (never-seeded) opaque key — its
 *     filter `b.masterLessonId === "sandbox"` simply never matches a real board,
 *     so the sandbox set is whatever the UI creates under this key;
 *   - the SUPABASE source maps it to lesson-less ephemeral personal boards
 *     (`master_core_lesson_event_id IS NULL`, `ephemeral = true`), because under
 *     Supabase a fake-uuid lesson id would resolve to no lesson and the
 *     grade-from-lesson lookup would throw.
 * Sharing the sentinel here (instead of a private const in each repo + the UI)
 * keeps the UI, the mock, and the Supabase adapter agreeing on the one key.
 */
export const SANDBOX_LESSON_ID = "sandbox";
