// Guards `chunkedIn` (lib/planner/paged-read.ts) — the chunked `.in(...)` reader
// three planner hydrate reads go through.
//
// WHAT WAS WRONG. It was a `for` loop with an `await` inside, so every chunk
// waited on the one before it. The chunks are DISJOINT id slices with no data
// dependency, so the waiting bought nothing. On the beta grade each of
// `personal_core_lesson_event_copies`, `completion_status` and the
// `lesson_sections` batch is keyed by all 1254 master lesson ids → 9 chunks
// each → 27 strictly sequential round trips inside what the hydrate bundle
// presents to the client as a SINGLE call. Replayed against production
// (scripts/probe-f3-chunk-cost.mjs, n=3) that cost 7925 / 8009 / 8226 ms versus
// 1771 / 1803 / 3217 ms with the chunks overlapped — and the three responses
// held 3, 4 and 0 rows. Almost the whole cost was round-trip latency.
//
// WHY THESE TESTS AND NOT A TIMING ASSERTION. "It got faster" is not testable on
// a machine whose hydration has varied 10× within an hour. What IS testable is
// the property that makes it faster and the properties that must survive it:
// how many requests are in flight at once, that the ceiling on that number is
// real, that the returned row ORDER is unchanged, that paging inside one chunk
// is still sequential and still cursor-chained, and that a failing chunk still
// fails the whole read. No test here sleeps for a fixed duration or asserts a
// wall-clock budget.
//
// SEEN RED. Against the previous serial implementation, in the same run:
//   ✗ "overlaps independent chunks"        → expected 1 to be greater than 1
//   ✗ "fills the concurrency window"       → expected 1 to be 6
//   ✓ every other test in this file passed — the positive control that the
//     harness itself was not simply broken.

import { describe, expect, it } from "vitest";
import {
  chunkedIn,
  IN_CHUNK_CONCURRENCY,
  IN_CHUNK_SIZE,
  type PageRequest,
  type PageResult,
} from "@/lib/planner/paged-read";

type Row = { id: string; chunkIndex: number };

/** Ids enough to produce exactly `n` chunks. */
function idsForChunks(n: number): string[] {
  return Array.from({ length: n * IN_CHUNK_SIZE }, (_, i) => `id-${i}`);
}

/** A fake `query` that records concurrency and lets each chunk's latency be
 *  chosen, so completion order can be made to disagree with chunk order. */
function makeQuery(opts?: {
  /** ms of simulated latency for the chunk starting at this id. */
  latency?: (chunkIndex: number) => number;
  /** rows one page of this chunk returns; default 1. */
  pagesFor?: (chunkIndex: number) => Row[][];
  /** throw for this chunk index. */
  failAt?: number;
}) {
  const state = {
    inFlight: 0,
    peakInFlight: 0,
    /** every (chunkIndex, cursor) pair the reader asked for, in issue order. */
    calls: [] as { chunkIndex: number; after: string | null }[],
    /** chunk indexes in the order their FIRST request was issued. */
    startOrder: [] as number[],
  };

  const query = async (
    idsChunk: string[],
    page: PageRequest,
  ): Promise<PageResult<Row>> => {
    // The chunk's identity: its first id's ordinal / IN_CHUNK_SIZE.
    const chunkIndex = Number(idsChunk[0].split("-")[1]) / IN_CHUNK_SIZE;
    if (page.after == null) state.startOrder.push(chunkIndex);
    state.calls.push({ chunkIndex, after: (page.after as string) ?? null });

    state.inFlight++;
    state.peakInFlight = Math.max(state.peakInFlight, state.inFlight);
    try {
      const ms = opts?.latency?.(chunkIndex) ?? 1;
      await new Promise((r) => setTimeout(r, ms));
      if (opts?.failAt === chunkIndex) throw new Error(`chunk ${chunkIndex} failed`);
      const pages = opts?.pagesFor?.(chunkIndex) ?? [
        [{ id: `row-${chunkIndex}`, chunkIndex }],
      ];
      // Cursor-chained paging within the chunk: pick the page whose first row
      // sorts after the requested cursor.
      const pageIndex =
        page.after == null
          ? 0
          : pages.findIndex((p) => p.length > 0 && p[0].id > (page.after as string));
      const data = pageIndex >= 0 ? (pages[pageIndex] ?? []) : [];
      return { data, error: null, count: null } as PageResult<Row>;
    } finally {
      state.inFlight--;
    }
  };

  return { query, state };
}

