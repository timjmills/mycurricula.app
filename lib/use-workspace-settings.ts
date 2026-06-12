"use client";

// use-workspace-settings — settings-managed overrides for the workspace
// identity, the notebook list, and the teacher's default notebook.
//
// Three pieces of state, two scopes:
//
//   1. `mycurricula:team:workspace-name`        (TEAM-scoped, raw string)
//      Override of the workspace display name. Unset → the provider default
//      ("Al-Noor School" via NotebookProvider's `workspaceName` prop).
//
//   2. `mycurricula:team:notebooks`             (TEAM-scoped, JSON array)
//      Notebook OVERLAY list — entries layered over the provider-injected
//      base list (MOCK_NOTEBOOKS today, server data in Phase 1B):
//        • an overlay entry whose gradeLevelId matches a base entry REPLACES
//          that entry in place (rename / archive=isActive:false / restore);
//        • an overlay entry with a new gradeLevelId is an ADDED notebook,
//          appended after the base list.
//      `mergeNotebookOverlay()` below is the single merge implementation —
//      lib/notebook-state.tsx calls it inside NotebookProvider.
//
//   3. `mycurricula:user:default-notebook-id`   (USER-scoped, raw string)
//      The notebook the app opens in when no active-notebook selection is
//      stored (`mycurricula:user:active-notebook-id` unset or invalid).
//      Per-teacher — two teachers on one workspace can default differently.
//
// SSR-safe pattern mirrors `lib/use-school-week.ts`:
//   1. Initial state is the SSR default (null override / empty overlay /
//      null default id) so server HTML matches the first client render.
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs.
//   4. Setters normalize defensively before persisting.
//
// One deliberate EXTENSION of that pattern: a same-tab change event
// (WORKSPACE_SETTINGS_EVENT). The `storage` event only fires on OTHER
// tabs, but here the writer (the Settings → Workspace cards) and a reader
// (NotebookProvider, which feeds the very list those cards render) coexist
// in one tab. Every write dispatches the event; every hook instance and
// the provider subscribe via `subscribeToWorkspaceSettings()`, so a rename
// or archive is visible everywhere in the same frame without a remount.
//
// Phase 1B Supabase seam:
//   • workspace-name   → an UPDATE on the `schools` row (RPC, admin-gated).
//   • notebook overlay → real `grade_levels` writes: replace-entries become
//     UPDATEs (rename / is_active), added-entries become INSERTs. The
//     client-generated `nb-…` ids for added notebooks are placeholders the
//     migration maps to server UUIDs; after that the overlay key empties
//     and the base list (server-driven via NotebookProvider's `notebooks`
//     prop) carries everything.
//   • default-notebook-id → a per-teacher prefs row keyed by auth.uid().
//   The hook APIs are stable across that migration — only the persistence
//   behind the setters changes.

import { useCallback, useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * One overlay entry. Structurally identical to `NotebookEntry` in
 * lib/notebook-state.tsx (kept as a separate declaration so this file
 * never imports from notebook-state — the dependency runs the other way:
 * notebook-state reads the overlay through the helpers below).
 */
export interface WorkspaceNotebookOverride {
  gradeLevelId: string;
  name: string;
  isActive: boolean;
}

// ── Storage keys ───────────────────────────────────────────────────────────

/** TEAM-scoped workspace-name override. Raw string (not JSON). */
export const WORKSPACE_NAME_KEY = "mycurricula:team:workspace-name";

/** TEAM-scoped notebook overlay. JSON-encoded WorkspaceNotebookOverride[]. */
export const NOTEBOOK_OVERLAY_KEY = "mycurricula:team:notebooks";

/** USER-scoped default-notebook id. Raw string (not JSON). */
export const DEFAULT_NOTEBOOK_KEY = "mycurricula:user:default-notebook-id";

/** Keys the `storage` listener treats as workspace-settings changes. */
const WATCHED_KEYS: readonly string[] = [
  WORKSPACE_NAME_KEY,
  NOTEBOOK_OVERLAY_KEY,
  DEFAULT_NOTEBOOK_KEY,
];

/**
 * Same-tab change event (see header). Dispatched after every write so
 * sibling hook instances + NotebookProvider re-read without a remount.
 */
export const WORKSPACE_SETTINGS_EVENT = "mycurricula:workspace-settings";

/** Display-name length cap — matches the settings inputs' maxLength. */
const MAX_NAME_LENGTH = 60;

// ── Normalizers ────────────────────────────────────────────────────────────

/**
 * Normalize a workspace-name override: trim, clamp length, and collapse
 * empty / non-string input to null ("no override — use the provider
 * default").
 */
function normalizeWorkspaceName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed === "" ? null : trimmed;
}

