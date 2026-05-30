// NamesWidget — interactive name picker / cold-call randomizer (Teach Phase 3
// interactive widget library). Reads the roster from the LOCAL-ONLY groups
// store (`useTeachGroups`); names live ONLY on the teacher's device and are
// NEVER written to `widget.config`/`state` or through `useWidgetState`.
//
// PRIVACY HARD RULE: the only durable values we persist are the picked student
// IDS (ids are local too) plus the "don't repeat" toggle — never names. On
// shuffle the displayed name rapidly cycles the roster (~1.2s, decelerating)
// then lands on a random pick; reduced motion picks instantly. Subject-tinted.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTeachGroups } from "@/lib/teach/use-teach-groups";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import { TeachIcon } from "./icons";
import type { WidgetBodyProps } from "./types";
import styles from "./NamesWidget.module.css";

/** Durable state — IDS only (privacy), plus the toggle. Stable module const. */
interface NamesState extends Record<string, unknown> {
  /** Student ids already picked while "don't repeat" is on. */
  pickedIds: string[];
  /** Whether picked students are excluded until the pool empties. */
  noRepeat: boolean;
}

const INITIAL: NamesState = { pickedIds: [], noRepeat: false };

/** Total cycle duration + decelerating step schedule for the shuffle animation. */
const SHUFFLE_MS = 1200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function NamesWidget({ widget }: WidgetBodyProps): ReactNode {
  const { store } = useTeachGroups();
  const { state, setState, hydrated } = useWidgetState(widget.id, INITIAL);

  // Transient animation state — the name flashing mid-shuffle + the landed pick.
  const [flashName, setFlashName] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  // rAF / timer handles so we can clean up on unmount or re-roll.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const students = store.students;
  const pickedSet = useMemo(() => new Set(state.pickedIds), [state.pickedIds]);

  // The pool to draw from: all students, minus already-picked when noRepeat.
  const pool = useMemo(
    () =>
      state.noRepeat ? students.filter((s) => !pickedSet.has(s.id)) : students,
    [students, state.noRepeat, pickedSet],
  );

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const landOn = useCallback(
    (id: string, name: string) => {
      setSpinning(false);
      setFlashName(null);
      setPicked(name);
      if (state.noRepeat) {
        setState((prev) => ({
          ...prev,
          pickedIds: prev.pickedIds.includes(id)
            ? prev.pickedIds
            : [...prev.pickedIds, id],
        }));
      }
    },
    [state.noRepeat, setState],
  );

  const handleShuffle = useCallback(() => {
    if (pool.length === 0 || spinning) return;
    clearTimers();

    const winner = pool[Math.floor(Math.random() * pool.length)];

    // Reduced motion: skip straight to the result, no cycling.
    if (prefersReducedMotion()) {
      landOn(winner.id, winner.name);
      return;
    }

    setSpinning(true);
    setPicked(null);

    // Build a decelerating schedule of "tick" times across SHUFFLE_MS. Each tick
    // flashes a random roster name; the final tick lands the winner.
    const ticks: number[] = [];
    let t = 0;
    let step = 55; // fast at the start
    while (t < SHUFFLE_MS) {
      ticks.push(t);
      t += step;
      step *= 1.12; // ease-out: gaps widen as we slow down
    }

    ticks.forEach((at, i) => {
      const handle = setTimeout(() => {
        if (i === ticks.length - 1) {
          landOn(winner.id, winner.name);
        } else {
          const r = students[Math.floor(Math.random() * students.length)];
          setFlashName(r?.name ?? winner.name);
        }
      }, at);
      timersRef.current.push(handle);
    });
  }, [pool, spinning, students, clearTimers, landOn]);

  const resetPool = useCallback(() => {
    clearTimers();
    setSpinning(false);
    setFlashName(null);
    setPicked(null);
    setState((prev) => ({ ...prev, pickedIds: [] }));
  }, [clearTimers, setState]);

  const toggleNoRepeat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      noRepeat: !prev.noRepeat,
      // Turning the toggle off clears the exclusion pool so chips re-enable.
      pickedIds: !prev.noRepeat ? prev.pickedIds : [],
    }));
  }, [setState]);

  // Empty roster — names are device-local by design; never invent names.
  if (hydrated && students.length === 0) {
    return (
      <div className={styles.body}>
        <div className={styles.empty}>
          <TeachIcon name="users" size={22} />
          <span>Add your class in the Class panel to pick names</span>
        </div>
      </div>
    );
  }

  const poolEmpty = state.noRepeat && pool.length === 0 && students.length > 0;
  const display = spinning
    ? (flashName ?? "…")
    : (picked ?? (poolEmpty ? "All picked!" : "Ready"));

  return (
    <div className={styles.body}>
      <div
        className={`${styles.pick} ${picked && !spinning ? styles.pickLanded : ""} ${spinning ? styles.pickSpin : ""}`}
        aria-live="polite"
      >
        {display}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.shuffleBtn}
          onClick={handleShuffle}
          disabled={spinning || pool.length === 0}
        >
          <TeachIcon name="shuffle" size={16} />
          {spinning ? "Picking…" : "Shuffle"}
        </button>
      </div>

      <div className={styles.optionsRow}>
        <button
          type="button"
          role="switch"
          aria-checked={state.noRepeat}
          className={`${styles.toggle} ${state.noRepeat ? styles.toggleOn : ""}`}
          onClick={toggleNoRepeat}
        >
          <span className={styles.toggleTrack} aria-hidden="true">
            <span className={styles.toggleKnob} />
          </span>
          Don&rsquo;t repeat
        </button>
        {state.noRepeat ? (
          <span className={styles.remaining}>
            {pool.length} left
            <button
              type="button"
              className={styles.resetLink}
              onClick={resetPool}
            >
              <TeachIcon name="rotate" size={12} />
              Reset pool
            </button>
          </span>
        ) : null}
      </div>

      <div className={styles.roster}>
        {students.map((s) => {
          const used = state.noRepeat && pickedSet.has(s.id);
          return (
            <span
              key={s.id}
              className={`${styles.chip} ${used ? styles.chipUsed : ""}`}
            >
              {s.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
