"use client";

// components/teach-v2/LessonRail.tsx — the v2 minimizable/pinnable lesson pane
// (artboard "teach-lesson" / "teach-rail" + LessonNav). It COMPOSES the shipped
// left/right module bodies rather than rebuilding the LessonNav:
//   • Lessons tab   → <LessonListModule> (the day's lessons; selects the active
//                     Teach lesson through the central reducer).
//   • Resources tab → <ResourcesModule> (the active lesson's resources — the T8
//                     drag source; magnify / embed / open-board actions).
//
// Minimized → a 64px vertical rail (subject-colour top bar, glyph, vertical
// name, expand). Pin/minimize state is owned by the shell (it drives the grid
// template + the fullscreen "keep lesson open" behaviour) and passed in.

import { useState, type CSSProperties, type ReactNode } from "react";
import { useSubjectColor } from "@/lib/palette";
import { SUBJECT_BY_ID } from "@/lib/mock";
import type { SubjectId, TeachResource, Board } from "@/lib/types";
import type { TeachWorkspaceState } from "@/lib/teach/types";
import type { TeachWorkspaceAction } from "@/components/teach/TeachWorkspace";
import {
  LessonListModule,
  ClassModule,
  GroupsModule,
} from "@/components/teach/left/modules";
import { ResourcesModule } from "@/components/teach/right/modules/ResourcesModule";
import { Button, Tooltip } from "@/components/ui";
import { V2Icon } from "./icons";
import styles from "./LessonRail.module.css";

export interface LessonRailProps {
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
  subject: SubjectId | undefined;
  boards: Board[];
  minimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onEmbedResource: (resource: TeachResource) => void;
  onMagnifyResource: (resource: TeachResource) => void;
  onOpenBoard: (boardId: string) => void;
}

type RailTab = "lessons" | "resources" | "class";

export function LessonRail({
  state,
  dispatch,
  subject,
  boards,
  minimized,
  onMinimize,
  onExpand,
  pinned,
  onTogglePin,
  onEmbedResource,
  onMagnifyResource,
  onOpenBoard,
}: LessonRailProps): ReactNode {
  const [tab, setTab] = useState<RailTab>("lessons");
  const [classSub, setClassSub] = useState<"roster" | "groups">("roster");
  // Subject colour is decorative here; fall back to a neutral hue when no lesson
  // is active. The hook must be called unconditionally, so pass a stable
  // fallback and only paint the stripe when a real subject exists.
  const color = useSubjectColor(subject ?? "reading");
  const meta = subject ? SUBJECT_BY_ID[subject] : undefined;
  const stripe = subject ? color.c : "var(--line)";

  const cssVars = {
    ["--rail-subj"]: stripe,
  } as CSSProperties;

  if (minimized) {
    return (
      <aside
        className={styles.rail}
        style={cssVars}
        title="Lesson panel (minimized) — expand to see lessons and resources"
        aria-label="Lesson panel, minimized"
      >
        <span className={styles.railBar} aria-hidden="true" />
        <span className={styles.railGlyph} aria-hidden="true">
          {meta?.icon ?? "•"}
        </span>
        <Tooltip content="Expand the lesson panel" side="right" tooltipId="teach-v2-lesson-expand">
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Expand lesson panel"
            onClick={onExpand}
          >
            <V2Icon name="expand" size={16} />
          </Button>
        </Tooltip>
        <span className={styles.railName}>{meta?.name ?? "Lesson"}</span>
      </aside>
    );
  }

  return (
    <aside
      className={styles.pane}
      style={cssVars}
      title="Lesson panel — the day's lessons and this lesson's resources"
      aria-label="Lesson panel"
    >
      <span className={styles.paneStripe} aria-hidden="true" />
      <header className={styles.head}>
        <div className={styles.tabs} role="tablist" aria-label="Lesson panel tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "lessons"}
            className={`${styles.tab} ${tab === "lessons" ? styles.tabOn : ""}`}
            onClick={() => setTab("lessons")}
          >
            Lessons
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "resources"}
            className={`${styles.tab} ${tab === "resources" ? styles.tabOn : ""}`}
            onClick={() => setTab("resources")}
          >
            Resources
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "class"}
            className={`${styles.tab} ${tab === "class" ? styles.tabOn : ""}`}
            onClick={() => setTab("class")}
            title="Your class roster and groups — kept on this device only"
          >
            Class
          </button>
        </div>
        <div className={styles.headActions}>
          <Tooltip
            content={pinned ? "Unpin — the panel hides when the board goes fullscreen" : "Pin — keep the lesson panel open even in board fullscreen"}
            side="bottom"
            tooltipId="teach-v2-lesson-pin"
          >
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel={pinned ? "Unpin lesson panel" : "Pin lesson panel"}
              aria-pressed={pinned}
              className={pinned ? styles.pinOn : undefined}
              onClick={onTogglePin}
            >
              <V2Icon name="pin" size={16} />
            </Button>
          </Tooltip>
          <Tooltip content="Minimize the lesson panel to the side" side="bottom" tooltipId="teach-v2-lesson-min">
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Minimize lesson panel"
              onClick={onMinimize}
            >
              <V2Icon name="minimize" size={16} />
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className={styles.body} role="tabpanel">
        {tab === "lessons" ? (
          <LessonListModule
            activeLessonId={state.activeLessonId}
            dispatch={dispatch}
          />
        ) : tab === "resources" ? (
          <ResourcesModule
            activeLessonId={state.activeLessonId}
            boards={boards}
            onEmbedResource={onEmbedResource}
            onMagnifyResource={onMagnifyResource}
            onOpenBoard={onOpenBoard}
          />
        ) : (
          // Roster + groups — the ONLY student-name entry path (restores the
          // Groups/Names widget copy's referenced panel). Composed AS-IS so the
          // privacy contract is untouched: names live in useTeachGroups
          // localStorage and never reach the repo. ClassModule and GroupsModule
          // are rendered ONE AT A TIME (a sub-toggle), exactly as V1's single-mode
          // left panel did — co-mounting both trips a cross-component
          // setState-in-render between the two useTeachGroups consumers.
          <div className={styles.classStack}>
            <div className={styles.classToggle} role="tablist" aria-label="Class view">
              <button
                type="button"
                role="tab"
                aria-selected={classSub === "roster"}
                className={`${styles.subTab} ${classSub === "roster" ? styles.subTabOn : ""}`}
                onClick={() => setClassSub("roster")}
              >
                Roster
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={classSub === "groups"}
                className={`${styles.subTab} ${classSub === "groups" ? styles.subTabOn : ""}`}
                onClick={() => setClassSub("groups")}
              >
                Groups
              </button>
            </div>
            {classSub === "roster" ? <ClassModule /> : <GroupsModule />}
          </div>
        )}
      </div>
    </aside>
  );
}