/**
 * Normalize an overlay list: keep only well-formed entries (non-empty
 * trimmed id + name), default a missing/invalid isActive to true, clamp
 * name length, and dedupe by gradeLevelId (last write wins). Anything
 * malformed — wrong root type, junk entries, hand-edited storage — is
 * dropped rather than propagated.
 */
export function normalizeNotebookOverlay(
  input: unknown,
): WorkspaceNotebookOverride[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map<string, WorkspaceNotebookOverride>();
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const gradeLevelId =
      typeof r.gradeLevelId === "string" ? r.gradeLevelId.trim() : "";
    const name =
      typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (gradeLevelId === "" || name === "") continue;
    const isActive = typeof r.isActive === "boolean" ? r.isActive : true;
    byId.set(gradeLevelId, { gradeLevelId, name, isActive });
  }
  return Array.from(byId.values());
}

/** Normalize a default-notebook id: trim; empty / non-string → null. */
function normalizeDefaultNotebookId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
}

// ── Readers (shared with lib/notebook-state.tsx) ──────────────────────────

/** Read the workspace-name override. Null when unset or storage disabled. */
export function readWorkspaceNameOverride(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeWorkspaceName(
      window.localStorage.getItem(WORKSPACE_NAME_KEY),
    );
  } catch {
    return null;
  }
}

/** Read + parse the overlay. Empty array when unset / malformed / disabled. */
export function readNotebookOverlay(): WorkspaceNotebookOverride[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_OVERLAY_KEY);
    if (raw == null) return [];
    return normalizeNotebookOverlay(JSON.parse(raw));
  } catch {
    // Malformed JSON or storage disabled — treat as "no overlay".
    return [];
  }
}

/** Read the default-notebook id. Null when unset or storage disabled. */
export function readDefaultNotebookId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeDefaultNotebookId(
      window.localStorage.getItem(DEFAULT_NOTEBOOK_KEY),
    );
  } catch {
    return null;
  }
}

// ── Merge helper (the overlay semantics, in one place) ────────────────────

/**
 * Layer the overlay over the base notebook list.
 *
 *   • Base order is preserved. An overlay entry whose gradeLevelId matches
 *     a base entry REPLACES it in place (rename / archive / restore).
 *   • Overlay entries with ids not in the base are ADDED notebooks —
 *     appended after the base list, in overlay order.
 *
 * Pure function — NotebookProvider memoizes the call. Accepts any
 * structurally-compatible base entries (NotebookEntry passes as-is).
 */
export function mergeNotebookOverlay(
  base: readonly WorkspaceNotebookOverride[],
  overlay: readonly WorkspaceNotebookOverride[],
): WorkspaceNotebookOverride[] {
  const overlayById = new Map(overlay.map((e) => [e.gradeLevelId, e]));
  const merged: WorkspaceNotebookOverride[] = base.map((b) => {
    const replacement = overlayById.get(b.gradeLevelId);
    if (replacement) {
      // Consume the entry so the append loop below only sees additions.
      overlayById.delete(b.gradeLevelId);
      return replacement;
    }
    return { gradeLevelId: b.gradeLevelId, name: b.name, isActive: b.isActive };
  });
  // Map iteration preserves insertion order → additions keep overlay order.
  for (const added of overlayById.values()) merged.push(added);
  return merged;
}

