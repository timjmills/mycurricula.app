// components/teach/widgets/ — display-only widget bodies for the Teaching Board
// (docs/teach-view-plan.md §4.5, Agent C). All bodies render from a `Widget`'s
// `config` (display-only in v1) and a lesson `subjectId` for tinted accents.
// Consumers import from this barrel, never a deep file.

export { WidgetBody } from "./WidgetBody";
export type { WidgetBodyProps } from "./WidgetBody";

export { ObjectiveWidget } from "./ObjectiveWidget";
export { TimerWidget } from "./TimerWidget";
export { GroupsWidget } from "./GroupsWidget";
export { ModelWidget } from "./ModelWidget";
export { AgendaWidget } from "./AgendaWidget";
export { NotesWidget } from "./NotesWidget";
export { ManipulativesWidget } from "./ManipulativesWidget";
export { SlidesWidget } from "./SlidesWidget";
export { YouTubeWidget } from "./YouTubeWidget";
export { EmbedWidget } from "./EmbedWidget";
export { PollWidget } from "./PollWidget";
export { NamesWidget } from "./NamesWidget";

export { MediaCard } from "./MediaCard";
export type { MediaCardProps } from "./MediaCard";

export { TeachIcon } from "./icons";
export type { TeachIconName, TeachIconProps } from "./icons";

export {
  WIDGET_CATALOG,
  widgetMeta,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from "./catalog";
export type { WidgetMeta, WidgetCategory } from "./catalog";

export { boardTintVar } from "./types";
export type { BoardTint } from "./types";
