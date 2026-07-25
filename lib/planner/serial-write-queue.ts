// serial-write-queue.ts — a latest-wins, one-in-flight-per-key write serializer.
//
// WHY THIS EXISTS. The planner autosaves per keystroke through a fire-and-forget
// tee. Firing those straight at the network makes them UNORDERED on the wire: a
// slow early request ("Qu") can commit AFTER a later one ("Quiz"), leaving the
// database stale relative to the UI with nothing surfaced. A reload then shows
// the teacher the older text and their work looks lost.
//
// THE CONTRACT. Per key, at most ONE request is in flight and at most ONE
// pending payload is held. A newer payload OVERWRITES the pending slot rather
// than queueing behind it; when the in-flight settles — success OR failure — the
// pending payload (if any) is sent next. So commits land in send order and the
// final persisted state always equals the last enqueued state.
//
// THE KEY IS THE CORRECTNESS BOUNDARY. Dropping an intermediate payload is only
// safe when a later payload for the same key fully supersedes it. Callers MUST
// therefore key by whatever they are overwriting — for a partial patch that
// means the target row AND the field(s), never the row alone, or a newer edit to
// one field would silently discard a still-pending edit to another.
//
// THE PAYLOAD CARRIES ITS OWN TARGET. `send` receives the payload it was given,
// so a drain closure can never apply one target's payload to another — the
// failure mode where a queue keyed by a caller-supplied string writes lesson B's
// patch to lesson A. Identity captured at enqueue time also means a mid-flight
// sign-out or a Personal↔Team toggle flip cannot retarget an authored payload.
//
// No DEBOUNCE timer: a trailing debounce would only reduce write volume. The
// serialization IS the ordering fix, and a debounce alone would not provide it.
//
// THE WATCHDOG. There is one timer, and it exists for a different reason. The
// contract above assumes every send eventually settles. A promise that NEVER
// settles — a fetch with no timeout against a black-holed connection, a hung
// server action — leaves `inFlight` true forever, and from that moment every
// later payload for that key parks in `pending` and is never sent. No rejection,
// no `onError`, nothing logged: the exact silent loss this module exists to
// prevent, made permanent for the rest of the session. `timeoutMs` bounds that:
// when a send has not settled within it, the queue reports a timeout through
// `onError` and releases the slot so the pending payload can go.
//
// RESIDUAL RISK, stated plainly — this is a TRADE, not a clean win. A timed-out
// request is ABANDONED, not cancelled: the source contract exposes no
// AbortSignal (plannerClient is a Proxy over a Next server action, which has no
// client-side cancellation), so the server may still commit it, and it may
// commit AFTER the payload the queue sent next. For the duration of that window
// two requests for one key are genuinely in flight — the very thing the rest of
// this file prevents.
//
// It is still the right trade. Without the watchdog the failure is PERMANENT
// and TOTAL: every later edit to that key is dropped for the rest of the
// session with nothing logged. With it, the damage is bounded — one already-hung
// request, one stale commit at worst, corrected by the next edit or reload, and
// reported through `onError` either way. Real cancellation (an AbortSignal
// threaded through `send` and `plannerDispatch`) closes the window for good and
// is the follow-up; until then, prefer a bounded, visible fault to a silent
// permanent one.

/** Rejection handed to `onError` when a send exceeds `timeoutMs`. A distinct
 *  class so a caller can tell "the write failed" from "the write never
 *  answered" — the latter may still commit server-side. */
export class SerialWriteTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(key: string, timeoutMs: number) {
    super(
      `serial write for "${key}" did not settle within ${timeoutMs}ms; the slot was released and the request abandoned (it may still commit)`,
    );
    this.name = "SerialWriteTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface SerialWriteQueue<T> {
  /** Enqueue `payload` under `key`, superseding any payload still pending for
   *  that key. Sends immediately when nothing is in flight for it. */
  enqueue(key: string, payload: T): void;
  /** Keys currently holding an in-flight request or a pending payload. Test +
   *  diagnostic surface; also proves settled keys are released rather than
   *  retained for the life of an editing session. */
  activeKeyCount(): number;
}

