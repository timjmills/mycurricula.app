// unit-write-queue.test.ts — deterministic coverage of the B1.7 unit-write
// concurrency contract (lib/planner/unit-write-queue.ts). This is the flag-ON
// persist path the §4a gate scrutinized across two rounds; it can't be triggered
// on the mock dev server (flag OFF short-circuits before the queue) and the repo
// has no React test-DOM harness, so the queue was extracted as a pure DI module
// and is driven here with a fake, controllable client.

import { describe, expect, it, vi } from "vitest";
import {
  createUnitWriteQueue,
  staleUnitPatchKeys,
} from "@/lib/planner/unit-write-queue";
import type { UnitPatch } from "@/lib/planner/source";
import type { Unit } from "@/lib/types";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush microtasks + the reconcile's macrotask boundary. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const U = (over: Partial<Unit> = {}): Unit => ({
  id: "u1",
  subject: "math",
  name: "U",
  weeks: "Wk 1",
  shade: 2,
  ...over,
});

/** A controllable fake client: each updateUnitFields call parks a deferred so
 *  the test decides when (and whether) it resolves/rejects. */
function makeRig(opts?: { canWrite?: () => boolean }) {
  const sends: { unitId: string; patch: UnitPatch; d: ReturnType<typeof deferred<Unit>> }[] = [];
  const reconciled: { unitId: string; unit: Unit }[] = [];
  const retained = new Map<string, UnitPatch>(); // §4a R5 H2 failed-write holder
  const queue = createUnitWriteQueue({
    updateUnitFields: (unitId, patch) => {
      const d = deferred<Unit>();
      sends.push({ unitId, patch, d });
      return d.promise;
    },
    // CONFIRM-ONLY: reconcile fires ONLY on a confirmed write's canonical row —
    // and it receives that ROW WHOLE, never a `UnitPatch` projection of it (the
    // projection cannot carry the source-derived `Unit.weeks`; see
    // tests/unit-week-label-reconcile.test.ts).
    reconcile: (unitId, unit) => reconciled.push({ unitId, unit }),
    canWrite: opts?.canWrite ?? (() => true),
    onError: () => {}, // swallow the expected console.error in tests
    retainFailed: (unitId, patch) =>
      retained.set(unitId, { ...(retained.get(unitId) ?? {}), ...patch }),
    // FIELD-WISE (§4a R6 H2-B): mirror the store — clear only the confirmed
    // fields; drop the entry only when nothing retained remains.
    clearFailed: (unitId, confirmedPatch) => {
      const cur = retained.get(unitId);
      if (!cur) return;
      const next = { ...cur };
      for (const key of Object.keys(confirmedPatch) as (keyof UnitPatch)[]) {
        delete next[key];
      }
      if (Object.keys(next).length === 0) retained.delete(unitId);
      else retained.set(unitId, next);
    },
  });
  return { queue, sends, reconciled, retained };
}

describe("unit-write-queue — serialize + coalesce (R1 H2)", () => {
  it("keeps one in-flight per unit and coalesces newer patches, draining in order", async () => {
    const { queue, sends } = makeRig();
    const rA = vi.fn();
    const rB = vi.fn();

    queue.enqueue("u1", { notes: "A" }, rA); // send #1 starts
    queue.enqueue("u1", { bigIdea: "B" }); // coalesced (in-flight)
    queue.enqueue("u1", { bigIdea: "B2" }, rB); // coalesced → overwrites bigIdea

    expect(sends).toHaveLength(1);
    expect(sends[0].patch).toEqual({ notes: "A" });

    sends[0].d.resolve(U({ notes: "A" }));
    await tick();

    // The coalesced pending drains as ONE send, latest value wins.
    expect(sends).toHaveLength(2);
    expect(sends[1].patch).toEqual({ bigIdea: "B2" });
    sends[1].d.resolve(U({ notes: "A", bigIdea: "B2" }));
    await tick();
    expect(sends).toHaveLength(2); // fully drained
    // PER-REQUEST callbacks (§4a R5 M3): each dispatched send reports on ITS OWN
    // result — rA for send #1, rB for the coalesced send #2 — so a settling send
    // never fires a different request's callback.
    expect(rA).toHaveBeenCalledWith(true);
    expect(rB).toHaveBeenCalledWith(true);
  });

  it("a second unit runs its own independent in-flight slot", async () => {
    const { queue, sends } = makeRig();
    queue.enqueue("u1", { notes: "A" });
    queue.enqueue("u2", { notes: "X" });
    expect(sends).toHaveLength(2); // different units → both may be in flight
    expect(sends.map((s) => s.unitId).sort()).toEqual(["u1", "u2"]);
  });
});

