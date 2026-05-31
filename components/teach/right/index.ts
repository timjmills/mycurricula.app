// components/teach/right/ — the Teach surface's RIGHT zone (Wave 1, Agent E).
//
// Public surface: the 64px right icon rail, the collapsible right panel that
// hosts the module tabs (Resources / Chat / To-do), and their prop types.
// Integration (Wave 2) mounts these against the frozen Wave-0 workspace state +
// dnd contract; module bodies are reached through the panel, not imported
// directly, so the panel stays the single owner of "which right module shows".

export { TeachRightRail } from "./TeachRightRail";
export type { TeachRightRailProps } from "./TeachRightRail";

export { TeachRightPanel } from "./TeachRightPanel";
export type { TeachRightPanelProps } from "./TeachRightPanel";

// Module bodies + their prop types — exported for integration tests and any
// caller that wants to mount a single module (e.g. a floating window in Phase 2).
export { ResourcesModule } from "./modules/ResourcesModule";
export type { ResourcesModuleProps } from "./modules/ResourcesModule";
export { ChatModule } from "./modules/ChatModule";
export type { ChatModuleProps } from "./modules/ChatModule";
export { TodoModule } from "./modules/TodoModule";
export type { TodoModuleProps } from "./modules/TodoModule";
