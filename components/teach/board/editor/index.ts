// components/teach/board/editor/ — the free-form Board Editor canvas (5.31
// Widgets & Boards handoff §4). Consumers import from this barrel, never a deep
// file. The LEAD mounts <BoardEditor> and wires its `onChange(intent)` to the
// Teach repo (see BoardEditorIntent for the full mutation surface).

export { BoardEditor, default } from "./BoardEditor";
export type {
  BoardEditorProps,
  BoardEditorIntent,
  ResourceItem,
} from "./BoardEditor";

export { AppearancePanel, ThemeControls } from "./AppearancePanel";
export type { AppearancePanelProps, ThemeProp } from "./AppearancePanel";
