// lesson-flow — public surface.
// Consumers import from "@/components/lesson-flow", never from deep files.
export { LessonFlow } from "./lesson-flow";
export type { LessonFlowProps } from "./lesson-flow";

// ResourceTile + ResourceLinkPreview are consumed by the Daily Resources
// panel; exported here so the folder's public surface stays discoverable
// from one barrel.
export { ResourceTile, ResourceLinkPreview } from "./resource-tile";
export type {
  ResourceTileProps,
  ResourceLinkPreviewProps,
} from "./resource-tile";

// PhaseResources owns each phase's tagged-resources block (resChip rows,
// 6.11.26 daily handoff §7). resourceChipColor is the ONE type→--rc token
// mapping for the chip thumb tint.
export {
  PhaseResources,
  ResourceChipGhost,
  resourceChipColor,
} from "./phase-resources";
export type { PhaseResourcesProps } from "./phase-resources";

// ResourceTypePill is the small uppercase type tag — consumed by the Daily
// planning tabs; kept on the public surface.
export { ResourceTypePill } from "./resource-type-pill";
export type { ResourceTypePillProps } from "./resource-type-pill";
