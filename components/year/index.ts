// Barrel export for the year component family.
// Consumers import from "@/components/year" — never from deep files.

export { TimelineYear } from "./TimelineYear";
export { YearView } from "./YearView";
export { YearMobile } from "./YearMobile";
export { YearSidebar } from "./YearSidebar";
export { RoadmapView } from "./RoadmapView";
export { ProgressionView } from "./ProgressionView";
export { StatusGlyph } from "./StatusGlyph";
export { LaneCard } from "./LaneCard";
export { UnitBar } from "./UnitBar";
export { StatusBadge } from "./StatusBadge";
export { TodayMarker } from "./TodayMarker";
export { subjectClassName } from "./roadTones";
export type { UnitBarStatus } from "./UnitBar";
export { QuarterMonthWeekHeader } from "./QuarterMonthWeekHeader";
export type { QuarterMonthWeekHeaderProps } from "./QuarterMonthWeekHeader";
export { StatusFilterBar } from "./StatusFilterBar";
export type { StatusFilterBarProps, StatusFilterId } from "./StatusFilterBar";
export { MonthPicker } from "./MonthPicker";
export type { MonthPickerProps } from "./MonthPicker";
export { AddUnitDialog } from "./AddUnitDialog";
export type { AddUnitDialogProps } from "./AddUnitDialog";
export { ResourcesSort } from "./ResourcesSort";
export type { ResourceEntry, ResourcesSortProps } from "./ResourcesSort";

// Merged Curriculum↔Yearly view (progressive drill: all → subject → unit →
// week → lesson). TimelineYear orchestrates these; they are also exported for
// any future direct consumers.
export { YearStatCards } from "./YearStatCards";
export { YearSubjectsSidebar } from "./YearSubjectsSidebar";
export type {
  YearSubjectsSidebarProps,
  YearSidebarSubject,
  YearSidebarUnit,
} from "./YearSubjectsSidebar";
export { YearBreadcrumb } from "./YearBreadcrumb";
export type { YearBreadcrumbProps } from "./YearBreadcrumb";
export { YearDayCards } from "./YearDayCards";
export type { YearDayCardsProps } from "./YearDayCards";
export { YearLessonPane } from "./YearLessonPane";
export type { YearLessonPaneProps } from "./YearLessonPane";
export { StandardsCoveragePanel } from "./StandardsCoveragePanel";
export type { StandardsCoveragePanelProps } from "./StandardsCoveragePanel";
export { YearFiltersPopover } from "./YearFiltersPopover";
export type {
  YearFiltersPopoverProps,
  YearFilterState,
  YearStatusKey,
} from "./YearFiltersPopover";
export type { YearScope } from "./year-scope";
export { scopeSubjectId } from "./year-scope";
