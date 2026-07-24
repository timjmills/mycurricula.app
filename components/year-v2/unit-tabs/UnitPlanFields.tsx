"use client";

// UnitPlanFields.tsx — the EDITABLE Track-B workspace fields on the Unit Plan
// tab (B1.7). Big idea, essential questions, vocabulary, K/U/D, and unit notes,
// all persisting through the planner store's editUnitFields → the Supabase
// `units` row (migration 20260728120000).
//
// TEAM-CONTENT MODEL (CLAUDE.md §2): units are MASTER / TEAM content — there is
// NO personal fork (units_write RLS = subject-master OR grade-lead). So the edit
// affordances are shown ONLY in Team Curriculum mode (editMode === "master");
// in Personal mode the fields render READ-ONLY, with a hint to switch modes. We
// NEVER paint an editable control that would silently no-op or pretend to save
// personally. The team-content warning tooltip is `required: true` per the
// §4 always-on list (team-wide settings — changes affect every teacher).
//
// PERSISTENCE: local draft state keeps typing smooth and never loses input; a
// debounced save (500ms) tees the field patch to the store, and every text
// field also flushes on blur + on unmount so a close mid-edit never drops the
// last keystrokes. Empty list entries are filtered out on save (an added-but-
// untyped row stays visible for editing but is not persisted as a blank).

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SubjectId, Unit, UnitKud, UnitVocabItem } from "@/lib/types";
import type { UnitPatch } from "@/lib/planner/source";
import { usePlanner } from "@/lib/planner-store";
import { useAppState } from "@/lib/app-state";
import { Tooltip } from "@/components/ui";
import styles from "../UnitExplorer.module.css";

const SAVE_DEBOUNCE_MS = 500;

/** The editable text/list shape held in local draft state. Mirrors the Track-B
 *  fields this tab edits; draft arrays may hold empty in-progress rows (filtered
 *  on save). */
interface Draft {
  bigIdea: string;
  essentialQuestions: string[];
  vocab: UnitVocabItem[];
  know: string[];
  understand: string[];
  doGoal: string[];
  notes: string;
}

/** Seed a draft from a unit's persisted Track-B fields (undefined → empty). */
function draftFromUnit(unit: Unit): Draft {
  return {
    bigIdea: unit.bigIdea ?? "",
    essentialQuestions: unit.essentialQuestions ? [...unit.essentialQuestions] : [],
    vocab: unit.vocab ? unit.vocab.map((v) => ({ ...v })) : [],
    know: unit.kud?.know ? [...unit.kud.know] : [],
    understand: unit.kud?.understand ? [...unit.kud.understand] : [],
    doGoal: unit.kud?.doGoal ? [...unit.kud.doGoal] : [],
    notes: unit.notes ?? "",
  };
}

/** Drop blank entries (empty after trim) from a string list — an added-but-
 *  untyped row is never persisted as a blank question/goal. */
function cleanList(list: string[]): string[] {
  return list.filter((s) => s.trim().length > 0);
}

/** Drop vocab rows with a blank term (a companion definition is optional). */
function cleanVocab(vocab: UnitVocabItem[]): UnitVocabItem[] {
  return vocab
    .filter((v) => v.term.trim().length > 0)
    .map((v) =>
      v.definition && v.definition.trim().length > 0
        ? { term: v.term, definition: v.definition }
        : { term: v.term },
    );
}

