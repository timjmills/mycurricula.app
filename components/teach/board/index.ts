// components/teach/board/ — the center Teaching Board (docs/teach-view-plan.md
// §4, Agent C): the CSS-grid board, widget tile chrome, picker, empty state,
// and focus mode. Consumers import from this barrel, never a deep file.

export { TeachingBoard } from "./TeachingBoard";
export type { TeachingBoardProps } from "./TeachingBoard";

export { WidgetShell } from "./WidgetShell";
export type { WidgetShellProps } from "./WidgetShell";

export { WidgetPicker } from "./WidgetPicker";
export type { WidgetPickerProps } from "./WidgetPicker";

export { BoardEmptyState } from "./BoardEmptyState";
export type { BoardEmptyStateProps } from "./BoardEmptyState";

export { FocusMode } from "./FocusMode";
export type { FocusModeProps } from "./FocusMode";

export { BoardSettingsPopover } from "./BoardSettingsPopover";
export type { BoardSettingsPopoverProps } from "./BoardSettingsPopover";

export { WidgetSettingsPopover } from "./WidgetSettingsPopover";
export type { WidgetSettingsPopoverProps } from "./WidgetSettingsPopover";
