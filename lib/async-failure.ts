// lib/async-failure.ts — telling "this was cancelled" apart from "this failed".
//
// WHY THIS EXISTS. A `git grep` for AbortError / signal.aborted / AbortController
// across lib/** and components/** finds ONE file, and it is animation code. No
// data-layer catch in this codebase asks whether it caught a cancellation. They
// all assume failure, and one of them says so out loud: the planner hydrate's
// catch is commented "on any backend/auth error" — a cancelled request is
// neither, and lands there anyway.
//
// That cost us a live defect. The planner hydrate runs as a Next server action —
// a POST to the page route — so navigating away CANCELS it. The browser reports
// `net::ERR_ABORTED`, the fetch rejects `TypeError: Failed to fetch` six
// milliseconds later, and the store painted an error state and an empty document
// for a request the user themselves had cancelled by clicking a link. Once per
// session, on clean auth, in production.
//
// It has cost us before, too: the 7.16 cutover "failure" was largely a
// navigation-abort sweep read as breakage. Making the distinction EXPLICIT and
// LOGGABLE is the durable fix — the next person reading a console should not
// have to re-litigate it.
//
// THE HARD PART, STATED HONESTLY. A cancelled `fetch` and a genuinely broken
// network are not always distinguishable from the error object. An explicit
// `AbortController.abort()` produces a named `AbortError`; a NAVIGATION-cancelled
// request produces a bare `TypeError: Failed to fetch` — the same thing an
// offline browser produces. So this classifier does not pretend to a certainty it
// does not have. It reports three states, and the middle one is the honest one:
//
//   "aborted"   — definitively cancelled. Never a real failure; never surface it
//                 as one.
//   "transport" — the request did not reach a verdict: cancelled by navigation,
//                 or the network is genuinely down. AMBIGUOUS. The right response
//                 is to retry once rather than to guess — a retry resolves the
//                 ambiguity by observation, which is the only way to resolve it.
//   "failed"    — a real error with a real message (backend, auth, RLS, a thrown
//                 Error from our own code). Surface it immediately.

export type AsyncFailureKind = "aborted" | "transport" | "failed";

/** Error names browsers use for an explicitly cancelled request. */
const ABORT_NAMES = new Set(["AbortError", "CanceledError"]);

/** Message fragments a cancelled-or-unreachable fetch produces across engines.
 *  Chrome: "Failed to fetch". Firefox: "NetworkError when attempting to fetch
 *  resource." Safari: "Load failed". Undici (node/edge): "fetch failed" /
 *  "terminated". React Native: "Network request failed".
 *
 *  ONLY CONSULTED FOR A `TypeError` — see below. Loose words like "terminated"
 *  are safe here precisely because of that gate; matched against any Error they
 *  would swallow real backend messages ("transaction terminated by
 *  administrator") and retry something that can never succeed. */
const TRANSPORT_FRAGMENTS = [
  "failed to fetch",
  "networkerror",
  "load failed",
  "fetch failed",
  "network request failed",
  "terminated",
];

/**
 * Classify a rejection so a caller can tell cancellation from failure.
 *
 * Deliberately conservative in one direction: anything with a real, specific
 * error message is `"failed"`. Only the small, well-known set of shapes a
 * cancelled or unreachable fetch produces is treated as ambiguous, because
 * mislabelling a genuine backend error as "transport" would silently retry a
 * request that is never going to succeed and delay a real error reaching the
 * teacher.
 */
export function classifyAsyncFailure(error: unknown): AsyncFailureKind {
  if (error === null || error === undefined) return "failed";

  // The unambiguous case: an explicitly aborted request. DOMException carries
  // ABORT_ERR (20) as well as the name, and both are checked because some
  // polyfills set only one.
  const name =
    typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (ABORT_NAMES.has(name)) return "aborted";
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.code === DOMException.ABORT_ERR
  ) {
    return "aborted";
  }

  // THE `TypeError` GATE IS LOAD-BEARING. Every engine reports a failed or
  // cancelled `fetch` as a TypeError specifically — that is what the spec
  // requires. Our own thrown errors, PostgREST errors and RLS denials are plain
  // Errors with real messages. Matching the fragments below against ANY error
  // would classify "transaction terminated by administrator" as transport and
  // retry a request that is never going to succeed, delaying a genuine failure
  // reaching the teacher. The message check narrows within TypeErrors; the type
  // check is what keeps real errors out.
  if (!(error instanceof TypeError)) return "failed";

  const message = String(
    (error as { message?: unknown }).message ?? "",
  ).toLowerCase();
  if (message.length === 0) return "failed";

  // A cancelled server action surfaces as a bare TypeError with one of these
  // messages — indistinguishable from a real transport fault, hence "transport"
  // rather than a guess in either direction.
  if (TRANSPORT_FRAGMENTS.some((f) => message.includes(f))) return "transport";

  return "failed";
}

/** True when the rejection is DEFINITELY a cancellation, so nothing about it
 *  should be surfaced to the user or painted as an error state. */
export function isAborted(error: unknown): boolean {
  return classifyAsyncFailure(error) === "aborted";
}

/** True when the request reached no verdict — cancelled by navigation, or the
 *  network is down. The caller should RETRY rather than conclude either way; a
 *  second attempt settles it by observation. */
export function isUnsettled(error: unknown): boolean {
  const kind = classifyAsyncFailure(error);
  return kind === "aborted" || kind === "transport";
}

/**
 * Should a read be retried after `error`, given it has already run `attempt`
 * times (0 = this was the first)?
 *
 * TWO RULES, AND BOTH BOUNDS MATTER.
 *
 * A real failure is never retried: the error has a specific message, so the
 * request reached a verdict and repeating it just delays that verdict reaching
 * the user.
 *
 * An unsettled one is retried, but only within a BUDGET. Unbounded retries look
 * harmless — each attempt is cheap and the cause is usually a navigation — right
 * up until a user clicking through a slow cold load spawns a chain that never
 * terminates. And a budget that is too small strands the user: on the last
 * attempt the caller must settle to a real state rather than sit on "loading",
 * because nothing further is coming and a permanent skeleton is a failure from
 * the user's seat whatever cancelled it.
 *
 * ONLY FOR READS. A write must not use this: repeating a write whose fate is
 * unknown risks applying it twice, and the queues already handle write ordering.
 */
export function shouldRetryRead(
  error: unknown,
  attempt: number,
  maxAttempts: number,
): boolean {
  if (classifyAsyncFailure(error) === "failed") return false;
  return attempt + 1 < maxAttempts;
}