export function UnitPlanFields({
  subjectId,
  unitId,
}: {
  subjectId: SubjectId;
  unitId: string;
}): ReactNode {
  const { unitById, editUnitFields, hasFailedUnitWrite, retryFailedUnitWrite } =
    usePlanner();
  const { editMode } = useAppState();
  const unit = unitById[unitId];
  const canEdit = editMode === "master";

  // Local draft — authoritative while editing.
  const [draft, setDraft] = useState<Draft>(() =>
    unit ? draftFromUnit(unit) : draftFromUnit({} as Unit),
  );
  // Per-unit save status (§4a R2 M3 + R4). KEYED BY UNIT so a "saving"/"error"
  // for unit A never shows on unit B after navigating away — the indicator/alert
  // renders only when it matches the open unit, and a stale A-result never
  // touches B's status. "saving" reflects the confirm-only latency (the catalog
  // updates only once the write is CONFIRMED); "error" is a denied/dropped write.
  const [saveState, setSaveState] = useState<{
    unitId: string;
    state: "saving" | "error";
  } | null>(null);

  // ── Debounced + blur-flushed save (§4a H1/H2) ────────────────────────────
  // The pending buffer captures the unit id WITH the patch, so a flush ALWAYS
  // targets the unit the edit was made on — even if the open unit switched
  // during the 500ms window (a bare id ref would save unit A's draft into unit
  // B). Switching units mid-debounce commits the prior buffer to ITS id first.
  const pendingRef = useRef<{ unitId: string; patch: UnitPatch } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRef = useRef(editUnitFields);
  editRef.current = editUnitFields;
  // Per-unit send sequence (§4a R5 M3, component side): only the LATEST send's
  // result updates the visible status, so an earlier send settling can't clear
  // the "Saving…" of a newer in-flight send.
  const sendSeqRef = useRef(new Map<string, number>());

  /** No unsaved local edits → safe to reconcile the draft from the catalog. */
  const isClean = useCallback(
    () => pendingRef.current === null && timerRef.current === null,
    [],
  );

  const sendNow = useCallback(
    (buffered: { unitId: string; patch: UnitPatch }): void => {
      // Confirm-only (§4a R4): the store queue serializes + coalesces the write
      // and reports the result — ok=true once CONFIRMED (the canonical row lands
      // in the catalog), ok=false on an RLS denial / dropped write (catalog
      // untouched). The status is UNIT-SCOPED (§4a R2 M3): mark "saving" for this
      // unit now, then on the result set "error" (failure) or clear it (success)
      // — never touching another unit's status. A per-unit SEQ (§4a R5 M3)
      // ignores a superseded send's result so it can't clear a newer send's
      // "Saving…".
      const uid = buffered.unitId;
      const seq = (sendSeqRef.current.get(uid) ?? 0) + 1;
      sendSeqRef.current.set(uid, seq);
      setSaveState({ unitId: uid, state: "saving" });
      editRef.current(uid, buffered.patch, (ok) => {
        if (sendSeqRef.current.get(uid) !== seq) return; // superseded by a newer send
        setSaveState((prev) => {
          if (prev?.unitId !== uid) return prev; // stale result for another unit
          return ok ? null : { unitId: uid, state: "error" };
        });
      });
    },
    [],
  );

  const flush = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const buffered = pendingRef.current;
    if (!buffered) return;
    pendingRef.current = null;
    sendNow(buffered);
  }, [sendNow]);

  const scheduleSave = useCallback(
    (uid: string, partial: UnitPatch): void => {
      // A fresh edit clears a stale save ERROR — but only for THIS unit (§4a R2 M3).
      setSaveState((prev) =>
        prev?.unitId === uid && prev.state === "error" ? null : prev,
      );
      const buffered = pendingRef.current;
      // Never merge across units: commit a buffered DIFFERENT unit first (§4a H1).
      if (buffered && buffered.unitId !== uid) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        pendingRef.current = null;
        sendNow(buffered);
      }
      pendingRef.current = {
        unitId: uid,
        patch: { ...(pendingRef.current?.patch ?? {}), ...partial },
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush, sendNow],
  );

  // Hard re-seed on unit switch — a different unit is a different draft. Also
  // (§4a R5 H2) re-surface a RETAINED post-unmount failure for this unit so the
  // user can retry it; otherwise clear any stale status.
  useEffect(() => {
    if (unit) setDraft(draftFromUnit(unit));
    setSaveState(
      hasFailedUnitWrite(unitId) ? { unitId, state: "error" } : null,
    );
    // Re-seed on unit identity change only (subjectId scopes cross-subject
    // same-slug units). `unit` handled by the reconcile effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, subjectId]);

  // Reconcile SAME-unit external catalog changes into the draft — another
  // teacher's team edit, or the §4a H3 failure-revert — but ONLY when the draft
  // is clean, so in-progress typing is never clobbered (§4a M5). `unit` changes
  // reference only when THIS unit's catalog entry changes.
  useEffect(() => {
    if (unit && isClean()) setDraft(draftFromUnit(unit));
  }, [unit, isClean]);

  // Flush pending on unmount / unit switch so a close-mid-edit never drops input.
  // In the real flow this fires while still in Team mode (the top-bar toggle is
  // occluded by the modal scrim, so a mode switch closes the modal first).
  useEffect(() => {
    return () => flush();
  }, [unitId, flush]);

  // Leaving Team mode abandons any in-progress edit (§4a M4 + R5 H1). Cancel the
  // pending debounced write (a stale timer would be refused at the store boundary
  // anyway), then — critically — RESEED the draft from the confirmed unit so the
  // Personal read-only view never renders an unsaved value as if saved, and
  // SURFACE the discard so it isn't silent.
  useEffect(() => {
    if (canEdit) return;
    const hadPending = timerRef.current !== null || pendingRef.current !== null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    // RESEED UNCONDITIONALLY (§4a R6 H1-B): read-only must show the CONFIRMED
    // value regardless of buffer state. Gating on `hadPending` missed the case
    // where a flush() had already sent (buffers cleared) but the RPC was still
    // in flight — if it then failed post-flip the catalog `unit` never changed
    // (confirm-only) and the stale draft would render as saved. Personal mode is
    // read-only, so discarding the local draft here is always correct.
    if (unit) setDraft(draftFromUnit(unit));
    // Surface the discard only when there was genuinely unconfirmed work, or a
    // retained failure exists for this unit.
    if (hadPending || hasFailedUnitWrite(unitId)) {
      setSaveState({ unitId, state: "error" });
    }
    // Runs on the canEdit transition; `unit`/`unitId` are read from the render
    // that flipped the mode (current).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const bigIdeaId = useId();
  const notesId = useId();

  // ── Read-only (Personal mode) ────────────────────────────────────────────
  if (!canEdit) {
    return (
      <section className={styles.planFields} aria-label="Unit plan">
        <div className={styles.planHead}>
          <span className={styles.planTitle}>Unit plan</span>
          <Tooltip
            content="Unit plan content is shared with your whole team. Switch to Team Curriculum (top bar) to edit it."
            side="bottom"
            required
          >
            <span className={styles.teamBadge} tabIndex={0}>
              Team · read-only
            </span>
          </Tooltip>
        </div>

        {/* §4a R5 H1: surface an unsaved edit discarded on leaving Team mode, so
            the read-only view is never a silent stale render. */}
        {saveState?.unitId === unitId && saveState.state === "error" ? (
          <p className={styles.saveError} role="alert">
            Your last change wasn&apos;t saved — switch to Team Curriculum to edit
            the unit plan. The saved version is shown.
          </p>
        ) : null}

        <ReadOnlyText label="Big idea" value={draft.bigIdea} />
        <ReadOnlyList label="Essential questions" items={cleanList(draft.essentialQuestions)} />
        <ReadOnlyVocab vocab={cleanVocab(draft.vocab)} />
        <ReadOnlyKud
          know={cleanList(draft.know)}
          understand={cleanList(draft.understand)}
          doGoal={cleanList(draft.doGoal)}
        />
        <ReadOnlyText label="Notes" value={draft.notes} />
      </section>
    );
  }

  // ── Editable (Team Curriculum mode) ──────────────────────────────────────
  // Each handler computes the next list from the CURRENT render's `draft`, sets
  // state, then tees the save OUTSIDE the state updater (a scheduleSave inside a
  // setDraft updater would double-fire under StrictMode's double-invoke). Every
  // save carries `unitId` so it lands on the right unit (§4a H1).
  const updateEq = (i: number, value: string): void => {
    const next = draft.essentialQuestions.slice();
    next[i] = value;
    setDraft({ ...draft, essentialQuestions: next });
    scheduleSave(unitId, { essentialQuestions: cleanList(next) });
  };
  const addEq = (): void =>
    setDraft({ ...draft, essentialQuestions: [...draft.essentialQuestions, ""] });
  const removeEq = (i: number): void => {
    const next = draft.essentialQuestions.filter((_, j) => j !== i);
    setDraft({ ...draft, essentialQuestions: next });
    scheduleSave(unitId, { essentialQuestions: cleanList(next) });
  };

  const updateVocab = (
    i: number,
    field: "term" | "definition",
    value: string,
  ): void => {
    const next = draft.vocab.map((v, j) => (j === i ? { ...v, [field]: value } : v));
    setDraft({ ...draft, vocab: next });
    scheduleSave(unitId, { vocab: cleanVocab(next) });
  };
  const addVocab = (): void =>
    setDraft({ ...draft, vocab: [...draft.vocab, { term: "", definition: "" }] });
  const removeVocab = (i: number): void => {
    const next = draft.vocab.filter((_, j) => j !== i);
    setDraft({ ...draft, vocab: next });
    scheduleSave(unitId, { vocab: cleanVocab(next) });
  };

  const updateKud = (
    key: "know" | "understand" | "doGoal",
    i: number,
    value: string,
  ): void => {
    const next = draft[key].slice();
    next[i] = value;
    setDraft({ ...draft, [key]: next });
    scheduleSave(unitId, { kud: buildKud({ ...draft, [key]: next }) });
  };
  const addKud = (key: "know" | "understand" | "doGoal"): void =>
    setDraft({ ...draft, [key]: [...draft[key], ""] });
  const removeKud = (
    key: "know" | "understand" | "doGoal",
    i: number,
  ): void => {
    const next = draft[key].filter((_, j) => j !== i);
    setDraft({ ...draft, [key]: next });
    scheduleSave(unitId, { kud: buildKud({ ...draft, [key]: next }) });
  };

  return (
    <section className={styles.planFields} aria-label="Unit plan">
      <div className={styles.planHead}>
        <span className={styles.planTitle}>Unit plan</span>
        <Tooltip
          content="These fields are the team's shared unit plan — every teacher sees your edits."
          side="bottom"
          required
        >
          <span className={styles.teamBadge} tabIndex={0}>
            Team content
          </span>
        </Tooltip>
        {saveState?.unitId === unitId && saveState.state === "saving" ? (
          <span className={styles.savingNote} aria-live="polite">
            Saving…
          </span>
        ) : null}
      </div>

      {saveState?.unitId === unitId && saveState.state === "error" ? (
        <p className={styles.saveError} role="alert">
          Couldn&apos;t save — you may not have permission to edit the team&apos;s
          unit plan. Your changes here weren&apos;t saved; the last saved version
          stands.
          {/* §4a R5 H2: a write that failed after the editor unmounted is
              retained by the store; offer to re-submit it. */}
          {hasFailedUnitWrite(unitId) ? (
            <>
              {" "}
              <button
                type="button"
                className={`${styles.retryBtn} ${styles.retryBtn}`}
                onClick={() =>
                  retryFailedUnitWrite(unitId, (ok) =>
                    setSaveState(ok ? null : { unitId, state: "error" }),
                  )
                }
              >
                Retry
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {/* Big idea */}
      <div className={styles.field}>
        <label htmlFor={bigIdeaId} className={styles.fieldLabel}>
          Big idea
        </label>
        <textarea
          id={bigIdeaId}
          className={styles.fieldArea}
          value={draft.bigIdea}
          placeholder="The central understanding this unit builds toward…"
          rows={2}
          onChange={(e) => {
            const value = e.target.value;
            setDraft({ ...draft, bigIdea: value });
            scheduleSave(unitId, { bigIdea: value });
          }}
          onBlur={flush}
        />
      </div>

      {/* Essential questions */}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Essential questions</span>
        <div className={styles.listRows}>
          {draft.essentialQuestions.map((q, i) => (
            <div key={i} className={styles.listRow}>
              <input
                className={styles.fieldInput}
                value={q}
                placeholder="A driving question for this unit…"
                aria-label={`Essential question ${i + 1}`}
                onChange={(e) => updateEq(i, e.target.value)}
                onBlur={flush}
              />
              <RemoveButton
                label="Remove this question"
                onClick={() => removeEq(i)}
              />
            </div>
          ))}
          <AddButton label="Add an essential question" onClick={addEq}>
            + Add question
          </AddButton>
        </div>
      </div>

      {/* Vocabulary */}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Vocabulary</span>
        <div className={styles.listRows}>
          {draft.vocab.map((v, i) => (
            <div key={i} className={styles.vocabRow}>
              <input
                className={`${styles.fieldInput} ${styles.vocabTerm}`}
                value={v.term}
                placeholder="Term"
                aria-label={`Vocabulary term ${i + 1}`}
                onChange={(e) => updateVocab(i, "term", e.target.value)}
                onBlur={flush}
              />
              <input
                className={styles.fieldInput}
                value={v.definition ?? ""}
                placeholder="Definition (optional)"
                aria-label={`Definition for term ${i + 1}`}
                onChange={(e) => updateVocab(i, "definition", e.target.value)}
                onBlur={flush}
              />
              <RemoveButton
                label="Remove this term"
                onClick={() => removeVocab(i)}
              />
            </div>
          ))}
          <AddButton label="Add a vocabulary term" onClick={addVocab}>
            + Add term
          </AddButton>
        </div>
      </div>

      {/* Know / Understand / Do */}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Know · Understand · Do</span>
        <div className={styles.kudGrid}>
          <KudColumn
            heading="Know"
            keyName="know"
            items={draft.know}
            onUpdate={updateKud}
            onAdd={addKud}
            onRemove={removeKud}
            onFlush={flush}
          />
          <KudColumn
            heading="Understand"
            keyName="understand"
            items={draft.understand}
            onUpdate={updateKud}
            onAdd={addKud}
            onRemove={removeKud}
            onFlush={flush}
          />
          <KudColumn
            heading="Do"
            keyName="doGoal"
            items={draft.doGoal}
            onUpdate={updateKud}
            onAdd={addKud}
            onRemove={removeKud}
            onFlush={flush}
          />
        </div>
      </div>

      {/* Notes */}
      <div className={styles.field}>
        <label htmlFor={notesId} className={styles.fieldLabel}>
          Notes
        </label>
        <textarea
          id={notesId}
          className={styles.fieldArea}
          value={draft.notes}
          placeholder="Planning notes for this unit…"
          rows={3}
          onChange={(e) => {
            const value = e.target.value;
            setDraft({ ...draft, notes: value });
            scheduleSave(unitId, { notes: value });
          }}
          onBlur={flush}
        />
      </div>
    </section>
  );
}

/** Assemble a `UnitKud` from the draft's three lists, filtering blanks. A list
 *  with no entries is left undefined so a partially-filled K/U/D round-trips. */
function buildKud(d: Pick<Draft, "know" | "understand" | "doGoal">): UnitKud {
  const know = cleanList(d.know);
  const understand = cleanList(d.understand);
  const doGoal = cleanList(d.doGoal);
  return {
    know: know.length > 0 ? know : undefined,
    understand: understand.length > 0 ? understand : undefined,
    doGoal: doGoal.length > 0 ? doGoal : undefined,
  };
}

// ── Editable sub-parts ───────────────────────────────────────────────────────

function KudColumn({
  heading,
  keyName,
  items,
  onUpdate,
  onAdd,
  onRemove,
  onFlush,
}: {
  heading: string;
  keyName: "know" | "understand" | "doGoal";
  items: string[];
  onUpdate: (k: "know" | "understand" | "doGoal", i: number, v: string) => void;
  onAdd: (k: "know" | "understand" | "doGoal") => void;
  onRemove: (k: "know" | "understand" | "doGoal", i: number) => void;
  onFlush: () => void;
}): ReactNode {
  return (
    <div className={styles.kudCol}>
      <span className={styles.kudHead}>{heading}</span>
      {items.map((item, i) => (
        <div key={i} className={styles.listRow}>
          <input
            className={styles.fieldInput}
            value={item}
            aria-label={`${heading} item ${i + 1}`}
            onChange={(e) => onUpdate(keyName, i, e.target.value)}
            onBlur={onFlush}
          />
          <RemoveButton
            label={`Remove this ${heading} item`}
            onClick={() => onRemove(keyName, i)}
          />
        </div>
      ))}
      <AddButton label={`Add a ${heading} item`} onClick={() => onAdd(keyName)}>
        + Add
      </AddButton>
    </div>
  );
}

function AddButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <Tooltip content={label} side="top" tooltipId="unit-plan-add">
      <button
        type="button"
        className={`${styles.addBtn} ${styles.addBtn}`}
        aria-label={label}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): ReactNode {
  return (
    <Tooltip content={label} side="top" tooltipId="unit-plan-remove">
      <button
        type="button"
        className={`${styles.removeBtn} ${styles.removeBtn}`}
        aria-label={label}
        onClick={onClick}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </Tooltip>
  );
}

// ── Read-only sub-parts (Personal mode) ──────────────────────────────────────

function ReadOnlyText({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactNode {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {value.trim().length > 0 ? (
        <p className={styles.readonlyText}>{value}</p>
      ) : (
        <p className={styles.emptyValue}>Not set yet.</p>
      )}
    </div>
  );
}

function ReadOnlyList({
  label,
  items,
}: {
  label: string;
  items: string[];
}): ReactNode {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {items.length > 0 ? (
        <ul className={styles.readonlyList}>
          {items.map((item, i) => (
            <li key={i} className={styles.readonlyItem}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyValue}>Not set yet.</p>
      )}
    </div>
  );
}

function ReadOnlyVocab({ vocab }: { vocab: UnitVocabItem[] }): ReactNode {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Vocabulary</span>
      {vocab.length > 0 ? (
        <ul className={styles.readonlyList}>
          {vocab.map((v, i) => (
            <li key={i} className={styles.readonlyItem}>
              <b>{v.term}</b>
              {v.definition ? ` — ${v.definition}` : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyValue}>Not set yet.</p>
      )}
    </div>
  );
}

function ReadOnlyKud({
  know,
  understand,
  doGoal,
}: {
  know: string[];
  understand: string[];
  doGoal: string[];
}): ReactNode {
  const empty =
    know.length === 0 && understand.length === 0 && doGoal.length === 0;
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Know · Understand · Do</span>
      {empty ? (
        <p className={styles.emptyValue}>Not set yet.</p>
      ) : (
        <div className={styles.kudGrid}>
          {(
            [
              ["Know", know],
              ["Understand", understand],
              ["Do", doGoal],
            ] as const
          ).map(([heading, items]) => (
            <div key={heading} className={styles.kudCol}>
              <span className={styles.kudHead}>{heading}</span>
              {items.length > 0 ? (
                <ul className={styles.readonlyList}>
                  {items.map((item, i) => (
                    <li key={i} className={styles.readonlyItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyValue}>—</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
