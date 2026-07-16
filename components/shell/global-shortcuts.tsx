"use client";

// global-shortcuts.tsx — thin client wrapper that mounts the keyboard
// shortcut dispatcher, the ⌘K command palette, and the ? shortcuts overlay.
//
// The planner layout (app/(planner)/layout.tsx) is a Server Component; it
// cannot call hooks directly. This client component owns that state so the
// layout can import it as a leaf without becoming a client boundary itself.
//
// Exactly one instance of this component is mounted in the planner layout,
// directly inside the AppStateProvider + PlannerProvider tree.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { usePlanner } from "@/lib/planner-store";
import { CommandPalette } from "./command-palette";
import { ShortcutsOverlay } from "./shortcuts-overlay";

/**
 * Custom DOM event name dispatched on `window` to toggle the shortcuts
 * overlay. The visible "?" button in the top bar (W3-C8) dispatches this;
 * the keyboard `?` shortcut continues to drive the same toggle via
 * `useKeyboardShortcuts`. Listening on the window — rather than threading
 * a context through the layout — keeps `GlobalShortcuts` a leaf with no
 * provider dependency and avoids forcing the planner layout into a Client
 * Component just to share open-state.
 */
export const SHORTCUTS_TOGGLE_EVENT = "mycurricula:shortcuts:toggle";

/**
 * Same pattern for the ⌘K command palette: the W3.3 chrome's visible search
 * button dispatches this so touch/tablet teachers (no keyboard-shortcut
 * discovery path) keep a search entry point after the v1.3 TopBar search box
 * retired (§4a W3.3 finding #8).
 */
export const PALETTE_TOGGLE_EVENT = "mycurricula:palette:toggle";

export function GlobalShortcuts(): ReactNode {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useKeyboardShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onOpenShortcuts: () => setShortcutsOpen((v) => !v),
  });

  // ── Undo/redo keyboard shortcuts — moved here from the retired v1.3
  // TopBar (W3.3; §4a finding #2). This component is the layout's keyboard
  // owner and sits inside PlannerProvider, so the 50-step history stays
  // reachable app-wide. Cmd/Ctrl+Z → undo; Cmd/Ctrl+Shift+Z or Ctrl+Y →
  // redo. Skipped when the event target is a text input, textarea, or
  // contentEditable element so the focused editor's own native undo is not
  // hijacked. Stable refs so the one-time listener never captures a stale
  // closure.
  const { undo, redo } = usePlanner();
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  useEffect(() => {
    function isEditingTarget(target: EventTarget | null): boolean {
      if (!target || !(target instanceof Element)) return false;
      const tag = (target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      // Walk up to catch nested contenteditable (e.g. RichTextEditor).
      return target.closest('[contenteditable="true"]') !== null;
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey && !e.metaKey) return;
      if (isEditingTarget(e.target)) return;

      const isZ = e.key === "z" || e.key === "Z";
      const isY = e.key === "y" || e.key === "Y";

      if (isZ && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((isZ && e.shiftKey) || (isY && !e.shiftKey && e.ctrlKey)) {
        e.preventDefault();
        redoRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // intentionally empty — latest callbacks via refs

  // Visible search affordance (ChromeTopBar) → the same palette state the
  // ⌘K path drives; both entry points converge so they cannot disagree.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (): void => setPaletteOpen((v) => !v);
    window.addEventListener(PALETTE_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(PALETTE_TOGGLE_EVENT, handler);
  }, []);

  // Wire the visible top-bar "?" button (W3-C8) to the same toggle as the
  // keyboard `?` shortcut. The button dispatches a CustomEvent on window;
  // we listen here and flip the same state the keyboard path uses. Both
  // entry points converge on one piece of state so they cannot disagree.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (): void => setShortcutsOpen((v) => !v);
    window.addEventListener(SHORTCUTS_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(SHORTCUTS_TOGGLE_EVENT, handler);
  }, []);

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </>
  );
}
