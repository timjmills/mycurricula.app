"use client";

// workspace-prefs.ts — the teacher's persisted Unit/Lesson Workspace preferences
// (B1.4). Today that is one value: how the workspace presents — a centered
// "modal" dialog, or the full-bleed "full" workspace revealed by the ⤢ expand
// toggle. Persisted so a teacher who prefers the full workspace gets it by
// default the next time they open a unit.
//
// USER scope: keyed under the repo's `mycurricula:user:*` convention (a personal
// device preference), mirroring lib/home/use-home-layout.ts and lib/theme.tsx.
//
// SSR-safety: the workspace only ever mounts client-side (it opens on a click,
// never during the server render), so the hook reads the stored value
// synchronously in a lazy initializer — no first-paint flash from modal→full —
// while still returning the default on the server. A storage listener keeps two
// open tabs in sync.

import { useCallback, useEffect, useState } from "react";
import type { ExplorerPresentation } from "@/components/year-v2/ExplorerShell";

/** The persisted workspace presentation — the ⤢ toggle's two states. */
export type WorkspacePresentation = ExplorerPresentation;

const PRESENTATION_KEY = "mycurricula:user:workspace-presentation";
const DEFAULT_PRESENTATION: WorkspacePresentation = "modal";

/** Read the stored presentation preference. SSR-safe (default on the server);
 *  any unrecognized / corrupt value falls back to the default. */
export function readWorkspacePresentation(): WorkspacePresentation {
  if (typeof window === "undefined") return DEFAULT_PRESENTATION;
  try {
    const v = window.localStorage.getItem(PRESENTATION_KEY);
    return v === "modal" || v === "full" ? v : DEFAULT_PRESENTATION;
  } catch {
    return DEFAULT_PRESENTATION;
  }
}

/** Persist the presentation preference. A blocked localStorage (private mode,
 *  quota) is swallowed — the in-memory state still drives this session. */
export function writeWorkspacePresentation(p: WorkspacePresentation): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESENTATION_KEY, p);
  } catch {
    /* non-persistent this session; ignore */
  }
}

export interface WorkspacePresentationPref {
  presentation: WorkspacePresentation;
  setPresentation: (p: WorkspacePresentation) => void;
  /** Convenience for the ⤢ button — flip modal ⇄ full and persist. */
  toggle: () => void;
}

/**
 * The workspace's presentation preference as reactive state. Reads synchronously
 * on mount (no flash), writes through to localStorage on every change, and
 * mirrors changes made in another tab.
 */
