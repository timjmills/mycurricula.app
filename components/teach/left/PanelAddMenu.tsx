"use client";

// PanelAddMenu — the panel-bar "+" trigger + popover menu shared by BOTH the
// left and right Teach panels. It surfaces:
//   • Tools — the dockable tool-widgets (timer, dice, poll, …). Selecting one
//     calls `onAddTool(type)` (the caller docks it via useDockedTools().add and
//     activates the Tools module on its side).
//   • Browse widget library — only when `onOpenWidgetLibrary` is supplied
//     (wired by the lead to the existing Widget Library overlay).
//
// Behaviour (CLAUDE.md §4):
//   • Hover-reveal on desktop (handled by the panel CSS via `.addTrigger`
//     opacity + :hover / :focus-within); ALWAYS visible on touch.
//   • a11y: trigger has aria-haspopup="menu" + aria-expanded; the popover is a
//     role="menu" with role="menuitem" rows. Esc + outside click/focus closes;
//     focus moves into the menu on open and restores to the trigger on close.
//   • Tokens only; ≥44px touch targets; width clamped so the popover never
//     forces document horizontal scroll.

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { WidgetType } from "@/lib/types";
import { TeachIcon, widgetMeta } from "@/components/teach/widgets";
import styles from "./PanelAddMenu.module.css";

/** The tool-widget types offered from the panel "+" (the dockable live tools).
 *  Order mirrors the request; labels + icons come from `widgetMeta(type)`. */
const TOOL_TYPES: readonly WidgetType[] = [
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

export interface PanelAddMenuProps {
  /** Which side this menu lives on — aligns the popover to the panel edge and
   *  scopes the generated ids so left/right menus never collide. */
  side: "left" | "right";
  /** Dock a tool-widget into this panel's Tools stack + activate it. */
  onAddTool: (type: WidgetType) => void;
  /** Open the Widget Library overlay. When absent, the entry is hidden. */
  onOpenWidgetLibrary?: () => void;
  /** Extra class for the trigger (the panels pass their hover-reveal class). */
  triggerClassName?: string;
}

function PlusIcon({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function PanelAddMenu({
  side,
  onAddTool,
  onOpenWidgetLibrary,
  triggerClassName,
}: PanelAddMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuId = `panel-add-menu-${side}-${reactId}`;

  const close = useCallback((restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Focus the first menu item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const first =
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  // Esc + outside click/focus close the menu (restores focus only for Esc).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    }
    function onPointerDown(e: PointerEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    }
    function onFocusIn(e: FocusEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, close]);

  // Arrow-key roving across the menu items (WAI-ARIA menu pattern).
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (Math.max(0, currentIndex) + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleToolClick(type: WidgetType): void {
    onAddTool(type);
    close(true);
  }

  function handleLibraryClick(): void {
    onOpenWidgetLibrary?.();
    close(true);
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Add a tool or widget to this panel"
        title="Add a tool or widget to this panel"
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <PlusIcon size={16} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Add a tool or widget"
          className={`${styles.menu} ${side === "right" ? styles.menuRight : styles.menuLeft}`}
          onKeyDown={handleMenuKeyDown}
        >
          <p className={styles.groupLabel} aria-hidden="true">
            Tools
          </p>
          {TOOL_TYPES.map((type) => {
            const meta = widgetMeta(type);
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                onClick={() => handleToolClick(type)}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  <TeachIcon name={meta.icon} size={16} />
                </span>
                <span className={styles.itemLabel}>{meta.label}</span>
              </button>
            );
          })}

          {onOpenWidgetLibrary ? (
            <>
              <p className={styles.groupLabel} aria-hidden="true">
                Widgets
              </p>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                onClick={handleLibraryClick}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  <TeachIcon name="grid" size={16} />
                </span>
                <span className={styles.itemLabel}>Browse widget library</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
