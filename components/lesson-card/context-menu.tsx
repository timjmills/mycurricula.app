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
//   3. Forking     — Restore from Team Curriculum*, Compare to Team Curriculum*, Copy to personal*
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
import { Button } from "@/components/ui";
import { buildWeeklyLink } from "@/lib/deep-links";
import { canCompareWithTeam, requestCompare } from "@/lib/fork-diff";
import { useCopyLink } from "@/lib/use-copy-link";
import { useAppState } from "@/lib/app-state";
import { useCatalogOptional } from "@/lib/planner-store";
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
  /** Master mode (internal value: "master" = Team Curriculum) unlocks the destructive "Delete from Team Curriculum" item. */
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
  /** Onboarding-voice explanation for this menu item. */
  tip?: string;
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
  // Copy-link wiring (UX roadmap item 07). Both hooks are provider-OPTIONAL
  // because this menu also renders in the Settings → Appearance preview,
  // which mounts lesson cards with no planner-shell providers.
  const copyLink = useCopyLink();
  const { activeGradeId } = useCatalogOptional();
  // M1: the LIVE Personal | Team-Curriculum mode. The `isMaster` prop is the
  // host-threaded signal (today only the destructive delete item consumes
  // it, and no current host threads it), so the compare gate reads the mode
  // from app-state directly — the cleanest existing seam. Safe here: every
  // host of this menu (weekly cards, lesson cards, the Settings → Appearance
  // preview) mounts under a layout that provides <AppStateProvider>; only
  // the PLANNER providers are optional in the preview (see the hooks above).
  const { editMode } = useAppState();

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
        tip: "Switch to Daily view with this lesson opened in the detail pane",
        onSelect: () => {
          // L6 (same class as the compare push below): encode the id.
          router.push(`/daily?lesson=${encodeURIComponent(lesson.id)}`);
          onClose();
        },
      },
      {
        label: "Copy link",
        tip: "Copy a shareable link to this lesson — teammates who open it see their own version of the plan",
        onSelect: () => {
          // Self-contained like "Open in Daily" above — no onAction round
          // trip, so every host of this menu gets Copy-link for free.
          // buildWeeklyLink emits the root-relative deep link; useCopyLink
          // prepends location.origin and confirms via the undo toast.
          void copyLink(
            buildWeeklyLink({
              week: lesson.week,
              subject: lesson.subject,
              lesson: lesson.id,
              grade: activeGradeId ?? undefined,
            }),
          );
          onClose();
        },
      },
      {
        label: "Relocate…",
        tip: "Pick a new day or week for this lesson — pops a picker so you can drop it precisely",
        onSelect: () => fire("relocate"),
      },
      {
        label: "Bump",
        tip: "Push this lesson forward one slot — useful when today's class ran short and you need to slide everything by a day",
        onSelect: () => fire("bump"),
      },
      {
        label: "Duplicate",
        kbd: "⌘D",
        tip: "Create a copy of this lesson on the next available slot — handy when you want to teach the same thing twice",
        onSelect: () => fire("duplicate"),
      },
      {
        label: "Save as template",
        tip: "Save this lesson's structure as a reusable template so you can stamp out similar lessons later",
        onSelect: () => fire("save-template"),
      },

      { kind: "divider" },

      // ── Group 2: status, resources, standards ────────────────────────────
      {
        label: "Mark status…",
        chevron: true,
        tip: "Choose a specific status — done, partial, skipped, carried, or not started",
        onSelect: () => setSub("status"),
      },
      {
        label: "Skip (quick)",
        tip: "Mark this lesson skipped in one click — it'll show on the catch-up list until you decide what to do with it",
        onSelect: () => fire("skip-quick"),
      },
      {
        label: "Add resource…",
        tip: "Attach a link, file, or note to this lesson so the whole team has the material when they teach it",
        onSelect: () => fire("add-resource"),
      },
      {
        label: "Add to to-do list",
        tip: "Pin this lesson to today's to-do list as a reminder to prep it",
        onSelect: () => fire("add-to-todo"),
      },
      {
        label: "See standards",
        tip: "Open the standards drawer to see which CCSS / curriculum standards this lesson hits",
        onSelect: () => fire("see-standards"),
      },

      { kind: "divider" },

      // ── Group 3: forking — conditional on lesson.modified ────────────────
      // "Restore from Team Curriculum" and "Compare to Team Curriculum" are only relevant when
      // a personal overlay exists; "Copy to personal" is only relevant when
      // there is no overlay yet. The audit rule: never grey out, fully omit.
      {
        label: "Restore from Team Curriculum",
        hidden: !lesson.modified,
        tip: "Discard your personal edits and revert to the Team Curriculum version of this lesson",
        onSelect: () => fire("restore-master"),
      },
      {
        // UX roadmap item 01 — opens the REAL fork diff (ForkDiffPanel),
        // rendered inline in the Daily lesson detail. Self-contained like
        // "Open in Daily" above (no onAction round trip), so every host of
        // this menu gets the diff for free and the old stub wiring
        // ("compare-master" → placeholder modal) is fully replaced. Only
        // offered when a master snapshot exists AND the lesson actually
        // diverged (canCompareWithTeam) — never on unedited lessons — AND
        // only in PERSONAL mode (M1): the diff's per-field reverts write
        // with the active save target, and its contract is personal-scoped
        // ("what did *I* change"), so in Team-Curriculum mode the item
        // simply doesn't offer itself. Gated on BOTH the host-threaded
        // `isMaster` prop and the live app-state mode (belt and braces —
        // see the editMode note above).
        // ≤2 clicks from the Weekly grid: ⋯ menu → this item → diff.
        label: "Compare with Team Curriculum",
        hidden:
          isMaster || editMode === "master" || !canCompareWithTeam(lesson),
        tip: "See exactly what you changed — every field where your version differs from the Team Curriculum, with per-field revert",
        onSelect: () => {
          // L6: lesson ids are query-string data — always encoded.
          router.push(
            `/daily?lesson=${encodeURIComponent(lesson.id)}&compare=1`,
          );
          // M6: the push may not change LessonDetail's `lesson.id` (the
          // lesson can already be selected in Daily), and the App Router
          // commits the URL only after the RSC round-trip — so a mounted
          // LessonDetail is ALSO nudged directly via the same-document
          // compare-request event (see lib/fork-diff.ts).
          requestCompare(lesson.id);
          onClose();
        },
      },
      {
        label: "Copy to my personal",
        hidden: lesson.modified,
        tip: "Fork the Team Curriculum lesson into your personal copy so you can edit it without affecting anyone else",
        onSelect: () => fire("copy-to-personal"),
      },

      { kind: "divider" },

      // ── Group 4: print + archive ─────────────────────────────────────────
      {
        label: "Print this lesson",
        kbd: "⌘P",
        tip: "Open a paper-friendly single-lesson print view (good for handouts and substitute folders)",
        onSelect: () => fire("print"),
      },
      {
        label: "Archive",
        tip: "Move this lesson out of the active planner — it stays in your archive so you can revive it next year",
        onSelect: () => fire("archive"),
      },

      // Master-only destructive item — only in Team Curriculum mode (internal value: "master").
      ...(isMaster
        ? ([
            { kind: "divider" },
            {
              label: "Delete from Team Curriculum",
              danger: true,
              tip: "Permanently remove this lesson from the Team Curriculum — affects every teacher's plan",
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSub(null)}
          tooltip="Return to the main lesson menu"
          leadingIcon={
            <span
              style={{ transform: "rotate(180deg)", display: "inline-flex" }}
            >
              <Icon name="chevron" size={9} />
            </span>
          }
          style={{
            width: "100%",
            justifyContent: "flex-start",
            color: "var(--ink-500)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Back
        </Button>
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
        // Menu items: Button ghost sm with role="menuitem" threaded through
        // {...rest} — Button spreads all extra props onto the native <button>
        // so role, aria-* attributes and keyboard semantics are fully preserved.
        return (
          <Button
            key={`i-${i}`}
            variant="ghost"
            size="sm"
            role="menuitem"
            onClick={row.onSelect}
            className="cp-card-menuitem"
            tooltip={row.tip}
            tooltipSide="right"
            trailingIcon={
              row.chevron ? (
                <Icon name="chevron" size={10} />
              ) : row.kbd ? (
                <span style={{ color: "var(--ink-400)", fontSize: 11 }}>
                  {row.kbd}
                </span>
              ) : undefined
            }
            style={{
              width: "100%",
              justifyContent: "flex-start",
              color: row.danger ? "var(--urgent)" : "var(--ink-900)",
            }}
          >
            {row.label}
          </Button>
        );
      })}
    </div>
  );
}
