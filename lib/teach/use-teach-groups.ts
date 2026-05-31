"use client";

// use-teach-groups — the LOCAL-ONLY student groups + names store for the Teach
// surface (docs/teach-view-plan.md §11.4, §13.3).
//
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PRIVACY HARD RULE — READ BEFORE TOUCHING THIS FILE                        ║
// ║                                                                           ║
// ║  Student group definitions and student names persist ONLY on the          ║
// ║  teacher's own device (localStorage). They are NEVER written to the       ║
// ║  database and NEVER sync across computers. This data MUST NOT pass        ║
// ║  through `lib/teach/queries.ts` (the `teach` repository) or ANY other     ║
// ║  DB / network path — not now (mock), not in Phase 4 (Supabase).           ║
// ║                                                                           ║
// ║  The persistable widget `config`/`state` (in lib/types.ts → Widget)       ║
// ║  carry STRUCTURE only (group count, slot ids) — never names. The Groups   ║
// ║  / Names widgets read names exclusively from THIS store. A teacher who    ║
// ║  opens Teach on a different machine sees their boards but NOT their        ║
// ║  rosters — by design. This makes "students are out of product scope"      ║
// ║  (CLAUDE.md §1) concrete: no roster entity, no students table, no         ║
// ║  cross-device name storage anywhere in Teach.                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// SSR-safe pattern, mirrored from `lib/use-rail-layout.ts`:
//   1. The initial useState is an empty store so the server-rendered HTML
//      matches the first client render (no hydration mismatch).
//   2. A post-mount effect syncs from localStorage and subscribes to an
//      in-process event bus so every hook instance in the tab stays coherent.
//   3. A `storage` event listener picks up writes from OTHER tabs (same
//      device — still local-only).
//   4. `normalize()` runs on every read AND write so a malformed payload is
//      repaired rather than crashing the Groups module.

import { useCallback, useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────

/** One named class member. Names live ONLY here — never in a Widget/Board. */
export interface TeachStudent {
  /** Stable local id (minted on add). */
  id: string;
  /** The full display name. LOCAL-ONLY — never persisted to the DB. */
  name: string;
}

/** A named group of students (e.g. "Table 1", "Red Group"). */
export interface TeachGroup {
  id: string;
  name: string;
  /** Member student ids (references into `students`). */
  studentIds: string[];
}

/** The full local-only roster + grouping for a teacher's class. */
export interface TeachGroupsStore {
  students: TeachStudent[];
  groups: TeachGroup[];
}

const EMPTY_STORE: TeachGroupsStore = { students: [], groups: [] };

// ── Storage ──────────────────────────────────────────────────────────────

/** localStorage key — USER-scoped per the `mycurricula:user:*` convention.
 *  This key is the ONLY persistence surface for names; it has no DB analogue
 *  and intentionally never migrates to Supabase (plan §11.4). */
const STORAGE_KEY = "mycurricula:user:teach-groups";

let seq = 0;
function localId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** Coerce an unknown payload back into a valid store. Drops malformed rows;
 *  never mutates the input. */
function normalize(input: unknown): TeachGroupsStore {
  const obj =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const students: TeachStudent[] = [];
  const seenStudent = new Set<string>();
  if (Array.isArray(obj.students)) {
    for (const raw of obj.students) {
      if (raw && typeof raw === "object") {
        const s = raw as Record<string, unknown>;
        if (
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          !seenStudent.has(s.id)
        ) {
          seenStudent.add(s.id);
          students.push({ id: s.id, name: s.name });
        }
      }
    }
  }
  const studentIdSet = new Set(students.map((s) => s.id));

  const groups: TeachGroup[] = [];
  const seenGroup = new Set<string>();
  if (Array.isArray(obj.groups)) {
    for (const raw of obj.groups) {
      if (raw && typeof raw === "object") {
        const g = raw as Record<string, unknown>;
        if (
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          !seenGroup.has(g.id)
        ) {
          seenGroup.add(g.id);
          const ids = Array.isArray(g.studentIds)
            ? g.studentIds.filter(
                (v): v is string =>
                  typeof v === "string" && studentIdSet.has(v),
              )
            : [];
          groups.push({
            id: g.id,
            name: g.name,
            studentIds: [...new Set(ids)],
          });
        }
      }
    }
  }

  return { students, groups };
}

function readFromStorage(): TeachGroupsStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return null;
  }
}

