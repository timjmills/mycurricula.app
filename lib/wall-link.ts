// wall-link.ts — the ONE place that owns the /post URL contract.
//
// WHY IT EXISTS. /weekly used to answer "what resources does this week use?"
// with a week-aggregated Resources panel in its right rail. The rail is gone
// (task #47), and the replacement is not a rebuilt panel but a button that
// opens the Resource Wall on the preset that already answers the same
// question — "This Week · Mixed". One resource surface instead of two, so the
// Wall's sections, per-card colours, photos and composer are not shadowed by a
// lesser copy of themselves that drifts as the Wall gains features.
//
// Every caller goes through here rather than writing a query string inline, so
// when the preset URL contract changes there is exactly one edit. That matters
// right now because the contract is NOT finished — see the boundary note below.
//
// ── Provenance ─────────────────────────────────────────────────────────────
// The six presets are the handoff's, verbatim (`source/resource-wall.jsx:92`,
// mirrored in lib/wall-scope.ts). The `?preset=` PARAM is ours: the handoff is
// a single-page mockup with no routing at all, so it is silent on how a preset
// would be addressed. That makes this a decision, not a divergence.

import type { WallPreset } from "@/lib/wall-scope";

/** The query key carrying a landing preset into /post. */
export const WALL_PRESET_PARAM = "preset";

/**
 * The Wall URL for a given preset.
 *
 * Anchors (`?lesson=` / `?subject=` / `?unit=`) are a SEPARATE axis and are not
 * accepted here: the presets that need one read it from the anchor params, and
 * mixing the two in a single helper invites callers to pass a preset whose
 * anchor they never supplied — which resolves to a deliberately empty wall
 * (lib/wall-scope's "a missing anchor never falls back to everything" rule).
 * A caller that needs both should compose them explicitly.
 */
export function wallPresetHref(preset: WallPreset): string {
  return `/post?${WALL_PRESET_PARAM}=${encodeURIComponent(preset)}`;
}

/**
 * The Wall URL for "the resources this whole week uses" — the capability the
 * removed weekly rail used to carry. Named for the QUESTION rather than the
 * preset id so the Week header does not have to know which preset answers it.
 */
export function weekResourcesHref(): string {
  return wallPresetHref("week-mixed");
}
