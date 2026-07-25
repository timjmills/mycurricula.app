// toggle-group-keys.ts — the pure keyboard + selection rules behind
// <ToggleGroup>.
//
// A LEAF ON PURPOSE. The test gate runs `environment: "node"` with no jsdom and
// no renderer (vitest.config.ts), and `include` is `tests/**/*.test.ts` — so the
// only way to assert "an arrow key must not commit" and "a no-op click must not
// fire onChange" is to test the DECISIONS separately from the DOM. Keeping them
// here (no React, no CSS import, no browser API) means the test imports nothing
// but this file, and ToggleGroup WIRES these rules rather than restating them.

/**
 * Where an arrow key moves the roving focus, or `null` for a key the group does
 * not answer to. Wraps at both ends — the ARIA radio-group convention, and the
 * behaviour the app already shipped.
 *
 * Wrapping is exactly why `arrowCommits` exists: with selection following focus,
 * a wrap puts option 0 ONE keypress after the last option, so a group whose
 * first option clears content can destroy it while the teacher is merely
 * navigating.
 */
export function arrowTarget(
  key: string,
  from: number,
  length: number,
): number | null {
  if (length <= 0) return null;
  // An out-of-range origin (a `value` that matches no option) still has to
  // navigate somewhere sane rather than leaving the group inert.
  const i = from >= 0 && from < length ? from : 0;
  if (key === "ArrowRight" || key === "ArrowDown") return (i + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return i === 0 ? length - 1 : i - 1;
  return null;
}

/**
 * Does the group hold an option whose selection CLEARS or destroys content
 * ("None", "Clear", "Remove")?
 *
 * Structurally typed so this file need not import ToggleOption — it stays a leaf
 * with no React in its import graph.
 */
export function hasDestructiveOption(
  options: ReadonlyArray<{ destructive?: boolean }>,
): boolean {
  return options.some((o) => o.destructive === true);
}

/**
 * May an arrow key COMMIT the option it lands on?
 *
 * `true` is the ARIA "selection follows focus" radio-group default and stays the
 * default for ordinary groups (Grid/List, Personal/Team, …), where arrowing to
 * an option is exactly how a keyboard user picks it.
 *
 * It is FORCED off by a destructive option, no matter what the callsite asked
 * for. WAI-ARIA's radio-group pattern makes the same exception: when selecting
 * an option causes a significant change, focus moves without selecting and
 * Enter/Space commits. Here "significant" is literal — a group containing a
 * clear/none option can otherwise wipe a teacher's text in transit, on a
 * keypress that was only meant to look at the next option.
 */
export function arrowCommits(
  options: ReadonlyArray<{ destructive?: boolean }>,
  selectOnFocus: boolean,
): boolean {
  return selectOnFocus && !hasDestructiveOption(options);
}

/**
 * The value a selection attempt should actually commit, or `null` when there is
 * nothing to commit because the option is already the active one.
 *
 * Re-selecting the active option is not an edit, and callers treat every
 * `onChange` as one: in the planner an `editLesson` on an unforked Team lesson
 * lazily FORKS it (CLAUDE.md §2 — forking is a consequence of editing), so
 * clicking the chip that is already lit would silently give the teacher a
 * personal copy that stops tracking the team plan.
 */
export function selectionOf<T>(next: T, current: T): T | null {
  return Object.is(next, current) ? null : next;
}
