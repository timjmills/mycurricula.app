// planner-hydrate-one-roundtrip.test.ts — the store's hydrate must reach the
// backend ONCE, not six times.
//
// This is the regression guard for the actual user-visible bug: /weekly taking
// 10–15 s to become usable. `PlannerProvider`'s hydrate effect read the grade,
// then lessons + subjects + units + standards, then the sections batch — six
// calls through `plannerClient`, which under the Supabase flag is six Next
// Server Actions. Next runs client-initiated server actions strictly one at a
// time, so the `Promise.all` in the middle was serial on the wire. Measured on
// production, replaying those six requests concurrently instead of serially cut
// ~9.4 s to ~4.5 s.
//
// The assertion is deliberately about the CALL SHAPE rather than about timing:
// a wall-clock test would be flaky and, worse, would pass under the mock source
// (which never round-trips at all). "The hydrate makes exactly one backend call,
// and never the six individual reads" is the property that has to hold, and it
// is checkable here.
//
// It mounts the real provider over linkedom (tests/mount-react.ts) so the real
// effect runs. Everything below the provider is stubbed; nothing about the
// hydrate path is.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";

const OWNER = "owner-uuid";
const GRADE = "grade-uuid";

const h = vi.hoisted(() => ({
  bundle: vi.fn(),
  reads: {
    getActiveGradeLevelId: vi.fn(),
    listLessons: vi.fn(),
    listSubjects: vi.fn(),
    listUnits: vi.fn(),
    listStandards: vi.fn(),
    getSectionsBatch: vi.fn(),
    getSections: vi.fn(),
  },
}));

// The facade. Both the batched entry point AND the six individual reads are
// stubbed, so the test can see WHICH of them the hydrate actually uses.
vi.mock("@/lib/planner/client", () => ({
  loadPlannerHydrateBundle: h.bundle,
  plannerClient: h.reads,
}));

// The hydrate effect is flag-gated; force it ON so the test exercises the real
// backend path rather than the mock short-circuit.
vi.mock("@/lib/planner/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner/source")>()),
  isPlannerSupabaseConfigured: () => true,
}));

// A signed-in owner, without mounting the whole app-state provider tree.
vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    currentUser: { id: OWNER },
    editMode: "personal" as const,
  }),
}));

// The barrel pulls 'use server' actions → next/headers, which cannot load here.
vi.mock("@/lib/workspaces", () => ({
  WORKSPACE_CHANGED_EVENT: "mycurricula:workspace-changed",
}));

import { mountReact } from "./mount-react";
import { PlannerProvider } from "@/lib/planner-store";

function bundleValue(lessonCount: number) {
  return {
    gradeLevelId: GRADE,
    // The school the reads were scoped by — the bundle reports it so a server
    // seed can be labelled with a fact about the rows rather than an inference.
    schoolId: "school-uuid",
    lessons: Array.from({ length: lessonCount }, (_, i) => ({
      id: `l${i}`,
      subject: "math",
      unit: "u1",
      week: 1,
      day: 0,
      title: `Lesson ${i}`,
      resources: [],
    })),
    subjects: [{ id: "math", name: "Math", cls: "math", icon: "Ma" }],
    units: [],
    standards: {},
    sections: {},
    sectionsFailed: false,
  };
}

describe("PlannerProvider hydrate — one backend round trip", () => {
  beforeEach(() => {
    h.bundle.mockReset();
    for (const fn of Object.values(h.reads)) fn.mockReset();
  });

  it("calls the batched loader ONCE and none of the six individual reads", async () => {
    h.bundle.mockResolvedValue(bundleValue(3));

    const harness = await mountReact(PlannerProvider);
    try {
      await harness.render({ children: createElement("div", null, "ok") });

      // THE FIX. One call, carrying the owner — not six queued server actions.
      expect(h.bundle).toHaveBeenCalledTimes(1);
      expect(h.bundle).toHaveBeenCalledWith(OWNER);

      // THE REGRESSION GUARD. Re-introducing any of these at the hydrate call
      // site puts a second entry back on the server-action queue, and the whole
      // saving is spent again.
      for (const [name, fn] of Object.entries(h.reads)) {
        expect(
          fn,
          `plannerClient.${name} must not be called during hydrate`,
        ).not.toHaveBeenCalled();
      }
    } finally {
      await harness.unmount();
    }
  });

  it("does not re-issue the load on a re-render with the same owner", async () => {
    h.bundle.mockResolvedValue(bundleValue(1));

    const harness = await mountReact(PlannerProvider);
    try {
      await harness.render({ children: createElement("div", null, "a") });
      await harness.render({ children: createElement("div", null, "b") });
      await harness.render({ children: createElement("div", null, "c") });
      expect(h.bundle).toHaveBeenCalledTimes(1);
    } finally {
      await harness.unmount();
    }
  });

  // A grade with no lessons still has to reach the same single call — the
  // cold-start path must not fall back to the six-read shape.
  it("uses the same single call for a zero-lesson grade", async () => {
    h.bundle.mockResolvedValue({ ...bundleValue(0) });

    const harness = await mountReact(PlannerProvider);
    try {
      await harness.render({ children: createElement("div", null, "ok") });
      expect(h.bundle).toHaveBeenCalledTimes(1);
      expect(h.reads.getSectionsBatch).not.toHaveBeenCalled();
    } finally {
      await harness.unmount();
    }
  });
});
