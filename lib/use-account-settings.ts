"use client";

// use-account-settings — the per-teacher account preferences behind
// Settings → Account: display name, startup view, and completion privacy.
//
// All three are USER-scoped (`mycurricula:user:*` — CLAUDE.md scope
// doctrine: team config lives under `mycurricula:team:*`, personal
// preference under `mycurricula:user:*`). Today they persist to
// localStorage; when Supabase lands they MIGRATE to per-teacher profile
// columns — the storage keys name the eventual destination so the
// migration is grep-able.
//
// SSR-safe pattern mirrors `lib/use-school-week.ts`:
//   1. Initial state is the SSR default (mock ME name / "/weekly" /
//      "shared") so server-rendered HTML matches the first client render.
//   2. A post-mount effect syncs from localStorage.
//   3. A `storage` event listener picks up changes from other tabs.
//   4. Setters normalize before persisting; storage access is wrapped in
//      try/catch so private mode / quota exhaustion degrades to
//      in-memory-only state instead of throwing.
//
// Same-tab propagation: the `storage` event only fires on OTHER tabs, but
// the display name is read by `lib/app-state.tsx` (the top-bar avatar)
// in the SAME tab the teacher renames themselves in. `setDisplayName`
// therefore also dispatches a window-level PROFILE_EVENT after each
// write so same-tab consumers (the AppStateProvider, other hook
// instances) update live without a remount.

import { useCallback, useEffect, useState } from "react";
import { ME } from "@/lib/mock";

// ── Storage keys ───────────────────────────────────────────────────────────

/**
 * Profile blob — `{ displayName: string }` as JSON. Unset (or storing an
 * empty name) means "use the account default" — today the mock ME name,
 * post-Supabase the auth-profile name.
 */
export const PROFILE_STORAGE_KEY = "mycurricula:user:profile";

/** Startup route — a raw route string from DEFAULT_VIEW_ROUTES. */
export const DEFAULT_VIEW_STORAGE_KEY = "mycurricula:user:default-view";

/** Completion privacy — raw "private" | "shared". */
export const COMPLETION_PRIVACY_STORAGE_KEY =
  "mycurricula:user:completion-privacy";

/**
 * Window event dispatched after every display-name write so SAME-tab
 * consumers (lib/app-state.tsx's CurrentUser overlay, sibling hook
 * instances) re-read storage immediately. Cross-tab consumers get the
 * native `storage` event instead — listeners should subscribe to both.
 */
export const PROFILE_EVENT = "mycurricula:profile-updated";

// ── Display name ───────────────────────────────────────────────────────────

/**
 * Default fallback display name when no profile is stored AND no caller-
 * supplied fallback is given — the mock lead teacher, matching the
 * FALLBACK_USER in lib/app-state.tsx. Callers under an <AppStateProvider>
 * should pass `useAppState().accountDefaultName` to useDisplayName instead,
 * so a signed-in teacher's real auth-profile name wins over this mock.
 */
export const FALLBACK_DISPLAY_NAME: string = ME.name;

/** Hard cap matching the Account page input's maxLength. */
const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * Derive a two-letter avatar monogram from a display name: the first
 * letters of the first two words, uppercased. Single-word names use the
 * first two characters; empty/whitespace input degrades to "?" rather
 * than throwing.
 */
export function deriveInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Normalize an arbitrary stored/passed value to a usable display name.
 * Trims, clamps to the input cap, and treats empty as null ("unset" —
 * fall back to the account default).
 */
function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, MAX_DISPLAY_NAME_LENGTH).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Read the stored display name. Returns null when unset or when the
 * stored JSON is malformed (private mode, hand-edited storage, etc.).
 * Exported for lib/app-state.tsx, which overlays the stored name onto
 * CurrentUser so the top-bar avatar reflects the teacher's choice.
 */
