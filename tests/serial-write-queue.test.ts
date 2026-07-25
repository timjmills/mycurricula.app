import { describe, it, expect, vi } from "vitest";
import {
  createSerialWriteQueue,
  SerialWriteTimeoutError,
} from "@/lib/planner/serial-write-queue";

// The queue is the planner's write-durability mechanism: a regression here loses
// teacher edits silently, and only on reload. Every test therefore drives real
// promise timing with manually-settled deferreds rather than asserting shape.

/** A promise plus the handles to settle it, so a test controls completion order. */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (the Promise.resolve → send → catch → then drain chain)
 *  run to completion. Each queued send costs several microtask hops and a drain
 *  can chain sends, so this is deliberately generous — too few ticks makes a
 *  correct queue look like it stalled. */
async function flush(): Promise<void> {
  for (let i = 0; i < 32; i += 1) await Promise.resolve();
}

describe("createSerialWriteQueue — ordering", () => {
  it("never has two requests in flight for one key", async () => {
    const first = deferred();
    const second = deferred();
    const sent: string[] = [];
    let call = 0;
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
    });

    q.enqueue("k", "a");
    q.enqueue("k", "b");
    await flush();
    // "b" must wait: only "a" has been sent.
    expect(sent).toEqual(["a"]);

    first.resolve();
    await flush();
    expect(sent).toEqual(["a", "b"]);
  });

  it("persists the LAST enqueued payload even when sends settle out of order", async () => {
    // The bug this queue exists to prevent: a slow early request committing
    // after a later one, leaving the store holding stale text.
    const slow = deferred();
    const fast = deferred();
    const committed: string[] = [];
    let call = 0;
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        call += 1;
        const d = call === 1 ? slow : fast;
        return d.promise.then(() => {
          committed.push(p);
        });
      },
    });

    q.enqueue("k", "Qu");
    await flush();
    q.enqueue("k", "Quiz");
    // The later payload cannot overtake: it has not even been sent yet.
    fast.resolve();
    await flush();
    expect(committed).toEqual([]);

    slow.resolve();
    await flush();
    expect(committed).toEqual(["Qu", "Quiz"]);
    expect(committed[committed.length - 1]).toBe("Quiz");
  });
});

describe("createSerialWriteQueue — latest-wins coalescing", () => {
  it("collapses every payload queued behind an in-flight request into the last", async () => {
    const inflight = deferred();
    const sent: string[] = [];
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        return sent.length === 1 ? inflight.promise : Promise.resolve();
      },
    });

    q.enqueue("k", "a");
    q.enqueue("k", "b");
    q.enqueue("k", "c");
    q.enqueue("k", "d");
    inflight.resolve();
    await flush();

    // b and c are superseded — never sent. Intermediate states are skippable
    // because each payload is the complete current value for its key.
    expect(sent).toEqual(["a", "d"]);
  });
});

describe("createSerialWriteQueue — key isolation", () => {
  it("runs different keys concurrently", async () => {
    const a = deferred();
    const sent: string[] = [];
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        return p === "a1" ? a.promise : Promise.resolve();
      },
    });

    q.enqueue("ka", "a1");
    q.enqueue("kb", "b1");
    await flush();
    // kb is NOT blocked by ka's in-flight request — independent fields must not
    // serialize behind each other.
    expect(sent).toEqual(["a1", "b1"]);
    a.resolve();
  });

  it("keeps two payloads under different keys from evicting each other", async () => {
    // The cross-target hazard: a shared slot would let the newer payload replace
    // the older one, losing an unrelated edit outright.
    const gate = deferred();
    const sent: Array<{ target: string; value: string }> = [];
    const q = createSerialWriteQueue<{ target: string; value: string }>({
      send: (p) => {
        sent.push(p);
        return gate.promise;
      },
    });

    q.enqueue("lesson-a::title", { target: "lesson-a", value: "A" });
    q.enqueue("lesson-b::title", { target: "lesson-b", value: "B" });
    gate.resolve();
    await flush();

    expect(sent).toEqual([
      { target: "lesson-a", value: "A" },
      { target: "lesson-b", value: "B" },
    ]);
  });

  it("sends each payload to the target the payload itself names", async () => {
    // Guards the structural fix: `send` must read the target off the payload,
    // never off a value captured when the slot was created.
    const gate = deferred();
    const seen: string[] = [];
    const q = createSerialWriteQueue<{ target: string }>({
      send: (p) => {
        seen.push(p.target);
        return seen.length === 1 ? gate.promise : Promise.resolve();
      },
    });

    q.enqueue("shared", { target: "lesson-a" });
    q.enqueue("shared", { target: "lesson-b" });
    gate.resolve();
    await flush();

    expect(seen).toEqual(["lesson-a", "lesson-b"]);
  });
});

