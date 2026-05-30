"use client";

// use-widget-state — per-widget persisted state for the interactive widget
// library (Teach Phase 3, plan §12/§16.3). Each live widget (timer duration,
// poll tallies, scoreboard points, traffic-light colour, …) keeps its own slice
// of JSON-serialisable state keyed by the widget's id.
//
// SSR-safe, mirroring `lib/teach/use-teach-groups.ts`:
//   1. The first render returns `initial` so server HTML == first client paint
//      (no hydration mismatch). A post-mount effect hydrates from localStorage.
//   2. An in-process event bus keyed by storage-key keeps multiple hook
//      instances for the SAME widget coherent within a tab.
//   3. A `storage` listener picks up writes from other tabs on the same device.
//
// PRIVACY (plan §11.4): like every Teach persistence surface, this stores
// STRUCTURE only — counts, durations, scores, option labels, colours. It MUST
// NOT be used to persist student names; name-bearing data lives solely in the
// USER-scoped `use-teach-groups` store. The Names/Groups widgets read rosters
// from there, never from here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** USER-scoped key namespace — one entry per widget id. Never migrates to the
 *  DB as-is; Phase 4 maps durable config onto `widget.config`/`state` columns. */
function storageKey(widgetId: string): string {
  return `mycurricula:user:teach-widget:${widgetId}`;
}

function readFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage disabled / quota exceeded — state still updates in-memory.
  }
}

// ── Same-tab sync bus, keyed by storage-key ────────────────────────────────
type Listener = (next: unknown) => void;
const buses = new Map<string, Set<Listener>>();

function subscribe(key: string, fn: Listener): () => void {
  let set = buses.get(key);
  if (!set) {
    set = new Set();
    buses.set(key, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) buses.delete(key);
  };
}

function broadcast(key: string, value: unknown): void {
  buses.get(key)?.forEach((fn) => fn(value));
}

export interface UseWidgetStateResult<T> {
  /** Current state — `initial` on the server + first paint, hydrated after. */
  state: T;
  /** Merge a partial patch (object states) or replace via an updater. */
  setState: (patch: Partial<T> | ((prev: T) => T)) => void;
  /** Reset to the initial state and clear the persisted entry. */
  reset: () => void;
  /** True once the post-mount hydration effect has run (lets a widget avoid
   *  flashing default content before its saved state loads). */
  hydrated: boolean;
}

/**
 * Persist a widget's interactive state to localStorage, scoped to `widgetId`.
 * `initial` is the default state used for SSR and as the reset target; it must
 * be stable across renders for the same widget (memoise object literals at the
 * call site or pass a primitive-keyed object).
 */
export function useWidgetState<T extends Record<string, unknown>>(
  widgetId: string,
  initial: T,
): UseWidgetStateResult<T> {
  const key = useMemo(() => storageKey(widgetId), [widgetId]);
  const [state, setLocal] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  // Hold the latest `initial` without making the hydration effect depend on a
  // possibly-unstable object identity (avoids re-hydrating on every render).
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // Post-mount hydrate + subscribe to the in-process bus for this key.
  useEffect(() => {
    const stored = readFromStorage<T>(key);
    if (stored != null && typeof stored === "object") {
      // Merge over the initial so a state shape that gained fields since the
      // entry was written still has every key defined.
      setLocal({ ...initialRef.current, ...stored });
    }
    setHydrated(true);
    const unsub = subscribe(key, (next) => setLocal(next as T));
    return unsub;
    // Re-run only when the widget id (key) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cross-tab sync (same device).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== key) return;
      if (e.newValue == null) {
        setLocal(initialRef.current);
        return;
      }
      try {
        setLocal({ ...initialRef.current, ...(JSON.parse(e.newValue) as T) });
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key]);

  const setState = useCallback(
    (patch: Partial<T> | ((prev: T) => T)): void => {
      setLocal((prev) => {
        const next =
          typeof patch === "function"
            ? (patch as (p: T) => T)(prev)
            : { ...prev, ...patch };
        writeToStorage(key, next);
        broadcast(key, next);
        return next;
      });
    },
    [key],
  );

  const reset = useCallback((): void => {
    const next = initialRef.current;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    broadcast(key, next);
    setLocal(next);
  }, [key]);

  return { state, setState, reset, hydrated };
}