export interface SerialWriteQueueOptions<T> {
  /** Performs the write. Rejections are routed to `onError`, never thrown. */
  send: (payload: T) => Promise<unknown>;
  /** Notified on a rejected send. The queue continues draining regardless — a
   *  failed payload is superseded by whatever is pending behind it. Also fires
   *  with a `SerialWriteTimeoutError` when a send exceeds `timeoutMs`.
   *
   *  `pending` is the NEWER payload already queued for this key, or null.
   *
   *  IT IS HANDED OVER RATHER THAN REDUCED TO A BOOLEAN, deliberately. Whether
   *  a failure MATTERS is the difference between "this edit is lost" and "this
   *  attempt lost a race it did not need to win" — and only the caller can tell,
   *  because only the caller knows whether the newer payload COVERS the failed
   *  one. For a whole-value payload (a resolved slot, a complete section list)
   *  the mere existence of `pending` settles it. For a PARTIAL patch it does
   *  not: a pending `{status}` does not cover a failed `{status, reasonNotDone}`,
   *  and reporting that as superseded loses the reason silently.
   *
   *  A queue that answered this itself would have to assume the payloads are
   *  whole values — an assumption that is true for two of this repo's three
   *  callers and false for the third. Returning `pending` makes the caller state
   *  its own coverage rule instead of inheriting a wrong one.
   *
   *  A caller that surfaces failures MUST consult this, or it will tell a
   *  teacher their work was lost while the queue is busy saving it.
   *
   *  A TIMEOUT ALWAYS REPORTS `pending: null` — see the watchdog below. */
  onError?: (error: unknown, payload: T, pending: T | null) => void;
  /** Watchdog: milliseconds a single send may stay unsettled before the queue
   *  gives up on it, reports a `SerialWriteTimeoutError`, and releases the key
   *  so the pending payload drains. Defaults to `DEFAULT_SEND_TIMEOUT_MS`. Pass
   *  `0` (or a negative number) to disable — only do that where a hung send is
   *  impossible, e.g. a fully synchronous in-memory `send` in a test. */
  timeoutMs?: number;
  /** Timer injection for deterministic tests. Defaults to global
   *  setTimeout/clearTimeout. */
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

/** 20s. Comfortably above a slow-but-real planner write (the Supabase hydrate
 *  chain itself runs 11–16s on a cold dev server) and far below "the teacher has
 *  moved on", so the watchdog only ever fires on a genuinely stuck request. */
export const DEFAULT_SEND_TIMEOUT_MS = 20_000;

export function createSerialWriteQueue<T>(
  options: SerialWriteQueueOptions<T>,
): SerialWriteQueue<T> {
  const { send, onError } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const setT = options.timers?.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT =
    options.timers?.clearTimeout ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const slots = new Map<string, { inFlight: boolean; pending: T | null }>();

  return {
    enqueue(key: string, payload: T): void {
      let slot = slots.get(key);
      if (!slot) {
        slot = { inFlight: false, pending: null };
        slots.set(key, slot);
      }
      const entry = slot;
      // Latest wins: overwrite, never queue behind.
      entry.pending = payload;
      if (entry.inFlight) return; // the settle handler drains the slot

      const sendNext = (): void => {
        const next = entry.pending;
        if (next === null) {
          entry.inFlight = false;
          // Settled with nothing pending — drop the slot so a long editing
          // session doesn't retain one per touched field. A later write simply
          // re-creates it. Guarded so a slot re-created by an enqueue during
          // this drain is not deleted out from under its own in-flight request.
          if (slots.get(key) === entry) slots.delete(key);
          return;
        }
        entry.pending = null;
        entry.inFlight = true;
        // `send` is called INSIDE a then() so a SYNCHRONOUS throw becomes a
        // rejection like any other. Calling it directly would let the exception
        // escape `enqueue` to the caller, skip `onError`, and — worse — leave
        // `inFlight` true forever, wedging that key so every later edit to the
        // field queues behind a request that will never settle.
        // The settle step runs on BOTH arms. A plain `.catch(...).then(...)`
        // chain looks equivalent but is not: if `onError` itself throws, the
        // catch handler's promise REJECTS, the following `.then(onFulfilled)`
        // is skipped, and `inFlight` stays true forever — wedging the key so
        // every later edit to that lesson+field is silently dropped for the rest
        // of the session, with the rejection swallowed by the `void`. That is
        // the same failure this file already guards against for `send`; a
        // reporting callback must not be able to cause it either.
        // The watchdog and the send race to settle the slot ONCE. `settled`
        // makes that idempotent: whichever arrives first releases the key and
        // drains, and the loser is a no-op — so a timed-out request that
        // answers later can never release a slot a NEWER send is now holding
        // (which would run two requests for one key concurrently and re-open
        // the ordering hole this module closes).
        let settled = false;
        let watchdog: unknown = null;
        const settle = (): void => {
          if (settled) return;
          settled = true;
          if (watchdog !== null) clearT(watchdog);
          entry.inFlight = false;
          sendNext();
        };
        if (timeoutMs > 0) {
          watchdog = setT(() => {
            watchdog = null; // already fired; nothing to clear
            if (settled) return;
            try {
              // A TIMEOUT ALWAYS REPORTS `pending: null`, even when a newer
              // payload is waiting. Supersession is only harmless when the
              // failed write definitively did NOT land — then the newer payload
              // simply overwrites it. A timeout does not establish that: the
              // request was abandoned, not cancelled, so it may still commit,
              // and it may commit AFTER the payload we send next. Reporting it
              // as superseded would hide the ONLY signal for the one case where
              // the NEWER edit is the one at risk.
              onError?.(new SerialWriteTimeoutError(key, timeoutMs), next, null);
            } catch {
              /* a broken reporter must never stall the queue */
            }
            settle();
          }, timeoutMs);
        }
        void Promise.resolve()
          .then(() => send(next))
          .then(undefined, (error: unknown) => {
            if (settled) return; // the watchdog already reported this key
            try {
              onError?.(error, next, entry.pending);
            } catch {
              /* a broken reporter must never stall the queue */
            }
          })
          .then(settle, settle);
      };
      sendNext();
    },

    activeKeyCount(): number {
      return slots.size;
    },
  };
}
