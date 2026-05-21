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

import { useState } from "react";
import type { ReactNode } from "react";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { CommandPalette } from "./command-palette";
import { ShortcutsOverlay } from "./shortcuts-overlay";

export function GlobalShortcuts(): ReactNode {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useKeyboardShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onOpenShortcuts: () => setShortcutsOpen((v) => !v),
  });

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
