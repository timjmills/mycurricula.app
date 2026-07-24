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
// No timers: a trailing debounce would only reduce write volume. The
// serialization IS the ordering fix, and a debounce alone would not provide it.

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
   *  failed payload is superseded by whatever is pending behind it. */
  onError?: (error: unknown, payload: T) => void;
}

export function createSerialWriteQueue<T>(
  options: SerialWriteQueueOptions<T>,
): SerialWriteQueue<T> {
  const { send, onError } = options;
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
        void Promise.resolve()
          .then(() => send(next))
          .catch((error: unknown) => {
            onError?.(error, next);
          })
          .then(() => {
            entry.inFlight = false;
            sendNext();
          });
      };
      sendNext();
    },

    activeKeyCount(): number {
      return slots.size;
    },
  };
}
