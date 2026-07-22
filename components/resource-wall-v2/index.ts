// components/resource-wall-v2 — the v2 Resource Wall (Wave 9a).
//
// The NET-NEW `/post` surface: a teacher's resources for a scope (current
// lesson / today / this week / subject / unit), grouped into stacked sections
// they can re-order, re-background, and drag cards between.
//
// Public surface:
//   • ResourceWall  — the whole surface; the route supplies the focus anchors
//                     and injects the canonical per-lesson resource list.
//   • WALL_FILTERS / matchesFilter — the filter vocabulary, shared with the route.
// Everything else (Section / Card / Lightbox / Annotator / WallLibrary) is an
// internal composition detail and is deliberately NOT exported: the wall owns
// its own layout, and a second mount path would fork the fork/persist model.
//
// Wave 9b (share links) is DEFERRED by the user — the bundle's `?share=` token
// is plain base64 of `{kind,id}` (forgeable: decode, edit the id, re-encode) and
// its viewer renders a hardcoded fake list. There is deliberately NO share
// affordance here. Reviving it needs a server-minted, signed, revocable token —
// not base64. See agent_shared_log.md.

export { ResourceWall } from "./ResourceWall";
export type { ResourceWallProps } from "./ResourceWall";
export { WALL_FILTERS, matchesFilter } from "./Section";
export type { WallFilter } from "./Section";