// ── Change subscription ────────────────────────────────────────────────────

/** Dispatch the same-tab change event. No-op during SSR. */
function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKSPACE_SETTINGS_EVENT));
}

/**
 * Subscribe to workspace-settings changes from BOTH directions:
 *   • `storage` — another tab wrote one of the three keys (or cleared
 *     storage entirely, key === null);
 *   • WORKSPACE_SETTINGS_EVENT — this tab wrote through a setter below.
 * Returns the unsubscribe function. SSR-safe (no-op on the server).
 */
export function subscribeToWorkspaceSettings(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || WATCHED_KEYS.includes(e.key)) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(WORKSPACE_SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WORKSPACE_SETTINGS_EVENT, onChange);
  };
}

// ── Write helpers ──────────────────────────────────────────────────────────

/**
 * Persist the overlay (read-modify-write happens in the callers so the
 * stored list — not any one hook instance's state — is the source of
 * truth, avoiding lost updates when two cards write back-to-back).
 */
function writeOverlay(next: WorkspaceNotebookOverride[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTEBOOK_OVERLAY_KEY, JSON.stringify(next));
    // Notify only after a SUCCESSFUL write — subscribers re-read storage,
    // so notifying after a failed write would hand them the stale value
    // and clobber the caller's in-memory update.
    emitChange();
  } catch {
    // Quota / private mode — in-memory state still updated by the caller.
  }
}

/** Generate a client-side id for an ADDED notebook (Phase 1B: server UUID). */
function generateNotebookId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `nb-${crypto.randomUUID()}`;
  }
  // Insecure-context fallback — uniqueness, not unguessability, is the goal.
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Hook: workspace name ───────────────────────────────────────────────────

/**
 * The workspace-name OVERRIDE plus a setter. `workspaceNameOverride` is
 * null when no override is stored — the resolved display name (override ??
 * provider default) is what `useNotebookState().workspaceName` returns;
 * this hook deliberately exposes only the raw override so callers can
 * distinguish "renamed" from "still the default".
 */
export function useWorkspaceName(): {
  workspaceNameOverride: string | null;
  setWorkspaceName: (name: string | null) => void;
} {
  // SSR default: no override. localStorage is overlaid post-mount.
  const [override, setOverrideState] = useState<string | null>(null);

  // Post-mount sync + cross-tab/same-tab subscription.
  useEffect(() => {
    const sync = (): void => setOverrideState(readWorkspaceNameOverride());
    sync();
    return subscribeToWorkspaceSettings(sync);
  }, []);

  // Setter. Null / empty clears the override (back to the provider default).
  const setWorkspaceName = useCallback((name: string | null): void => {
    const normalized = normalizeWorkspaceName(name);
    setOverrideState(normalized);
    if (typeof window === "undefined") return;
    try {
      if (normalized === null) {
        window.localStorage.removeItem(WORKSPACE_NAME_KEY);
      } else {
        window.localStorage.setItem(WORKSPACE_NAME_KEY, normalized);
      }
      // Notify only after a successful write (see writeOverlay).
      emitChange();
    } catch {
      // Storage disabled — state still updates in-memory.
    }
  }, []);

  return { workspaceNameOverride: override, setWorkspaceName };
}

// ── Hook: notebook overlay ─────────────────────────────────────────────────

/**
 * The notebook overlay plus mutation helpers. Mutations only — reading
 * the MERGED list belongs to `useNotebookState()` (NotebookProvider owns
 * the base list and calls `mergeNotebookOverlay`). Callers pass complete
 * merged entries into `upsertNotebook` (the overlay must capture name AND
 * isActive so a later base-list change can't resurrect stale fields).
 */
