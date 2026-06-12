// lesson-flow — public surface.
// Consumers import from "@/components/lesson-flow", never from deep files.
export { LessonFlow } from "./lesson-flow";
export type { LessonFlowProps } from "./lesson-flow";

// SectionResources owns each section's resources area (expanded ↔ minimized
// states + per-(lesson,section) localStorage persistence).
export { SectionResources } from "./section-resources";
export type { SectionResourcesProps } from "./section-resources";

// ResourceTypePill is the small uppercase type tag used inside the
// "More resources" sub-list and "Resource quick access" rows.
export { ResourceTypePill } from "./resource-type-pill";
export type { ResourceTypePillProps } from "./resource-type-pill";
