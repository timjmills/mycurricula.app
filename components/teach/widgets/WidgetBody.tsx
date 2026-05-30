// WidgetBody — the switch that maps a `Widget.type` to its display-only body
// (docs/teach-view-plan.md §4.5 + 5.31 Ultraplan §4). The integrator passes the
// lesson's subject so subject-tinted bodies resolve their accent; it defaults to
// "math" (the first beta team's lead subject) when unresolved. Every union
// member maps to a body — alias ids reuse a survivor body (per the §4.2 dedupe
// map) — so a board can never render an unknown type. The `default` branch is a
// belt-and-braces fallback only.

import type { ReactNode } from "react";
import type { SubjectId, Widget } from "@/lib/types";
// ── Generic / utility bodies (restyled into the 5.31 --w-* contract) ─────────
import { ObjectiveWidget } from "./ObjectiveWidget";
import { TimerWidget } from "./TimerWidget";
import { GroupsWidget } from "./GroupsWidget";
import { ModelWidget } from "./ModelWidget";
import { AgendaWidget } from "./AgendaWidget";
import { NotesWidget } from "./NotesWidget";
import { ManipulativesWidget } from "./ManipulativesWidget";
import { SlidesWidget } from "./SlidesWidget";
import { YouTubeWidget } from "./YouTubeWidget";
import { EmbedWidget } from "./EmbedWidget";
import { PollWidget } from "./PollWidget";
import { NamesWidget } from "./NamesWidget";
import { StopwatchWidget } from "./StopwatchWidget";
import { ClockWidget } from "./ClockWidget";
import { CountdownWidget } from "./CountdownWidget";
import { DiceWidget } from "./DiceWidget";
import { ScoreboardWidget } from "./ScoreboardWidget";
import { TrafficLightWidget } from "./TrafficLightWidget";
import { WorkSymbolsWidget } from "./WorkSymbolsWidget";
import { SoundLevelWidget } from "./SoundLevelWidget";
import { TextWidget } from "./TextWidget";
// ── Named pedagogical bodies — Lesson Essentials (B1a) ───────────────────────
import { LearningTargetWidget } from "./LearningTargetWidget";
import { NowNextThenWidget } from "./NowNextThenWidget";
import { DirectionsWidget } from "./DirectionsWidget";
import { MaterialsNeededWidget } from "./MaterialsNeededWidget";
import { WorkCompletedWidget } from "./WorkCompletedWidget";
// ── Routines & Management (B1a) ──────────────────────────────────────────────
import { TransitionWidget } from "./TransitionWidget";
import { AttentionSignalWidget } from "./AttentionSignalWidget";
import { VoiceMovementWidget } from "./VoiceMovementWidget";
import { WhenDoneWidget } from "./WhenDoneWidget";
import { StudentJobsWidget } from "./StudentJobsWidget";
// ── Assessment & Support (B1a) ───────────────────────────────────────────────
import { ExitTicketWidget } from "./ExitTicketWidget";
import { UnderstandingCheckWidget } from "./UnderstandingCheckWidget";
import { HelpQueueWidget } from "./HelpQueueWidget";
import { ParticipationTrackerWidget } from "./ParticipationTrackerWidget";
import { QuestionParkingLotWidget } from "./QuestionParkingLotWidget";
// ── Small Groups & Language (B1b) ────────────────────────────────────────────
import { CenterRotationWidget } from "./CenterRotationWidget";
import { TeacherTableWidget } from "./TeacherTableWidget";
import { VocabularyWidget } from "./VocabularyWidget";
import { SentenceFramesWidget } from "./SentenceFramesWidget";
import { DiscussionProtocolWidget } from "./DiscussionProtocolWidget";
// ── Regulation & Teacher Tools (B1b) ─────────────────────────────────────────
import { BrainBreakWidget } from "./BrainBreakWidget";
import { CalmCornerWidget } from "./CalmCornerWidget";
import { ClassPointsWidget } from "./ClassPointsWidget";
import { TeacherNotesWidget } from "./TeacherNotesWidget";
import { MiniWhiteboardWidget } from "./MiniWhiteboardWidget";
import { widgetMeta } from "./catalog";
import { TeachIcon } from "./icons";
import styles from "./widgets.module.css";

export interface WidgetBodyProps {
  widget: Widget;
  /** Lesson subject for tinted accents. Defaults to "math". */
  subjectId?: SubjectId;
}

