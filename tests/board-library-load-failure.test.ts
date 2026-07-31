import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Board } from "@/lib/types";

// Regression guard for the Board Library's false empty — the same defect class
// as tests/teach-false-empty.test.ts, one layer down the stack.
//
// THE BUG. `refresh()` in BoardLibraryModule was `try / finally` with NO
// `catch`. Under the live flag lib/teach/client.ts rethrows the server action's
// error envelope, so a backend outage did two things at once:
//   (a) the rejection escaped `void refresh()` as an UNHANDLED PROMISE
//       REJECTION, and
//   (b) `finally` still cleared the loading flag with `boards` stuck at [], so
//       the surface rendered "No boards yet — click “New board” to create your
//       first one". A teacher whose 40 boards were briefly unreachable was told
//       they had none, and invited to start over.
//
// WHAT IS PINNED. Both directions, because only the pair is a real guard:
//   • a REJECTED load renders the failure copy and NEVER the empty copy, and
//   • a SETTLED-but-genuinely-empty load still says "No boards yet" — a fix
//     that answered "couldn't load" (or spun forever) for an empty library
//     would pass the first assertion while lying in the other direction.
//
// HOW IT RENDERS WITHOUT A DOM. vitest runs `environment: "node"` and there is
// no jsdom (and adding one is a new dependency), so React effects cannot run
// here. The two halves the effect glues together are therefore exercised
// directly, and both are the shipped production code the module itself uses:
//   loadBoardLibrary()  — the real load, including its catch, returns the state
//   BoardListRegion     — the real render, branching on that state
// The module's own body is `setDataState(res.state)` between them. Nothing
// about the copy, the branch order, or the swallowing is duplicated here.
//
// NOTE ON APOSTROPHES: renderToStaticMarkup escapes ASCII `'` to `&#x27;`,
// while curly `’`/`“`/`”` pass through literally. An ASCII-quoted matcher would
// silently never fire — the exact failure mode that once made a live check of
// this defect class return a vacuous "not reproduced".

const client = vi.hoisted(() => ({
  listMyBoards: vi.fn(),
  listTeamLibraryBoards: vi.fn(),
  countMyBoards: vi.fn(),
}));

// The module's ONLY data path. Mocked so a rejection is deterministic (and so
// the real client's server-action import never loads in the node env).
vi.mock("@/lib/teach/client", () => ({ teachClient: client }));

const { loadBoardLibrary, BoardListRegion } = await import(
  "@/components/teach/library/BoardLibraryModule"
);

// ── Fixtures ────────────────────────────────────────────────────────────────

const BOARD = {
  id: "b1",
  masterLessonId: null,
  ownerId: "t1",
  scope: "personal",
  title: "Monday Math Warm-Up",
  displayOrderWithinLesson: 0,
  templateId: null,
  widgets: [],
  gradeLevelId: "g5",
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-20T09:00:00.000Z",
} as unknown as Board;

// The exact strings a teacher reads.
const EMPTY_COPY = "No boards yet";
const ERROR_COPY = "Couldn’t load your boards";
const ERROR_BODY = "Check your connection and reload. Your saved work is safe.";
const LOADING = 'role="status" aria-busy="true"';
const LOADING_LABEL = "Loading your boards";
const FILTER_MISS = "No boards match your search and filters.";

function renderRegion(opts: {
  dataState: "pending" | "error" | "settled";
  loadedCount?: number;
  visibleCount?: number;
  tab?: "mine" | "team";
  canCreate?: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(
      BoardListRegion,
      {
        dataState: opts.dataState,
        loadedCount: opts.loadedCount ?? 0,
        visibleCount: opts.visibleCount ?? 0,
        tab: opts.tab ?? "mine",
        canCreate: opts.canCreate ?? true,
      },
      // The stand-in for the real card grid the module passes.
      createElement("div", { className: "grid" }, "THE GRID"),
    ),
  );
}

beforeEach(() => {
  client.listMyBoards.mockReset();
  client.listTeamLibraryBoards.mockReset();
  client.countMyBoards.mockReset();
});

// ── The load ────────────────────────────────────────────────────────────────

