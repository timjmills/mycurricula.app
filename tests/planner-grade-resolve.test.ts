// Pins the resolveGrade contract that keeps a hydrate FAILURE distinct from a
// genuine no-grade. Swallowing the failure to null (the old behavior) made a
// backend outage at the first hydrate step render as a false "empty" plan.
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted so the mock fn exists before the (hoisted) vi.mock factory runs —
// the factory must not close over a non-hoisted module const.
const { mockGetGrade } = vi.hoisted(() => ({ mockGetGrade: vi.fn() }));
vi.mock("@/lib/planner/client", () => ({
  plannerClient: { getActiveGradeLevelId: mockGetGrade },
}));

import { resolveGrade } from "@/lib/planner/grade";

describe("resolveGrade", () => {
  beforeEach(() => mockGetGrade.mockReset());

  it("returns null for a falsy owner without hitting the backend", async () => {
    expect(await resolveGrade(null)).toBeNull();
    expect(mockGetGrade).not.toHaveBeenCalled();
  });

  it("passes through a resolved grade uuid", async () => {
    mockGetGrade.mockResolvedValue("grade-uuid");
    expect(await resolveGrade("owner")).toBe("grade-uuid");
  });

  // The critical REGRESSION GUARD: a genuine no-grade must still resolve to null
  // (→ the store settles to "empty"), unchanged by the fix. Only a *failed
  // lookup* should now behave differently (propagate → "error").
  it("passes through a genuine no-grade (null) — the store settles it to empty", async () => {
    mockGetGrade.mockResolvedValue(null);
    expect(await resolveGrade("owner")).toBeNull();
  });

  // The FIX: a lookup FAILURE must PROPAGATE (no longer swallowed to null), so
  // the store's hydrate catch renders "error" — not a false "empty" plan. This
  // pins it so a future re-introduced catch can't silently regress the outage.
  it("PROPAGATES a lookup failure instead of swallowing it to null", async () => {
    mockGetGrade.mockRejectedValueOnce(new Error("backend down"));
    await expect(resolveGrade("owner")).rejects.toThrow("backend down");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// MULTI_WORKSPACE resolver behavior — needs a live Postgres with the
// 20260724120000 + 20260725120000 migrations applied + an auth context
// (auth.uid()); the supabase-source ON path resolves the active workspace via
// the auth_teacher_school_id() RPC. NOT runnable here (no DB harness);
// enumerated so the intended coverage is on the record.
// ───────────────────────────────────────────────────────────────────────────
describe("getActiveGradeLevelId under MULTI_WORKSPACE (needs a DB harness)", () => {
  it.todo(
    "a default_grade_level_id belonging to a FOREIGN (non-active) workspace is ignored, not returned",
  );
  it.todo(
    "the TGA fallback only considers assignments whose grade belongs to the ACTIVE workspace",
  );
  it.todo(
    "switching the active workspace switches the resolved grade (planner hydrates workspace B's content in workspace B)",
  );
  it.todo(
    "a member with NO grade in the active workspace resolves null (store settles to 'empty', never home content)",
  );
  it.todo(
    "resolveSchoolWeek reads the ACTIVE workspace's school_week, not the home school's",
  );
});
