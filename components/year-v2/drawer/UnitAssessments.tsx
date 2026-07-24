"use client";

// UnitAssessments.tsx — the UNIT-OWNED half of the drawer's Assessments pane
// (B3, migration 20260729120000).
//
// A DIFFERENT THING FROM THE LESSON ROLL-UP ABOVE IT. A lesson assessment is
// four columns ON a lesson row ("a lesson wearing a hat"); it always belongs to
// exactly one lesson and the roll-up names that lesson on every row. A UNIT
// assessment is a ROW IN ITS OWN TABLE: the unit owns MANY of them (a pre-test,
// a mid-unit check, a final task) and none of them belongs to a lesson. The
// panel must never blur the two, so this half is a self-contained, labelled
// section whose rows carry "Whole unit · <kind>" where a lesson row carries its
// lesson — the ownership is stated on the row, not left to the reader.
//
// TEAM CONTENT, NO FORK (CLAUDE.md §2). Like the B1.7 unit fields, unit
// assessments are MASTER / TEAM curriculum content — there is no personal copy
// to fork into, so `UnitAssessmentPatch` carries no SaveTarget and the write is
// authorized server-side by `unit_assessments_write` RLS. Editing affordances
// therefore appear ONLY in Team Curriculum mode; Personal renders the same rows
// READ-ONLY. We never paint a control that would silently no-op or pretend to
// save personally. Every editing control's tooltip is `required: true` (§4
// always-on list — team-wide changes affect every teacher).
//
// CONFIRM-ONLY (the UnitPlanFields / unit-write-queue model). Local `rows` hold
// ONLY server-confirmed values; nothing is written optimistically. A create /
// save / delete / reorder updates the list only once the source confirms it, and
// a denial or transport failure SURFACES rather than leaving a value on screen
// that never persisted. That is why there is no revert path anywhere here —
// there is nothing to revert.
//
// ABSENT KIND IS REAL. `kind` is optional and round-trips: an assessment can
// carry a title before the teacher has decided formative vs summative. "Not set"
// is a first-class choice in the editor, never a default we invent, and such a
// row renders as "Not classified" rather than being hidden.
//
// POSITION IS NOT AN INDEX. `position` is sparse after a delete (0,1,2 minus the
// middle leaves 0,2); creates append at MAX+1. Order comes from
// `sortUnitAssessments` (total, ties broken by id) and a move sends the COMPLETE
// id order to `reorderUnitAssessments`, which is what re-densifies it.
//
// DELETE IS A WHOLE-ROW DELETE. Never a soft-null of `kind` — that is how the
// prototype stranded orphaned purpose/notes text that resurfaced later.
//
// APPLY COUPLING (§4c). `unit_assessments` exists only once migration
// 20260729120000 is applied. Under the planner Supabase flag, before that apply,
// the list read REJECTS — so this section shows its own error state (with a
// retry) and the lesson roll-up beside it is untouched. That is deliberate: a
// missing table must read as "couldn't load", never as "no assessments".

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UnitAssessment } from "@/lib/types";
import { isAssessmentKind } from "@/lib/types";
import type { UnitAssessmentPatch } from "@/lib/planner/source";
import { sortUnitAssessments } from "@/lib/planner/unit-assessments";
import { plannerClient } from "@/lib/planner/client";
import { useAppState } from "@/lib/app-state";
import { Button, Skeleton, ToggleGroup, Tooltip } from "@/components/ui";
import type { ToggleOption } from "@/components/ui";
import styles from "./AssessmentsPanel.module.css";

const SAVE_DEBOUNCE_MS = 500;

// ── Kind vocabulary ──────────────────────────────────────────────────────────

/** How the editor models `kind`. "unclassified" is the UI stand-in for a
 *  genuinely ABSENT kind — a real persisted state, not an error case. */
type KindChoice = "formative" | "summative" | "unclassified";

/** Team-wide control → the group carries `tooltipRequired`, so these options
 *  need no per-option `tooltipId` (a required tooltip is never dismissible and
 *  never renders the "turn off these tips" link). */
const KIND_OPTIONS: Array<ToggleOption<KindChoice>> = [
  {
    value: "unclassified",
    label: "Not set",
    ariaLabel: "Not classified",
    title:
      "Leave the kind blank — the assessment still belongs to the unit and still shows here.",
  },
  {
    value: "formative",
    label: "Formative",
    title:
      "A check for understanding partway through the unit (pre-test, mid-unit check).",
  },
  {
    value: "summative",
    label: "Summative",
    title:
      "An end-of-unit assessment of mastery (unit test, final performance task).",
  },
];

const KIND_LABEL: Record<KindChoice, string> = {
  formative: "Formative",
  summative: "Summative",
  unclassified: "Not classified",
};

/** An unvalidated or absent kind reads as "unclassified" — never dropped. */
function kindOf(a: UnitAssessment): KindChoice {
  return isAssessmentKind(a.kind) ? a.kind : "unclassified";
}

// ── Draft ────────────────────────────────────────────────────────────────────

