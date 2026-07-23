"use client";

// notebook-state.tsx — workspace + notebook selection state for W-E.
//
// A "notebook" maps to a `grade_levels` row (see docs/6.6.26 Workspace-Notebook-
// Team Model.md §6). The workspace maps to the `schools` row — it is otherwise
// invisible except for a quiet label here.
//
// Multi-workspace seam (Wave 12b-2): the workspace IDENTITY (name, admin flag,
// notebook list) is flag-gated on `MULTI_WORKSPACE` (lib/multi-workspace-flag.ts,
// DEFAULT OFF — the backing migration 20260724120000_multi_workspace.sql is not
// yet applied to prod).
//   • OFF (today): the list + name + admin flag come from the MOCK constants
//     below, so the switcher renders against a realistic multi-notebook scenario
//     without a backend. This path is BYTE-IDENTICAL to before the seam landed
//     (the flag is a build-inlined `false`, so every ON branch dead-code-
//     eliminates and every derived value collapses to its original expression).
//   • ON: a post-mount fetch (in <WorkspaceIdentitySync>, mounted only when the
//     flag is on) sources the REAL active workspace via the lib/workspaces/* seam's
//     ATOMIC getActiveWorkspaceContext — identity + notebook list in ONE request,
//     notebooks scoped to the resolved workspace id (from lib/admin/queries
//     listWorkspaceNotebooks) so a concurrent switch can't tear a cross-tenant
//     read. Until it resolves (and on failure / no active workspace) the ON path
//     FAILS CLOSED to an empty/loading identity with isWorkspaceAdmin=false —
//     never the mock. The context's shape and the localStorage persistence key
//     are stable across the flip.
// The `notebooks` / `workspaceName` PROPS remain injection points (an RSC may
// still pass server data), and the settings overlay layers over WHICHEVER base
// the flag selects.
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
//   OFF (Phase 1A): the founding teacher (first in the TEACHERS mock list, role
//   "lead") is treated as workspace admin. ON (MULTI_WORKSPACE): derived from the
//   real active workspace's role (owner/admin) — list_my_workspaces resolves
//   is_school_admin server-side, so this reflects the actual `school_admins`
//   grant for the active tenant.

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
import { MULTI_WORKSPACE } from "@/lib/multi-workspace-flag";
import {
  workspacesClient,
  isWorkspaceAdminRole,
  WORKSPACE_CHANGED_EVENT,
} from "@/lib/workspaces";

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

// Stable empty notebook list for the multi-workspace ON path BEFORE its fetch
// resolves (and on failure / no active workspace). A module-level constant so its
// reference is stable across renders — keeps the mergedNotebooks memo from
// churning during the loading window. Only ever used on the ON path; the OFF path
// still uses the injected `notebooks` (default MOCK_NOTEBOOKS) unchanged.
const EMPTY_NOTEBOOKS: readonly NotebookEntry[] = [];

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
   * OFF (Phase 1A): derived from the mock lead-teacher identity (ME.role "lead").
   * ON (MULTI_WORKSPACE): the real active workspace's owner/admin role, resolved
   * server-side by list_my_workspaces (is_school_admin).
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

/** The real active-workspace identity the ON path layers over the mock. */
interface RemoteIdentity {
  name: string;
  isAdmin: boolean;
  notebooks: NotebookEntry[];
}

