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

// Phase 3 interactive widget library (TimerWidget/PollWidget/NamesWidget/
// AgendaWidget were rewritten in place; exported above).
export { StopwatchWidget } from "./StopwatchWidget";
export { ClockWidget } from "./ClockWidget";
export { CountdownWidget } from "./CountdownWidget";
export { DiceWidget } from "./DiceWidget";
export { ScoreboardWidget } from "./ScoreboardWidget";
export { TrafficLightWidget } from "./TrafficLightWidget";
export { WorkSymbolsWidget } from "./WorkSymbolsWidget";
export { SoundLevelWidget } from "./SoundLevelWidget";
export { TextWidget } from "./TextWidget";

// 5.31 named pedagogical widgets (handoff §2 / Ultraplan §4).
// Lesson Essentials
export { LearningTargetWidget } from "./LearningTargetWidget";
export { NowNextThenWidget } from "./NowNextThenWidget";
export { DirectionsWidget } from "./DirectionsWidget";
export { MaterialsNeededWidget } from "./MaterialsNeededWidget";
export { WorkCompletedWidget } from "./WorkCompletedWidget";
// Routines & Management
export { TransitionWidget } from "./TransitionWidget";
export { AttentionSignalWidget } from "./AttentionSignalWidget";
export { VoiceMovementWidget } from "./VoiceMovementWidget";
export { WhenDoneWidget } from "./WhenDoneWidget";
export { StudentJobsWidget } from "./StudentJobsWidget";
// Assessment & Support
export { ExitTicketWidget } from "./ExitTicketWidget";
export { UnderstandingCheckWidget } from "./UnderstandingCheckWidget";
export { HelpQueueWidget } from "./HelpQueueWidget";
export { ParticipationTrackerWidget } from "./ParticipationTrackerWidget";
export { QuestionParkingLotWidget } from "./QuestionParkingLotWidget";
// Small Groups & Language
export { CenterRotationWidget } from "./CenterRotationWidget";
export { TeacherTableWidget } from "./TeacherTableWidget";
export { VocabularyWidget } from "./VocabularyWidget";
export { SentenceFramesWidget } from "./SentenceFramesWidget";
export { DiscussionProtocolWidget } from "./DiscussionProtocolWidget";
// Regulation & Teacher Tools
export { BrainBreakWidget } from "./BrainBreakWidget";
export { CalmCornerWidget } from "./CalmCornerWidget";
export { ClassPointsWidget } from "./ClassPointsWidget";
export { TeacherNotesWidget } from "./TeacherNotesWidget";
export { MiniWhiteboardWidget } from "./MiniWhiteboardWidget";

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