describe("loadBoardLibrary — a failed read is reported, never swallowed into empty", () => {
  it("resolves to the error state when the board list REJECTS", async () => {
    client.listMyBoards.mockRejectedValue(new Error("network"));
    client.countMyBoards.mockResolvedValue(7);

    const load = await loadBoardLibrary({ tab: "mine", ownerId: "t1" });

    expect(load.state).toBe("error");
  });

  it("resolves to the error state when the CAP COUNT rejects", async () => {
    // Both reads are awaited together; either failing means the surface's
    // numbers would be wrong, so both must fail closed.
    client.listMyBoards.mockResolvedValue([BOARD]);
    client.countMyBoards.mockRejectedValue(new Error("network"));

    expect((await loadBoardLibrary({ tab: "mine", ownerId: "t1" })).state).toBe(
      "error",
    );
  });

  it("never rejects, so the caller's fire-and-forget `void refresh()` cannot go unhandled", async () => {
    client.listMyBoards.mockRejectedValue(new Error("network"));
    client.countMyBoards.mockRejectedValue(new Error("network"));

    // `.resolves` is the assertion: a rejection here is the original bug (a),
    // an unhandled promise rejection escaping the effect.
    await expect(
      loadBoardLibrary({ tab: "mine", ownerId: "t1" }),
    ).resolves.toBeDefined();
  });

  it("returns the boards and the cap count on a healthy read", async () => {
    client.listMyBoards.mockResolvedValue([BOARD]);
    client.countMyBoards.mockResolvedValue(1);

    const load = await loadBoardLibrary({ tab: "mine", ownerId: "t1" });

    expect(load).toEqual({ state: "settled", boards: [BOARD], myCount: 1 });
  });

  it("settles with an empty list rather than erroring when the team grade is unresolved", async () => {
    // gradeLevelId arrives a tick after ownerId under the live flag; the team
    // query is skipped until then (a mock slug would throw in resolveGradeId).
    client.countMyBoards.mockResolvedValue(3);

    const load = await loadBoardLibrary({ tab: "team", ownerId: "t1" });

    expect(load).toEqual({ state: "settled", boards: [], myCount: 3 });
    expect(client.listTeamLibraryBoards).not.toHaveBeenCalled();
  });
});

// ── The render ──────────────────────────────────────────────────────────────

describe("BoardListRegion — a failed load never reads as an empty library", () => {
  it("shows the failure copy, NOT “No boards yet”, when the load errored", async () => {
    // The regression guard, end to end: reject → state → rendered copy.
    client.listMyBoards.mockRejectedValue(new Error("network"));
    client.countMyBoards.mockResolvedValue(7);
    const load = await loadBoardLibrary({ tab: "mine", ownerId: "t1" });

    const html = renderRegion({ dataState: load.state, loadedCount: 0 });

    expect(html).toContain(ERROR_COPY);
    expect(html).toContain(ERROR_BODY);
    expect(html).not.toContain(EMPTY_COPY);
    expect(html).not.toContain(FILTER_MISS);
  });

  it("keeps the failure copy on the Team segment too", () => {
    const html = renderRegion({ dataState: "error", tab: "team" });
    expect(html).toContain(ERROR_COPY);
    // The team segment's own empty line is equally a lie during an outage.
    expect(html).not.toContain("shared any boards yet");
  });

  it("shows a labelled loading affordance while the load is in flight", () => {
    const html = renderRegion({ dataState: "pending" });
    expect(html).toContain(LOADING);
    // Without the label a screen-reader user hears silence where the lie was.
    expect(html).toContain(LOADING_LABEL);
    expect(html).not.toContain(EMPTY_COPY);
    expect(html).not.toContain(ERROR_COPY);
  });
});

describe("BoardListRegion — a settled load still answers honestly", () => {
  it("says “No boards yet” for a load that genuinely returned nothing", async () => {
    // The anti-overshoot direction: distinguishing an outage from an empty
    // library only counts if the empty library is STILL named as such.
    client.listMyBoards.mockResolvedValue([]);
    client.countMyBoards.mockResolvedValue(0);
    const load = await loadBoardLibrary({ tab: "mine", ownerId: "t1" });

    expect(load.state).toBe("settled");

    const html = renderRegion({ dataState: load.state, loadedCount: 0 });

    expect(html).toContain(EMPTY_COPY);
    expect(html).not.toContain(ERROR_COPY);
    expect(html).not.toContain(LOADING);
  });

  it("points at “New board” only when that action exists", () => {
    expect(renderRegion({ dataState: "settled", canCreate: true })).toContain(
      "New board",
    );
    const noCreate = renderRegion({ dataState: "settled", canCreate: false });
    expect(noCreate).toContain("Build one on a lesson");
    expect(noCreate).not.toContain("New board");
  });

  it("distinguishes a filtered-to-nothing list from an empty library", () => {
    const html = renderRegion({
      dataState: "settled",
      loadedCount: 5,
      visibleCount: 0,
    });
    expect(html).toContain(FILTER_MISS);
    expect(html).not.toContain(EMPTY_COPY);
  });

  it("renders the grid once there is something to show", () => {
    // The other anti-overshoot check: gating the empty copy must not gate the
    // grid, which would strand a healthy library behind a permanent skeleton.
    const html = renderRegion({
      dataState: "settled",
      loadedCount: 1,
      visibleCount: 1,
    });
    expect(html).toContain("THE GRID");
    expect(html).not.toContain(EMPTY_COPY);
    expect(html).not.toContain(ERROR_COPY);
    expect(html).not.toContain(LOADING);
  });
});
