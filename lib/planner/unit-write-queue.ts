// lib/planner/unit-write-queue.ts — the per-unit write queue for the Unit Plan
// editor (B1.7). A PURE, dependency-injected state machine (so the concurrency
// contract the §4a gate scrutinized is deterministically tested — see
// tests/unit-write-queue.test.ts; the flag-ON path is neither live-testable on
// the mock nor React-mountable in this repo's node test env).
//
// CONFIRM-ONLY MODEL (§4a round 4 — the design that ends the cycle). The catalog
// holds ONLY server-CONFIRMED values; it is NEVER written optimistically. The
// editor's local DRAFT is the user's live in-progress value. So this queue never
// has to UNDO anything — there is no baseline capture, no reconcile-from-server,
// no failure-revert (the class of "stale optimistic value left after a failed /
// dropped / mode-switched write" — eight findings across rounds 1–3 — simply
// cannot exist when nothing is optimistically written).
//
// GUARANTEES (each pinned by tests/unit-write-queue.test.ts):
//   • SERIALIZED + COALESCED: at most ONE in-flight RPC per unit; newer patches
//     merge into a single pending slot and drain in send order.
//   • SUCCESS → dispatch the CANONICAL returned row into the catalog (guarded on
//     an empty pending slot so an older echo can't override a newer confirmed
//     write).
//   • FAILURE → do NOTHING to the catalog (it was never dirtied) + surface the
//     error via onResult(false). The draft stays so the user can retry.
//   • MODE GATE AT SEND TIME: canWrite() is re-checked BEFORE every send; a write
//     coalesced in Team mode is DROPPED + surfaced (never silently sent) if the
//     user switched to Personal before it drained — again, no catalog undo needed.

import type { Unit } from "../types";
import type { UnitPatch } from "./source";

export interface UnitWriteQueueDeps {
  /** Persist a unit patch; resolves with the canonical row, rejects on an RLS
   *  denial / transport error. (Flag OFF this is the in-memory mock, which is the
   *  confirming source of truth for the session.) */
  updateUnitFields: (unitId: string, patch: UnitPatch) => Promise<Unit>;
  /** Apply a CONFIRMED patch to the in-memory catalog (a reducer dispatch in the
   *  store). Called ONLY on a successful write — never optimistically. */
  reconcile: (unitId: string, patch: UnitPatch) => void;
  /** True when writes are allowed (Team Curriculum mode). Re-checked at send. */
  canWrite: () => boolean;
  /** Project a Unit → its editable `UnitPatch` (for the canonical merge). */
  unitToPatch: (u: Unit) => UnitPatch;
  /** Error sink (console.error in the store; captured in tests). */
  onError?: (message: string, err: unknown) => void;
  /** Retain a FAILED write's patch OUTSIDE the component, keyed by unit (§4a R5
   *  H2). The editor may unmount before an RPC settles (close / unit switch), so
   *  a post-unmount failure has no component to surface it — the store holds the
   *  failed patch so the unit's next open can re-surface / retry it. Merged with
   *  any prior retained patch for the unit. */
  retainFailed?: (unitId: string, patch: UnitPatch) => void;
  /** Clear the CONFIRMED fields from a unit's retained failed patch (§4a R6 H2-B
   *  — FIELD-WISE). A confirmed write supersedes only the fields it actually
   *  covered; fields still unconfirmed (e.g. an earlier failed `bigIdea` retry
   *  while a `notes` edit succeeds) stay retained. `confirmedPatch` is the patch
   *  that just committed. */
  clearFailed?: (unitId: string, confirmedPatch: UnitPatch) => void;
}

export interface UnitWriteQueue {
  /** Enqueue a patch for a unit. The catalog is NOT touched until the write is
   *  confirmed (confirm-only). `onResult(false)` fires on a denied/dropped write;
   *  `onResult(true)` on a confirmed one. */
  enqueue: (
    unitId: string,
    patch: UnitPatch,
    onResult?: (ok: boolean) => void,
  ) => void;
}

interface Entry {
  inFlight: boolean;
  pending: UnitPatch | null;
  onResult?: (ok: boolean) => void;
}

/**
 * Which keys of a RETAINED failed patch have gone stale — i.e. the unit's
 * server-confirmed value for that key is no longer what it was when the write
 * failed.
 *
 * WHY THIS MATTERS. A retained patch outlives the editor that authored it (that
 * is the point — §4a R5 H2) and it also outlives a RE-HYDRATE, which is where it
 * turns dangerous. Teacher A's `bigIdea:"A"` fails; a re-hydrate later brings in
 * teammate B's `bigIdea:"C"`; A clicks Retry and the queue re-sends `"A"`
 * verbatim, reverting a TEAM value to text that was not on screen at retry
 * time — and because the retry genuinely commits, `onResult(true)` clears the
 * banner and it reads as success. Units are shared content, so this is a
 * silent team-wide revert.
 *
 * `baseline` is what the unit held when the write failed; `current` is what it
 * holds now. A key whose value moved between the two is reported, and the caller
 * must drop it from the retry rather than blind-overwrite.
 *
 * Pure and exported so the rule is unit-testable without a queue or a store.
 */
