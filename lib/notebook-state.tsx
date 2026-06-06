"use client";

// notebook-state.tsx — workspace + notebook selection state for W-E.
//
// A "notebook" maps to a `grade_levels` row (see docs/6.6.26 Workspace-Notebook-
// Team Model.md §6). The workspace maps to the `schools` row — it is otherwise
// invisible except for a quiet label here.
//
// Phase 1B seam: today (Phase 1A) the list is MOCK data so the switcher renders
// against a realistic multi-notebook scenario without a Supabase backend. When
// Phase 1B lands, replace MOCK_NOTEBOOKS with a server-driven data prop (e.g. a
// React Server Component that calls `lib/admin/queries.ts listWorkspaceNotebooks()`
// and passes the result into NotebookProvider as a prop). The context's shape and
// the localStorage persistence key are stable across that migration.
//
// Active notebook selection:
//   Persisted to `mycurricula:user:active-notebook-id` under the USER-scoped
//   namespace (active notebook is a per-teacher choice, not team-shared — two
//   teachers on the same workspace may be looking at different notebooks).
//   Falls back to the first active notebook when the stored id is not found.
//
// Workspace admin detection:
//   In Phase 1A the founding teacher (first in the TEACHERS mock list) is treated
//   as workspace admin. Phase 1B: derive from the `school_admins` table via the
//   AppState currentUser.id (not built here yet — documented seam).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ME } from "@/lib/mock";

// ── Mock notebook definitions ────────────────────────────────────────────────
// Beta school has a single active notebook ("Grade 5 — My Class").
// A second inactive notebook is included to test the archived-notebook filter.
// When Phase 1B wires the real `grade_levels` table these fixtures are removed.

export interface NotebookEntry {
  gradeLevelId: string;
  name: string;
  isActive: boolean;
}

const MOCK_NOTEBOOKS: readonly NotebookEntry[] = [
  { gradeLevelId: "g5", name: "Grade 5", isActive: true },
  // Uncomment to test multi-notebook switcher UI (Phase 1B will make this real):
  // { gradeLevelId: "g6", name: "Grade 6", isActive: true },
  // { gradeLevelId: "g4-archived", name: "Grade 4", isActive: false },
] as const;

// ── Mock workspace metadata ─────────────────────────────────────────────────
const MOCK_WORKSPACE_NAME = "Al-Noor School";

// ── localStorage persistence ─────────────────────────────────────────────────
// USER-scoped: active notebook is a per-teacher view choice.
const ACTIVE_NB_KEY = "mycurricula:user:active-notebook-id";

function readStoredId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_NB_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_NB_KEY, id);
  } catch {
    // Quota / private-mode — in-memory state is still correct for this tab.
  }
}

// ── Context shape ────────────────────────────────────────────────────────────

export interface NotebookStateValue {
  /** The workspace name (quiet label; not a management surface). */
  workspaceName: string;
  /** All notebooks (active and archived) in this workspace. */
  allNotebooks: readonly NotebookEntry[];
  /** Active notebooks only — the switcher list. */
  activeNotebooks: readonly NotebookEntry[];
  /** The currently-selected notebook id. Always one of `activeNotebooks`. */
  activeNotebookId: string;
  /** Switch to a different notebook. No-op when the id is not an active notebook. */
  setActiveNotebookId: (id: string) => void;
  /**
   * True when the signed-in teacher is a workspace admin.
   * Phase 1A: derived from the mock lead-teacher identity (ME.id === "lh").
   * Phase 1B seam: replace with `currentUser.id → school_admins` lookup.
   */
  isWorkspaceAdmin: boolean;
}

const NotebookStateContext = createContext<NotebookStateValue | null>(null);

/** Read the workspace + notebook selection state. Throws outside a <NotebookProvider>. */
export function useNotebookState(): NotebookStateValue {
  const ctx = useContext(NotebookStateContext);
  if (!ctx) {
    throw new Error("useNotebookState must be used within a <NotebookProvider>");
  }
  return ctx;
}

interface NotebookProviderProps {
  /**
   * Notebook list injection point. Defaults to MOCK_NOTEBOOKS.
   * Phase 1B: pass the result of `listWorkspaceNotebooks()` from a Server Component.
   */
  notebooks?: readonly NotebookEntry[];
  /** Workspace name injection point. Defaults to MOCK_WORKSPACE_NAME. */
  workspaceName?: string;
  children: ReactNode;
}

/** Provides workspace + notebook selection state to the planner shell. */
export function NotebookProvider({
  notebooks = MOCK_NOTEBOOKS,
  workspaceName = MOCK_WORKSPACE_NAME,
  children,
}: NotebookProviderProps): ReactNode {
  const activeNotebooks = useMemo(
    () => notebooks.filter((nb) => nb.isActive),
    [notebooks],
  );

  // Resolve the initial active id. SSR-safe: starts with the first active
  // notebook (same on server and first client frame). The stored id is
  // overlaid in a post-mount effect to avoid hydration mismatch.
  const [activeNotebookId, setActiveNotebookIdState] = useState<string>(
    activeNotebooks[0]?.gradeLevelId ?? "",
  );

  // Post-mount: restore the stored id if it's still an active notebook.
  useEffect(() => {
    const stored = readStoredId();
    if (
      stored &&
      activeNotebooks.some((nb) => nb.gradeLevelId === stored)
    ) {
      setActiveNotebookIdState(stored);
    }
  }, [activeNotebooks]);

  const setActiveNotebookId = useCallback(
    (id: string): void => {
      if (!activeNotebooks.some((nb) => nb.gradeLevelId === id)) return;
      setActiveNotebookIdState(id);
      writeStoredId(id);
    },
    [activeNotebooks],
  );

  // Phase 1A: the mock founding teacher (ME, id="lh") is the workspace admin.
  // Phase 1B seam: derive from currentUser.id vs. school_admins table.
  const isWorkspaceAdmin = ME.role === "lead";

  const value = useMemo<NotebookStateValue>(
    () => ({
      workspaceName,
      allNotebooks: notebooks,
      activeNotebooks,
      activeNotebookId,
      setActiveNotebookId,
      isWorkspaceAdmin,
    }),
    [
      workspaceName,
      notebooks,
      activeNotebooks,
      activeNotebookId,
      setActiveNotebookId,
      isWorkspaceAdmin,
    ],
  );

  return (
    <NotebookStateContext.Provider value={value}>
      {children}
    </NotebookStateContext.Provider>
  );
}
