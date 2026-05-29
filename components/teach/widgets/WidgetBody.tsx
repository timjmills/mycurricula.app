// WidgetBody — the switch that maps a `Widget.type` to its display-only body
// (docs/teach-view-plan.md §4.5). The integrator passes the lesson's subject so
// subject-tinted bodies resolve their accent; it defaults to "math" (the first
// beta team's lead subject) when unresolved. Unknown/not-yet-built types fall
// back to a labelled placeholder rather than crashing the board.

import type { ReactNode } from "react";
import type { SubjectId, Widget } from "@/lib/types";
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
    case "objective":
      return <ObjectiveWidget {...props} />;
    case "timer":
      return <TimerWidget {...props} />;
    case "groups":
      return <GroupsWidget {...props} />;
    case "model":
      return <ModelWidget {...props} />;
    case "agenda":
      return <AgendaWidget {...props} />;
    case "notes":
      return <NotesWidget {...props} />;
    case "manipulatives":
      return <ManipulativesWidget {...props} />;
    case "slides":
      return <SlidesWidget {...props} />;
    case "youtube":
      return <YouTubeWidget {...props} />;
    case "embed":
      return <EmbedWidget {...props} />;
    case "poll":
      return <PollWidget {...props} />;
    case "names":
      return <NamesWidget {...props} />;
    default: {
      // Exhaustiveness guard + graceful fallback for an unknown type.
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
