import { describe, it, expect, vi, beforeEach } from "vitest";

import { mountReact } from "./mount-react";
import type { Board } from "@/lib/types";

// The Board Library's SUPERSEDED-LOAD guard — `BoardLibraryModule.tsx:414`,
// `if (seq !== loadSeq.current) return;`.
//
// WHY THIS FILE EXISTS. That line was completely untested: deleting it left
// every board-library test green. Everything the other files assert
// (`tests/board-library-load-failure.test.ts`, `tests/board-library-delete-label.test.ts`)
// is about ONE load — its result, its copy, its labels. The guard is about the
// relationship BETWEEN two loads, and no amount of single-load coverage can see
// it. That is the general shape worth naming: a race guard is invisible to
// every test that only ever runs one request.
//
// WHAT GOES WRONG WITHOUT IT. `refresh()` re-runs whenever `tab`, `ownerId` or
// `gradeLevelId` changes, and again after every mutation, so two loads are in
// flight routinely — switching segment while the first read is slow is the
// everyday case. Network responses do not arrive in the order they were sent.
// The older response lands last and `setBoards` paints it over the newer one:
// the teacher is looking at the Personal segment, holding a list that belongs to
// the Team segment (or to the previous account), with the header, the cap meter
// and the filter pills all describing the list they cannot see. No error, no
// spinner — the surface simply asserts something false and stays there until
// something else happens to trigger a reload.
//
// WHY IT MUST BE A REAL MOUNT. The interleave lives in an effect plus a ref
// across two awaits. `renderToStaticMarkup` runs no effects and cannot hold a
// ref across renders, so a static render can only ever observe one load's
// result — the ordering the guard exists for is unreachable from there.
// `tests/mount-react.ts` mounts with react-dom/client over linkedom (no new
// dependency; CLAUDE.md §6), so the effect really runs and the ref really
// persists between the two responses.
//
// EVERY LOAD HERE IS A DEFERRED PROMISE the test resolves BY HAND, in an order
// it chooses. Nothing is timing-dependent and nothing sleeps: an out-of-order
// response is produced deliberately rather than hoped for.

// ── A promise the test resolves when it wants ───────────────────────────────

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const client = vi.hoisted(() => ({
  /** One deferred per `listMyBoards` call, in call order. */
  boardCalls: [] as { ownerId: string; d: Deferred<Board[]> }[],
  listMyBoards: vi.fn(),
  listTeamLibraryBoards: vi.fn(),
  countMyBoards: vi.fn(),
  listBoardTemplates: vi.fn(),
}));

vi.mock("@/lib/teach/client", () => ({ teachClient: client }));

const { BoardLibraryModule } = await import(
  "@/components/teach/library/BoardLibraryModule"
);

// ── Fixtures ────────────────────────────────────────────────────────────────

function board(id: string, title: string, ownerId: string): Board {
  return {
    id,
    masterLessonId: null,
    ownerId,
    scope: "personal",
    title,
    displayOrderWithinLesson: 0,
    templateId: null,
    widgets: [],
    gradeLevelId: "g5",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z",
  } as unknown as Board;
}

const OLD_BOARD = board("b-old", "Fractions Warm-Up", "t1");
const NEW_BOARD = board("b-new", "Decimals Warm-Up", "t2");

const PROPS = {
  gradeLevelId: "g5",
  onOpenBoard: () => {},
  onUseTemplate: () => {},
  onCreateBlank: () => {},
  creating: false,
};

beforeEach(() => {
  client.boardCalls.length = 0;
  client.listMyBoards.mockReset();
  client.listMyBoards.mockImplementation((ownerId: string) => {
    const d = deferred<Board[]>();
    client.boardCalls.push({ ownerId, d });
    return d.promise;
  });
  client.countMyBoards.mockReset();
  client.countMyBoards.mockResolvedValue(2);
  client.listTeamLibraryBoards.mockReset();
  client.listTeamLibraryBoards.mockResolvedValue([]);
  client.listBoardTemplates.mockReset();
  client.listBoardTemplates.mockResolvedValue([]);
});

// ── 1. The out-of-order response ────────────────────────────────────────────

