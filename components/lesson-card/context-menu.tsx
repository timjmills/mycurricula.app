"use client";

// context-menu.tsx — the lesson context menu.
//
// Opened by right-click on the card or by the `⋯` affordance. Items match
// the expanded action set from planning_document §6.5 and the audit-fixes
// spec. "Mark status…" opens a one-level submenu in place. The menu is
// positioned at a viewport point and clamps itself inside the window; it
// closes on outside-click, Esc, or selection.
//
// Action groups (separated by dividers):
//   1. Navigation  — Open in Daily, Relocate, Bump, Duplicate, Save as template
//   2. Status/work — Mark status (submenu), Skip (quick), Add resource, Add to to-do, See standards
//   3. Forking     — Restore from Master*, Compare to Master*, Copy to personal*
//   4. Printing    — Print this lesson, Archive
//   (* conditional on lesson.modified)

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Lesson, LessonStatus } from "@/lib/types";
import { Icon } from "./icon";
import { STATUS_LABEL } from "./status";
// RelocatePicker, CompareToMaster, ArchiveToast are imported by the
// caller (lesson-card.tsx / weekly-lesson-card.tsx) via a shared
// menu state; the context menu itself fires string actions and lets
// the host handle opening the sub-surfaces. This keeps the menu tree
// shallow and avoids nesting portals inside portals.

/** Stable action ids handed back through `onContextAction`. */
export type ContextAction =
  | "open-daily"
  | "relocate"
  | "bump"
  | "duplicate"
  | "save-template"
  | "mark-status"
  | "skip-quick"
  | "add-resource"
  | "add-to-todo"
  | "see-standards"
  | "restore-master"
  | "compare-master"
  | "copy-to-personal"
  | "print"
  | "archive"
  // Legacy aliases kept so existing onContextAction consumers do not break.
  | "move"
  | "reset-to-master"
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

type Submenu = "status" | null;

interface MenuRow {
  kind?: "item" | "head" | "divider";
  label?: string;
  chevron?: boolean;
  kbd?: string;
  danger?: boolean;
  /** When true the row is omitted entirely — not greyed, not rendered. */
  hidden?: boolean;
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
  const router = useRouter();

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

  if (sub === "status") {
    // Mark-status submenu — one entry per status, plus a back button above.
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
    // Main menu — four groups separated by dividers.
    rows = [
      // ── Group 1: navigation & movement ──────────────────────────────────
      {
        label: "Open in Daily",
        onSelect: () => {
          router.push(`/daily?lesson=${lesson.id}`);
          onClose();
        },
      },
      {
        label: "Relocate…",
        onSelect: () => fire("relocate"),
      },
      {
        label: "Bump",
        onSelect: () => fire("bump"),
      },
      {
        label: "Duplicate",
        kbd: "⌘D",
        onSelect: () => fire("duplicate"),
      },
      {
        label: "Save as template",
        onSelect: () => fire("save-template"),
      },

      { kind: "divider" },

      // ── Group 2: status, resources, standards ────────────────────────────
      {
        label: "Mark status…",
        chevron: true,
        onSelect: () => setSub("status"),
      },
      {
        label: "Skip (quick)",
        onSelect: () => fire("skip-quick"),
      },
      {
        label: "Add resource…",
        onSelect: () => fire("add-resource"),
      },
      {
        label: "Add to to-do list",
        onSelect: () => fire("add-to-todo"),
      },
      {
        label: "See standards",
        onSelect: () => fire("see-standards"),
      },

      { kind: "divider" },

      // ── Group 3: forking — conditional on lesson.modified ────────────────
      // "Restore from Master" and "Compare to Master" are only relevant when
      // a personal overlay exists; "Copy to personal" is only relevant when
      // there is no overlay yet. The audit rule: never grey out, fully omit.
      {
        label: "Restore from Master",
        hidden: !lesson.modified,
        onSelect: () => fire("restore-master"),
      },
      {
        label: "Compare to Master",
        hidden: !lesson.modified,
        onSelect: () => fire("compare-master"),
      },
      {
        label: "Copy to my personal",
        hidden: lesson.modified,
        onSelect: () => fire("copy-to-personal"),
      },

      { kind: "divider" },

      // ── Group 4: print + archive ─────────────────────────────────────────
      {
        label: "Print this lesson",
        kbd: "⌘P",
        onSelect: () => fire("print"),
      },
      {
        label: "Archive",
        onSelect: () => fire("archive"),
      },

      // Master-only destructive item — only in Core Curriculum mode.
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

  // Filter out fully-hidden rows (conditional forking items) and collapse
  // consecutive/leading/trailing dividers that become adjacent after filtering.
  const visibleRows = rows.filter((r) => !r.hidden);
  const cleanedRows: MenuRow[] = [];
  for (const row of visibleRows) {
    if (row.kind === "divider") {
      // Skip leading divider or consecutive dividers.
      const last = cleanedRows[cleanedRows.length - 1];
      if (!last || last.kind === "divider") continue;
    }
    cleanedRows.push(row);
  }
  // Drop trailing divider.
  while (
    cleanedRows.length > 0 &&
    cleanedRows[cleanedRows.length - 1].kind === "divider"
  ) {
    cleanedRows.pop();
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
        minWidth: 210,
        background: "var(--paper)",
        borderRadius: 6,
        border: "1px solid var(--ink-150)",
        boxShadow: "var(--shadow-popover)",
        padding: 4,
        fontSize: 13,
      }}
    >
      {/* Back button shown only when a submenu is open */}
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

      {cleanedRows.map((row, i) => {
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
