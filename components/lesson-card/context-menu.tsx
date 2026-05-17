"use client";

// context-menu.tsx — the lesson context menu.
//
// Opened by right-click on the card or by the `⋯` affordance. Items match
// planning_document §6.5. "Move to…" and "Mark status…" open a one-level
// submenu in place. The menu is positioned at a viewport point and clamps
// itself inside the window; it closes on outside-click, Esc, or selection.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lesson, LessonStatus } from "@/lib/types";
import { Icon } from "./icon";
import { STATUS_LABEL } from "./status";

/** Stable action ids handed back through `onContextAction`. */
export type ContextAction =
  | "move"
  | "duplicate"
  | "copy-to-personal"
  | "reset-to-master"
  | "mark-status"
  | "add-to-todo"
  | "see-standards"
  | "print"
  | "delete";

/**
 * Structured detail for a context action. All fields optional — only the
 * ones an action needs are set:
 *   • `mark-status` → `status`
 *   • `move` to a day  → `day` (0 = Sun … 4 = Thu)
 *   • `move` to a week → `week`
 *   • `move` to a unit → `unit`
 * `taskId` is set when the action originated from an inner task row.
 */
export interface ContextActionPayload {
  status?: LessonStatus;
  day?: number;
  week?: number;
  unit?: string;
  taskId?: string;
}

interface ContextMenuProps {
  lesson: Lesson;
  /** Viewport coordinates of the open point. */
  x: number;
  y: number;
  /** Master mode unlocks the destructive "Delete from Core" item. */
  isMaster?: boolean;
  onClose: () => void;
  /**
   * Fired with the chosen action and an optional structured payload
   * (target day/week/unit for Move, `status` for Mark-status).
   */
  onAction: (action: ContextAction, payload?: ContextActionPayload) => void;
}

type Submenu = "move" | "status" | null;

interface MenuRow {
  kind?: "item" | "head" | "divider";
  label?: string;
  chevron?: boolean;
  kbd?: string;
  danger?: boolean;
  onSelect?: () => void;
}

export function LessonContextMenu({
  lesson,
  x,
  y,
  isMaster = false,
  onClose,
  onAction,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<Submenu>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp the menu inside the viewport once it has measured itself.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - width - 8);
    const ny = Math.min(y, window.innerHeight - height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y, sub]);

  // Dismiss on outside-click or Esc.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const fire = useCallback(
    (action: ContextAction, payload?: ContextActionPayload) => {
      onAction(action, payload);
      onClose();
    },
    [onAction, onClose],
  );

  let rows: MenuRow[];
  if (sub === "move") {
    rows = [
      { kind: "head", label: "Move to day" },
      // Day indices follow the model: 0 = Sunday … 4 = Thursday.
      ...["Sun", "Mon", "Tue", "Wed", "Thu"].map((d, i) => ({
        label: d,
        onSelect: () => fire("move", { day: i }),
      })),
      { kind: "divider" },
      { kind: "head", label: "Move to week" },
      {
        label: "← Week 11 (last week)",
        onSelect: () => fire("move", { week: 11 }),
      },
      {
        label: "→ Week 13 (next week)",
        onSelect: () => fire("move", { week: 13 }),
      },
      { label: "Pick a week…", chevron: true, onSelect: () => fire("move") },
      { kind: "divider" },
      { kind: "head", label: "Move to unit" },
      {
        label: "Choose another unit…",
        chevron: true,
        onSelect: () => fire("move"),
      },
    ];
  } else if (sub === "status") {
    const statuses: LessonStatus[] = [
      "done",
      "partial",
      "skipped",
      "carried",
      "not_done",
    ];
    rows = [
      { kind: "head", label: "Mark status" },
      ...statuses.map((s, i) => ({
        label: STATUS_LABEL[s],
        kbd: ["1", "2", "3", "4", "0"][i],
        onSelect: () => fire("mark-status", { status: s }),
      })),
    ];
  } else {
    rows = [
      { label: "Move to…", chevron: true, onSelect: () => setSub("move") },
      { label: "Duplicate", kbd: "⌘D", onSelect: () => fire("duplicate") },
      lesson.isPersonal
        ? {
            label: "Reset to master",
            onSelect: () => fire("reset-to-master"),
          }
        : {
            label: "Copy to my personal",
            onSelect: () => fire("copy-to-personal"),
          },
      { label: "Mark status…", chevron: true, onSelect: () => setSub("status") },
      { kind: "divider" },
      { label: "Add to to-do list", onSelect: () => fire("add-to-todo") },
      { label: "See standards", onSelect: () => fire("see-standards") },
      { label: "Print this lesson", kbd: "⌘P", onSelect: () => fire("print") },
      ...(isMaster
        ? ([
            { kind: "divider" },
            {
              label: "Delete from Core",
              danger: true,
              onSelect: () => fire("delete"),
            },
          ] as MenuRow[])
        : []),
    ];
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Lesson actions"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: 1000,
        minWidth: 200,
        background: "var(--paper)",
        borderRadius: 6,
        border: "1px solid var(--ink-150)",
        boxShadow: "var(--shadow-popover)",
        padding: 4,
        fontSize: 13,
      }}
    >
      {sub && (
        <button
          type="button"
          onClick={() => setSub(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            padding: "5px 10px",
            borderRadius: 4,
            color: "var(--ink-500)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
            <Icon name="chevron" size={9} />
          </span>
          Back
        </button>
      )}
      {rows.map((row, i) => {
        if (row.kind === "divider") {
          return (
            <div
              key={`d-${i}`}
              role="separator"
              style={{
                height: 1,
                background: "var(--ink-100)",
                margin: "4px 2px",
              }}
            />
          );
        }
        if (row.kind === "head") {
          return (
            <div
              key={`h-${i}`}
              style={{
                fontSize: 10,
                color: "var(--ink-400)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontWeight: 500,
                padding: "6px 10px 2px",
              }}
            >
              {row.label}
            </div>
          );
        }
        return (
          <button
            key={`i-${i}`}
            type="button"
            role="menuitem"
            onClick={row.onSelect}
            className="cp-card-menuitem"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 10px",
              borderRadius: 4,
              textAlign: "left",
              color: row.danger ? "var(--urgent)" : "var(--ink-900)",
            }}
          >
            <span style={{ flex: 1 }}>{row.label}</span>
            {row.chevron && <Icon name="chevron" size={10} />}
            {row.kbd && (
              <span style={{ color: "var(--ink-400)", fontSize: 11 }}>
                {row.kbd}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