export function useWorkspacePresentation(): WorkspacePresentationPref {
  const [presentation, setState] = useState<WorkspacePresentation>(
    readWorkspacePresentation,
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      // key === null fires on localStorage.clear() (e.g. a future sign-out) —
      // re-read so this tab doesn't keep a stale preference.
      if (e.key === PRESENTATION_KEY || e.key === null) {
        setState(readWorkspacePresentation());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPresentation = (p: WorkspacePresentation): void => {
    setState(p);
    writeWorkspacePresentation(p);
  };

  return {
    presentation,
    setPresentation,
    toggle: () => setPresentation(presentation === "full" ? "modal" : "full"),
  };
}

// ── Context drawer (B3) ────────────────────────────────────────────────────

/** The right context drawer's panes — commentary ABOUT the unit, kept out of
 *  the tab strip (which lists the unit's parts).
 *
 *  "assessments" WAS the first pane and the default. It is now the workspace's
 *  own **Assessments tab** (the v2 handoff specifies one — mockup :8651 —, and
 *  a teacher asked for it by name), and it MOVED rather than being copied: two
 *  mounted `<AssessmentsPanel>`s would each carry their own debounce timer,
 *  their own confirm-only row list, and their own write queue over the SAME
 *  `unit_assessments` rows, with nothing serialising between them. See
 *  components/year-v2/unit-tabs/AssessmentsTab.tsx. */
export type WorkspaceDrawerPane = "insights" | "prep";

const DRAWER_OPEN_KEY = "mycurricula:user:workspace-drawer-open";
const DRAWER_PANE_KEY = "mycurricula:user:workspace-drawer-pane";
const DRAWER_PANES: readonly WorkspaceDrawerPane[] = ["insights", "prep"];
/** Closed by default: the drawer is a deliberate second read, and opening it
 *  unasked would narrow the lesson list for teachers who never wanted it. */
const DEFAULT_DRAWER_OPEN = false;
/** Insights, because "assessments" — the previous default — no longer names a
 *  pane. Every device that used the drawer before the move has the retired
 *  value in localStorage; `isDrawerPane` no longer accepts it, so those reads
 *  fall back HERE. Without that the drawer would reopen on a pane key that
 *  matches no tab: an empty drawer with no tab selected. */
const DEFAULT_DRAWER_PANE: WorkspaceDrawerPane = "insights";

/** Persist one drawer key. A blocked localStorage (private mode, quota) is
 *  swallowed — the in-memory state still drives this session. */
function writeDrawerPref(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* non-persistent this session; ignore */
  }
}

function isDrawerPane(v: unknown): v is WorkspaceDrawerPane {
  return (
    typeof v === "string" && DRAWER_PANES.includes(v as WorkspaceDrawerPane)
  );
}

/** Read the stored drawer state. SSR-safe; corrupt values fall back. */
export function readWorkspaceDrawer(): {
  open: boolean;
  pane: WorkspaceDrawerPane;
} {
  if (typeof window === "undefined") {
    return { open: DEFAULT_DRAWER_OPEN, pane: DEFAULT_DRAWER_PANE };
  }
  try {
    const open = window.localStorage.getItem(DRAWER_OPEN_KEY);
    const pane = window.localStorage.getItem(DRAWER_PANE_KEY);
    return {
      open: open === "1" ? true : open === "0" ? false : DEFAULT_DRAWER_OPEN,
      pane: isDrawerPane(pane) ? pane : DEFAULT_DRAWER_PANE,
    };
  } catch {
    return { open: DEFAULT_DRAWER_OPEN, pane: DEFAULT_DRAWER_PANE };
  }
}

export interface WorkspaceDrawerPref {
  open: boolean;
  pane: WorkspaceDrawerPane;
  setOpen: (open: boolean) => void;
  setPane: (pane: WorkspaceDrawerPane) => void;
  /** Convenience for the drawer toggle — flip open/closed and persist. */
  toggle: () => void;
}

/**
 * The context drawer's open state + active pane, persisted per device like the
 * presentation preference above. Same no-flash lazy read and cross-tab mirror.
 */
export function useWorkspaceDrawer(): WorkspaceDrawerPref {
  const [state, setState] = useState(readWorkspaceDrawer);

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (
        e.key === DRAWER_OPEN_KEY ||
        e.key === DRAWER_PANE_KEY ||
        e.key === null
      ) {
        setState(readWorkspaceDrawer());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Stable identities: consumers wrap these in their own useCallback (the
  // drawer's focus-restoring close does), and a setter re-created every render
  // would silently defeat that memoization.
  const setOpen = useCallback((open: boolean): void => {
    setState((s) => ({ ...s, open }));
    writeDrawerPref(DRAWER_OPEN_KEY, open ? "1" : "0");
  }, []);

  const setPane = useCallback((pane: WorkspaceDrawerPane): void => {
    setState((s) => ({ ...s, pane }));
    writeDrawerPref(DRAWER_PANE_KEY, pane);
  }, []);

  // Deliberately NOT stable — it closes over `state.open`. Keeping the
  // localStorage write OUT of the setState updater matters more: an updater must
  // be pure, and React invokes it twice under StrictMode.
  const toggle = useCallback((): void => {
    setOpen(!state.open);
  }, [setOpen, state.open]);

  return { open: state.open, pane: state.pane, setOpen, setPane, toggle };
}
