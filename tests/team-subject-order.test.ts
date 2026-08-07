import { describe, it, expect, afterEach } from "vitest";

import {
  CANONICAL_SUBJECT_ORDER,
  loadTeamSubjectOrder,
  moveSubjectInOrder,
  normalizeSubjectOrder,
  teamSubjectOrderStorageKey,
} from "@/lib/use-subject-settings";
import type { SubjectId } from "@/lib/types";

// Pure ordering logic behind the Settings → Subjects reorder control
// (audit 2026-07-31 §B6). These exercise the two exported pure functions
// only — no React, no localStorage, no DOM. Everything is imported, not
// read off disk: no readFileSync, no path literals, so this suite cannot
// go red because a file moved.
//
// The two functions carry the whole correctness weight of the feature:
// `normalizeSubjectOrder` is what stops a stale save from dropping a
// subject off the roster, and `moveSubjectInOrder` is what the ↑ / ↓
// buttons (and any future drag path) call.

const CANONICAL = [...CANONICAL_SUBJECT_ORDER] as SubjectId[];

describe("teamSubjectOrderStorageKey — notebook scoping", () => {
  const BASE = "mycurricula:team:subject-order";

  it("falls back to the bare base key for null / undefined / empty scope", () => {
    // Empty string matters: on the MULTI_WORKSPACE ON path the notebook
    // id can be "" while identity is still loading — that window must
    // degrade to the legacy base key, never write "…:" (a junk scope).
    expect(teamSubjectOrderStorageKey(null)).toBe(BASE);
    expect(teamSubjectOrderStorageKey(undefined)).toBe(BASE);
    expect(teamSubjectOrderStorageKey("")).toBe(BASE);
  });

  it("appends the notebook scope to the base key", () => {
    expect(teamSubjectOrderStorageKey("g5")).toBe(`${BASE}:g5`);
  });

  it("passes a UUID scope through verbatim (no escaping invented)", () => {
    const uuid = "3f1c2f4e-9b3a-4d2e-8c1a-1234567890ab";
    expect(teamSubjectOrderStorageKey(uuid)).toBe(`${BASE}:${uuid}`);
  });

  it("gives two notebooks two distinct keys (the isolation property)", () => {
    // The whole point of the Codex Medium-3 fix: a reorder saved under
    // one notebook's key must be invisible under another's.
    expect(teamSubjectOrderStorageKey("g5")).not.toBe(
      teamSubjectOrderStorageKey("g6"),
    );
  });
});

describe("normalizeSubjectOrder — completeness", () => {
  it("falls back to the canonical roster for null / undefined / non-arrays", () => {
    expect(normalizeSubjectOrder(null)).toEqual(CANONICAL);
    expect(normalizeSubjectOrder(undefined)).toEqual(CANONICAL);
    expect(normalizeSubjectOrder("math,reading")).toEqual(CANONICAL);
    expect(normalizeSubjectOrder({ 0: "math" })).toEqual(CANONICAL);
  });

  it("preserves a full valid permutation exactly", () => {
    const shuffled = [...CANONICAL].reverse();
    expect(normalizeSubjectOrder(shuffled)).toEqual(shuffled);
  });

  it("drops unknown / removed subject ids", () => {
    const out = normalizeSubjectOrder(["history", "math", "phys-ed"]);
    expect(out).not.toContain("history");
    expect(out).not.toContain("phys-ed");
    expect(out[0]).toBe("math");
  });

  it("keeps a subject that is ABSENT from the stored order, appended canonically", () => {
    // A save written before `sel` joined the roster: it must still show up.
    const partial = CANONICAL.filter((id) => id !== "sel");
    const out = normalizeSubjectOrder(partial);
    expect(out).toContain("sel");
    expect(out.length).toBe(CANONICAL.length);
    // The saved ids keep their saved order at the front; the missing one
    // is appended rather than inserted at its old canonical slot.
    expect(out.slice(0, partial.length)).toEqual(partial);
    expect(out[out.length - 1]).toBe("sel");
  });

  it("de-dupes a corrupt save (first occurrence wins) and never loses a subject", () => {
    const out = normalizeSubjectOrder([
      "math",
      "math",
      "reading",
      null,
      7,
      "math",
    ]);
    expect(out.filter((id) => id === "math").length).toBe(1);
    expect(out.length).toBe(CANONICAL.length);
    expect(new Set(out).size).toBe(CANONICAL.length);
  });

  it("reconciles against a passed-in catalog, not the locked 8 (multi-grade)", () => {
    const catalog = ["math", "reading", "writing"] as SubjectId[];
    expect(normalizeSubjectOrder(["writing", "sel", "math"], catalog)).toEqual([
      "writing",
      "math",
      "reading",
    ]);
  });
});

