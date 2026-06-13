// components/teach/board/ — the board surface (docs/teach-view-plan.md §4).
// The canonical board renderer is the free-form `BoardEditor` (board/editor);
// this barrel exposes the board-settings/appearance popovers + tag chips that
// the workspace mounts around it. Consumers import from this barrel, never a
// deep file.
//
// Wave 1 declutter: the dead second board system (the CSS-grid `TeachingBoard`,
// `WidgetShell`, `WidgetPicker`, `WidgetSettingsPopover`, `FocusMode`,
// `BoardEmptyState`, and `board.module.css`) was removed — `BoardEditor` always
// wins, so those were unreachable.

export { BoardSettingsPopover } from "./BoardSettingsPopover";
export type { BoardSettingsPopoverProps } from "./BoardSettingsPopover";

// BoardBackgroundPicker was removed in the #11 appearance consolidation — board
// paper now lives ONLY in the editor's appearance popover (BoardEditor's
// intent-based PaperPicker), so the standalone client-write picker is gone.

export { BoardTagChips } from "./BoardTagChips";
export type { BoardTagChipsProps } from "./BoardTagChips";

export { BoardTagPicker } from "./BoardTagPicker";
export type { BoardTagPickerProps } from "./BoardTagPicker";
