import { describe, it, expect } from "vitest";
import {
  createElement,
  StrictMode,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { mountReact } from "./mount-react";
import { useSubjectOrder } from "@/lib/subject-order";
import { NotebookProvider, useNotebookState } from "@/lib/notebook-state";
import {
  teamSubjectOrderStorageKey,
  useTeamSubjectOrder,
} from "@/lib/use-subject-settings";
import type { SubjectId } from "@/lib/types";

// Both subject-ORDER hooks carried the same switch-window defect the override
// key was fixed for: the storage key was namespaced, but React state SURVIVES
// a scope change, so between the render that resolves the new scope's key and
// the passive effect that loads it, the hook holds the PREVIOUS scope's order
// under the NEW scope's key. A move in that window persisted one grade's (or
// notebook's) arrangement under another's.
//
// lib/subject-order.ts's `move` carried a SECOND, independent defect on the
// same lines: the whole body ran inside a `setOrderState(prev => …)` updater
// with the localStorage write called from within it. Updaters must be pure —
// React invokes them more than once per dispatch under StrictMode, which is
// what these tests run under (measured: 2 invocations per click in this env).
//
// THE TWO ARE PROVEN SEPARATELY, ON PURPOSE. A single test that goes red could
// be satisfied by fixing either one, which would leave the impure write in
// place looking guarded. So:
//   • the scope defect is proven by WHAT is persisted (the previous scope's
//     arrangement appearing under the new key), and
//   • the impurity is proven by HOW MANY TIMES it is persisted (one keypress,
//     two setItem calls), which is unaffected by the scope fix.
// Each was verified by mutating that one property out and confirming THAT
// assertion — not merely some assertion — went red.

const CATALOG = ["math", "reading", "writing", "sel"] as SubjectId[];

// ── Instrumented storage ────────────────────────────────────────────────────
// mountReact's harness storage is a plain Map, so it cannot count calls. The
// hooks read `window.localStorage` at call time, so replacing it after mount
// is enough — and counting is the whole proof for the impurity.

interface StorageCalls {
  setItem: string[];
}

function instrumentStorage(store: Map<string, string>): StorageCalls {
  const calls: StorageCalls = { setItem: [] };
  (globalThis as unknown as { window: Record<string, unknown> }).window.localStorage =
    {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        calls.setItem.push(k);
        store.set(k, String(v));
      },
      removeItem: (k: string) => void store.delete(k),
    };
  return calls;
}

// ── Probe: lib/subject-order.ts (PERSONAL key, caller-supplied scope) ───────

/**
 * What `order` READ as during the pre-load frame, captured from a layout
 * effect that mutates nothing. Module-level so it can leave the tree.
 *
 * This exists because the first version of the "key-bound render" test did not
 * actually test the key-bound READ: it observed only the settled state after a
 * layout effect had already mutated, so it passed on the strength of the WRITE
 * guard and would have passed with the key-bound read deleted. Caught by the
 * §4a gate, not by me. The rule that would have caught it is the one already
 * written at the top of this file — mutate out the ONE property the test names
 * and confirm THAT assertion goes red — and it is now applied to the read
 * guard too.
 */
const observedOrderInWindow: string[] = [];

interface PersonalProps {
  scopeKey: string;
  /** Move a subject the instant `scopeKey` changes — i.e. inside the window. */
  moveOnScopeChange?: boolean;
  /** Record `order` in the window WITHOUT mutating — the read-guard probe. */
  observeOnScopeChange?: boolean;
  /** Override the catalog, to exercise the catalog axis of the same window. */
  catalog?: readonly SubjectId[];
  /**
   * Move the instant the CATALOG changes — the catalog axis's window.
   * Keyed on the catalog rather than the scope, and load-bearing for the same
   * reason `moveOnScopeChange` is: a plain re-render followed by a click does
   * NOT reach the window, because `act()` flushes the passive load effect
   * first. (My first draft of the catalog tests did exactly that and passed
   * with the fix removed — caught by counterfactual, not by reading it.)
   */
  moveOnCatalogChange?: boolean;
}

