// Barrel for the notecard UI family.
//
// A notecard is a LessonResource (`type:"notecard"`) whose content is a
// flip-through media gallery plus a rich-text notes body (see lib/notecards.ts
// for the read-side helpers). This family renders it three ways:
//   • Gallery            — the flip-through media strip primitive.
//   • NotecardCard       — the at-rest card (gallery + collapsible notes).
//   • NotecardFullscreen — the split-screen view (carousel left, notes right).
//
// Consumers import from `@/components/notecards`, never a deep file.

export { Gallery } from "./Gallery";
export type { GalleryProps } from "./Gallery";

export { NotecardCard } from "./NotecardCard";
export type { NotecardCardProps } from "./NotecardCard";

export { NotecardFullscreen } from "./NotecardFullscreen";
export type { NotecardFullscreenProps } from "./NotecardFullscreen";