describe("createSerialWriteQueue — failure handling", () => {
  it("still drains the pending payload after a rejected send", async () => {
    const failing = deferred();
    const sent: string[] = [];
    const onError = vi.fn();
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        return sent.length === 1 ? failing.promise : Promise.resolve();
      },
      onError,
    });

    q.enqueue("k", "first");
    q.enqueue("k", "second");
    failing.reject(new Error("network down"));
    await flush();

    // A failed write must not wedge the key: the newer payload supersedes it.
    expect(sent).toEqual(["first", "second"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe("first");
  });

  it("never rejects out of enqueue when send REJECTS and no onError is given", async () => {
    const q = createSerialWriteQueue<string>({
      send: () => Promise.reject(new Error("boom")),
    });
    expect(() => q.enqueue("k", "a")).not.toThrow();
    await flush();
  });

  it("treats a SYNCHRONOUS throw from send as a failure, not an escape", async () => {
    // A send that throws before returning a promise must not escape enqueue to
    // the caller, and must not leave the key marked in-flight.
    const onError = vi.fn();
    const q = createSerialWriteQueue<string>({
      send: () => {
        throw new Error("client blew up synchronously");
      },
      onError,
    });

    expect(() => q.enqueue("k", "a")).not.toThrow();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    // And critically: the key is released, not wedged in-flight forever.
    expect(q.activeKeyCount()).toBe(0);
  });

  it("does NOT wedge the key when onError itself throws", async () => {
    // The subtle one: a `.catch(...).then(...)` chain skips its trailing then
    // when the catch handler throws, leaving inFlight true forever — every
    // later edit to that key silently dropped, with the rejection swallowed.
    const sent: string[] = [];
    let call = 0;
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        call += 1;
        return call === 1 ? Promise.reject(new Error("net")) : Promise.resolve();
      },
      onError: () => {
        throw new Error("the reporter itself is broken");
      },
    });

    q.enqueue("k", "first");
    q.enqueue("k", "second");
    await flush();

    // The queue kept draining despite the broken reporter…
    expect(sent).toEqual(["first", "second"]);
    // …and the key was released rather than left in-flight forever.
    expect(q.activeKeyCount()).toBe(0);

    // And a later write still goes out — proof the key is not wedged.
    q.enqueue("k", "third");
    await flush();
    expect(sent).toEqual(["first", "second", "third"]);
  });

  it("keeps draining after a synchronous throw", async () => {
    const sent: string[] = [];
    let call = 0;
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        call += 1;
        if (call === 1) throw new Error("sync boom");
        sent.push(p);
        return Promise.resolve();
      },
      onError: () => {},
    });

    q.enqueue("k", "first");
    q.enqueue("k", "second");
    await flush();
    // The failed payload must not block the newer one behind it.
    expect(sent).toEqual(["second"]);
    expect(q.activeKeyCount()).toBe(0);
  });
});

describe("createSerialWriteQueue — slot lifecycle", () => {
  it("releases a key once it settles with nothing pending", async () => {
    const q = createSerialWriteQueue<string>({ send: () => Promise.resolve() });
    q.enqueue("k", "a");
    expect(q.activeKeyCount()).toBe(1);
    await flush();
    // A long editing session must not retain one slot per field touched.
    expect(q.activeKeyCount()).toBe(0);
  });

  it("retains a key while a payload is still pending behind an in-flight send", async () => {
    const gate = deferred();
    const q = createSerialWriteQueue<string>({
      send: () => gate.promise,
    });
    q.enqueue("k", "a");
    q.enqueue("k", "b");
    expect(q.activeKeyCount()).toBe(1);
    gate.resolve();
    await flush();
    expect(q.activeKeyCount()).toBe(0);
  });
});

// ── The watchdog ──────────────────────────────────────────────────────────
// The contract above assumes every send eventually settles. A send that NEVER
// settles used to wedge its key permanently: `inFlight` stayed true, every later
// payload parked in `pending` and was never sent, and nothing was logged —
// because nothing failed. That is the exact silent loss this module exists to
// prevent, made permanent for the rest of the session. These pin the bound.
//
// Timers are INJECTED so the tests are deterministic: `fire()` is the timeout
// arriving, with no wall-clock wait and no reliance on fake-timer ordering
// against the promise chain.

/** A controllable timer pair: `fire()` runs the pending callback on demand. */
function manualTimers(): {
  timers: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (h: unknown) => void;
  };
  fire: () => void;
  pending: () => number;
} {
  const scheduled = new Map<number, () => void>();
  let next = 1;
  return {
    timers: {
      setTimeout: (fn: () => void) => {
        const id = next;
        next += 1;
        scheduled.set(id, fn);
        return id;
      },
      clearTimeout: (h: unknown) => {
        scheduled.delete(h as number);
      },
    },
    fire: () => {
      for (const [id, fn] of [...scheduled]) {
        scheduled.delete(id);
        fn();
      }
    },
    pending: () => scheduled.size,
  };
}

