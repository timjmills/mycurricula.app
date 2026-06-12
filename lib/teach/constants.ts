// lib/teach/constants.ts — shared Teach sentinels that must live in a LEAF
// module (no imports from ./queries or ./mock-source) to avoid a runtime
// circular import. `queries.ts` re-exports these so the documented repository
// seam stays the single import site for UI consumers, while the mock + Supabase
// sources import them straight from here — breaking the
// queries → mock-source → queries cycle that otherwise TDZ-crashes /teach in
// dev (`Cannot access 'mockTeachSource' before initialization`). Mirrors the
// existing ./limits leaf-module pattern.

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
