"use client";

// editing-indicator.tsx — W4-D1 per-lesson "someone else is editing" pill.
//
// Renders inside the LessonCard's top-right indicator cluster when one or
// more OTHER teachers are actively editing this lesson, surfaced by the
// useTeacherPresence() hook from lib/realtime-presence.ts.
//
// Voice (CLAUDE.md §4): teach the coordination semantics, not just the
// state. "Sarah is editing — last change wins" tells the teacher both
// who is in the lesson AND what happens on conflict.
//
// Visual contract: subtle but persistent. Uses --fyi (informational
// blue) for the chip, --ink-700 for the text. NOT --urgent / --catchup
// (this isn't an error or an emergency — it's a coordination hint).
// Mirrors the Modified pill geometry on the same card so the cluster
// reads as a coherent row of state indicators.
//
// Multi-editor case: when ≥2 teachers are active we render the first
// teacher's initials chip + "+N" suffix and surface the full list in
// the tooltip. Avatars + live cursors are deferred per Decision #9.

import type { CSSProperties, ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import { useTeacherPresence } from "@/lib/realtime-presence";

export interface EditingIndicatorProps {
  /** Lesson id to look up in the active-editors map. */
  lessonId: string;
}

export function EditingIndicator({
  lessonId,
}: EditingIndicatorProps): ReactNode {
  const { activeEditors } = useTeacherPresence();
  const editors = activeEditors.get(lessonId);

  // No one editing → render nothing. Lesson card layout stays unchanged
  // for the common case (the vast majority of lessons).
  if (!editors || editors.length === 0) return null;

  const primary = editors[0];
  const others = editors.length - 1;

  const label =
    editors.length === 1
      ? `${primary.name.split(" ")[0]} is editing`
      : `${primary.name.split(" ")[0]} +${others} editing`;

  // Tooltip copy — the load-bearing teaching surface. List every editor
  // by full name + explain the last-write-wins semantics so the teacher
  // knows what to expect if they edit at the same time.
  const tooltipContent = (
    <>
      <strong>
        {editors.length === 1
          ? `${primary.name} is editing this lesson`
          : `${editors.map((t) => t.name).join(", ")} are editing this lesson`}
      </strong>
      {" — "}
      whoever saves last wins. If you both edit at once, the most recent change
      overwrites the earlier one.
    </>
  );

  // Inline styles to match the sibling "Modified" pill's geometry in
  // lesson-card.tsx (same height, same vertical rhythm). Background is
  // --fyi-bg (soft blue tint) so the chip recedes; text is --ink-700.
  // The chip itself contains the initials avatar — same dot the
  // notification bell uses, with the per-teacher avatarColor.
  const pillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 18,
    padding: "0 6px 0 3px",
    borderRadius: 999,
    background: "var(--fyi-bg)",
    border: "1px solid color-mix(in srgb, var(--fyi) 30%, transparent)",
    color: "var(--ink-700)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.2,
    lineHeight: 1,
    whiteSpace: "nowrap",
    // Keep the cluster from inflating when a long initials string lands.
    maxWidth: 130,
  };

  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 14,
    height: 14,
    borderRadius: 999,
    background: primary.avatarColor,
    color: "var(--paper)",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.1,
    flex: "0 0 auto",
  };

  return (
    <Tooltip content={tooltipContent} side="top" tooltipId="editing-indicator">
      <span
        // tabIndex so keyboard users can land on the chip and trigger the
        // tooltip; the chip itself is non-interactive (presence is
        // observed, not actioned).
        tabIndex={0}
        role="status"
        aria-label={`${editors.length === 1 ? primary.name : `${primary.name} and ${others} other${others === 1 ? "" : "s"}`} editing — last change wins`}
        // Native title for touch long-press fallback (mirrors the rest of
        // the lesson card's indicator cluster).
        title={
          editors.length === 1
            ? `${primary.name} is editing — last change wins`
            : `${editors.map((t) => t.name).join(", ")} are editing — last change wins`
        }
        style={pillStyle}
      >
        <span style={chipStyle} aria-hidden="true">
          {primary.initials}
        </span>
        <span>{label}</span>
      </span>
    </Tooltip>
  );
}
