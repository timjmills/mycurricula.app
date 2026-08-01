// workspace-context-off-queue.test.ts — the active-workspace context read must
// NOT occupy a slot in Next's Server Action queue (task #46, fix F2).
//
// WHY. Next runs client-initiated Server Actions strictly one at a time. On a
// /weekly first load there are exactly two: this read and the planner hydrate
// bundle. This one fires at t≈0 from `WorkspaceIdentitySync`'s mount effect with
// no awaited prerequisite; the planner hydrate is gated behind `ownerId`, which
// is null until a browser auth round trip resolves. So this read always won the
// queue and the planner waited out its full duration (677–1311 ms, measured on
// production by an earlier pass — not by this test) before starting its own.
//
// Reordering the two does not help: whichever runs second still pays for the
// first. The fix is to take this one OFF the queue entirely, which is what the
// first test pins. The rest pin that moving it did not change WHAT it reads,
// WHEN it declines to read, or WHAT it says when it fails.

import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  multi: true,
  planner: true,
  clients: 0,
  rpcCalls: [] as string[],
  tableReads: [] as { table: string; filters: Record<string, unknown> }[],
  rpcResult: { data: [] as unknown, error: null as unknown },
  tableResult: { data: [] as unknown, error: null as unknown },
}));

// Both halves of the DOUBLE GATE, individually switchable. Module-namespace
// getters so each test can move one without re-importing.
vi.mock("@/lib/multi-workspace-flag", () => ({
  get MULTI_WORKSPACE() {
    return state.multi;
  },
}));
vi.mock("@/lib/planner/source", () => ({
  isPlannerSupabaseConfigured: () => state.planner,
}));

// The Supabase BROWSER client. Recording every call is the instrument: a read
// that never happened and a read that happened against the wrong scope are the
// two failures worth catching.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    state.clients += 1;
    return {
      rpc: async (name: string) => {
        state.rpcCalls.push(name);
        return state.rpcResult;
      },
      from: (table: string) => {
        const record = { table, filters: {} as Record<string, unknown> };
        state.tableReads.push(record);
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            record.filters[col] = val;
            return builder;
          },
          order: () => builder,
          then: (res: (v: unknown) => void) =>
            Promise.resolve(state.tableResult).then(res),
        };
        return builder;
      },
    };
  },
}));

import { readActiveWorkspaceContextRemote } from "@/lib/workspaces/remote";

const WORKSPACE_ROW = {
  school_id: "school-a",
  name: "Beta School",
  is_owner: false,
  is_admin: true,
  member_count: 4,
  is_active: true,
};

function reset() {
  state.multi = true;
  state.planner = true;
  state.clients = 0;
  state.rpcCalls = [];
  state.tableReads = [];
  state.rpcResult = { data: [], error: null };
  state.tableResult = { data: [], error: null };
}

describe("readActiveWorkspaceContextRemote — off the action queue", () => {
  beforeEach(reset);

  it("reads through the BROWSER supabase client, not a server action", async () => {
    state.rpcResult = { data: [WORKSPACE_ROW], error: null };
    state.tableResult = {
      data: [{ id: "g1", name: "Grade 5", display_order: 0, is_active: true }],
      error: null,
    };

    const ctx = await readActiveWorkspaceContextRemote();

    expect(state.clients).toBe(1);
    expect(state.rpcCalls).toEqual(["list_my_workspaces"]);
    expect(ctx.workspace?.schoolId).toBe("school-a");
    expect(ctx.workspace?.role).toBe("admin");
    expect(ctx.notebooks).toEqual([
      { gradeLevelId: "g1", name: "Grade 5", isActive: true },
    ]);
  });

  // THE CROSS-TENANT INVARIANT, and the one property that must survive losing
  // "one round trip". The notebook read is PINNED to the just-resolved
  // workspace, not left to the ambient RLS resolver — so a concurrent
  // set_active_workspace between the two reads degrades to an empty list, never
  // another tenant's notebooks.
  it("PINS the notebook read to the resolved workspace id", async () => {
    state.rpcResult = { data: [WORKSPACE_ROW], error: null };

    await readActiveWorkspaceContextRemote();

    expect(state.tableReads).toHaveLength(1);
    expect(state.tableReads[0].table).toBe("grade_levels");
    expect(state.tableReads[0].filters).toEqual({ school_id: "school-a" });
  });

  it("does not read notebooks when no workspace is active", async () => {
    state.rpcResult = {
      data: [{ ...WORKSPACE_ROW, is_active: false }],
      error: null,
    };

    const ctx = await readActiveWorkspaceContextRemote();

    expect(ctx).toEqual({ workspace: null, notebooks: [] });
    expect(state.tableReads).toEqual([]);
  });
});

// The gate is the no-regression half: a flag-off deployment must issue exactly
// the requests it issues today, which is none. Moving a read to the browser is
// precisely the change that could start making calls where none were made.
describe("readActiveWorkspaceContextRemote — the double gate", () => {
  beforeEach(reset);

  it("short-circuits with MULTI_WORKSPACE off, without building a client", async () => {
    state.multi = false;

    const ctx = await readActiveWorkspaceContextRemote();

    expect(ctx).toEqual({ workspace: null, notebooks: [] });
    expect(state.clients).toBe(0);
    expect(state.rpcCalls).toEqual([]);
  });

  it("short-circuits with the planner backend off, without building a client", async () => {
    state.planner = false;

    const ctx = await readActiveWorkspaceContextRemote();

    expect(ctx).toEqual({ workspace: null, notebooks: [] });
    expect(state.clients).toBe(0);
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("readActiveWorkspaceContextRemote — failure posture", () => {
  beforeEach(reset);

  // The server action wrapped failures in an opaque envelope so a DB/RLS
  // internal could never become UI text. That property has to survive the move,
  // even though the error now originates in the browser.
  it("throws the opaque message and never the raw DB error (workspaces read)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.rpcResult = {
        data: null,
        error: { message: "permission denied for function list_my_workspaces" },
      };

      await expect(readActiveWorkspaceContextRemote()).rejects.toThrow(
        "That didn't work — please try again.",
      );
      await expect(readActiveWorkspaceContextRemote()).rejects.not.toThrow(
        /permission denied/,
      );
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it("throws the opaque message and never the raw DB error (notebook read)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.rpcResult = { data: [WORKSPACE_ROW], error: null };
      state.tableResult = {
        data: null,
        error: { message: 'relation "grade_levels" does not exist' },
      };

      await expect(readActiveWorkspaceContextRemote()).rejects.toThrow(
        "That didn't work — please try again.",
      );
      await expect(readActiveWorkspaceContextRemote()).rejects.not.toThrow(
        /grade_levels/,
      );
    } finally {
      err.mockRestore();
    }
  });
});