interface Draft {
  kind: KindChoice;
  title: string;
  purpose: string;
  notes: string;
}

function draftOf(a: UnitAssessment): Draft {
  return {
    kind: kindOf(a),
    title: a.title ?? "",
    purpose: a.purpose ?? "",
    notes: a.notes ?? "",
  };
}

/** A text field's persisted value: blank clears the column (undefined → NULL via
 *  the mapper's key-presence rule), so a cleared field reads back as ABSENT
 *  rather than as an empty string the panel would then have to special-case. */
function textValue(raw: string): string | undefined {
  return raw.trim() === "" ? undefined : raw;
}

// ── Per-assessment write queue ───────────────────────────────────────────────

interface QueueSlot {
  pending: UnitAssessmentPatch | null;
  inFlight: boolean;
}

interface PatchQueue {
  /** Merge a patch into the row's pending slot and drain. MERGE, not replace —
   *  a newer `notes` edit must never discard a still-pending `title` edit. */
  enqueue: (id: string, patch: UnitAssessmentPatch) => void;
  /** Drop a row's queued work (it is being deleted) AND silence whatever is
   *  already in flight for it. Without the silencing, a save racing the delete
   *  would report "couldn't save" for a row the teacher just successfully
   *  removed — an error about work that no longer exists. */
  forget: (id: string) => void;
  /**
   * Resolves once nothing is pending or in flight for ANY row.
   *
   * The barrier every UNIT-level operation waits on. Reorder and delete replace
   * or remove whole row objects, so if a per-row PATCH is still outstanding they
   * race: a reorder that started first can return its older snapshot AFTER the
   * PATCH confirms and overwrite the newer title/purpose/notes, and a delete can
   * discard an edit that had already reached the server. Draining first makes
   * the ordering explicit instead of accidental.
   */
  idle: () => Promise<void>;
}

interface PatchQueueDeps {
  send: (id: string, patch: UnitAssessmentPatch) => Promise<UnitAssessment>;
  /** Re-checked BEFORE every send: a patch coalesced in Team mode must not
   *  commit after a switch to Personal. */
  canWrite: () => boolean;
  onConfirm: (row: UnitAssessment) => void;
  onFail: (reason: "denied" | "failed") => void;
}

/**
 * One in-flight request per assessment, newer patches merged into a single
 * pending slot — the `unit-write-queue` contract, per row. Serializing matters:
 * two unordered PATCHes for the same row can land out of order and persist the
 * older text. Nothing is written to `rows` here except a CONFIRMED row.
 */
function createPatchQueue(deps: PatchQueueDeps): PatchQueue {
  const slots = new Map<string, QueueSlot>();
  // Ids abandoned mid-flight by `forget` (a delete). Their in-flight replies are
  // discarded rather than reported — see `forget`.
  const abandoned = new Set<string>();

  const drain = (id: string): void => {
    const slot = slots.get(id);
    if (!slot || slot.inFlight) return;
    if (!deps.canWrite()) {
      const dropped = slot.pending !== null;
      slots.delete(id);
      if (dropped) deps.onFail("denied");
      return;
    }
    const patch = slot.pending;
    if (patch === null) {
      slots.delete(id);
      return;
    }
    slot.pending = null;
    slot.inFlight = true;
    void deps.send(id, patch).then(
      (row) => {
        slot.inFlight = false;
        if (abandoned.has(id)) return; // deleted while this was in flight
        deps.onConfirm(row);
        drain(id);
      },
      (err: unknown) => {
        slot.inFlight = false;
        if (abandoned.has(id)) return;
        console.error("[b3] unit assessment save failed", err);
        deps.onFail("failed");
        drain(id);
      },
    );
  };

  return {
    enqueue(id, patch) {
      // A fresh edit un-abandons the id. Ids are server-minted and never reused,
      // so this only matters if a delete failed and the row came back.
      abandoned.delete(id);
      const slot = slots.get(id) ?? { pending: null, inFlight: false };
      slot.pending = { ...(slot.pending ?? {}), ...patch };
      slots.set(id, slot);
      drain(id);
    },
    forget(id) {
      slots.delete(id);
      abandoned.add(id);
    },
    async idle() {
      // Poll rather than track waiters: `drain` re-enters itself on every
      // settle, so a promise-based barrier would need a waiter list threaded
      // through both arms of every send. A microtask-frequency poll over a map
      // that holds at most a handful of rows is cheaper to get right, and it
      // cannot miss a slot created while waiting.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let busy = false;
        for (const slot of slots.values()) {
          if (slot.inFlight || slot.pending !== null) {
            busy = true;
            break;
          }
        }
        if (!busy) return;
        await new Promise((r) => setTimeout(r, 15));
      }
    },
  };
}