describe("unit-write-queue — confirm-only: catalog written ONLY on confirmed writes (R4)", () => {
  it("success dispatches ONLY the confirmed canonical row into the catalog", async () => {
    const { queue, sends, reconciled } = makeRig();
    queue.enqueue("u1", { bigIdea: "B" });
    expect(reconciled).toHaveLength(0); // nothing optimistic before confirmation
    sends[0].d.resolve(U({ bigIdea: "B" }));
    await tick();
    expect(reconciled).toEqual([{ unitId: "u1", unit: U({ bigIdea: "B" }) }]);
  });

  it("a FAILED write leaves the catalog untouched — no reconcile, no revert (dissolves the stale-optimistic class)", async () => {
    const { queue, sends, reconciled } = makeRig();
    const rB = vi.fn();
    queue.enqueue("u1", { bigIdea: "B" }, rB);
    sends[0].d.reject(new Error("RLS denied"));
    await tick();
    expect(reconciled).toHaveLength(0); // catalog was never dirtied → nothing to undo
    expect(rB).toHaveBeenLastCalledWith(false); // failure surfaced
  });

  it("A confirmed then B fails: A's canonical stands, B never touches the catalog", async () => {
    const { queue, sends, reconciled } = makeRig();
    queue.enqueue("u1", { notes: "A" }); // send #1
    sends[0].d.resolve(U({ notes: "A" })); // A confirmed → reconcile A
    await tick();
    expect(reconciled).toEqual([
      { unitId: "u1", unit: U({ notes: "A" }) },
    ]);

    const rB = vi.fn();
    queue.enqueue("u1", { bigIdea: "B" }, rB); // send #2
    sends[1].d.reject(new Error("RLS denied")); // B fails → NO catalog change
    await tick();
    // Still only A's reconcile — B never dispatched (A is intact by construction).
    expect(reconciled).toEqual([
      { unitId: "u1", unit: U({ notes: "A" }) },
    ]);
    expect(rB).toHaveBeenLastCalledWith(false);
  });

  it("a failed in-flight write still retries a newer pending edit; each reconciles only on its OWN success", async () => {
    const { queue, sends, reconciled } = makeRig();
    queue.enqueue("u1", { notes: "A" }); // send #1 (in-flight)
    queue.enqueue("u1", { bigIdea: "B" }); // coalesced pending
    sends[0].d.reject(new Error("transient")); // #1 fails → NO reconcile
    await tick();
    expect(reconciled).toHaveLength(0);
    expect(sends).toHaveLength(2); // B retried (serialized)
    expect(sends[1].patch).toEqual({ bigIdea: "B" });
    sends[1].d.resolve(U({ bigIdea: "B" })); // #2 confirmed → reconcile only now
    await tick();
    expect(reconciled).toEqual([
      { unitId: "u1", unit: U({ bigIdea: "B" }) },
    ]);
  });
});

describe("unit-write-queue — mode gate re-checked at send time (R2 H2)", () => {
  it("drops a queued write (surfacing it) when the mode leaves Team before it drains", async () => {
    let canWrite = true;
    const { queue, sends, reconciled } = makeRig({ canWrite: () => canWrite });
    const rB = vi.fn();

    queue.enqueue("u1", { notes: "A" }); // send #1 (in-flight)
    queue.enqueue("u1", { bigIdea: "B" }, rB); // coalesced pending
    canWrite = false; // user switches Team → Personal

    sends[0].d.resolve(U({ notes: "A" }));
    await tick();

    // B must NOT be sent (gate re-checked at drain) and the drop is surfaced;
    // only A (confirmed before the switch) reached the catalog — B never did.
    expect(sends).toHaveLength(1);
    expect(rB).toHaveBeenLastCalledWith(false);
    expect(reconciled).toEqual([
      { unitId: "u1", unit: U({ notes: "A" }) },
    ]);
  });

  it("does not even start a first send when the mode is already not Team", async () => {
    const { queue, sends } = makeRig({ canWrite: () => false });
    const r = vi.fn();
    queue.enqueue("u1", { notes: "A" }, r);
    await tick();
    expect(sends).toHaveLength(0);
    expect(r).toHaveBeenCalledWith(false);
  });
});

describe("unit-write-queue — per-request callback (R5 M3)", () => {
  it("a settling request invokes ITS OWN callback, not a later request's", async () => {
    const { queue, sends } = makeRig();
    const rA = vi.fn();
    const rB = vi.fn();

    queue.enqueue("u1", { notes: "A" }, rA); // send #1 (in-flight), callback rA
    queue.enqueue("u1", { bigIdea: "B" }, rB); // coalesced pending, callback rB

    // A settles: it must call rA — NOT rB (rB's request hasn't been sent yet, so
    // rB's "Saving" must not be cleared by A's settlement).
    sends[0].d.resolve(U({ notes: "A" }));
    await tick();
    expect(rA).toHaveBeenCalledWith(true);
    expect(rB).not.toHaveBeenCalled();

    // Now B drains and settles → rB fires with its own result.
    expect(sends).toHaveLength(2);
    sends[1].d.resolve(U({ notes: "A", bigIdea: "B" }));
    await tick();
    expect(rB).toHaveBeenCalledWith(true);
  });
});

