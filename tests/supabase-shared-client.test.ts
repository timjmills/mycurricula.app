// supabase-shared-client.test.ts — `withSharedServerClient` / `sb()`.
//
// WHY IT MATTERS. Several per-request memos in the planner repository are
// WeakMaps keyed on the server CLIENT object (school week, active school year,
// and the subject/unit/standards indexes). Their comments assume "a fresh client
// per request", but `sb()` built a new client on EVERY call, so a server action
// that touched six source methods built six clients and every memo missed —
// subjects were re-read 3×, units 2×, the standards pair 2×, and the
// grade_levels + school_years pair 2×, all inside one document load.
//
// The scope is opt-in, so the two properties that must hold are symmetric: it
// shares INSIDE, and it changes nothing OUTSIDE.

import { describe, expect, it, vi, beforeEach } from "vitest";

// `sb()` → `createClient()` → `next/headers`, which cannot run under vitest's
// node environment. Stub the factory with an identity-bearing counter so the
// test can tell "the same client" from "another client that looks the same".
const { createClient, made } = vi.hoisted(() => {
  const made = { count: 0 };
  return {
    made,
    createClient: vi.fn(async () => {
      made.count += 1;
      return { id: made.count } as unknown as object;
    }),
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { sb, withSharedServerClient } from "@/lib/supabase/helpers";

describe("sb() outside a shared scope", () => {
  beforeEach(() => {
    made.count = 0;
    createClient.mockClear();
  });

  // The no-regression half: every existing caller keeps today's exact behaviour.
  it("builds a NEW client per call (unchanged)", async () => {
    const a = await sb();
    const b = await sb();
    expect(a).not.toBe(b);
    expect(createClient).toHaveBeenCalledTimes(2);
  });
});

describe("withSharedServerClient", () => {
  beforeEach(() => {
    made.count = 0;
    createClient.mockClear();
  });

  it("hands every sb() inside the scope the SAME client instance", async () => {
    const clients = await withSharedServerClient(async () => {
      const first = await sb();
      const second = await sb();
      const third = await sb();
      return [first, second, third];
    });

    expect(clients[0]).toBe(clients[1]);
    expect(clients[1]).toBe(clients[2]);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  // THE RACE THE IMPLEMENTATION IS SHAPED AROUND. `scope.client ??= await
  // createClient()` looks equivalent and is not: every branch of a `Promise.all`
  // observes `undefined` before any assignment happens, so each builds its own
  // client and each receives the one IT built. The memos would still miss and
  // the fix would look applied. Caching the PROMISE — assigned in the same
  // synchronous turn as the check — is what makes this pass.
  it("survives concurrent sb() calls (Promise.all), which is how the hydrate calls it", async () => {
    const clients = await withSharedServerClient(() =>
      Promise.all([sb(), sb(), sb(), sb(), sb(), sb()]),
    );

    expect(new Set(clients).size).toBe(1);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("does not leak the client out of the scope", async () => {
    const inside = await withSharedServerClient(() => sb());
    const outside = await sb();
    expect(outside).not.toBe(inside);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  // Two concurrently-running scopes are two requests. `AsyncLocalStorage` keeps
  // them apart by construction; this pins that a shared client can never be
  // observed across them — the property that makes sharing safe at all.
  it("keeps concurrent scopes isolated from each other", async () => {
    const [a, b] = await Promise.all([
      withSharedServerClient(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return sb();
      }),
      withSharedServerClient(async () => sb()),
    ]);
    expect(a).not.toBe(b);
  });

  it("propagates a rejection and still restores the outer (unscoped) behaviour", async () => {
    await expect(
      withSharedServerClient(async () => {
        await sb();
        throw new Error("read failed");
      }),
    ).rejects.toThrow("read failed");

    const a = await sb();
    const b = await sb();
    expect(a).not.toBe(b);
  });
});