/**
 * ON-path ONLY. The <NotebookProvider> renders this exclusively when
 * MULTI_WORKSPACE is on, so when the flag is OFF this component — and therefore
 * its effect — NEVER mount: the provider keeps the exact hook/effect topology it
 * had before the seam landed (Codex R1: any added effect on the OFF path is a
 * regression). Renders nothing; its sole job is the post-mount fetch.
 *
 * It resolves the active workspace identity + notebooks ATOMICALLY via ONE server
 * request (workspacesClient.getActiveWorkspaceContext) — reading them as two
 * separate requests would let a concurrent switch produce a torn cross-tenant
 * read. It reports up ONLY when a non-null active workspace resolves; a null
 * active workspace (seam off at runtime / no membership) or a fetch error leaves
 * `remote` null, and the provider then FAILS CLOSED to an empty/loading identity
 * (isWorkspaceAdmin=false) rather than a mock-fallback identity that could wrongly
 * confer admin.
 *
 * RE-SOURCING AFTER A SWITCH/CREATE: the switcher (components/settings/
 * workspace-switcher.tsx) moves the SERVER-side active-workspace pointer, then
 * broadcasts WORKSPACE_CHANGED_EVENT. This component listens for it and re-runs
 * the fetch, so the persistent settings-LAYOUT provider (and the /settings
 * overview tile it feeds) re-source WITHOUT a full reload — router.refresh()
 * alone re-runs Server Components but NOT this client mount effect, so the
 * identity would otherwise linger on the prior workspace. A monotonic sequence
 * guard keeps the LATEST-DISPATCHED resolve authoritative, so a slow initial
 * fetch can't clobber a newer re-source (last-write-wins). Still ON path only —
 * this component mounts only when MULTI_WORKSPACE is on.
 */
