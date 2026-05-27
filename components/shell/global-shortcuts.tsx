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

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
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

export function GlobalShortcuts(): ReactNode {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useKeyboardShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onOpenShortcuts: () => setShortcutsOpen((v) => !v),
  });

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
