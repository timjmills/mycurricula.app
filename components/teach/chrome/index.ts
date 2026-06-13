// components/teach/chrome/ — Teach surface chrome & modes (Agent A).
//
// The five-zone shell's top/sub bars, footer, and Present-mode strip
// (docs/teach-view-plan.md §3, §14). Each is a pure presentational component:
// it reads the central `TeachWorkspaceState` and dispatches against the frozen
// `TeachWorkspaceAction` union, with lesson/board data passed in as props (the
// integrating component reads usePlanner()/the teach repository, never the
// chrome). Consumers import from the folder, never a deep file.

export { TeachTopBar } from "./TeachTopBar";
export type { TeachTopBarProps } from "./TeachTopBar";

export { TeachSubBar, TEACH_CENTER_PANEL_ID } from "./TeachSubBar";
export type { TeachSubBarProps } from "./TeachSubBar";

export { TeachFooter } from "./TeachFooter";
export type { TeachFooterProps } from "./TeachFooter";

export { PresentBar } from "./PresentBar";
export type { PresentBarProps } from "./PresentBar";

export { TeachHelpOverlay } from "./TeachHelpOverlay";
export type { TeachHelpOverlayProps } from "./TeachHelpOverlay";