function WorkspaceIdentitySync({
  onResolved,
}: {
  // Reports the resolved identity, or NULL to FAIL CLOSED (see below). Null is
  // load-bearing on the RE-SOURCE path: after a switch `remote` already holds the
  // PRIOR workspace, so a failed/empty re-source must actively CLEAR it (not just
  // "leave it") or the UI would keep flashing the prior workspace's admin
  // affordances against a server that has already moved on.
  onResolved: (identity: RemoteIdentity | null) => void;
}): null {
  useEffect(() => {
    // Monotonic sequence: each resolve claims a ticket up-front; only the ticket
    // that equals `latest` when it settles is allowed to report. This makes the
    // most-recently-DISPATCHED fetch win regardless of network completion order,
    // so a re-source (from the change event) can't be overwritten by an older
    // in-flight initial fetch.
    let latest = 0;
    let active = true;
    const resolve = async (): Promise<void> => {
      const seq = ++latest;
      try {
        const { workspace, notebooks } =
          await workspacesClient.getActiveWorkspaceContext();
        // Unmounted or superseded by a newer resolve → the newer one owns the
        // outcome; don't touch state.
        if (!active || seq !== latest) return;
        // Report authoritatively. A real workspace → its identity. NO active
        // workspace (seam off at runtime / no membership) → NULL: the provider
        // FAILS CLOSED (empty identity, isWorkspaceAdmin=false). On a re-source
        // this CLEARS a stale prior-workspace identity rather than retaining it.
        onResolved(
          workspace
            ? {
                name: workspace.name,
                isAdmin: isWorkspaceAdminRole(workspace.role),
                notebooks: notebooks.map((nb) => ({
                  gradeLevelId: nb.gradeLevelId,
                  name: nb.name,
                  isActive: nb.isActive,
                })),
              }
            : null,
        );
      } catch {
        // Seam/network error. Same fail-closed rule: CLEAR any stale identity
        // (guard against clobbering a newer resolve) so the provider shows
        // empty/loading — never the mock, never the prior workspace on a
        // re-source.
        if (!active || seq !== latest) return;
        onResolved(null);
      }
    };
    void resolve(); // initial mount fetch (remote already starts null — no
    // eager clear needed here, unlike the re-source path below)

    // Re-source when the switcher/create moves the active-workspace pointer.
    // The event carries no payload — it's a "re-read the active workspace now"
    // signal. window exists here (effects only run client-side).
    const onChanged = (): void => {
      // FAIL CLOSED IMMEDIATELY: drop the prior workspace's identity (name,
      // notebooks, AND admin affordances) the instant the pointer moves — BEFORE
      // the re-fetch tells us the new identity — then repopulate from resolve().
      // Otherwise a live consumer could briefly show the prior workspace's admin
      // UI against the NEW tenant during the fetch window (server RPCs are the
      // real gate, but fail-closed is the house rule). resolve()'s sequence
      // guard keeps the eventual repopulate authoritative over this eager clear.
      onResolved(null);
      void resolve();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
    return () => {
      active = false;
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
    };
    // onResolved is the stable useState setter; the listener re-runs the fetch.
  }, [onResolved]);
  return null;
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

  // ── Multi-workspace ON-path identity (flag-gated; OFF path is inert) ──────
  // DEFAULT OFF: the backing migration (20260724120000_multi_workspace.sql) is
  // NOT yet applied to prod. When OFF, this state is NEVER written — the fetch
  // lives in <WorkspaceIdentitySync>, which the return below renders ONLY when
  // MULTI_WORKSPACE is on. So the OFF build mounts NO extra effect (the flagged
  // Codex R1 finding), and this useState stays null forever; every derived value
  // then collapses to the exact Phase-1A mock expression it always used, leaving
  // the provider behaviorally identical to today. When ON, the child resolves the
  // REAL active workspace identity + notebook list ATOMICALLY (one request → no
  // torn cross-tenant read) and reports it here.
  const [remote, setRemote] = useState<RemoteIdentity | null>(null);

  // Base identity, split cleanly by the flag so the OFF branch is verbatim:
  //   • OFF (MULTI_WORKSPACE build-inlined false): the injected mock — exactly
  //     `notebooks` / `workspaceName`, byte-identical to before the seam landed.
  //   • ON, resolved: the REAL active workspace (remote.*).
  //   • ON, UNRESOLVED (pre-fetch, fetch failed, or no active workspace): a
  //     NEUTRAL empty/loading state — NEVER the mock. Falling back to the mock on
  //     an ON build would surface mock data to a real user and (via isWorkspace-
  //     Admin below) flash the mock lead's admin capability to a non-admin. The
  //     ON path therefore FAILS CLOSED (Codex R2 High); server-side RLS/RPCs are
  //     the real gate regardless.
  const baseNotebooks: readonly NotebookEntry[] = MULTI_WORKSPACE
    ? remote
      ? remote.notebooks
      : EMPTY_NOTEBOOKS
    : notebooks;
  const baseWorkspaceName = MULTI_WORKSPACE
    ? (remote?.name ?? "")
    : workspaceName;

  // Settings overrides (workspace name + notebook overlay) are LEGACY, GLOBAL,
  // localStorage-backed keys from the single-workspace (mock) era. They apply
  // ONLY on the OFF path. On the ON path the base identity is workspace-SPECIFIC
  // (per active workspace), so a global override saved while in workspace A must
  // NOT bleed into workspace B after switching (Codex R3 High — cross-workspace
  // UI projection). Per-workspace override scoping (or migrating these writes to
  // the server) belongs to the Settings unit; until then the ON path shows real
  // workspace data only. The OFF branch is byte-identical to today:
  // mergeNotebookOverlay(notebooks, overlay) and overrides.name ?? workspaceName.
  const mergedNotebooks = useMemo<readonly NotebookEntry[]>(
    () =>
      MULTI_WORKSPACE
        ? baseNotebooks
        : mergeNotebookOverlay(baseNotebooks, overrides.overlay),
    [baseNotebooks, overrides.overlay],
  );

  const effectiveWorkspaceName = MULTI_WORKSPACE
    ? baseWorkspaceName
    : (overrides.name ?? baseWorkspaceName);

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

  // OFF (Phase 1A): the mock founding teacher (ME, id="lh", role "lead") is the
  // workspace admin. ON (MULTI_WORKSPACE): the real active workspace's role —
  // owner or admin, from list_my_workspaces (is_school_admin server-side) — and
  // FAIL CLOSED to `false` until it resolves (never the mock lead's admin, so a
  // non-admin can't be flashed admin affordances during the load / on failure).
  // The `MULTI_WORKSPACE ?` split keeps the OFF expression verbatim.
  const isWorkspaceAdmin = MULTI_WORKSPACE
    ? Boolean(remote?.isAdmin)
    : ME.role === "lead";

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
      {/* ON-path fetch. `MULTI_WORKSPACE` is a build-inlined `false` when the
          flag is off, so this renders `null` and the sync component — and its
          effect — never mount: the OFF build's render is unchanged. */}
      {MULTI_WORKSPACE ? (
        <WorkspaceIdentitySync onResolved={setRemote} />
      ) : null}
      {children}
    </NotebookStateContext.Provider>
  );
}
