// Public surface of the Lesson Card component.
// Grid views and other consumers import only from `@/components/lesson-card`.

export { LessonCard } from "./lesson-card";
export type {
  LessonCardProps,
  ContextAction,
  ContextActionPayload,
} from "./lesson-card";

export { RelocatePicker } from "./relocate-picker";
export type { RelocatePickerProps, RelocateTarget } from "./relocate-picker";

export { CompareToMaster } from "./compare-to-master";
export type { CompareToMasterProps } from "./compare-to-master";

// The singleton that makes the fork diff reachable on the v2 build. Mounted
// once, from app/(planner)/layout.tsx, behind the V2 flag — never per-card.
export { ForkDiffHost } from "./fork-diff-host";

export { ForkDiffPanel } from "./fork-diff";
export type { ForkDiffPanelProps } from "./fork-diff";

export { ArchiveToast } from "./archive-toast";
export type { ArchiveToastProps } from "./archive-toast";
