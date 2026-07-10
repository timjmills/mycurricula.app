import { describe, it, expect } from "vitest";

import {
  deriveDayStatus,
  currentAndNext,
  type DayStatusLesson,
} from "@/lib/day-status";

// Pure status-derivation tests for the v2 Day canvas (components/day-v2).
// The effective time band comes from the lesson's own `time` label, else the
// subject's typical block via lessonTime() → SUBJECT_TIME. Reference minutes:
//   math    8:10–9:10   → 490 .. 550
//   reading 10:00–11:00 → 600 .. 660
//   grammar 1:10–1:40   → 790 .. 820  (afternoon: hour < 7 reads as PM)

/** Build a minimal lesson for the structural helpers. */
function lesson(over: Partial<DayStatusLesson> & { id?: string } = {}) {
  return {
    id: over.id ?? "L",
    status: over.status ?? "not_done",
    subject: over.subject ?? "math",
    time: over.time,
  } as DayStatusLesson & { id: string };
}

describe("deriveDayStatus", () => {
  it("returns done from the store status, overriding any time band", () => {
    // A lesson whose clock band is 'now' but marked done reads done.
    expect(deriveDayStatus(lesson({ status: "done", time: "8:10–9:10" }), 500)).toBe("done");
  });

  it("treats the band START as inclusive (now)", () => {
    expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 490)).toBe("now");
  });

  it("is now for a minute inside the band", () => {
    expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 500)).toBe("now");
  });

  it("treats the band END as exclusive (past → idle, not now)", () => {
    expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 550)).toBe("idle");
  });

  it("is upcoming before the band start", () => {
    expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 400)).toBe("upcoming");
  });

  it("is idle once the band is fully past", () => {
    expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 700)).toBe("idle");
  });

  it("falls back to the subject's typical block when no label is set", () => {
    // reading → 10:00–11:00 (600..660)
    expect(deriveDayStatus(lesson({ subject: "reading" }), 620)).toBe("now");
    expect(deriveDayStatus(lesson({ subject: "reading" }), 500)).toBe("upcoming");
    expect(deriveDayStatus(lesson({ subject: "reading" }), 700)).toBe("idle");
  });

  it("resolves afternoon labels (hour < 7 reads as PM)", () => {
    // grammar 1:10–1:40 → 790..820
    expect(deriveDayStatus(lesson({ subject: "grammar", time: "1:10–1:40" }), 800)).toBe("now");
  });

  it("is idle when the effective label cannot be parsed", () => {
    expect(deriveDayStatus(lesson({ time: "TBD" }), 500)).toBe("idle");
  });

  it("defaults isToday to true (2-arg call keeps the live split)", () => {
    expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 500)).toBe("now");
  });

  describe("isToday gate", () => {
    it("degrades a would-be 'now' lesson to idle when not today", () => {
      expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 500, false)).toBe("idle");
    });

    it("degrades a would-be 'upcoming' lesson to idle when not today", () => {
      expect(deriveDayStatus(lesson({ time: "8:10–9:10" }), 400, false)).toBe("idle");
    });

    it("keeps done through the gate when not today", () => {
      expect(deriveDayStatus(lesson({ status: "done", time: "8:10–9:10" }), 500, false)).toBe("done");
    });
  });
});

describe("currentAndNext", () => {
  it("finds the in-progress lesson and the first upcoming one", () => {
    const list = [
      lesson({ id: "a", time: "8:10–9:10" }), // 490..550
      lesson({ id: "b", time: "10:00–11:00" }), // 600..660
      lesson({ id: "c", time: "1:10–1:40" }), // 790..820
    ];
    // 8:30 (510): a is now, b is the first upcoming.
    expect(currentAndNext(list, 510)).toEqual({ currentId: "a", nextId: "b" });
  });

  it("returns null current when nothing is in progress (a gap)", () => {
    const list = [
      lesson({ id: "a", time: "8:10–9:10" }),
      lesson({ id: "b", time: "10:00–11:00" }),
    ];
    // 9:30 (570): between the two blocks — no now, b upcoming.
    expect(currentAndNext(list, 570)).toEqual({ currentId: null, nextId: "b" });
  });

  it("returns both null when the day is over / all done", () => {
    const list = [
      lesson({ id: "a", status: "done", time: "8:10–9:10" }),
      lesson({ id: "b", time: "10:00–11:00" }),
    ];
    // 12:00 (720): a done, b past → idle.
    expect(currentAndNext(list, 720)).toEqual({ currentId: null, nextId: null });
  });

  it("skips done lessons when choosing current/next", () => {
    const list = [
      lesson({ id: "a", status: "done", time: "8:10–9:10" }),
      lesson({ id: "b", time: "10:00–11:00" }),
    ];
    // 8:30 (510): a would be 'now' by clock but is done → skipped; b upcoming.
    expect(currentAndNext(list, 510)).toEqual({ currentId: null, nextId: "b" });
  });

  it("picks the FIRST upcoming when several lie ahead", () => {
    const list = [
      lesson({ id: "b", time: "10:00–11:00" }),
      lesson({ id: "c", time: "1:10–1:40" }),
    ];
    expect(currentAndNext(list, 400)).toEqual({ currentId: null, nextId: "b" });
  });

  it("handles an empty list", () => {
    expect(currentAndNext([], 500)).toEqual({ currentId: null, nextId: null });
  });

  it("returns both null when not today, regardless of the clock", () => {
    const list = [
      lesson({ id: "a", time: "8:10–9:10" }), // would be 'now' at 510
      lesson({ id: "b", time: "10:00–11:00" }),
    ];
    expect(currentAndNext(list, 510, false)).toEqual({
      currentId: null,
      nextId: null,
    });
  });
});
