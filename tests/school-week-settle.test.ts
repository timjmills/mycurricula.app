import { describe, it, expect } from "vitest";

import {
  isCacheInScope,
  resolveWeekSettlement,
  shouldApplyRemoteRead,
} from "@/lib/school-week-settle";

// The school week is optimistic-write: the chips respond to a click before the
// database answers. That is only safe if the ROLLBACK is exact, so these tests
// pin the rules rather than the plumbing. Each describe block corresponds to a
// defect the adversarial review found in the first cut of this change, where
// the same logic lived inline in a `.then()` and could not be exercised.

type D = string;

const MON_FRI: D[] = ["mon", "tue", "wed", "thu", "fri"];
const SUN_THU: D[] = ["sun", "mon", "tue", "wed", "thu"];
const DEFAULT: D[] = SUN_THU;

describe("school-week write settlement — accepted writes", () => {
  it("displays AND commits a week the server accepted", () => {
    const s = resolveWeekSettlement<D>({
      outcome: "saved",
      attempted: MON_FRI,
      confirmed: SUN_THU,
      fallback: DEFAULT,
      superseded: false,
    });
    expect(s.apply).toEqual(MON_FRI);
    expect(s.commit).toBe(true);
    expect(s.status).toBe("saved");
  });

  it("commits on the prototype path, where localStorage IS the store", () => {
    const s = resolveWeekSettlement<D>({
      outcome: "local",
      attempted: MON_FRI,
      confirmed: null,
      fallback: DEFAULT,
      superseded: false,
    });
    expect(s.apply).toEqual(MON_FRI);
    expect(s.commit).toBe(true);
    expect(s.status).toBe("local");
  });
});

describe("school-week write settlement — rejected writes", () => {
  // The whole point of the change is that the UI never shows a week the
  // database did not accept. A rejected write must roll back AND must not be
  // promoted to the cache that seeds the next page load.

  it("rolls an RLS-denied write back to the last confirmed week", () => {
    const s = resolveWeekSettlement<D>({
      outcome: "denied",
      attempted: MON_FRI,
      confirmed: SUN_THU,
      fallback: DEFAULT,
      superseded: false,
    });
    expect(s.apply).toEqual(SUN_THU);
    expect(s.status).toBe("denied");
  });

  it("NEVER commits a rejected week to the cache", () => {
    for (const outcome of ["denied", "failed"] as const) {
      const s = resolveWeekSettlement<D>({
        outcome,
        attempted: MON_FRI,
        confirmed: SUN_THU,
        fallback: DEFAULT,
        superseded: false,
      });
      expect(s.commit, `${outcome} must not commit`).toBe(false);
    }
  });

  it("falls back when the server has never confirmed anything", () => {
    // Both the write AND the read failed — there is no confirmed value to
    // return to. Landing on the caller's fallback still beats leaving the
    // rejected week on screen, which is what the first cut did.
    const s = resolveWeekSettlement<D>({
      outcome: "failed",
      attempted: MON_FRI,
      confirmed: null,
      fallback: DEFAULT,
      superseded: false,
    });
    expect(s.apply).toEqual(DEFAULT);
    expect(s.commit).toBe(false);
    expect(s.status).toBe("failed");
  });
});

describe("school-week write settlement — superseded writes", () => {
  it("shows and reports nothing when a newer write has been issued", () => {
    // Two rapid preset clicks. The first response must not repaint, must not
    // touch the cache, and must not report — the second write owns the outcome.
    for (const outcome of ["saved", "local", "denied", "failed"] as const) {
      const s = resolveWeekSettlement<D>({
        outcome,
        attempted: MON_FRI,
        confirmed: SUN_THU,
        fallback: DEFAULT,
        superseded: true,
      });
      expect(s.apply, `${outcome} superseded`).toBeNull();
      expect(s.commit, `${outcome} superseded`).toBe(false);
      expect(s.status, `${outcome} superseded`).toBeNull();
    }
  });

  it("STILL records a superseded SUCCESS as the server's value", () => {
    // The database took write 1 even though write 2 has since been issued.
    // Forgetting that leaves write 2's rollback target pointing at a week the
    // server no longer holds — the divergence, reintroduced.
    const s = resolveWeekSettlement<D>({
      outcome: "saved",
      attempted: MON_FRI,
      confirmed: SUN_THU,
      fallback: DEFAULT,
      superseded: true,
    });
    expect(s.confirm).toEqual(MON_FRI);
  });

  it("rolls a denied write back to the week an earlier write confirmed", () => {
    // The succeeded-then-denied pair, end to end: write 1 (Mon–Fri) is accepted
    // and recorded; write 2 (a 3-day week) is denied and must land on Mon–Fri,
    // not on whatever preceded write 1.
    const first = resolveWeekSettlement<D>({
      outcome: "saved",
      attempted: MON_FRI,
      confirmed: SUN_THU,
      fallback: DEFAULT,
      superseded: true,
    });
    const second = resolveWeekSettlement<D>({
      outcome: "denied",
      attempted: ["sun", "tue", "thu"],
      confirmed: first.confirm,
      fallback: DEFAULT,
      superseded: false,
    });
    expect(second.apply).toEqual(MON_FRI);
    expect(second.commit).toBe(false);
  });

  it("never records a rejected or backend-less write as the server's value", () => {
    for (const outcome of ["denied", "failed", "local"] as const) {
      const s = resolveWeekSettlement<D>({
        outcome,
        attempted: MON_FRI,
        confirmed: SUN_THU,
        fallback: DEFAULT,
        superseded: false,
      });
      expect(s.confirm, `${outcome} must not confirm`).toBeNull();
    }
  });
});

describe("school-week remote read guard", () => {
  it("applies a resolved read when no write has intervened", () => {
    expect(shouldApplyRemoteRead(MON_FRI, 0, 0)).toBe(true);
    expect(shouldApplyRemoteRead(MON_FRI, 3, 3)).toBe(true);
  });

  it("discards a read that resolved AFTER the teacher changed the week", () => {
    // The once-per-load server read is shared and can resolve late. Applying it
    // then would silently undo an edit whose own write is still in flight.
    expect(shouldApplyRemoteRead(MON_FRI, 0, 1)).toBe(false);
    expect(shouldApplyRemoteRead(MON_FRI, 2, 5)).toBe(false);
  });

  it("treats null / empty as UNKNOWN and never applies it", () => {
    // A read error must not yank a teacher back to a default week.
    expect(shouldApplyRemoteRead(null, 0, 0)).toBe(false);
    expect(shouldApplyRemoteRead([], 0, 0)).toBe(false);
  });
});

describe("school-week cache scoping", () => {
  // A workspace switch is a soft router.refresh() in this app, so module-level
  // state survives it. An unscoped cache would serve one tenant's week inside
  // another — and a write issued from that assumption targets the wrong place.

  it("accepts a cache entry only for the same teacher + school", () => {
    expect(isCacheInScope("uid-1:school-a", "uid-1:school-a")).toBe(true);
  });

  it("rejects it across a workspace switch", () => {
    expect(isCacheInScope("uid-1:school-a", "uid-1:school-b")).toBe(false);
  });

  it("rejects it across an account switch on a shared device", () => {
    expect(isCacheInScope("uid-1:school-a", "uid-2:school-a")).toBe(false);
  });

  it("fails CLOSED when either scope is unknown", () => {
    expect(isCacheInScope(null, "uid-1:school-a")).toBe(false);
    expect(isCacheInScope("uid-1:school-a", null)).toBe(false);
    expect(isCacheInScope(null, null)).toBe(false);
  });
});