function writeToStorage(store: TeachGroupsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage disabled / quota exceeded — state still updates in-memory.
  }
}

// ── Same-tab sync (in-process event bus) ───────────────────────────────────
// The native `storage` event only fires on OTHER tabs, so a tiny in-process
// bus keeps multiple hook instances in THIS tab coherent after a write.

type Listener = (next: TeachGroupsStore) => void;
const listeners = new Set<Listener>();

function broadcast(store: TeachGroupsStore): void {
  for (const fn of listeners) fn(store);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseTeachGroupsResult {
  /** The current local roster + grouping. SSR uses EMPTY_STORE; a post-mount
   *  effect syncs from localStorage. */
  store: TeachGroupsStore;
  /** Add a named student. Returns the minted id. LOCAL-ONLY. */
  addStudent: (name: string) => string;
  /** Rename a student in place. */
  renameStudent: (id: string, name: string) => void;
  /** Remove a student and drop them from every group. */
  removeStudent: (id: string) => void;
  /** Create a named group (optionally pre-seeded with member ids). */
  addGroup: (name: string, studentIds?: string[]) => string;
  /** Rename a group. */
  renameGroup: (id: string, name: string) => void;
  /** Remove a group (students are kept). */
  removeGroup: (id: string) => void;
  /** Set a group's complete member list. */
  setGroupMembers: (id: string, studentIds: string[]) => void;
  /** Wipe the entire local roster + grouping (destructive). */
  clearAll: () => void;
}

export function useTeachGroups(): UseTeachGroupsResult {
  // SSR-safe initial state — never reads localStorage during render.
  const [store, setStore] = useState<TeachGroupsStore>(EMPTY_STORE);

  // Post-mount: sync from localStorage + subscribe to in-process broadcasts.
  useEffect(() => {
    const stored = readFromStorage();
    if (stored != null) setStore(stored);
    const listener: Listener = (next) => setStore(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Cross-tab sync (same device — still local-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue == null) {
        setStore(EMPTY_STORE);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        setStore(normalize(parsed));
      } catch {
        // Ignore malformed values; keep current state.
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  /** Apply a producer, normalize, persist (LOCAL ONLY), and broadcast. */
  const commit = useCallback(
    (producer: (prev: TeachGroupsStore) => TeachGroupsStore): void => {
      setStore((prev) => {
        const next = normalize(producer(prev));
        writeToStorage(next);
        broadcast(next);
        return next;
      });
    },
    [],
  );

  const addStudent = useCallback(
    (name: string): string => {
      const id = localId("stu");
      commit((prev) => ({
        ...prev,
        students: [...prev.students, { id, name: name.trim() }],
      }));
      return id;
    },
    [commit],
  );

  const renameStudent = useCallback(
    (id: string, name: string): void => {
      commit((prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === id ? { ...s, name: name.trim() } : s,
        ),
      }));
    },
    [commit],
  );

  const removeStudent = useCallback(
    (id: string): void => {
      commit((prev) => ({
        students: prev.students.filter((s) => s.id !== id),
        groups: prev.groups.map((g) => ({
          ...g,
          studentIds: g.studentIds.filter((sid) => sid !== id),
        })),
      }));
    },
    [commit],
  );

  const addGroup = useCallback(
    (name: string, studentIds: string[] = []): string => {
      const id = localId("grp");
      commit((prev) => ({
        ...prev,
        groups: [...prev.groups, { id, name: name.trim(), studentIds }],
      }));
      return id;
    },
    [commit],
  );

  const renameGroup = useCallback(
    (id: string, name: string): void => {
      commit((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === id ? { ...g, name: name.trim() } : g,
        ),
      }));
    },
    [commit],
  );

  const removeGroup = useCallback(
    (id: string): void => {
      commit((prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== id),
      }));
    },
    [commit],
  );

  const setGroupMembers = useCallback(
    (id: string, studentIds: string[]): void => {
      commit((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === id ? { ...g, studentIds: [...new Set(studentIds)] } : g,
        ),
      }));
    },
    [commit],
  );

  const clearAll = useCallback((): void => {
    setStore(EMPTY_STORE);
    writeToStorage(EMPTY_STORE);
    broadcast(EMPTY_STORE);
  }, []);

  return {
    store,
    addStudent,
    renameStudent,
    removeStudent,
    addGroup,
    renameGroup,
    removeGroup,
    setGroupMembers,
    clearAll,
  };
}
