// async-failure.test.ts — telling "cancelled" apart from "failed".
//
// This classifier exists because of a live prod defect: the planner hydrate runs
// as a Next server action, navigating away CANCELS it, and the store treated the
// resulting `TypeError: Failed to fetch` exactly like a backend error — painting
// an error state and an empty document for a request the teacher cancelled by
// clicking a link. Six milliseconds after `net::ERR_ABORTED`.
//
// The classifier's whole value is where it draws its lines, so that is what is
// pinned here. Two directions of mistake, both expensive:
//   • calling a REAL error "transport" → a retry that can never succeed, and a
//     genuine failure reaching the teacher late or not at all;
//   • calling a CANCELLATION "failed" → the original bug.

import { describe, expect, it } from "vitest";
import {
  classifyAsyncFailure,
  isAborted,
  isUnsettled,
  shouldRetryRead,
} from "@/lib/async-failure";

describe("classifyAsyncFailure — definitely cancelled", () => {
  it("names an AbortError by its name", () => {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    expect(classifyAsyncFailure(err)).toBe("aborted");
  });

  it("recognises axios-style CanceledError", () => {
    const err = new Error("canceled");
    err.name = "CanceledError";
    expect(classifyAsyncFailure(err)).toBe("aborted");
  });

  it("recognises a real DOMException from AbortController", () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(ctrl.signal.reason).toBeInstanceOf(DOMException);
    expect(classifyAsyncFailure(ctrl.signal.reason)).toBe("aborted");
  });
});

describe("classifyAsyncFailure — unsettled (cancelled OR network down)", () => {
  it.each([
    ["Failed to fetch", "Chrome"],
    ["NetworkError when attempting to fetch resource.", "Firefox"],
    ["Load failed", "Safari"],
    ["fetch failed", "undici / node"],
    ["Network request failed", "React Native"],
    ["terminated", "undici stream"],
  ])("classifies %s (%s) as transport", (message) => {
    expect(classifyAsyncFailure(new TypeError(message))).toBe("transport");
  });

  it("is case-insensitive", () => {
    expect(classifyAsyncFailure(new TypeError("FAILED TO FETCH"))).toBe(
      "transport",
    );
  });

  it("classifies the exact prod symptom", () => {
    // The line that appeared in production: TypeError: Failed to fetch, 6ms
    // after net::ERR_ABORTED on an in-flight server action.
    expect(classifyAsyncFailure(new TypeError("Failed to fetch"))).toBe(
      "transport",
    );
  });
});

describe("classifyAsyncFailure — genuinely failed", () => {
  it.each([
    "Planner repository load lessons failed: permission denied for table lessons",
    "grade id must be a grade uuid",
    "new row violates row-level security policy",
    "JWT expired",
    "relation \"unit_assessments\" does not exist",
  ])("treats a real backend message as failed: %s", (message) => {
    expect(classifyAsyncFailure(new Error(message))).toBe("failed");
  });

  it("requires a TypeError — a plain Error with a transport-ish word is FAILED", () => {
    // The load-bearing gate. Every engine reports a failed/cancelled fetch as a
    // TypeError specifically; our own throws and PostgREST/RLS errors are plain
    // Errors. Without this check, a real backend message containing one of the
    // fragments would be classified transport and retried forever.
    expect(classifyAsyncFailure(new Error("transaction terminated by administrator"))).toBe("failed");
    expect(classifyAsyncFailure(new Error("Failed to fetch"))).toBe("failed");
    expect(classifyAsyncFailure(new Error("NetworkError talking to the audit log"))).toBe("failed");
    // …and the same text as a TypeError IS transport.
    expect(classifyAsyncFailure(new TypeError("terminated"))).toBe("transport");
  });

  it("treats null / undefined / a non-error as failed, never as cancelled", () => {
    // Defaulting to "failed" is deliberate: an unrecognised rejection must not
    // be silently retried and then silently dropped.
    expect(classifyAsyncFailure(null)).toBe("failed");
    expect(classifyAsyncFailure(undefined)).toBe("failed");
    expect(classifyAsyncFailure(42)).toBe("failed");
    expect(classifyAsyncFailure({})).toBe("failed");
  });

  it("treats an empty message as failed", () => {
    expect(classifyAsyncFailure(new Error(""))).toBe("failed");
    expect(classifyAsyncFailure(new TypeError(""))).toBe("failed");
  });

  it("does NOT let a stray word inside a real error message trigger a retry", () => {
    // "failed" alone must not match — only the specific transport phrasings,
    // and only on a TypeError.
    expect(classifyAsyncFailure(new Error("update failed"))).toBe("failed");
    expect(
      classifyAsyncFailure(new Error("Planner repository move authored lesson failed")),
    ).toBe("failed");
    // Even as a TypeError, an unrecognised message is a real failure.
    expect(classifyAsyncFailure(new TypeError("x is not a function"))).toBe(
      "failed",
    );
  });
});

describe("the two predicates", () => {
  it("isAborted is true ONLY for definite cancellation", () => {
    const abort = new Error("x");
    abort.name = "AbortError";
    expect(isAborted(abort)).toBe(true);
    expect(isAborted(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAborted(new Error("permission denied"))).toBe(false);
  });

  it("isUnsettled covers both no-verdict cases and nothing else", () => {
    const abort = new Error("x");
    abort.name = "AbortError";
    expect(isUnsettled(abort)).toBe(true);
    expect(isUnsettled(new TypeError("Failed to fetch"))).toBe(true);
    expect(isUnsettled(new Error("permission denied"))).toBe(false);
  });
});

// ── The read-retry budget ──────────────────────────────────────────────────
// Both bounds matter. Unbounded retries look harmless — each attempt is cheap
// and the cause is usually a navigation — until a user clicking through a slow
// cold load spawns a chain that never terminates. Too small a budget strands
// them on a permanent skeleton with nothing coming.

describe("shouldRetryRead", () => {
  const MAX = 3;

  it("retries an unsettled read while budget remains", () => {
    expect(shouldRetryRead(new TypeError("Failed to fetch"), 0, MAX)).toBe(true);
    expect(shouldRetryRead(new TypeError("Failed to fetch"), 1, MAX)).toBe(true);
  });

  it("STOPS on the final attempt so the caller can settle to a real state", () => {
    // attempt 2 is the third and last; retrying would be attempt 3.
    expect(shouldRetryRead(new TypeError("Failed to fetch"), 2, MAX)).toBe(
      false,
    );
    expect(shouldRetryRead(new TypeError("Failed to fetch"), 99, MAX)).toBe(
      false,
    );
  });

  it("retries a definite cancellation the same way", () => {
    const abort = new Error("x");
    abort.name = "AbortError";
    expect(shouldRetryRead(abort, 0, MAX)).toBe(true);
    expect(shouldRetryRead(abort, 2, MAX)).toBe(false);
  });

  it("NEVER retries a real failure, even on the first attempt", () => {
    // The request reached a verdict; repeating it only delays that verdict
    // reaching the teacher.
    expect(
      shouldRetryRead(new Error("permission denied for table lessons"), 0, MAX),
    ).toBe(false);
  });

  it("a budget of 1 means no retries at all", () => {
    expect(shouldRetryRead(new TypeError("Failed to fetch"), 0, 1)).toBe(false);
  });
});
