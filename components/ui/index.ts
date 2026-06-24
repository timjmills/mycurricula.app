// components/ui/ — the canonical primitive library.
//
// Every page must import from this barrel rather than re-creating a
// button, card, list row, header, badge, chip, toggle group, or tooltip
// inline. See BUILD_STANDARD.md §7 for the contract.
//
// When a new variant is needed: add a prop to the existing primitive.
// Do NOT duplicate or fork a primitive locally.

export { Button } from "./Button";
export type { ButtonProps } from "./Button";

export { ToggleGroup } from "./ToggleGroup";
export type { ToggleGroupProps, ToggleOption } from "./ToggleGroup";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";

export { Chip } from "./Chip";
export type { ChipProps } from "./Chip";

export { StandardPill } from "./StandardPill";
export type { StandardPillProps } from "./StandardPill";

export { ZoomPanCanvas } from "./ZoomPanCanvas";
export type { ZoomPanCanvasProps } from "./ZoomPanCanvas";

export { Tooltip } from "./Tooltip";
export type { TooltipProps } from "./Tooltip";

export { FutureControl } from "./FutureControl";
export type { FutureControlProps } from "./FutureControl";

export { IntroSubtitle } from "./IntroSubtitle";
export type { IntroSubtitleProps, IntroSubtitleViewKey } from "./IntroSubtitle";

export { ThemeWash } from "./ThemeWash";