export function readStoredDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return normalizeDisplayName(
      (parsed as { displayName?: unknown }).displayName,
    );
  } catch {
    // Malformed JSON or storage disabled — treat as unset.
    return null;
  }
}

/**
 * The teacher's display name plus a setter.
 *
 * The state is always a usable name — when no profile is stored it is
 * `fallbackName`, never the empty string. The setter accepts any
 * string; empty/whitespace input CLEARS the stored profile so the name
 * falls back to the account default.
 *
 * `fallbackName` defaults to the mock ME teacher (the backend-less
 * prototype default). Pages rendered under an <AppStateProvider> should
 * pass `useAppState().accountDefaultName` instead, so a signed-in
 * teacher with no stored display name sees their real auth-profile name
 * rather than a fabricated mock person. The returned name is DERIVED
 * (`stored ?? fallbackName`), so a fallback that resolves after mount
 * (the Supabase session arriving) propagates without extra effects.
 *
 * Cross-tab sync via the `storage` event; same-tab sync (other hook
 * instances, the app-state avatar overlay) via PROFILE_EVENT.
 */
export function useDisplayName(fallbackName: string = FALLBACK_DISPLAY_NAME): {
  displayName: string;
  setDisplayName: (name: string) => void;
} {
  // The STORED name only — null when unset. The initial state is null so
  // server-rendered HTML (which sees `fallbackName`'s SSR value) matches
  // the first client render; the real stored value arrives in the
  // post-mount effect below (the usual no-hydration-mismatch pattern).
  const [stored, setStored] = useState<string | null>(null);

  // Post-mount: sync from localStorage if a profile is stored.
  useEffect(() => {
    setStored(readStoredDisplayName());
  }, []);

  // Cross-tab (`storage`) + same-tab (PROFILE_EVENT) sync. Both paths
  // re-read storage rather than trusting event payloads, so there is a
  // single source of truth for what the name currently is.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (): void => {
      setStored(readStoredDisplayName());
    };
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== PROFILE_STORAGE_KEY) return;
      sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PROFILE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROFILE_EVENT, sync);
    };
  }, []);

  // Setter. Normalizes, updates local state, persists, then notifies
  // same-tab consumers. Wrapped in useCallback so consumers can pass it
  // through props / deps without forcing re-renders.
  const setDisplayName = useCallback((name: string): void => {
    const normalized = normalizeDisplayName(name);
    setStored(normalized);
    if (typeof window === "undefined") return;
    try {
      if (normalized == null) {
        // Cleared — remove the profile so the default name comes back.
        window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          PROFILE_STORAGE_KEY,
          JSON.stringify({ displayName: normalized }),
        );
      }
      // Same-tab notification only AFTER a successful write — listeners
      // re-read storage, so notifying after a FAILED write would make
      // them observe the stale value and clobber this tab's in-memory
      // update. When storage is disabled the rename simply stays local
      // to this hook instance (the documented degraded mode).
      window.dispatchEvent(new Event(PROFILE_EVENT));
    } catch {
      // Storage disabled / quota exceeded — state still updates in-memory.
    }
  }, []);

  return { displayName: stored ?? fallbackName, setDisplayName };
}

// ── Default view ───────────────────────────────────────────────────────────

/**
 * The routes a teacher may pick as their startup view. The Curriculum surface
 * ("/subject") was merged into the Yearly view ("/year"), so it is no longer a
 * separate startup option (a stored "/subject" migrates to "/year" below).
 */
export const DEFAULT_VIEW_ROUTES = ["/weekly", "/daily", "/year"] as const;

export type DefaultViewRoute = (typeof DEFAULT_VIEW_ROUTES)[number];

/** Factory default — the Weekly view, the app's canonical surface. */
export const DEFAULT_DEFAULT_VIEW: DefaultViewRoute = "/weekly";

/** Clamp an arbitrary stored value to the allowed route set. A legacy
 *  "/subject" (the retired Curriculum view) migrates to its successor "/year"
 *  so existing teachers keep a sensible startup surface. */
