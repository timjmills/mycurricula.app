// workspace-context-facade.test.ts — the regression guard for fix F2 (task #46).
//
// `getActiveWorkspaceContext` is the sole entry point `WorkspaceIdentitySync`
// (lib/notebook-state.tsx:236) calls on mount. It must reach the browser read,
// NOT `getActiveWorkspaceContextAction` — routing it back through the server
// action puts it on Next's one-at-a-time action queue, where it fires at t≈0
// and the planner hydrate waits out its full duration behind it.
//
// The assertion is about the CALL SHAPE, not timing: "the facade calls the
// browser read and never the action" is the property, and it is checkable here.

import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  remote: vi.fn(),
  actions: {
    getActiveWorkspaceContextAction: vi.fn(),
    listMyWorkspacesAction: vi.fn(),
    getActiveWorkspaceAction: vi.fn(),
    setActiveWorkspaceAction: vi.fn(),
    createWorkspaceAction: vi.fn(),
    renameWorkspaceAction: vi.fn(),
  },
}));

// The 'use server' module pulls next/headers, which cannot load here — and
// stubbing it is also what lets the test SEE whether the facade reaches for it.
vi.mock("@/lib/workspaces/actions", () => h.actions);
vi.mock("@/lib/workspaces/remote", () => ({
  readActiveWorkspaceContextRemote: h.remote,
}));

import { getActiveWorkspaceContext } from "@/lib/workspaces/client";

const CONTEXT = {
  workspace: {
    schoolId: "school-a",
    name: "Beta School",
    role: "admin" as const,
    isActive: true,
    isSolo: false,
    memberCount: 4,
  },
  notebooks: [{ gradeLevelId: "g1", name: "Grade 5", isActive: true }],
};

describe("getActiveWorkspaceContext", () => {
  beforeEach(() => {
    h.remote.mockReset();
    for (const fn of Object.values(h.actions)) fn.mockReset();
  });

  it("reads through the browser and NEVER queues a server action", async () => {
    h.remote.mockResolvedValue(CONTEXT);

    const ctx = await getActiveWorkspaceContext();

    expect(h.remote).toHaveBeenCalledTimes(1);
    expect(ctx).toEqual(CONTEXT);

    // THE REGRESSION GUARD. Re-pointing this at the action puts a second entry
    // back on the action queue and spends the whole F2 saving again.
    expect(h.actions.getActiveWorkspaceContextAction).not.toHaveBeenCalled();
  });

  // The action stays exported on purpose: it is the revert path and the
  // server-side entry point for any future caller. Pinning that it is still
  // importable stops a well-meaning cleanup from deleting it.
  it("keeps the server action available as the revert path", async () => {
    const actions = await import("@/lib/workspaces/actions");
    expect(typeof actions.getActiveWorkspaceContextAction).toBe("function");
  });

  it("propagates a read failure so the provider can fail closed", async () => {
    h.remote.mockRejectedValue(
      new Error("That didn't work — please try again."),
    );

    await expect(getActiveWorkspaceContext()).rejects.toThrow(
      "That didn't work — please try again.",
    );
  });
});