describe("unit-write-queue — failed-write retention outside the component (R5 H2)", () => {
  it("retains a failed patch keyed by unit, and CLEARS it on a later confirmed write", async () => {
    const { queue, sends, retained } = makeRig();

    queue.enqueue("u1", { bigIdea: "B" });
    sends[0].d.reject(new Error("failed after unmount"));
    await tick();
    // The failed patch survives outside the (now-unmounted) component.
    expect(retained.get("u1")).toEqual({ bigIdea: "B" });

    // A later confirmed write for the unit supersedes + clears the retained patch.
    queue.enqueue("u1", { bigIdea: "B-retry" });
    expect(sends).toHaveLength(2);
    sends[1].d.resolve(U({ bigIdea: "B-retry" }));
    await tick();
    expect(retained.has("u1")).toBe(false);
  });

  it("merges successive failures for the same unit (no lost fields)", async () => {
    const { queue, sends, retained } = makeRig();
    queue.enqueue("u1", { bigIdea: "B" });
    sends[0].d.reject(new Error("fail 1"));
    await tick();
    queue.enqueue("u1", { notes: "N" });
    sends[1].d.reject(new Error("fail 2"));
    await tick();
    expect(retained.get("u1")).toEqual({ bigIdea: "B", notes: "N" });
  });

  it("clears retained fields FIELD-WISE — a notes success keeps a failed bigIdea (R6 H2-B)", async () => {
    const { queue, sends, retained } = makeRig();
    // A bigIdea write fails and is retained.
    queue.enqueue("u1", { bigIdea: "B" });
    sends[0].d.reject(new Error("bigIdea failed"));
    await tick();
    expect(retained.get("u1")).toEqual({ bigIdea: "B" });

    // A DIFFERENT field (notes) then succeeds — it must NOT drop the still-
    // unconfirmed bigIdea retry (the whole-patch clear bug, R6 H2-B).
    queue.enqueue("u1", { notes: "N" });
    sends[1].d.resolve(U({ notes: "N" }));
    await tick();
    expect(retained.get("u1")).toEqual({ bigIdea: "B" });

    // Confirming bigIdea itself finally clears the entry.
    queue.enqueue("u1", { bigIdea: "B2" });
    sends[2].d.resolve(U({ bigIdea: "B2" }));
    await tick();
    expect(retained.has("u1")).toBe(false);
  });
});

// ── Retry staleness ────────────────────────────────────────────────────────
// A retained failed patch outlives the editor that authored it — that is the
// point (§4a R5 H2). It also outlives a RE-HYDRATE, which is where it turns
// dangerous. Units are TEAM content, so re-sending a stale patch reverts a value
// for everyone, and because the retry genuinely commits, `onResult(true)` clears
// the banner and it reads as success. `staleUnitPatchKeys` is what stops that.

describe("staleUnitPatchKeys — the retry guard", () => {
  it("reports nothing when the unit has not moved since the failure", () => {
    expect(
      staleUnitPatchKeys(
        { bigIdea: "A" },
        { bigIdea: "orig" },
        { bigIdea: "orig" },
      ),
    ).toEqual([]);
  });

  it("reports a field a teammate changed after the write failed", () => {
    // A queued "A" fails; a re-hydrate brings in B's "C"; Retry must NOT
    // overwrite "C" with "A" — text that was never on screen at retry time.
    expect(
      staleUnitPatchKeys({ bigIdea: "A" }, { bigIdea: "orig" }, { bigIdea: "C" }),
    ).toEqual(["bigIdea"]);
  });

  it("reports only the MOVED fields, so the rest of the retry still goes", () => {
    expect(
      staleUnitPatchKeys(
        { bigIdea: "A", notes: "N" },
        { bigIdea: "orig", notes: "n0" },
        { bigIdea: "C", notes: "n0" },
      ),
    ).toEqual(["bigIdea"]);
  });

  it("treats a value that APPEARED as stale", () => {
    // Baseline absent (the field was unset), current set → someone filled it in.
    expect(staleUnitPatchKeys({ notes: "N" }, {}, { notes: "theirs" })).toEqual([
      "notes",
    ]);
  });

  it("treats a value that was CLEARED as stale", () => {
    expect(staleUnitPatchKeys({ notes: "N" }, { notes: "was" }, {})).toEqual([
      "notes",
    ]);
  });

  it("compares structurally, not by reference", () => {
    // The catalog rebuilds unit objects on every confirmed write, so reference
    // equality would report every array/object field as moved and refuse every
    // retry — the guard would silently become a blanket "never retry".
    expect(
      staleUnitPatchKeys(
        { vocab: [{ term: "t", definition: "d" }] },
        { vocab: [{ term: "was", definition: "d0" }] },
        { vocab: [{ term: "was", definition: "d0" }] },
      ),
    ).toEqual([]);
  });

  it("detects a real change inside an object field", () => {
    expect(
      staleUnitPatchKeys(
        { vocab: [{ term: "t", definition: "d" }] },
        { vocab: [{ term: "was", definition: "d0" }] },
        { vocab: [{ term: "theirs", definition: "d0" }] },
      ),
    ).toEqual(["vocab"]);
  });

  it("ignores fields the retry does not carry", () => {
    // A teammate editing an UNRELATED field must not block this retry.
    expect(
      staleUnitPatchKeys(
        { bigIdea: "A" },
        { bigIdea: "orig", notes: "n0" },
        { bigIdea: "orig", notes: "theirs" },
      ),
    ).toEqual([]);
  });
});
