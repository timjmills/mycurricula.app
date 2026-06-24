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
// Settings overrides (Workspace & Team settings — lib/use-workspace-settings.ts):
//   The provider LAYERS three localStorage-backed overrides over the injected
//   base data, read-only from this side (mutations live in the settings hooks):
//     • `mycurricula:team:workspace-name` — overrides the workspace label.
//     • `mycurricula:team:notebooks`      — notebook OVERLAY list, merged over
//       the base list by `mergeNotebookOverlay()` (matching id replaces the
//       base entry — rename/archive/restore; new id appends — added notebook).
//     • `mycurricula:user:default-notebook-id` — selection fallback (below).
//   SSR-safe: the initial render uses the base list + provider default name;
//   the overrides arrive in a post-mount effect and stay live through
//   `subscribeToWorkspaceSettings()` (cross-tab `storage` + same-tab event).
//   The Phase 1B props-injection seam above is unchanged — when the base list
//   becomes server-driven the overlay simply layers over server data until
//   its writes migrate to real `grade_levels` rows.
//
// Active notebook selection:
//   Persisted to `mycurricula:user:active-notebook-id` under the USER-scoped
//   namespace (active notebook is a per-teacher choice, not team-shared — two
//   teachers on the same workspace may be looking at different notebooks).
//   When the stored id is unset or no longer active, falls back to the
//   teacher's default notebook (`mycurricula:user:default-notebook-id`),
//   then to the first active notebook.
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
import {
  mergeNotebookOverlay,
  readDefaultNotebookId,
  readNotebookOverlay,
  readWorkspaceNameOverride,
  subscribeToWorkspaceSettings,
  type WorkspaceNotebookOverride,
} from "@/lib/use-workspace-settings";

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
  /** The workspace name (settings override applied; managed on
   *  Settings → Workspace, quiet label everywhere else). */
  workspaceName: string;
  /** All notebooks (active and archived), settings overlay merged in. */
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
  // ── Settings overrides ─────────────────────────────────────────────────
  // Read-only layering of the Workspace & Team settings state (mutations
  // live in lib/use-workspace-settings.ts). SSR-safe: the initial render
  // carries no overrides (base list + provider-default name), so server
  // HTML matches the first client frame; the stored values arrive in the
  // post-mount sync below and stay live through the subscription
  // (cross-tab `storage` + same-tab settings event).
  const [overrides, setOverrides] = useState<{
    name: string | null;
    overlay: WorkspaceNotebookOverride[];
  }>({ name: null, overlay: [] });

  useEffect(() => {
    const sync = (): void =>
      setOverrides({
        name: readWorkspaceNameOverride(),
        overlay: readNotebookOverlay(),
      });
    sync(); // post-mount read
    return subscribeToWorkspaceSettings(sync); // stays live; returns cleanup
  }, []);

  // Merge the overlay over the injected base list (matching id replaces the
  // base entry; new ids append). WorkspaceNotebookOverride is structurally
  // identical to NotebookEntry, so the merged array satisfies the existing
  // NotebookEntry-typed context API unchanged.
  const mergedNotebooks = useMemo<NotebookEntry[]>(
    () => mergeNotebookOverlay(notebooks, overrides.overlay),
    [notebooks, overrides.overlay],
  );

  // Workspace name: the settings override wins; the prop stays the default.
  const effectiveWorkspaceName = overrides.name ?? workspaceName;

  const activeNotebooks = useMemo(
    () => mergedNotebooks.filter((nb) => nb.isActive),
    [mergedNotebooks],
  );

  // Resolve the initial active id. SSR-safe: starts with the first active
  // notebook (same on server and first client frame). The stored id is
  // overlaid in a post-mount effect to avoid hydration mismatch.
  const [activeNotebookId, setActiveNotebookIdState] = useState<string>(
    activeNotebooks[0]?.gradeLevelId ?? "",
  );

  // Re-resolve the selection post-mount and whenever the active list
  // changes (overlay arrival, archive/restore from Settings → Workspace).
  // Precedence:
  //   1. the stored active id        (the teacher's last explicit switch),
  //   2. the teacher's default notebook (Settings → "Default notebook"),
  //   3. the current selection, if still active (avoid churn),
  //   4. the first active notebook.
  useEffect(() => {
    setActiveNotebookIdState((current) => {
      const isActiveId = (id: string | null): id is string =>
        id != null && activeNotebooks.some((nb) => nb.gradeLevelId === id);
      const stored = readStoredId();
      if (isActiveId(stored)) return stored;
      const preferred = readDefaultNotebookId();
      if (isActiveId(preferred)) return preferred;
      if (isActiveId(current)) return current;
      return activeNotebooks[0]?.gradeLevelId ?? "";
    });
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
      workspaceName: effectiveWorkspaceName,
      allNotebooks: mergedNotebooks,
      activeNotebooks,
      activeNotebookId,
      setActiveNotebookId,
      isWorkspaceAdmin,
    }),
    [
      effectiveWorkspaceName,
      mergedNotebooks,
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