export function WidgetBody({
  widget,
  subjectId = "math",
}: WidgetBodyProps): ReactNode {
  const props = { widget, subjectId };
  switch (widget.type) {
    // ── Generic / utility ────────────────────────────────────────────────────
    case "objective":
      return <ObjectiveWidget {...props} />;
    case "timer":
      return <TimerWidget {...props} />;
    case "groups":
      return <GroupsWidget {...props} />;
    case "model":
      return <ModelWidget {...props} />;
    case "agenda":
    case "lesson-flow": // alias: lesson-flow is the §4.2 survivor for agenda
      return <AgendaWidget {...props} />;
    case "notes":
      return <NotesWidget {...props} />;
    case "manipulatives":
      return <ManipulativesWidget {...props} />;
    case "slides":
    case "note-view": // alias: multi-page resource slideshow
      return <SlidesWidget {...props} />;
    case "youtube":
      return <YouTubeWidget {...props} />;
    case "embed":
    case "resource": // alias: embedded resource card on the canvas
      return <EmbedWidget {...props} />;
    case "poll":
      return <PollWidget {...props} />;
    case "names":
    case "namepick": // alias: §4.2 survivor id for the name picker
      return <NamesWidget {...props} />;
    case "stopwatch":
      return <StopwatchWidget {...props} />;
    case "clock":
      return <ClockWidget {...props} />;
    case "countdown":
      return <CountdownWidget {...props} />;
    case "dice":
      return <DiceWidget {...props} />;
    case "scoreboard":
      return <ScoreboardWidget {...props} />;
    case "traffic":
      return <TrafficLightWidget {...props} />;
    case "work_symbols":
      return <WorkSymbolsWidget {...props} />;
    case "soundlevel":
    case "sound": // alias: §4.2 survivor id for the mic-level meter
    case "work-sound": // voice-level selector — shares the sound-level body
      return <SoundLevelWidget {...props} />;
    case "text":
      return <TextWidget {...props} />;
    // ── Lesson Essentials ─────────────────────────────────────────────────────
    case "learning-target":
      return <LearningTargetWidget {...props} />;
    case "now-next-then":
      return <NowNextThenWidget {...props} />;
    case "directions":
      return <DirectionsWidget {...props} />;
    case "materials-needed":
      return <MaterialsNeededWidget {...props} />;
    case "work-completed":
      return <WorkCompletedWidget {...props} />;
    // ── Routines & Management ─────────────────────────────────────────────────
    case "transition":
      return <TransitionWidget {...props} />;
    case "attention-signal":
      return <AttentionSignalWidget {...props} />;
    case "voice-movement":
      return <VoiceMovementWidget {...props} />;
    case "when-done":
      return <WhenDoneWidget {...props} />;
    case "student-jobs":
      return <StudentJobsWidget {...props} />;
    // ── Assessment & Support ──────────────────────────────────────────────────
    case "exit-ticket":
      return <ExitTicketWidget {...props} />;
    case "understanding-check":
      return <UnderstandingCheckWidget {...props} />;
    case "help-queue":
      return <HelpQueueWidget {...props} />;
    case "participation-tracker":
      return <ParticipationTrackerWidget {...props} />;
    case "question-parking-lot":
      return <QuestionParkingLotWidget {...props} />;
    // ── Small Groups & Language ───────────────────────────────────────────────
    case "center-rotation":
      return <CenterRotationWidget {...props} />;
    case "teacher-table":
      return <TeacherTableWidget {...props} />;
    case "vocabulary":
      return <VocabularyWidget {...props} />;
    case "sentence-frames":
      return <SentenceFramesWidget {...props} />;
    case "discussion-protocol":
      return <DiscussionProtocolWidget {...props} />;
    // ── Regulation & Teacher Tools ────────────────────────────────────────────
    case "brain-break":
      return <BrainBreakWidget {...props} />;
    case "calm-corner":
      return <CalmCornerWidget {...props} />;
    case "class-points":
      return <ClassPointsWidget {...props} />;
    case "teacher-notes":
      return <TeacherNotesWidget {...props} />;
    case "mini-whiteboard":
      return <MiniWhiteboardWidget {...props} />;
    default: {
      // Belt-and-braces fallback for an unknown type (should be unreachable —
      // every union member is handled above).
      const meta = widgetMeta(widget.type);
      return (
        <div className={styles.fallback}>
          <TeachIcon name={meta?.icon ?? "grid"} size={22} />
          <span className={styles.fallbackLabel}>
            {meta?.label ?? widget.type}
          </span>
        </div>
      );
    }
  }
}