// ── Cross-mount write tracking ───────────────────────────────────────────────
//
// MODULE scope on purpose: it has to OUTLIVE the component. The drawer mounts
// only its active pane, so switching to Insights and back unmounts and remounts
// this section. A write issued by the previous instance can still be in flight —
// its state update lands on a dead component, and a fresh read issued before it
// commits server-side returns the PRE-write snapshot, which the new instance
// would then show as confirmed truth until the unit is reopened.
//
// Every unit-level write registers here; a remount's read awaits them first.
// Rejections are swallowed: a failed write already surfaced its own message, and
// the read that follows is exactly how the UI recovers the true state.
const inFlightWrites = new Set<Promise<unknown>>();

/** Register a unit-level write so a later remount's read can wait for it. */
function trackUnitWrite<T>(p: Promise<T>): Promise<T> {
  const tracked = p.then(
    (v) => v,
    (e: unknown) => {
      throw e;
    },
  );
  inFlightWrites.add(tracked);
  void tracked.catch(() => {}).finally(() => inFlightWrites.delete(tracked));
  return p;
}

/**
 * Resolves once every registered write has settled AND no new one has taken its
 * place.
 *
 * LOOPS rather than awaiting a single snapshot. The per-row queue CHAINS: it
 * starts the next pending patch inside the settle handler of the current one, so
 * a successor registers after a snapshot was taken. Awaiting one snapshot would
 * return while that successor was still in flight, and the read it unblocks
 * would capture the PREDECESSOR's server state — the exact stale snapshot this
 * barrier exists to prevent, just one link further along.
 */