function normalizeDefaultView(input: unknown): DefaultViewRoute {
  if (input === "/subject") return "/year";
  return DEFAULT_VIEW_ROUTES.includes(input as DefaultViewRoute)
    ? (input as DefaultViewRoute)
    : DEFAULT_DEFAULT_VIEW;
}

/**
 * Read the stored startup route, clamped to the allowlist. Non-hook so
 * `app/page.tsx` can call it inside its redirect effect. Defensive:
 * unset, invalid, or unreadable values all yield "/weekly" (the pre-
 * preference behavior).
 */
export function readDefaultView(): DefaultViewRoute {
  if (typeof window === "undefined") return DEFAULT_DEFAULT_VIEW;
  try {
    return normalizeDefaultView(
      window.localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_DEFAULT_VIEW;
  }
}

/**
 * The teacher's startup view plus a setter. The root route (/) honors
 * this on load; the value is stored as the raw route string.
 */
export function useDefaultView(): {
  defaultView: DefaultViewRoute;
  setDefaultView: (route: DefaultViewRoute) => void;
} {
  const [defaultView, setDefaultViewState] =
    useState<DefaultViewRoute>(DEFAULT_DEFAULT_VIEW);

  // Post-mount localStorage sync (see the SSR note on useDisplayName).
  useEffect(() => {
    setDefaultViewState(readDefaultView());
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== DEFAULT_VIEW_STORAGE_KEY) return;
      setDefaultViewState(normalizeDefaultView(e.newValue));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setDefaultView = useCallback((route: DefaultViewRoute): void => {
    const normalized = normalizeDefaultView(route);
    setDefaultViewState(normalized);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DEFAULT_VIEW_STORAGE_KEY, normalized);
    } catch {
      // Storage disabled / quota exceeded — state still updates in-memory.
    }
  }, []);

  return { defaultView, setDefaultView };
}

// ── Completion privacy ─────────────────────────────────────────────────────

/**
 * Whether teammates can see this teacher's lesson done-marks.
 * "shared" is the default — the team-visibility behavior the product has
 * always had. ENFORCEMENT NOTE: completion is mock-driven today; the
 * preference is recorded now so the Supabase realtime wave (Phase 1B)
 * can honor it from day one.
 */
export type CompletionPrivacy = "private" | "shared";

export const DEFAULT_COMPLETION_PRIVACY: CompletionPrivacy = "shared";

/** Clamp an arbitrary stored value to the two valid settings. */
function normalizeCompletionPrivacy(input: unknown): CompletionPrivacy {
  return input === "private" || input === "shared"
    ? input
    : DEFAULT_COMPLETION_PRIVACY;
}

/** The teacher's completion-privacy preference plus a setter. */
export function useCompletionPrivacy(): {
  privacy: CompletionPrivacy;
  setPrivacy: (p: CompletionPrivacy) => void;
} {
  const [privacy, setPrivacyState] = useState<CompletionPrivacy>(
    DEFAULT_COMPLETION_PRIVACY,
  );

  // Post-mount localStorage sync (see the SSR note on useDisplayName).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(COMPLETION_PRIVACY_STORAGE_KEY);
      if (raw != null) setPrivacyState(normalizeCompletionPrivacy(raw));
    } catch {
      // Storage disabled — keep the default.
    }
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== COMPLETION_PRIVACY_STORAGE_KEY) return;
      setPrivacyState(normalizeCompletionPrivacy(e.newValue));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setPrivacy = useCallback((p: CompletionPrivacy): void => {
    const normalized = normalizeCompletionPrivacy(p);
    setPrivacyState(normalized);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(COMPLETION_PRIVACY_STORAGE_KEY, normalized);
    } catch {
      // Storage disabled / quota exceeded — state still updates in-memory.
    }
  }, []);

  return { privacy, setPrivacy };
}
