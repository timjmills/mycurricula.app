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

import { useEffect, useState } from "react";
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