async function settleUnitWrites(): Promise<void> {
  while (inFlightWrites.size > 0) {
    await Promise.allSettled([...inFlightWrites]);
    // Yield a macrotask so a chained send has registered before we re-check;
    // it is queued from a `.then` that may not have run yet.
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

const MSG = {
  load: "Couldn’t load this unit’s assessments.",
  create: "Couldn’t add the assessment — nothing was saved.",
  save: "Couldn’t save — you may not have permission to edit the team’s assessments. The last saved version stands.",
  denied:
    "Your last change wasn’t saved — switch to Team Curriculum to edit unit assessments. The saved version is shown.",
  remove: "Couldn’t remove the assessment — it is still there.",
  reorder: "Couldn’t change the order — the saved order is shown.",
} as const;

// ── Props ────────────────────────────────────────────────────────────────────

export interface UnitAssessmentsProps {
  /** The unit these assessments belong to — the id as it appears on
   *  `Lesson.unit` (a slug under the mock; the Supabase source hashes a slug to
   *  its uuid exactly as `updateUnitFields` does, so the same value the Unit Plan
   *  tab edits with is the right one here). */
  unitId: string;
  /**
   * Whether this pane is actually ON SCREEN.
   *
   * The drawer subtree stays MOUNTED while closed (ExplorerShell hides it with
   * `display: none`) and "assessments" is the DEFAULT pane, so this component
   * mounts — and its effects run — on every unit-explorer open, including the
   * ones where nobody opened the drawer. Without this gate that is a wasted
   * `listUnitAssessments` round-trip per open under the planner flag, and a
   * console error per open before migration 20260729120000 is applied.
   *
   * LATCHED, not a live gate: the first `true` starts the read and the component
   * then behaves normally forever. Hiding the drawer must NOT tear down the rows,
   * an open editor, or an in-flight save.
   */
  visible: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function UnitAssessments({
  unitId,
  visible,
}: UnitAssessmentsProps): ReactNode {
  const { currentUser, editMode } = useAppState();
  const canEdit = editMode === "master";
  const ownerId = currentUser.id ?? "";
  const uid = useId();

  const [rows, setRows] = useState<UnitAssessment[]>([]);
  // This section's OWN readiness. The lesson roll-up's `dataState` says nothing
  // about a separate table read, and rendering "none yet" over an unfinished
  // read is exactly the loading dishonesty the 7.23 pass removed.
  const [readState, setReadState] = useState<"pending" | "ready" | "error">(
    "pending",
  );
  const [reloadTick, setReloadTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Bumped on a rejected save so the open editor reverts to confirmed values —
   *  see the queue's `onFail`. */
  const [revertTick, setRevertTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sectionRef = useRef<HTMLElement | null>(null);
  // Live values for callbacks that outlive the render they were created in.
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  // ── Read ───────────────────────────────────────────────────────────────────
  // Batched seam, one unit: the map is keyed by the ids passed in, and a unit
  // with no assessments comes back as an empty array (read, none) rather than a
  // missing key we could mistake for "not read".
  //
  // GATED ON FIRST REVEAL. `visible` latches: nothing is read until the pane is
  // actually shown, and once it has been, hiding the drawer changes nothing (see
  // the prop's doc). While unrevealed the state stays "pending", which renders a
  // skeleton — inside a `display: none` subtree, so it is neither seen nor
  // announced, and it is the honest state anyway: we have not read yet.
  const [revealed, setRevealed] = useState(visible);
  useEffect(() => {
    if (visible) setRevealed(true);
  }, [visible]);

  useEffect(() => {
    if (!revealed) return;
    let alive = true;
    setReadState("pending");
    // WAIT FOR OUTSTANDING WRITES FIRST. Only the ACTIVE pane is mounted, so
    // switching to Insights and straight back unmounts and remounts this
    // section. A write issued by the previous instance can still be in flight;
    // its `setRows` lands on a dead component, and a read issued before it
    // commits server-side returns the PRE-write snapshot — which this instance
    // would then display as confirmed truth until the unit is reopened.
    // `inFlightWrites` outlives the component precisely so the new read can
    // wait for the old instance's work.
    void settleUnitWrites().then(() => {
      if (!alive) return;
      readUnitAssessments();
    });

    function readUnitAssessments(): void {
      plannerClient.listUnitAssessments([unitId]).then(
        (map) => {
          if (!alive) return;
          setRows(sortUnitAssessments(map[unitId] ?? []));
          setReadState("ready");
        },
        (err: unknown) => {
          if (!alive) return;
          console.error("[b3] list unit assessments failed", err);
          setReadState("error");
        },
      );
    }

    return () => {
      alive = false;
    };
  }, [unitId, reloadTick, revealed]);

  // ── Write queue (created once; deps read the live refs) ───────────────────
  const queueRef = useRef<PatchQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createPatchQueue({
      send: (id, patch) =>
        trackUnitWrite(
          plannerClient.updateUnitAssessment(id, patch, ownerRef.current),
        ),
      canWrite: () => canEditRef.current,
      onConfirm: (row) => {
        setRows((prev) =>
          sortUnitAssessments(prev.map((r) => (r.id === row.id ? row : r))),
        );
        // A confirm RETIRES a stale failure. The queue drains after a failed
        // send, so a newer queued patch can succeed moments later — leaving the
        // banner insisting the change "wasn't saved" while the saved row on
        // screen proves otherwise. Whatever is displayed is now server-confirmed,
        // so the warning has stopped being true. (`scheduleSave` clears it on a
        // fresh edit for the same reason.)
        setError(null);
      },
      onFail: (reason) => {
        setError(reason === "denied" ? MSG.denied : MSG.save);
        // Snap the editor back to CONFIRMED values. Both failure messages end
        // "the saved version is shown" / "the last saved version stands", and
        // until now that was untrue: the editor kept displaying the rejected
        // text, so the teacher read an error while looking at the very words it
        // said had not been saved — and the draft was then silently reseeded
        // when the row collapsed, losing them without a second word. Reverting
        // makes what is on screen match both the message and the database.
        setRevertTick((n) => n + 1);
      },
    });
  }

  // ── Debounce (the UnitPlanFields shape) ───────────────────────────────────
  // The buffer carries its assessment id WITH the patch, so a flush always lands
  // on the row the edit was made on even if the open row changed inside the
  // 500ms window. A different id arriving commits the buffered one first.
  const pendingRef = useRef<{ id: string; patch: UnitAssessmentPatch } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const buffered = pendingRef.current;
    if (!buffered) return;
    pendingRef.current = null;
    queueRef.current?.enqueue(buffered.id, buffered.patch);
  }, []);

  const scheduleSave = useCallback(
    (id: string, partial: UnitAssessmentPatch): void => {
      setError(null); // a fresh edit clears a stale save error
      const buffered = pendingRef.current;
      if (buffered && buffered.id !== id) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        pendingRef.current = null;
        queueRef.current?.enqueue(buffered.id, buffered.patch);
      }
      pendingRef.current = {
        id,
        patch: { ...(pendingRef.current?.patch ?? {}), ...partial },
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on unmount / unit switch. The drawer mounts ONLY the active pane, so
  // switching to Insights unmounts this section mid-edit — without this, the last
  // keystrokes inside the debounce window would be lost.
  useEffect(() => {
    return () => flush();
  }, [unitId, flush]);

  // Leaving Team mode abandons in-progress work: cancel the debounce (the queue
  // would drop it at send time anyway), collapse the editor so the read-only view
  // renders CONFIRMED values only, and surface the discard rather than losing it
  // silently.
  useEffect(() => {
    if (canEdit) return;
    const hadPending = timerRef.current !== null || pendingRef.current !== null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    setAdding(false);
    setOpenId(null);
    if (hadPending) setError(MSG.denied);
  }, [canEdit]);

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Expand / collapse a row, flushing the row being left so a pending edit is
   *  never stranded behind a collapse. */
  const toggleOpen = useCallback(
    (id: string): void => {
      flush();
      setOpenId((prev) => (prev === id ? null : id));
    },
    [flush],
  );

  const create = useCallback(
    async (title: string, kind: KindChoice): Promise<void> => {
      if (!canEditRef.current || busy) return;
      setBusy(true);
      setError(null);
      try {
        const row = await trackUnitWrite(
          plannerClient.createUnitAssessment(
            unitId,
            {
              kind: kind === "unclassified" ? undefined : kind,
              title: textValue(title),
            },
            ownerRef.current,
          ),
        );
        setRows((prev) => sortUnitAssessments([...prev, row]));
        setAdding(false);
        setOpenId(row.id);
      } catch (err) {
        console.error("[b3] create unit assessment failed", err);
        setError(MSG.create);
      } finally {
        setBusy(false);
      }
    },
    [busy, unitId],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!canEditRef.current || busy) return;
      setBusy(true);
      setError(null);
      // LAND OUTSTANDING EDITS FIRST, then delete. Abandoning them up front (the
      // first cut) lost work whenever the delete FAILED: a PATCH already in
      // flight had its confirmation discarded, so the server could hold the edit
      // while the UI showed the pre-edit row and the teacher was told the row is
      // "still there" — true, but silently stale. Flushing and draining makes
      // the delete strictly ordered after every save, so a failed delete leaves
      // a row whose displayed text matches what was actually persisted.
      flush();
      await queueRef.current?.idle();
      // RE-CHECK AFTER THE AWAIT. The drain can take as long as the network
      // does, and the Personal / Team toggle is reachable throughout — so the
      // permission that was true when the teacher pressed Delete may be false by
      // the time we would send it. Without this, switching to Personal mid-drain
      // still deletes shared TEAM content. The patch queue already re-checks at
      // send time for exactly this reason; unit-level operations must too.
      if (!canEditRef.current) {
        setError(MSG.denied);
        setBusy(false);
        return;
      }
      try {
        await trackUnitWrite(
          plannerClient.deleteUnitAssessment(id, ownerRef.current),
        );
        // Only NOW is the row gone for good, so only now is it safe to silence
        // its queue slot.
        queueRef.current?.forget(id);
        setRows((prev) => prev.filter((r) => r.id !== id));
        setOpenId((prev) => (prev === id ? null : prev));
      } catch (err) {
        // The seam is deliberately NOT idempotent: an unauthorized or already-
        // gone delete throws, so it can never read as a success.
        console.error("[b3] delete unit assessment failed", err);
        setError(MSG.remove);
      } finally {
        setBusy(false);
      }
    },
    [busy, flush],
  );

  /** Move a row one slot. Sends the COMPLETE final id order (that is also what
   *  compacts a sparse sequence). Confirm-only: the row moves on screen when the
   *  source confirms, never before. */
  const move = useCallback(
    async (id: string, dir: -1 | 1): Promise<void> => {
      if (!canEditRef.current || busy) return;
      const from = rows.findIndex((r) => r.id === id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= rows.length) return;
      const next = rows.slice();
      const moved = next[from];
      next[from] = next[to];
      next[to] = moved;
      setBusy(true);
      setError(null);
      // Reorder replaces WHOLE row objects with the server's snapshot, so any
      // PATCH still outstanding would be clobbered: the reorder can be issued
      // first, the PATCH confirm land second, and then the reorder's older
      // snapshot arrive and overwrite the newer title/purpose/notes. Draining
      // first makes the ordering explicit — every edit is persisted and
      // reflected in the snapshot the reorder returns.
      flush();
      await queueRef.current?.idle();
      // Same re-check as `remove`: the drain is an await, and the Personal /
      // Team toggle stays reachable across it. A reorder is a team-wide write.
      if (!canEditRef.current) {
        setError(MSG.denied);
        setBusy(false);
        return;
      }
      try {
        const confirmed = await trackUnitWrite(
          plannerClient.reorderUnitAssessments(
            unitId,
            next.map((r) => r.id),
            ownerRef.current,
          ),
        );
        setRows(sortUnitAssessments(confirmed));
        // The moved row's button is re-created at its new position, so focus
        // would fall to <body>. Hand it back to the same control — or to its
        // sibling when the move landed on an end and disabled it.
        requestAnimationFrame(() => {
          const root = sectionRef.current;
          if (!root) return;
          const want = dir === -1 ? "up" : "down";
          const other = dir === -1 ? "down" : "up";
          const pick = (d: string): HTMLButtonElement | null =>
            root.querySelector<HTMLButtonElement>(
              `[data-ua-move="${d}"][data-ua-id="${id}"]`,
            );
          const target = pick(want);
          if (target && !target.disabled) target.focus();
          else pick(other)?.focus();
        });
      } catch (err) {
        console.error("[b3] reorder unit assessments failed", err);
        setError(MSG.reorder);
      } finally {
        setBusy(false);
      }
    },
    [busy, rows, unitId, flush],
  );

  // ── Body ───────────────────────────────────────────────────────────────────

  let body: ReactNode;
  if (readState === "pending") {
    body = <Skeleton lines={2} size="sm" label="Loading unit assessments…" />;
  } else if (readState === "error") {
    body = (
      <div className={styles.uLoadFail}>
        <p className={styles.note} role="alert">
          {MSG.load}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setReloadTick((t) => t + 1)}
        >
          Try again
        </Button>
      </div>
    );
  } else {
    body = (
      <>
        {rows.length === 0 ? (
          <p className={styles.note}>
            Nothing that belongs to the unit as a whole yet — a pre-test, a
            mid-unit check, or a final task would live here.
          </p>
        ) : (
          <ul className={styles.list}>
            {rows.map((row, i) => {
              const open = openId === row.id;
              const detailId = `${uid}-${row.id}-detail`;
              const kind = kindOf(row);
              const title = (row.title ?? "").trim();
              return (
                <li key={row.id} className={`${styles.row} ${styles.uRow}`}>
                  {/* Dismissible, not `required`: expanding only REVEALS the
                      assessment — the team-wide consequence belongs to the
                      controls inside, which carry their own always-on tips. */}
                  <Tooltip
                    content={
                      canEdit
                        ? "Open this assessment to edit what it checks for, its notes, its kind, and where it sits in the unit."
                        : "Open this assessment to read what it checks for and the team's notes on it."
                    }
                    tooltipId="b3-uassess-row"
                    side="bottom"
                  >
                    <button
                      type="button"
                      className={styles.uRowMain}
                      aria-expanded={open}
                      aria-controls={detailId}
                      onClick={() => toggleOpen(row.id)}
                    >
                      <span
                        className={styles.uGlyph}
                        data-kind={kind}
                        aria-hidden="true"
                      >
                        <span className={styles.uGlyphRing} />
                      </span>
                      <span className={styles.uRowText}>
                        <span
                          className={
                            title
                              ? styles.rowTitle
                              : `${styles.rowTitle} ${styles.rowTitleEmpty}`
                          }
                        >
                          {title || "Untitled assessment"}
                        </span>
                        {/* The ownership tell, on every row: a lesson assessment
                            names its lesson here; a unit one says "Whole unit". */}
                        <span className={styles.uRowCaption}>
                          Whole unit · {KIND_LABEL[kind]}
                        </span>
                      </span>
                      <Chevron open={open} />
                    </button>
                  </Tooltip>

                  {open ? (
                    canEdit ? (
                      <UnitAssessmentEditor
                        key={row.id}
                        id={detailId}
                        row={row}
                        index={i}
                        total={rows.length}
                        busy={busy}
                        revertTick={revertTick}
                        onField={scheduleSave}
                        onFlush={flush}
                        onMove={move}
                        onRemove={remove}
                      />
                    ) : (
                      <ReadOnlyDetail id={detailId} row={row} kind={kind} />
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit ? (
          <div className={styles.addSlot}>
            {adding ? (
              <AddUnitAssessment
                busy={busy}
                onAdd={create}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <Tooltip
                required
                content="Add an assessment that belongs to the whole unit — a pre-test, a mid-unit check, a final task. Every teacher on the team sees it."
                side="top"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setAdding(true)}
                >
                  Add unit assessment
                </Button>
              </Tooltip>
            )}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section
      ref={sectionRef}
      className={styles.uSection}
      aria-label="Unit assessments"
    >
      <div className={styles.uHead}>
        <h4 className={styles.uTitle}>Unit assessments</h4>
        {readState === "ready" && rows.length > 0 ? (
          <span className={styles.groupCount}>{rows.length}</span>
        ) : null}
        <Tooltip
          required
          content={
            canEdit
              ? "These assessments belong to the unit itself, not to a lesson — and they are shared with your whole team. Every teacher sees your edits."
              : "Unit assessments are shared with your whole team. Switch to Team Curriculum (top bar) to edit them."
          }
          side="bottom"
        >
          <span className={styles.uBadge} tabIndex={0}>
            {canEdit ? "Team content" : "Team · read-only"}
          </span>
        </Tooltip>
      </div>

      {error ? (
        <p className={styles.uError} role="alert">
          {error}
        </p>
      ) : null}

      {body}
    </section>
  );
}

// ── Field label + its always-on explanation ──────────────────────────────────

/**
 * A field label carrying the field's explanation. Every field below writes TEAM
 * content, so the tooltip is `required` (CLAUDE.md §4's always-on list).
 *
 * WHY THE LABEL AND NOT THE INPUT. The Tooltip primitive opens on FOCUS and
 * stays open until blur — a `required` bubble anchored to a textarea would sit
 * over the editor for the entire time the teacher types, and by definition could
 * not be dismissed. Anchoring the styled bubble to the label gives the desktop
 * hover path, and the SAME sentence is mirrored onto the control's native
 * `title=`, which covers touch long-press, hover over the field itself, and the
 * screen-reader description. No tab stop is added: a keyboard user reaches the
 * control, not the label, and the `title` travels with the control.
 */
function FieldLabel({
  text,
  tip,
  htmlFor,
}: {
  text: string;
  tip: string;
  htmlFor?: string;
}): ReactNode {
  return (
    <Tooltip required content={tip} side="top">
      {htmlFor ? (
        <label className={styles.fieldLabel} htmlFor={htmlFor}>
          {text}
        </label>
      ) : (
        <span className={styles.fieldLabel}>{text}</span>
      )}
    </Tooltip>
  );
}

/** The explanations, defined once so the label bubble and the control's native
 *  `title=` can never drift apart. */
const FIELD_TIP = {
  title:
    "Name this assessment the way your team will recognise it on the unit plan — everyone sees the same name.",
  purpose:
    "Say what this assessment actually measures, so anyone teaching the unit knows what evidence it produces.",
  notes:
    "Anything the team needs in order to give it: scoring, timing, accommodations.",
} as const;

// ── Chevron (matches the lesson rows') ───────────────────────────────────────

function Chevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      className={`${styles.chev} ${open ? styles.chevOpen : ""}`}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// ── Editor (Team mode) ───────────────────────────────────────────────────────

/**
 * The expanded editor for ONE unit assessment. Mounted with `key={row.id}` so
 * switching rows remounts it and the draft always starts from confirmed truth.
 *
 * Same draft-vs-store dance as the lesson AssessmentDetail: an external change
 * (a teammate's edit landing on the next read, a confirmed save) reseeds the
 * draft — but never while the teacher is focused inside the editor.
 */
function UnitAssessmentEditor({
  id,
  row,
  index,
  total,
  busy,
  revertTick,
  onField,
  onFlush,
  onMove,
  onRemove,
}: {
  id: string;
  row: UnitAssessment;
  index: number;
  total: number;
  busy: boolean;
  /** Bumped when a save is rejected — forces the draft back to `row`, so the
   *  editor stops showing text the server refused. */
  revertTick: number;
  onField: (id: string, patch: UnitAssessmentPatch) => void;
  onFlush: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(draftOf(row));
    // Individual fields, not object identity — a confirmed reorder hands back a
    // fresh object for every row and would otherwise clobber a live draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.kind, row.title, row.purpose, row.notes]);

  // A rejected save overrides the editing guard: the draft is not salvageable
  // (the queue already dropped that patch), so continuing to show it would be a
  // lie. Skips the initial mount — there is nothing to revert to yet.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    editing.current = false;
    setDraft(draftOf(row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revertTick]);

  const edit = useCallback(
    (next: Draft, patch: UnitAssessmentPatch): void => {
      editing.current = true;
      setDraft(next);
      onField(row.id, patch);
    },
    [onField, row.id],
  );

  const first = index === 0;
  const last = index === total - 1;

  return (
    <div
      id={id}
      className={`${styles.detail} ${styles.uDetail}`}
      onBlurCapture={(e) => {
        // Only when focus leaves the editor ENTIRELY. A blur onto a sibling field
        // (Title → Purpose) is still one editing session; clearing the guard there
        // would let the next confirmed row reseed the draft mid-keystroke.
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        editing.current = false;
        onFlush();
      }}
    >
      <div className={styles.field}>
        <FieldLabel text="Title" tip={FIELD_TIP.title} htmlFor={`${id}-title`} />
        <input
          id={`${id}-title`}
          type="text"
          className={styles.textInput}
          value={draft.title}
          placeholder="e.g. End-of-unit performance task"
          aria-label="Unit assessment title"
          title={FIELD_TIP.title}
          // Locked while a unit-level mutation is in flight. A delete or reorder
          // now drains outstanding saves BEFORE it runs, so an edit typed during
          // one would land after the drain and either patch a row that is about
          // to vanish or report "couldn't save" for a row already gone.
          disabled={busy}
          onChange={(e) =>
            edit(
              { ...draft, title: e.target.value },
              { title: textValue(e.target.value) },
            )
          }
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Kind</span>
        <div className={styles.kindRow}>
          <ToggleGroup
            options={KIND_OPTIONS}
            value={draft.kind}
            onChange={(next) =>
              edit(
                { ...draft, kind: next },
                { kind: next === "unclassified" ? undefined : next },
              )
            }
            ariaLabel="Unit assessment kind"
            size="sm"
            tooltipRequired
            disabled={busy}
          />
        </div>
      </div>

      <div className={styles.field}>
        <FieldLabel
          text="What it checks for"
          tip={FIELD_TIP.purpose}
          htmlFor={`${id}-purpose`}
        />
        <textarea
          id={`${id}-purpose`}
          className={styles.textArea}
          rows={2}
          value={draft.purpose}
          placeholder="The understanding or skill this assessment measures…"
          aria-label="Unit assessment purpose"
          title={FIELD_TIP.purpose}
          disabled={busy}
          onChange={(e) =>
            edit(
              { ...draft, purpose: e.target.value },
              { purpose: textValue(e.target.value) },
            )
          }
        />
      </div>

      <div className={styles.field}>
        <FieldLabel text="Notes" tip={FIELD_TIP.notes} htmlFor={`${id}-notes`} />
        <textarea
          id={`${id}-notes`}
          className={styles.textArea}
          rows={2}
          value={draft.notes}
          placeholder="Scoring, timing, accommodations…"
          aria-label="Unit assessment notes"
          title={FIELD_TIP.notes}
          disabled={busy}
          onChange={(e) =>
            edit(
              { ...draft, notes: e.target.value },
              { notes: textValue(e.target.value) },
            )
          }
        />
      </div>

      <div className={styles.uFoot}>
        <div className={styles.uOrder}>
          <span className={styles.uOrderLabel}>
            {index + 1} of {total}
          </span>
          <MoveButton
            id={row.id}
            dir={-1}
            disabled={first || busy}
            reason={first ? "This is already first in the unit." : undefined}
            onMove={onMove}
          />
          <MoveButton
            id={row.id}
            dir={1}
            disabled={last || busy}
            reason={last ? "This is already last in the unit." : undefined}
            onMove={onMove}
          />
        </div>

        {/* Destructive AND team-wide → the tooltip is `required` twice over. */}
        <Tooltip
          required
          content="Deletes this assessment for the whole team — kind, title, what it checks for, and notes all go, and it cannot be undone."
          side="top"
        >
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => onRemove(row.id)}
          >
            Delete
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

/** One reorder control. Icon-only, so it carries an explicit accessible name;
 *  when disabled the tooltip explains WHY (CLAUDE.md §4). */
function MoveButton({
  id,
  dir,
  disabled,
  reason,
  onMove,
}: {
  id: string;
  dir: -1 | 1;
  disabled: boolean;
  reason?: string;
  onMove: (id: string, dir: -1 | 1) => void;
}): ReactNode {
  const up = dir === -1;
  const label = up ? "Move earlier in the unit" : "Move later in the unit";
  return (
    <Tooltip
      required
      content={
        reason ??
        (up
          ? "Move this assessment one place earlier. The order is shared with your team."
          : "Move this assessment one place later. The order is shared with your team.")
      }
      side="top"
    >
      <button
        type="button"
        className={`${styles.moveBtn} ${styles.moveBtn}`}
        data-ua-move={up ? "up" : "down"}
        data-ua-id={id}
        aria-label={label}
        disabled={disabled}
        onClick={() => onMove(id, dir)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {up ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
        </svg>
      </button>
    </Tooltip>
  );
}

// ── Add flow ─────────────────────────────────────────────────────────────────

/**
 * Create a unit-owned assessment. Unlike the lesson add flow — where the kind IS
 * the commit, because an all-null lesson assessment reads back as "no
 * assessment" — a unit assessment is its own row, so a title alone is a perfectly
 * valid start and the kind can stay "Not set". The gate is only that SOMETHING
 * was said: a row with neither a title nor a kind would show up for the whole
 * team as an untitled, unclassified placeholder.
 */
function AddUnitAssessment({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (title: string, kind: KindChoice) => void;
  onCancel: () => void;
}): ReactNode {
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<KindChoice>("unclassified");
  const valid = title.trim() !== "" || kind !== "unclassified";

  return (
    <div className={styles.addForm}>
      <div className={styles.field}>
        <FieldLabel text="Title" tip={FIELD_TIP.title} htmlFor={titleId} />
        <input
          id={titleId}
          type="text"
          className={styles.textInput}
          value={title}
          placeholder="e.g. Fractions pre-test"
          title={FIELD_TIP.title}
          autoFocus
          // Locked once Add is pressed. The create is already in flight with the
          // values it was given, so an edit here would change nothing while
          // looking like it had.
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Kind</span>
        <div className={styles.kindRow}>
          <ToggleGroup
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
            ariaLabel="New unit assessment kind"
            size="sm"
            tooltipRequired
            disabled={busy}
          />
        </div>
      </div>

      <p className={styles.addHint}>
        Belongs to the whole unit, not to a lesson. You can add what it checks
        for and notes next.
      </p>

      <div className={styles.addActions}>
        {/* Team-wide write → `required` tooltip, so it is wrapped explicitly
            rather than via Button's `tooltip` prop (which has no required
            escalation). The Tooltip primitive wraps a disabled trigger in a
            span, so the disabled reason still surfaces on hover. */}
        <Tooltip
          required
          side="top"
          content={
            valid
              ? "Adds this assessment to the unit for the whole team."
              : "Give it a title or pick a kind first — otherwise your team sees an empty row."
          }
        >
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || busy}
            onClick={() => onAdd(title, kind)}
          >
            Add
          </Button>
        </Tooltip>
        {/* Disabled while the create is in flight. There is no cancellation to
            offer — the request is already on its way and WILL create the row —
            so an active Cancel would be a button that lies: the teacher dismisses
            the form, and the assessment appears anyway. */}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Read-only detail (Personal mode) ─────────────────────────────────────────

function ReadOnlyDetail({
  id,
  row,
  kind,
}: {
  id: string;
  row: UnitAssessment;
  kind: KindChoice;
}): ReactNode {
  return (
    <div id={id} className={`${styles.detail} ${styles.uDetail}`}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Kind</span>
        <p className={styles.roText}>{KIND_LABEL[kind]}</p>
      </div>
      <ReadOnlyField label="What it checks for" value={row.purpose} />
      <ReadOnlyField label="Notes" value={row.notes} />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value?: string;
}): ReactNode {
  const text = (value ?? "").trim();
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {text ? (
        <p className={styles.roText}>{text}</p>
      ) : (
        <p className={styles.roEmpty}>Not set yet.</p>
      )}
    </div>
  );
}
