"use client";

// hub-recents.ts — the Planner Hub's "recently opened" seam (W8).
//
// A tiny localStorage-backed MRU list of the last 10 documents (lessons +
// units) the teacher opened in the hub. Deduped by `key` (`${kind}:${id}`),
// most-recent first. This is a per-device convenience list, not a synced
// record — W8 deliberately keeps it in localStorage (the teacher_preferences
// cross-device mirror is a later nicety; nothing here blocks it).
//
// Shape mirrors what the recents popover renders: a headline (`title`), a
// dimmed subtitle (`sub`, e.g. the subject · unit), and enough identity
// (`key`, `kind`, `sid`) to reopen the doc. `id` is derived from `key` at the
// callsite (strip the `${kind}:` prefix) so the stored shape stays minimal.
//
// SSR-safe: `useRecents()` returns [] on the server and hydrates in a mount
// effect, so the first client paint matches the server HTML. A module-level
// cache + listener set keeps every mounted popover in sync within the tab
// (and a `storage` event syncs across tabs).

import { useEffect, useState } from "react";

export type HubRecentKind = "lesson" | "unit";

export interface HubRecent {
  /** `${kind}:${sid}:${id}` — the dedupe key. Unit slugs are unique only WITHIN
   *  a subject, so the key MUST include `sid` or two same-slug units from
   *  different subjects collide onto one entry. */
  key: string;
  kind: HubRecentKind;
  /** The lesson id / unit slug to reopen (stored explicitly, not parsed from
   *  the key, since the key now carries `sid` too). */
  id: string;
  /** Headline shown in the popover row. */
  title: string;
  /** Dimmed subtitle, e.g. "Math · Fractions". */
  sub: string;
  /** Owning SubjectId — drives the row's subject tint. */
  sid: string;
}

const STORAGE_KEY = "mycurricula:hub:recents";
const MAX = 10;

// In-memory cache of the parsed list + subscribers. `null` = not yet read from
// storage this session. Reads lazily on first access.
let cache: HubRecent[] | null = null;
const listeners = new Set<(list: HubRecent[]) => void>();

function isRecent(v: unknown): v is HubRecent {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.key === "string" &&
    (r.kind === "lesson" || r.kind === "unit") &&
    typeof r.id === "string" &&
    typeof r.title === "string" &&
    typeof r.sub === "string" &&
    typeof r.sid === "string"
  );
}

function readStorage(): HubRecent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecent).slice(0, MAX);
  } catch {
    // Corrupt/blocked storage → behave as empty rather than throwing into React.
    return [];
  }
}

function ensureCache(): HubRecent[] {
  if (cache === null) cache = readStorage();
  return cache;
}

function writeStorage(list: HubRecent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota/private-mode failures are non-fatal — the in-memory cache still
    // drives the current session; we simply don't persist across reloads.
  }
}

function emit(list: HubRecent[]): void {
  for (const fn of listeners) fn(list);
}

/** Push a document to the front of the recents list (dedupe by key, cap 10). */
export function pushRecent(entry: HubRecent): void {
  const current = ensureCache();
  const next = [entry, ...current.filter((r) => r.key !== entry.key)].slice(
    0,
    MAX,
  );
  cache = next;
  writeStorage(next);
  emit(next);
}

/** Clear the recents list (exposed for a future "clear recents" affordance). */
export function clearRecents(): void {
  cache = [];
  writeStorage([]);
  emit([]);
}

/**
 * Subscribe to the recents list. SSR-safe: starts empty so the server HTML and
 * the first client paint agree, then hydrates + subscribes post-mount. Also
 * listens for cross-tab `storage` events.
 */
export function useRecents(): HubRecent[] {
  const [list, setList] = useState<HubRecent[]>([]);

  useEffect(() => {
    // Hydrate from storage on mount, then keep in sync with same-tab pushes.
    setList(ensureCache());
    const onChange = (next: HubRecent[]): void => setList(next);
    listeners.add(onChange);

    // Cross-tab: another tab wrote the key → re-read + refresh our cache.
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      cache = readStorage();
      setList(cache);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return list;
}

