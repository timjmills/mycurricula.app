// components/teach/tools/ToolsDock.tsx — a "Dockable Tools" side panel: the
// teaching tool-widgets STACKED vertically in a bounded, internally-scrolling
// column (the handoff's panel-dock/stack behavior). Bounded scope: tools dock
// as a vertical stack only — no floating / detached windows.
//
// Pure presentational. The parent owns the docked-stack state; this component
// renders it and emits add/remove/clear intents. Each tile reuses the canonical
// widget vocabulary: a `.tw`-classed wrapper carrying the type's default theme
// vars, wrapping the same display-only `<WidgetBody>` the board canvas renders.
//
// Tokens-only: every colour/radius/shadow/font comes through `var(--token)` or
// the `--w-*` themeable vars; no raw hex, no px font sizes. Sizes inside a tile
// are em-based so they read in a narrow (~280–320px) column.

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { SubjectId, Widget, WidgetType } from "@/lib/types";
import { WidgetBody, widgetMeta, TeachIcon } from "@/components/teach/widgets";
import { effective, themeVars } from "@/lib/teach/widget-theme";
import { widgetDefaultTheme } from "@/lib/teach/widget-defaults";
import styles from "./ToolsDock.module.css";

/** One tool docked in the stack (top→bottom by array order). */
export interface DockedTool {
  id: string;
  type: WidgetType;
}

export interface ToolsDockProps {
  /** The docked stack, top→bottom. */
  tools: readonly DockedTool[];
  /** Add a tool of `type` to the stack. */
  onAdd: (type: WidgetType) => void;
  /** Remove the docked tool with `id`. */
  onRemove: (id: string) => void;
  /** Optional clear-all affordance (hidden when absent). */
  onClear?: () => void;
  /** Lesson subject for tinted accents on the tool bodies. */
  subjectId?: SubjectId;
}

/** The utility / management interactive tool-widgets offered in the dock picker,
 *  in display order. These are the addable "teacher tools" from the catalog —
 *  not the pedagogical lesson widgets. */
const DOCKABLE_TOOL_TYPES: readonly WidgetType[] = [
  "timer",
  "stopwatch",
  "clock",
  "countdown",
  "dice",
  "scoreboard",
  "poll",
  "namepick",
  "sound",
  "traffic",
  "work-sound",
  "class-points",
];

/**
 * Build a minimal display-only `Widget` for a docked tool. The dock never
 * persists or positions these (no `canvas`, legacy grid anchor zeroed); the
 * body renders purely from `type` + empty config/state. No name-bearing data is
 * ever placed here — student-bearing tools render initials-only in the body
 * itself (plan §11.4).
 */
function toolWidget(tool: DockedTool): Widget {
  const meta = widgetMeta(tool.type);
  return {
    id: tool.id,
    boardId: "tools-dock",
    type: tool.type,
    title: meta.label,
    position: { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
    displayOrder: 0,
    pinned: false,
    config: {},
    state: {},
    persistence: "inherit",
    gradeLevelId: "",
  };
}

export function ToolsDock({
  tools,
  onAdd,
  onRemove,
  onClear,
  subjectId,
}: ToolsDockProps): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const handleAdd = useCallback(
    (type: WidgetType) => {
      onAdd(type);
      setPickerOpen(false);
    },
    [onAdd],
  );

  return (
    <section
      className={styles.dock}
      aria-label="Dockable tools"
      title="Dock teaching tools here as a vertical stack — add a timer, dice, poll, and more. They scroll within this panel."
    >
      <header className={styles.head}>
        <span className={styles.headTitle}>Tools</span>
        <div className={styles.headActions}>
          {onClear && tools.length > 0 ? (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={onClear}
              aria-label="Remove all docked tools"
              title="Remove every tool from the dock"
            >
              Clear
            </button>
          ) : null}
          <AddToolButton
            open={pickerOpen}
            onOpen={openPicker}
            onClose={closePicker}
            onAdd={handleAdd}
          />
        </div>
      </header>

      {tools.length === 0 ? (
        <EmptyState onAdd={openPicker} />
      ) : (
        <ul className={styles.stack}>
          {tools.map((tool) => (
            <li key={tool.id} className={styles.tile}>
              <ToolTile tool={tool} onRemove={onRemove} subjectId={subjectId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── A single docked tool tile ────────────────────────────────────────────────

interface ToolTileProps {
  tool: DockedTool;
  onRemove: (id: string) => void;
  subjectId?: SubjectId;
}

function ToolTile({ tool, onRemove, subjectId }: ToolTileProps): ReactNode {
  const meta = widgetMeta(tool.type);
  const widget = useMemo(() => toolWidget(tool), [tool]);
  const twStyle = useMemo(
    () => themeVars(effective(widgetDefaultTheme(tool.type), null, null)),
    [tool.type],
  ) as CSSProperties;

  return (
    <div className={styles.tileInner}>
      <div className={styles.tileHead}>
        <span className={styles.tileLabel}>
          <TeachIcon name={meta.icon} size={16} />
          <span className={styles.tileLabelText}>{meta.label}</span>
        </span>
        <button
          type="button"
          className={styles.removeBtn}
          onClick={() => onRemove(tool.id)}
          aria-label={`Remove ${meta.label} from the dock`}
          title={`Remove ${meta.label}`}
        >
          <TeachIcon name="x" size={18} />
        </button>
      </div>
      <div className={styles.tw} style={twStyle}>
        <WidgetBody widget={widget} subjectId={subjectId} />
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }): ReactNode {
  return (
    <div className={styles.empty}>
      <TeachIcon name="grid" size={28} />
      <p className={styles.emptyText}>
        No tools docked yet — add a timer, dice, poll…
      </p>
      <button
        type="button"
        className={styles.emptyAdd}
        onClick={onAdd}
        title="Open the tool picker"
      >
        <TeachIcon name="plus" size={16} />
        Add tool
      </button>
    </div>
  );
}

// ── Add-tool button + picker popover ─────────────────────────────────────────

interface AddToolButtonProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (type: WidgetType) => void;
}

function AddToolButton({
  open,
  onOpen,
  onClose,
  onAdd,
}: AddToolButtonProps): ReactNode {
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Esc closes; click/focus outside closes.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  // Move focus into the menu on open (focus-trap nice-to-have).
  useEffect(() => {
    if (open) firstOptionRef.current?.focus();
  }, [open]);

  return (
    <div className={styles.addWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.addBtn}
        onClick={open ? onClose : onOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Add a teaching tool to the dock"
      >
        <TeachIcon name="plus" size={16} />
        <span className={styles.addBtnText}>Add tool</span>
      </button>

      {open ? (
        <div className={styles.menu} id={menuId} role="menu">
          <p className={styles.menuLabel}>Add a tool</p>
          <ul className={styles.menuList}>
            {DOCKABLE_TOOL_TYPES.map((type, i) => {
              const meta = widgetMeta(type);
              return (
                <li key={type}>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    ref={i === 0 ? firstOptionRef : undefined}
                    onClick={() => onAdd(type)}
                    title={`Dock a ${meta.label}`}
                  >
                    <span className={styles.menuItemIcon}>
                      <TeachIcon name={meta.icon} size={18} />
                    </span>
                    <span className={styles.menuItemLabel}>{meta.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