export function staleUnitPatchKeys(
  patch: UnitPatch,
  baseline: UnitPatch,
  current: UnitPatch,
): (keyof UnitPatch)[] {
  const stale: (keyof UnitPatch)[] = [];
  for (const key of Object.keys(patch) as (keyof UnitPatch)[]) {
    const was = baseline[key];
    const now = current[key];
    if (was === now) continue;
    // Structural compare: the catalog rebuilds unit objects on every confirmed
    // write, so reference equality reports far too many keys as moved. Absent
    // and `undefined` are the same value to the write path.
    if (was === undefined || now === undefined) {
      stale.push(key);
      continue;
    }
    if (JSON.stringify(was) !== JSON.stringify(now)) stale.push(key);
  }
  return stale;
}

export function createUnitWriteQueue(deps: UnitWriteQueueDeps): UnitWriteQueue {
  const queue = new Map<string, Entry>();

  const enqueue = (
    unitId: string,
    patch: UnitPatch,
    onResult?: (ok: boolean) => void,
  ): void => {
    let entry = queue.get(unitId);
    if (!entry) {
      entry = { inFlight: false, pending: null, onResult };
      queue.set(unitId, entry);
    }
    const q = entry;
    // Coalesce newer edits into the pending slot; the pending callback tracks the
    // latest enqueue's onResult (it is SNAPSHOTTED per dispatched request below).
    q.pending = { ...(q.pending ?? {}), ...patch };
    q.onResult = onResult;
    if (q.inFlight) return; // the settle handler drains the slot

    const sendNext = (): void => {
      // Re-check the mode gate BEFORE each send. A write coalesced in Team mode
      // must not commit after a switch to Personal — drop it (nothing to undo;
      // the catalog was never dirtied) and surface the drop.
      if (!deps.canWrite()) {
        const dropped = q.pending;
        const cb = q.onResult;
        q.pending = null;
        q.inFlight = false;
        queue.delete(unitId);
        if (dropped) cb?.(false);
        return;
      }
      const next = q.pending;
      if (!next) {
        q.inFlight = false;
        queue.delete(unitId);
        return;
      }
      // §4a R5 M3: SNAPSHOT this dispatched request's callback into a local const
      // so its terminal result invokes THIS request's callback — never a later
      // request's (which would clear the newer request's "Saving" before it is
      // confirmed). The entry's `q.onResult` keeps advancing as newer edits
      // coalesce; `cb` is frozen to the request actually in flight.
      const cb = q.onResult;
      q.pending = null;
      q.inFlight = true;
      void deps.updateUnitFields(unitId, next).then(
        (updated) => {
          // SUCCESS: dispatch the CONFIRMED canonical row into the catalog. Sends
          // are serialized, so dispatches are already in send order — no guard is
          // needed (and guarding on an empty pending slot would WRONGLY skip a
          // confirmed write whose follow-up is later dropped by the mode gate,
          // leaving the catalog stale until the next hydrate). Both are
          // server-confirmed states in sequence; the latest confirmed one wins.
          deps.reconcile(unitId, deps.unitToPatch(updated));
          // FIELD-WISE (§4a R6 H2-B): a confirmed write supersedes only the
          // fields it actually covered — `next` is the patch that just
          // committed. An earlier failed retry of a DIFFERENT field stays
          // retained. Passing `next` (not the canonical row) is deliberate:
          // clearing keys off what this write set, not the unit's full state.
          deps.clearFailed?.(unitId, next);
          cb?.(true);
          q.inFlight = false;
          sendNext();
        },
        (err: unknown) => {
          deps.onError?.("[planner] persist 'updateUnitFields' failed", err);
          // FAILURE: do NOTHING to the catalog (it was never optimistically
          // written). RETAIN the failed patch OUTSIDE the component (§4a R5 H2)
          // so a post-unmount failure isn't lost — the unit's next open can
          // re-surface / retry it. Surface via this request's callback.
          deps.retainFailed?.(unitId, next);
          cb?.(false);
          q.inFlight = false;
          sendNext(); // retry any newer pending (mode re-checked at top)
        },
      );
    };
    sendNext();
  };

  return { enqueue };
}