describe("BoardLibraryModule — a superseded load never paints over a newer one", () => {
  it("keeps the NEWER response when the older one lands last", async () => {
    const h = await mountReact(BoardLibraryModule as never);
    try {
      // Load #1 — the teacher's own library, slow.
      await h.render({ ...PROPS, ownerId: "t1" } as never);
      // Load #2 — the owner resolved to someone else (an account switch, or the
      // session finishing after a null first paint). Both are now in flight.
      await h.render({ ...PROPS, ownerId: "t2" } as never);

      // CONTROL — the two loads really are both outstanding and really are
      // distinct. Without this the interleave below could be a single load, or
      // two loads for the same owner, and the test would prove nothing about
      // ordering at all.
      expect(client.boardCalls.map((c) => c.ownerId)).toEqual(["t1", "t2"]);

      // The NEWER response arrives first…
      await h.render({ ...PROPS, ownerId: "t2" } as never);
      client.boardCalls[1].d.resolve([NEW_BOARD]);
      await h.render({ ...PROPS, ownerId: "t2" } as never);

      // CONTROL — it painted. An assertion that the old board is absent is
      // worthless against a surface that is rendering no boards at all.
      expect(h.html(), "control: the newer load painted").toContain(
        "Decimals Warm-Up",
      );

      // …and the OLDER one lands afterwards. This is the whole test.
      client.boardCalls[0].d.resolve([OLD_BOARD]);
      await h.render({ ...PROPS, ownerId: "t2" } as never);

      expect(h.html(), "the stale load repainted the list").not.toContain(
        "Fractions Warm-Up",
      );
      expect(h.html(), "the newer load's list survived").toContain(
        "Decimals Warm-Up",
      );
    } finally {
      await h.unmount();
    }
  });

  it("still paints a load that is NOT superseded", async () => {
    // The anti-overshoot direction, and it is not ceremony: a guard that
    // discarded EVERY response would satisfy the test above perfectly while
    // leaving the library permanently empty. Both directions or neither.
    const h = await mountReact(BoardLibraryModule as never);
    try {
      await h.render({ ...PROPS, ownerId: "t1" } as never);
      expect(client.boardCalls).toHaveLength(1);

      client.boardCalls[0].d.resolve([OLD_BOARD]);
      await h.render({ ...PROPS, ownerId: "t1" } as never);

      expect(h.html()).toContain("Fractions Warm-Up");
    } finally {
      await h.unmount();
    }
  });
});

// ── 2. The unresolved owner ─────────────────────────────────────────────────
//
// `refresh()`'s other early exit: `if (!ownerId) { setBoards([]); setDataState("pending"); return; }`.
// "We do not know who you are yet" is not "you have no boards" — the same
// false-empty class tests/board-library-load-failure.test.ts pins for a failed
// read, arriving here through an unresolved session instead.

describe("BoardLibraryModule — an unresolved owner reads as pending, never as empty", () => {
  it("does not claim an empty library while the session is still resolving", async () => {
    const h = await mountReact(BoardLibraryModule as never);
    try {
      await h.render({ ...PROPS, ownerId: null } as never);

      // The load was never even attempted — there is nobody to load for.
      expect(client.listMyBoards).not.toHaveBeenCalled();
      // CONTROL: the module rendered its list region at all. "No boards yet" is
      // absent from an unmounted component too.
      expect(h.html(), "control: the loading affordance rendered").toContain(
        "Loading your boards",
      );
      expect(h.html()).not.toContain("No boards yet");
    } finally {
      await h.unmount();
    }
  });

  it("loads once the owner arrives, rather than staying stuck on pending", async () => {
    // The anti-overshoot pair: refusing to answer without an owner is only
    // correct if the answer arrives when the owner does.
    const h = await mountReact(BoardLibraryModule as never);
    try {
      await h.render({ ...PROPS, ownerId: null } as never);
      await h.render({ ...PROPS, ownerId: "t1" } as never);

      expect(client.boardCalls.map((c) => c.ownerId)).toEqual(["t1"]);
      client.boardCalls[0].d.resolve([OLD_BOARD]);
      await h.render({ ...PROPS, ownerId: "t1" } as never);

      expect(h.html()).toContain("Fractions Warm-Up");
    } finally {
      await h.unmount();
    }
  });
});