export function useNotebookOverlay(): {
  overlay: readonly WorkspaceNotebookOverride[];
  /** Replace-or-add the overlay entry for `entry.gradeLevelId`. */
  upsertNotebook: (entry: WorkspaceNotebookOverride) => void;
  /** Create an ADDED notebook. Returns its new id, or null for empty names. */
  createNotebook: (name: string) => string | null;
  /**
   * Remove the overlay entry for an id: an ADDED notebook disappears
   * entirely; a base notebook reverts to its provider-injected values.
   * Used as the Undo for "create".
   */
  removeNotebookOverride: (gradeLevelId: string) => void;
} {
  // SSR default: empty overlay (initial render = base list everywhere).
  const [overlay, setOverlayState] = useState<WorkspaceNotebookOverride[]>([]);

  // Post-mount sync + cross-tab/same-tab subscription.
  useEffect(() => {
    const sync = (): void => setOverlayState(readNotebookOverlay());
    sync();
    return subscribeToWorkspaceSettings(sync);
  }, []);

  const upsertNotebook = useCallback(
    (entry: WorkspaceNotebookOverride): void => {
      // Route through the normalizer so a junk entry (empty name after
      // trim, blank id) is refused rather than persisted.
      const [normalized] = normalizeNotebookOverlay([entry]);
      if (!normalized) return;
      const current = readNotebookOverlay();
      const idx = current.findIndex(
        (e) => e.gradeLevelId === normalized.gradeLevelId,
      );
      if (idx >= 0) {
        current[idx] = normalized;
      } else {
        current.push(normalized);
      }
      setOverlayState(current);
      writeOverlay(current);
    },
    [],
  );

  const createNotebook = useCallback(
    (name: string): string | null => {
      const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
      if (trimmed === "") return null;
      const gradeLevelId = generateNotebookId();
      upsertNotebook({ gradeLevelId, name: trimmed, isActive: true });
      return gradeLevelId;
    },
    [upsertNotebook],
  );

  const removeNotebookOverride = useCallback((gradeLevelId: string): void => {
    const current = readNotebookOverlay();
    const next = current.filter((e) => e.gradeLevelId !== gradeLevelId);
    if (next.length === current.length) return; // nothing to remove
    setOverlayState(next);
    writeOverlay(next);
  }, []);

  return { overlay, upsertNotebook, createNotebook, removeNotebookOverride };
}

// ── Hook: default notebook ─────────────────────────────────────────────────

/**
 * The teacher's default-notebook id plus a setter. Null means "no
 * preference — open in the first active notebook". NotebookProvider
 * consults this when `mycurricula:user:active-notebook-id` is unset or
 * no longer points at an active notebook.
 */
export function useDefaultNotebookId(): {
  defaultNotebookId: string | null;
  setDefaultNotebookId: (id: string | null) => void;
} {
  // SSR default: no preference.
  const [defaultId, setDefaultIdState] = useState<string | null>(null);

  // Post-mount sync + cross-tab/same-tab subscription.
  useEffect(() => {
    const sync = (): void => setDefaultIdState(readDefaultNotebookId());
    sync();
    return subscribeToWorkspaceSettings(sync);
  }, []);

  const setDefaultNotebookId = useCallback((id: string | null): void => {
    const normalized = normalizeDefaultNotebookId(id);
    setDefaultIdState(normalized);
    if (typeof window === "undefined") return;
    try {
      if (normalized === null) {
        window.localStorage.removeItem(DEFAULT_NOTEBOOK_KEY);
      } else {
        window.localStorage.setItem(DEFAULT_NOTEBOOK_KEY, normalized);
      }
      // Notify only after a successful write (see writeOverlay).
      emitChange();
    } catch {
      // Storage disabled — state still updates in-memory.
    }
  }, []);

  return { defaultNotebookId: defaultId, setDefaultNotebookId };
}
