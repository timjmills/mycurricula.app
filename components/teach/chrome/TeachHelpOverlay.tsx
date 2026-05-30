"use client";

// TeachHelpOverlay — the Teach surface's help + keyboard-shortcuts overlay
// (audit B2). The planner shell's GlobalShortcuts (and its SHORTCUTS_TOGGLE_EVENT)
// is NOT mounted in the (teach) route group, so the top-bar Help button opens
// this self-contained overlay instead of dispatching a window event that has no
// listener here. It lists the Teach shortcut map from lib/use-teach-shortcuts.ts
// plus a one-line orientation to the workspace. Esc / backdrop / × closes.
//
// Tokens-only; client-only. Modifier glyph adapts to the platform at mount.

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./TeachHelpOverlay.module.css";

export interface TeachHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

export function TeachHelpOverlay({
  open,
  onClose,
}: TeachHelpOverlayProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Platform-aware modifier glyph (⌘ on macOS, Ctrl elsewhere). SSR-safe: the
  // server + first paint render "Ctrl"; the real value arrives post-mount.
  const [mod, setMod] = useState("Ctrl");

  useEffect(() => {
    if (typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform)) {
      setMod("⌘");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the dialog so Esc/Tab land here.
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const rows: ShortcutRow[] = [
    { keys: [mod, "1–9"], label: "Jump to the Nth board" },
    { keys: [mod, "L"], label: "Focus the Lessons panel" },
    { keys: [mod, "⇧", "L"], label: "Focus the Boards panel" },
    { keys: [mod, "R"], label: "Focus the Resources panel" },
    { keys: [mod, "J"], label: "Focus the Chat panel" },
    { keys: [mod, "K"], label: "Focus the To-do panel" },
    { keys: [mod, "/"], label: "Switch the board layout" },
    { keys: [mod, "P"], label: "Present this board full-screen" },
    { keys: ["Esc"], label: "Exit Focus → Full Screen → Present" },
  ];

  return (
    <div
      className={styles.scrim}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Teach help and keyboard shortcuts"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>Teach — help & shortcuts</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close help"
          >
            ✕
          </button>
        </header>

        <p className={styles.intro}>
          Build a board of widgets, drop a resource onto the canvas to annotate
          it live, then press Present to project it. Your boards, the lesson
          resources, and the day&rsquo;s chat all live in the side panels.
        </p>

        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.label} className={styles.row}>
              <span className={styles.keys}>
                {row.keys.map((k, i) => (
                  <kbd key={i} className={styles.kbd}>
                    {k}
                  </kbd>
                ))}
              </span>
              <span className={styles.rowLabel}>{row.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