describe("moveSubjectInOrder — adjacent moves", () => {
  const order = ["math", "reading", "writing", "sel"] as SubjectId[];

  it("moves a subject up one slot", () => {
    expect(moveSubjectInOrder(order, "writing", "up")).toEqual([
      "math",
      "writing",
      "reading",
      "sel",
    ]);
  });

  it("moves a subject down one slot", () => {
    expect(moveSubjectInOrder(order, "reading", "down")).toEqual([
      "math",
      "writing",
      "reading",
      "sel",
    ]);
  });

  it("does not mutate the input array", () => {
    // A LOCAL array on purpose: sharing the outer `order` would let an
    // in-place mutation from an earlier test in this block pre-move the
    // subject to a boundary, where the function legitimately no-ops —
    // and the assertion would pass while the bug was live. (Observed:
    // that is exactly what happened before this was made local.)
    const local = ["math", "reading", "writing", "sel"] as SubjectId[];
    const snapshot = [...local];
    moveSubjectInOrder(local, "reading", "down");
    expect(local).toEqual(snapshot);
  });
});

describe("moveSubjectInOrder — boundaries and unknown ids", () => {
  const order = ["math", "reading", "writing", "sel"] as SubjectId[];

  it("is a no-op moving the FIRST subject up (same reference back)", () => {
    expect(moveSubjectInOrder(order, "math", "up")).toBe(order);
  });

  it("is a no-op moving the LAST subject down (same reference back)", () => {
    expect(moveSubjectInOrder(order, "sel", "down")).toBe(order);
  });

  it("is a no-op for an id that is not in the order at all", () => {
    expect(moveSubjectInOrder(order, "grammar" as SubjectId, "up")).toBe(order);
    expect(moveSubjectInOrder(order, "grammar" as SubjectId, "down")).toBe(
      order,
    );
  });

  it("is a no-op on a single-entry order in either direction", () => {
    const one = ["math"] as SubjectId[];
    expect(moveSubjectInOrder(one, "math", "up")).toBe(one);
    expect(moveSubjectInOrder(one, "math", "down")).toBe(one);
  });
});

describe("moveSubjectInOrder — `among` skips invisible neighbours", () => {
  // `reading` is archived, so it is not in `among`. Moving `writing` up
  // must step OVER it and swap with `math`, otherwise the button would
  // appear to do nothing (the swapped row isn't rendered).
  const order = ["math", "reading", "writing", "sel"] as SubjectId[];
  const visible = ["math", "writing", "sel"] as SubjectId[];

  it("swaps past a hidden neighbour rather than with it", () => {
    expect(moveSubjectInOrder(order, "writing", "up", visible)).toEqual([
      "writing",
      "reading",
      "math",
      "sel",
    ]);
  });

  it("treats a subject with no visible neighbour above as at the boundary", () => {
    // `math` is first among the visible ids even though `reading` sits
    // between nothing and it — there is no visible row above.
    expect(moveSubjectInOrder(order, "math", "up", visible)).toBe(order);
  });

  it("still reaches the last visible row when the tail is invisible", () => {
    const tailHidden = ["math", "writing", "sel"] as SubjectId[];
    const visibleTail = ["math", "writing"] as SubjectId[];
    // `writing` is the last VISIBLE id — down is a boundary, not a swap
    // with the invisible `sel`.
    expect(moveSubjectInOrder(tailHidden, "writing", "down", visibleTail)).toBe(
      tailHidden,
    );
  });
});

// ── The pre-scoping migration ─────────────────────────────────────────────
//
// A reorder saved before notebook scoping landed sits under the bare base key.
// The first implementation surfaced it whenever a notebook's own key was
// unset — which is every notebook the teacher has not yet reordered — so one
// legacy reorder reappeared in every grade and every workspace. It was
// described in a comment as "read-once"; it was read once PER SCOPE, and those
// coincide only when there is one scope.
//
// These pin the migration semantics: the first notebook to meet the legacy
// value CLAIMS it (writes it under its own key and removes the bare one), and
// no second notebook can inherit it. The second test is the one that would
// have caught the original bug, so it is the one that matters.