function PersonalProbe({
  scopeKey,
  moveOnScopeChange,
  observeOnScopeChange,
  catalog = CATALOG,
  moveOnCatalogChange,
}: PersonalProps): ReactNode {
  const { order, move } = useSubjectOrder({
    catalogOrder: catalog,
    scopeKey,
  });
  const first = useRef(true);
  const firstCatalog = useRef(true);

  // The CATALOG window: fires in the commit that first carries the new
  // catalog, before the passive effect re-reconciles the held order against it.
  useLayoutEffect(() => {
    if (firstCatalog.current) {
      firstCatalog.current = false;
      return;
    }
    if (moveOnCatalogChange) move("writing", "up");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // READ-ONLY window probe. Runs in the same commit as the stale render and
  // before the passive load effect, and touches nothing — so what it records is
  // exactly what the surface would have PAINTED in the pre-load frame.
  useLayoutEffect(() => {
    if (!observeOnScopeChange) return;
    observedOrderInWindow.push(order.join(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, catalog]);

  // Keyed on `scopeKey`, so it runs in the SAME commit that first carries the
  // NEW key — before the passive effect that loads that key's value. That
  // commit is the switch window's definition. (An "arm" button cannot reach
  // it: clicking flushes passive effects, so the load has already settled.
  // The first draft of this test did exactly that and armed the OLD scope.)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (moveOnScopeChange) move("sel", "up");
    // `move` is deliberately absent: the closure must be the one from the
    // stale render, which re-running on its identity would destroy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  return createElement(
    "div",
    null,
    createElement("span", { "data-order": order.join(",") }),
    createElement(
      "button",
      { "data-act": "move-writing-up", onClick: () => move("writing", "up") },
      "move",
    ),
  );
}

function PersonalRoot(props: PersonalProps): ReactNode {
  return createElement(StrictMode, null, createElement(PersonalProbe, props));
}

const personalKey = (scope: string): string =>
  `mycurricula:user:weekly-subject-order:${scope}`;

describe("useSubjectOrder (lib/subject-order.ts) — DEFECT 1: stale scope", () => {
  it("does not write grade A's arrangement under grade B's key", async () => {
    const h = await mountReact(PersonalRoot);
    try {
      await h.render({ scopeKey: "g5", moveOnScopeChange: true });

      const click = async (act: string): Promise<void> => {
        const el = h.query(`[data-act='${act}']`);
        if (!el) throw new Error(`no ${act} button — the test is lying`);
        await h.clickElement(el);
      };

      // Grade 5 gets a real reorder.
      await click("move-writing-up");
      expect(JSON.parse(h.storage.get(personalKey("g5")) as string)).toEqual([
        "math",
        "writing",
        "reading",
        "sel",
      ]);

      // Switch. The scope-keyed layout effect fires in the commit that carries
      // g6's key and g5's state, and moves from whatever it reads there.
      await h.render({ scopeKey: "g6", moveOnScopeChange: true });

      // g6 has never been reordered, so a move there must be measured against
      // the CANONICAL order — never against g5's saved arrangement.
      const storedG6 = JSON.parse(h.storage.get(personalKey("g6")) as string);
      expect(storedG6).toEqual(["math", "reading", "sel", "writing"]);
      // Stated the other way round, so the intent survives a catalog change:
      // g5's arrangement must not appear under g6.
      expect(storedG6).not.toEqual(["math", "writing", "sel", "reading"]);

      // ...and g5 is untouched by the move made under g6.
      expect(JSON.parse(h.storage.get(personalKey("g5")) as string)).toEqual([
        "math",
        "writing",
        "reading",
        "sel",
      ]);
    } finally {
      await h.unmount();
    }
  });
});

describe("useSubjectOrder (lib/subject-order.ts) — DEFECT 3: the key-bound READ", () => {
  it("paints the canonical order in the pre-load frame, not grade A's", async () => {
    observedOrderInWindow.length = 0;
    const h = await mountReact(PersonalRoot);
    try {
      await h.render({ scopeKey: "g5", observeOnScopeChange: true });

      const el = h.query("[data-act='move-writing-up']");
      if (!el) throw new Error("no move button — the test is lying");
      await h.clickElement(el);
      expect(h.query("[data-order]")?.getAttribute("data-order")).toBe(
        "math,writing,reading,sel",
      );

      // Switch WITHOUT mutating. Nothing in this test writes, so a passing
      // result cannot be borrowed from the write guard — the only thing that
      // can produce it is the key-bound read.
      observedOrderInWindow.length = 0;
      await h.render({ scopeKey: "g6", observeOnScopeChange: true });

      expect(observedOrderInWindow).toEqual(["math,reading,writing,sel"]);
      expect(observedOrderInWindow[0]).not.toBe("math,writing,reading,sel");
    } finally {
      await h.unmount();
    }
  });
});

describe("useSubjectOrder (lib/subject-order.ts) — DEFECT 4: stale CATALOG", () => {
  it("does not persist an order that omits a newly added subject", async () => {
    const WIDER = [...CATALOG, "grammar"] as SubjectId[];
    const h = await mountReact(PersonalRoot);
    try {
      await h.render({ scopeKey: "g5", moveOnScopeChange: false });
      const el = h.query("[data-act='move-writing-up']");
      if (!el) throw new Error("no move button — the test is lying");
      await h.clickElement(el);

      // The catalog grows while the KEY stays the same — so the stamp still
      // matches and the held order is a permutation of the OLD catalog. The
      // move happens INSIDE that commit (moveOnCatalogChange), before the
      // passive effect re-reconciles; a click after the re-render would miss
      // the window entirely.
      await h.render({
        scopeKey: "g5",
        catalog: WIDER,
        moveOnCatalogChange: true,
      });

      const stored = JSON.parse(h.storage.get(personalKey("g5")) as string);
      expect([...stored].sort()).toEqual([...WIDER].sort());
      expect(stored).toContain("grammar");
    } finally {
      await h.unmount();
    }
  });
});

describe("useSubjectOrder (lib/subject-order.ts) — DEFECT 2: impure write", () => {
  it("persists ONCE per move, not once per updater invocation", async () => {
    const h = await mountReact(PersonalRoot);
    try {
      await h.render({ scopeKey: "g5" });
      const calls = instrumentStorage(h.storage);

      const el = h.query("[data-act='move-writing-up']");
      if (!el) throw new Error("no move button — the test is lying");
      await h.clickElement(el);

      // ONE keypress, ONE write. The old code called writeStoredOrder from
      // inside a setState updater, and React double-invokes updaters under
      // StrictMode — so this was 2. Independent of DEFECT 1: the value
      // written was correct, it was simply written twice.
      expect(calls.setItem.filter((k) => k === personalKey("g5"))).toHaveLength(
        1,
      );
    } finally {
      await h.unmount();
    }
  });
});

// ── Probe: useTeamSubjectOrder (TEAM key, scope resolved internally) ────────

const NOTEBOOKS = [
  { gradeLevelId: "nb-alpha", name: "Grade 5", isActive: true },
  { gradeLevelId: "nb-beta", name: "Grade 6", isActive: true },
] as const;

function TeamProbe(): ReactNode {
  const { activeNotebookId, setActiveNotebookId } = useNotebookState();
  const { order, moveSubject } = useTeamSubjectOrder({ catalogOrder: CATALOG });
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    if (!armed) return;
    moveSubject("sel", "up");
    setArmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  return createElement(
    "div",
    null,
    createElement("span", {
      "data-order": order.join(","),
      "data-scope": activeNotebookId,
    }),
    createElement(
      "button",
      {
        "data-act": "move-writing-up",
        onClick: () => moveSubject("writing", "up"),
      },
      "move",
    ),
    createElement(
      "button",
      {
        "data-act": "switch-and-arm",
        onClick: () => {
          setActiveNotebookId(NOTEBOOKS[1].gradeLevelId);
          setArmed(true);
        },
      },
      "switch and arm",
    ),
  );
}

function TeamRoot(): ReactNode {
  return createElement(NotebookProvider, {
    notebooks: NOTEBOOKS,
    workspaceName: "Test Workspace",
    children: createElement(TeamProbe),
  });
}

/** Switches notebook and OBSERVES the window without mutating — the read-guard
 *  probe. Kept separate from TeamProbe so no write can carry its assertion. */
function TeamObserverProbe(): ReactNode {
  const { activeNotebookId, setActiveNotebookId } = useNotebookState();
  const { order, moveSubject } = useTeamSubjectOrder({ catalogOrder: CATALOG });

  useLayoutEffect(() => {
    observedOrderInWindow.push(order.join(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotebookId]);

  return createElement(
    "div",
    null,
    createElement("span", {
      "data-order": order.join(","),
      "data-scope": activeNotebookId,
    }),
    createElement(
      "button",
      {
        "data-act": "move-writing-up",
        onClick: () => moveSubject("writing", "up"),
      },
      "move",
    ),
    createElement(
      "button",
      {
        "data-act": "switch-only",
        onClick: () => setActiveNotebookId(NOTEBOOKS[1].gradeLevelId),
      },
      "switch",
    ),
  );
}

function TeamObserverRoot(): ReactNode {
  return createElement(NotebookProvider, {
    notebooks: NOTEBOOKS,
    workspaceName: "Test Workspace",
    children: createElement(TeamObserverProbe),
  });
}

/** Same notebook throughout; only the CALLER'S catalog grows. */
function TeamCatalogProbe({ wide }: { wide: boolean }): ReactNode {
  const catalog = wide ? ([...CATALOG, "grammar"] as SubjectId[]) : CATALOG;
  const { order, moveSubject } = useTeamSubjectOrder({ catalogOrder: catalog });
  const firstCatalog = useRef(true);

  // Mutate INSIDE the commit that first carries the wider catalog — before the
  // passive effect re-reconciles the held order. A click after the re-render
  // is too late; `act()` has already flushed the load.
  useLayoutEffect(() => {
    if (firstCatalog.current) {
      firstCatalog.current = false;
      return;
    }
    // Moves the LAST subject of the OLD catalog DOWNWARD. That target is
    // chosen, not incidental — see the test for why a "drops a subject"
    // assertion cannot fail here.
    moveSubject("sel", "down");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide]);

  return createElement(
    "div",
    null,
    createElement("span", { "data-order": order.join(",") }),
    createElement(
      "button",
      {
        "data-act": "move-writing-up",
        onClick: () => moveSubject("writing", "up"),
      },
      "move",
    ),
  );
}

function TeamCatalogRoot({ wide }: { wide: boolean }): ReactNode {
  return createElement(NotebookProvider, {
    notebooks: [NOTEBOOKS[0]],
    workspaceName: "Test Workspace",
    children: createElement(TeamCatalogProbe, { wide }),
  });
}

describe("useTeamSubjectOrder — the notebook-switch window", () => {
  it("does not write notebook A's arrangement under notebook B's key", async () => {
    const h = await mountReact(TeamRoot);
    try {
      await h.render({});

      const click = async (act: string): Promise<void> => {
        const el = h.query(`[data-act='${act}']`);
        if (!el) throw new Error(`no ${act} button — the test is lying`);
        await h.clickElement(el);
      };

      await click("move-writing-up");
      const keyA = teamSubjectOrderStorageKey("nb-alpha");
      const keyB = teamSubjectOrderStorageKey("nb-beta");
      expect(JSON.parse(h.storage.get(keyA) as string)).toEqual([
        "math",
        "writing",
        "reading",
        "sel",
      ]);

      // Switch and mutate inside the window, in one commit.
      await click("switch-and-arm");

      const storedB = JSON.parse(h.storage.get(keyB) as string);
      expect(storedB).toEqual(["math", "reading", "sel", "writing"]);
      expect(storedB).not.toEqual(["math", "writing", "sel", "reading"]);
      expect(JSON.parse(h.storage.get(keyA) as string)).toEqual([
        "math",
        "writing",
        "reading",
        "sel",
      ]);
    } finally {
      await h.unmount();
    }
  });

  it("paints the canonical order in the pre-load frame, not notebook A's", async () => {
    // THE READ GUARD, ON ITS OWN. The earlier version of this test switched
    // AND mutated, then asserted the settled state — so it was carried by the
    // write guard and would have passed with the key-bound read deleted (§4a
    // gate, Medium 3). This one mutates nothing after the switch: the observer
    // is a layout effect in the stale commit, so the only thing that can
    // satisfy it is the key-bound read.
    observedOrderInWindow.length = 0;
    const h = await mountReact(TeamObserverRoot);
    try {
      await h.render({});
      const click = async (act: string): Promise<void> => {
        const el = h.query(`[data-act='${act}']`);
        if (!el) throw new Error(`no ${act} button — the test is lying`);
        await h.clickElement(el);
      };
      await click("move-writing-up");
      expect(h.query("[data-order]")?.getAttribute("data-order")).toBe(
        "math,writing,reading,sel",
      );

      observedOrderInWindow.length = 0;
      await click("switch-only");

      expect(observedOrderInWindow).toEqual(["math,reading,writing,sel"]);
      expect(observedOrderInWindow[0]).not.toBe("math,writing,reading,sel");
      expect(h.query("[data-scope]")?.getAttribute("data-scope")).toBe(
        "nb-beta",
      );
    } finally {
      await h.unmount();
    }
  });

  it("can move past a subject the catalog gained in this very commit", async () => {
    // THE TEAM HOOK'S CATALOG AXIS IS NARROWER THAN THE PERSONAL ONE, and the
    // difference is worth stating because it changes what can be asserted.
    //
    // `commit` already runs `normalizeSubjectOrder(ids, stableCatalog)` before
    // persisting, so a stale-catalog base can NEVER drop a subject here — the
    // new id is appended on the way out. The "omits a newly added subject"
    // assertion used for lib/subject-order.ts is therefore UNFALSIFIABLE
    // against this hook; a version of this test written that way passed with
    // the fix removed, and was only caught by the counterfactual.
    //
    // What a stale base still costs is a BOUNDARY move: `sel` is last in the
    // old catalog, so an un-normalized base makes "move down" a no-op that
    // returns false and writes nothing, when the live catalog has `grammar`
    // sitting after it. That is the residue, and it is what this asserts.
    const h = await mountReact(TeamCatalogRoot);
    try {
      await h.render({ wide: false });
      await h.clickElement(h.query("[data-act='move-writing-up']") as Element);
      expect(
        JSON.parse(h.storage.get(teamSubjectOrderStorageKey("nb-alpha")) as string),
      ).toEqual(["math", "writing", "reading", "sel"]);

      // The widening commit itself performs the move (see TeamCatalogProbe).
      await h.render({ wide: true });

      const stored = JSON.parse(
        h.storage.get(teamSubjectOrderStorageKey("nb-alpha")) as string,
      );
      // `sel` moved past the newly-added `grammar` rather than dead-ending at
      // the old catalog's boundary.
      expect(stored).toEqual([
        "math",
        "writing",
        "reading",
        "grammar",
        "sel",
      ]);
    } finally {
      await h.unmount();
    }
  });
});