describe("chunkedIn — the chunk loop overlaps, and nothing else changes", () => {
  it("overlaps independent chunks", async () => {
    // THE POINT OF THE CHANGE. Four chunks, each with real (if tiny) latency.
    // A serial loop can never have more than one request in flight.
    const { query, state } = makeQuery({ latency: () => 20 });
    await chunkedIn<Row>(idsForChunks(4), (r) => r.id, query, "test");
    expect(state.peakInFlight).toBeGreaterThan(1);
  });

  it("fills the concurrency window", async () => {
    // With more chunks than the window, the window should actually be full —
    // this separates "overlaps a bit" from "overlaps as designed".
    const { query, state } = makeQuery({ latency: () => 25 });
    await chunkedIn<Row>(
      idsForChunks(IN_CHUNK_CONCURRENCY * 2),
      (r) => r.id,
      query,
      "test",
    );
    expect(state.peakInFlight).toBe(IN_CHUNK_CONCURRENCY);
  });

  it("never exceeds the concurrency window", async () => {
    // The bound is the half of the change that protects the DATABASE. Without
    // it, a school 3× the beta's size would put 80+ requests in flight from one
    // hydrate — trading a slow read for a saturated pooler.
    const { query, state } = makeQuery({ latency: () => 5 });
    await chunkedIn<Row>(idsForChunks(30), (r) => r.id, query, "test");
    expect(state.peakInFlight).toBeLessThanOrEqual(IN_CHUNK_CONCURRENCY);
  });

  it("returns rows in chunk order even when the chunks finish out of order", async () => {
    // The rows must come back in exactly the sequence the serial loop produced.
    // `completion_status` pages on a cursor that is unique only under the call
    // site's teacher filter, and the lesson reads re-sort afterwards; both of
    // those arguments assume the pre-existing order. So chunk 0 is made the
    // SLOWEST — it finishes last and must still appear first.
    const chunks = 5;
    const { query } = makeQuery({ latency: (i) => (chunks - i) * 12 });
    const rows = await chunkedIn<Row>(idsForChunks(chunks), (r) => r.id, query, "test");
    expect(rows.map((r) => r.chunkIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps paging within one chunk sequential and cursor-chained", async () => {
    // Chunks are independent; PAGES ARE NOT. Page N+1 needs page N's last
    // cursor, so overlapping the outer loop must not have overlapped the inner
    // one. Chunk 0 returns two pages; the second request for it must carry the
    // last id of the first page.
    const { query, state } = makeQuery({
      pagesFor: (i) =>
        i === 0
          ? [
              [
                { id: "a1", chunkIndex: 0 },
                { id: "a2", chunkIndex: 0 },
              ],
              [{ id: "b1", chunkIndex: 0 }],
            ]
          : [[{ id: `row-${i}`, chunkIndex: i }]],
    });
    const rows = await chunkedIn<Row>(idsForChunks(3), (r) => r.id, query, "test");

    const chunk0 = state.calls.filter((c) => c.chunkIndex === 0);
    expect(chunk0.length).toBeGreaterThan(1);
    expect(chunk0[0].after).toBeNull();
    // The cursor handed to page 2 is the last row of page 1 — not an offset.
    expect(chunk0[1].after).toBe("a2");
    // And chunk 0's rows are still contiguous and first.
    expect(rows.slice(0, 3).map((r) => r.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("issues chunks in order, so a bounded window starts at the front", async () => {
    const { query, state } = makeQuery({ latency: () => 5 });
    await chunkedIn<Row>(idsForChunks(8), (r) => r.id, query, "test");
    expect(state.startOrder.slice(0, IN_CHUNK_CONCURRENCY)).toEqual(
      Array.from({ length: IN_CHUNK_CONCURRENCY }, (_, i) => i),
    );
  });

  it("propagates a chunk failure instead of returning a partial read", async () => {
    // A partial result presented as a whole one is the failure mode this repo
    // has already shipped once. `Promise.all` must reject exactly as the old
    // `await` did.
    const { query } = makeQuery({ failAt: 3, latency: () => 5 });
    await expect(
      chunkedIn<Row>(idsForChunks(6), (r) => r.id, query, "test"),
    ).rejects.toThrow("chunk 3 failed");
  });

  it("stops issuing requests once a chunk has failed", async () => {
    // The serial loop got this for free — a throw ended it. Overlapped workers
    // do not: `Promise.all` rejects to the caller straight away while the other
    // workers happily drain every remaining chunk, so one transient failure
    // fans out across the whole id set and then overlaps the store's retry.
    // (Medium, §4a gate.)
    //
    // 20 chunks, failure on chunk 0, window of 6. The bound asserted is the
    // honest one: work already in flight cannot be cancelled (no AbortSignal on
    // the builder), so at most one more request per worker may land — never the
    // remaining fourteen.
    const { query, state } = makeQuery({ failAt: 0, latency: () => 10 });
    await expect(
      chunkedIn<Row>(idsForChunks(20), (r) => r.id, query, "test"),
    ).rejects.toThrow("chunk 0 failed");
    // Let any worker that was mid-flight settle before counting.
    await new Promise((r) => setTimeout(r, 60));
    expect(state.startOrder.length).toBeLessThanOrEqual(IN_CHUNK_CONCURRENCY * 2);
    expect(state.startOrder.length).toBeLessThan(20);
  });

  it("does no work at all for an empty id set", async () => {
    const { query, state } = makeQuery();
    const rows = await chunkedIn<Row>([], (r) => r.id, query, "test");
    expect(rows).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it("handles a single partial chunk without touching the window", async () => {
    const { query, state } = makeQuery();
    const rows = await chunkedIn<Row>(["only-0"], (r) => r.id, query, "test");
    expect(rows).toHaveLength(1);
    expect(state.peakInFlight).toBe(1);
  });
});