describe("createSerialWriteQueue — hung-send watchdog", () => {
  it("releases a key whose send never settles, and drains what was pending", async () => {
    const { timers, fire } = manualTimers();
    const sent: string[] = [];
    let call = 0;
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        call += 1;
        // The first send NEVER settles — a black-holed request.
        return call === 1 ? new Promise<void>(() => {}) : Promise.resolve();
      },
      onError: () => {},
      timeoutMs: 20_000,
      timers,
    });

    q.enqueue("k", "a");
    q.enqueue("k", "b");
    await flush();
    // Before the timeout, "b" correctly waits behind the in-flight "a".
    expect(sent).toEqual(["a"]);

    fire(); // the watchdog fires
    await flush();
    // WITHOUT the watchdog this stayed ["a"] forever and "b" was lost.
    expect(sent).toEqual(["a", "b"]);
    expect(q.activeKeyCount()).toBe(0);
  });

  it("reports the timeout through onError with the payload that hung", async () => {
    const { timers, fire } = manualTimers();
    const seen: { error: unknown; payload: string }[] = [];
    const q = createSerialWriteQueue<string>({
      send: () => new Promise<void>(() => {}),
      onError: (error, payload) => seen.push({ error, payload }),
      timeoutMs: 20_000,
      timers,
    });

    q.enqueue("k", "a");
    await flush();
    expect(seen).toEqual([]);

    fire();
    await flush();
    // Silence is the failure mode being fixed — the drop must be surfaced.
    expect(seen).toHaveLength(1);
    expect(seen[0].payload).toBe("a");
    expect(seen[0].error).toBeInstanceOf(SerialWriteTimeoutError);
    expect((seen[0].error as Error).message).toContain("k");
  });

  it("does not fire the watchdog for a send that settles normally", async () => {
    const { timers, fire, pending } = manualTimers();
    const errors: unknown[] = [];
    const q = createSerialWriteQueue<string>({
      send: () => Promise.resolve(),
      onError: (e) => errors.push(e),
      timeoutMs: 20_000,
      timers,
    });

    q.enqueue("k", "a");
    await flush();
    // The timer must be CLEARED on settle, or a long session leaks one per write.
    expect(pending()).toBe(0);
    fire(); // no-op: nothing is scheduled
    await flush();
    expect(errors).toEqual([]);
  });

  it("reports a rejection ONCE, not twice, when the watchdog also fires", async () => {
    const { timers, fire } = manualTimers();
    const gate = deferred();
    const errors: unknown[] = [];
    const q = createSerialWriteQueue<string>({
      send: () => gate.promise,
      onError: (e) => errors.push(e),
      timeoutMs: 20_000,
      timers,
    });

    q.enqueue("k", "a");
    await flush();
    fire(); // watchdog gives up first
    await flush();
    expect(errors).toHaveLength(1);

    // The abandoned request answers late. It must not report again, and must not
    // release a slot a newer send may now hold.
    gate.reject(new Error("late failure"));
    await flush();
    expect(errors).toHaveLength(1);
  });

  it("a late answer from an abandoned send cannot double-drain the key", async () => {
    const { timers, fire } = manualTimers();
    const late = deferred();
    const sent: string[] = [];
    let call = 0;
    const q = createSerialWriteQueue<string>({
      send: (p) => {
        sent.push(p);
        call += 1;
        return call === 1 ? late.promise : new Promise<void>(() => {});
      },
      onError: () => {},
      timeoutMs: 20_000,
      timers,
    });

    q.enqueue("k", "a");
    q.enqueue("k", "b");
    await flush();
    fire(); // "a" abandoned → "b" sent
    await flush();
    expect(sent).toEqual(["a", "b"]);

    q.enqueue("k", "c"); // parks behind the in-flight "b"
    late.resolve(); // "a" finally answers
    await flush();
    // "c" must still be waiting on "b" — the stale settle must not have released
    // the slot, which would run "b" and "c" concurrently for one key.
    expect(sent).toEqual(["a", "b"]);
  });

  it("timeoutMs: 0 disables the watchdog entirely", async () => {
    const { timers, pending } = manualTimers();
    const q = createSerialWriteQueue<string>({
      send: () => new Promise<void>(() => {}),
      timeoutMs: 0,
      timers,
    });
    q.enqueue("k", "a");
    await flush();
    expect(pending()).toBe(0);
  });
});