const BASE = teamSubjectOrderStorageKey(null);

/** Minimal localStorage over a Map — the module reads `window.localStorage`
 *  at call time, so installing it on globalThis is enough in the node env. */
function installStorage(seed: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(seed));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  };
  return map;
}

describe("loadTeamSubjectOrder — the pre-scoping legacy migration", () => {
  const CATALOG = CANONICAL_SUBJECT_ORDER;
  const LEGACY: SubjectId[] = ["writing", "math", "reading"] as SubjectId[];
  const KEY_A = teamSubjectOrderStorageKey("notebook-a");
  const KEY_B = teamSubjectOrderStorageKey("notebook-b");

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("surfaces a legacy order in the first notebook that asks", () => {
    installStorage({ [BASE]: JSON.stringify(LEGACY) });
    const got = loadTeamSubjectOrder(KEY_A, CATALOG);
    // normalizeSubjectOrder appends the rest of the catalog, so compare the
    // prefix rather than demanding an exact array — the claim is about which
    // subjects lead, not about dropping the others.
    expect(got.slice(0, 3)).toEqual(LEGACY);
  });

  it("CLAIMS it — writes it to the notebook's own key and drops the bare one", () => {
    const store = installStorage({ [BASE]: JSON.stringify(LEGACY) });
    loadTeamSubjectOrder(KEY_A, CATALOG);
    expect(store.has(BASE)).toBe(false);
    expect(store.has(KEY_A)).toBe(true);
    // Written BEFORE the delete: the value survives the migration.
    expect(JSON.parse(store.get(KEY_A) as string).slice(0, 3)).toEqual(LEGACY);
  });

  it("does NOT leak into a second notebook — the bug this exists for", () => {
    installStorage({ [BASE]: JSON.stringify(LEGACY) });
    loadTeamSubjectOrder(KEY_A, CATALOG); // A claims it
    const b = loadTeamSubjectOrder(KEY_B, CATALOG);
    // B has never been reordered, so it gets the catalog order — not A's.
    expect(b).toEqual(normalizeSubjectOrder(null, CATALOG));
    expect(b.slice(0, 3)).not.toEqual(LEGACY);
  });

  it("leaves an existing scoped order alone and never consults the bare key", () => {
    const own: SubjectId[] = ["sel", "math"] as SubjectId[];
    const store = installStorage({
      [BASE]: JSON.stringify(LEGACY),
      [KEY_A]: JSON.stringify(own),
    });
    expect(loadTeamSubjectOrder(KEY_A, CATALOG).slice(0, 2)).toEqual(own);
    // Untouched: only a notebook with NO order of its own may claim it.
    expect(store.has(BASE)).toBe(true);
  });

  it("returns the catalog order when nothing is stored anywhere", () => {
    installStorage();
    expect(loadTeamSubjectOrder(KEY_A, CATALOG)).toEqual(
      normalizeSubjectOrder(null, CATALOG),
    );
  });
});

describe("loadTeamSubjectOrder — the migration never destroys the value", () => {
  const CATALOG = CANONICAL_SUBJECT_ORDER;
  const LEGACY: SubjectId[] = ["writing", "math", "reading"] as SubjectId[];
  const KEY_A = teamSubjectOrderStorageKey("notebook-a");

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("keeps the legacy key when the scoped write FAILS (quota / private mode)", () => {
    // The dangerous interleaving: setItem throws, removeItem succeeds. Deleting
    // regardless would trade a cosmetic leak for real data loss — the teacher's
    // only saved reorder, gone.
    const map = new Map<string, string>([[BASE, JSON.stringify(LEGACY)]]);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: (k: string) => void map.delete(k),
      },
    };

    const got = loadTeamSubjectOrder(KEY_A, CATALOG);
    // The caller still gets the right order in memory...
    expect(got.slice(0, 3)).toEqual(LEGACY);
    // ...and the only persisted copy survives.
    expect(map.has(BASE)).toBe(true);
    expect(JSON.parse(map.get(BASE) as string)).toEqual(LEGACY);
  });

  it("survives removeItem throwing — value kept under BOTH keys, nothing lost", () => {
    const map = new Map<string, string>([[BASE, JSON.stringify(LEGACY)]]);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
    };

    expect(() => loadTeamSubjectOrder(KEY_A, CATALOG)).not.toThrow();
    expect(map.has(KEY_A)).toBe(true);
    expect(map.has(BASE)).toBe(true); // migration missed, value intact
  });
});
