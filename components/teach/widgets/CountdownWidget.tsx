// CountdownWidget — counts down to a target datetime/event (Phase 3 interactive
// widget library). Shows Days · Hours · Mins · Secs in labelled cells plus the
// event label, ticking once a second via setInterval. Durable `targetISO`
// (default: next Friday 15:00 local, computed once) and `label` (default "End of
// term") persist via useWidgetState. An inline "Edit" affordance reveals a
// datetime-local + label input + Save; invalid dates are ignored. Once the target
// passes, a token-coloured "It's here!" banner replaces the cells. SSR-safe — the
// live "now" arrives in a post-mount effect so server HTML matches first paint.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./CountdownWidget.module.css";

/** Durable slice — the target instant + its display label. */
interface CountdownPersisted extends Record<string, unknown> {
  /** ISO-8601 target datetime. */
  targetISO: string;
  /** Human label for the event ("End of term", "Trip", …). */
  label: string;
}

/** The default target: the next Friday at 15:00 local time, computed once. */
function defaultTargetISO(): string {
  const d = new Date();
  // Friday === day 5. Days until the next Friday (today counts only if before 15:00).
  const day = d.getDay();
  let add = (5 - day + 7) % 7;
  d.setHours(15, 0, 0, 0);
  if (add === 0 && Date.now() >= d.getTime()) add = 7; // today's Friday already past 15:00
  d.setDate(d.getDate() + add);
  return d.toISOString();
}

/** Read a string config field defensively. */
function readString(
  config: Record<string, unknown>,
  field: string,
  fallback: string,
): string {
  const raw = config[field];
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

/** Parse an ISO/date string into a valid timestamp, or null. */
function parseTarget(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Break a positive remaining-ms span into day/hour/minute/second parts. */
function splitRemaining(ms: number): {
  days: number;
  hours: number;
  mins: number;
  secs: number;
} {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
  };
}

/** Convert an ISO string to the `datetime-local` input value (local, no zone). */
function toLocalInputValue(iso: string): string {
  const t = parseTarget(iso);
  if (t == null) return "";
  const d = new Date(t);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CountdownWidget({ widget }: WidgetBodyProps): ReactNode {
  // `defaultTargetISO` reads the clock, so memoise it once per widget so the
  // initial object stays a stable reference (and doesn't drift each render).
  const initial = useMemo<CountdownPersisted>(
    () => ({
      targetISO: readString(widget.config, "targetISO", defaultTargetISO()),
      label: readString(widget.config, "label", "End of term"),
    }),
    [widget.config],
  );
  const { state, setState } = useWidgetState<CountdownPersisted>(
    widget.id,
    initial,
  );
  const { targetISO, label } = state;
  const targetMs = useMemo(() => parseTarget(targetISO), [targetISO]);

  // Transient — the live "now". Null until post-mount so SSR == first paint.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── Inline edit state (transient draft, committed on Save) ─────────────
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftLabel, setDraftLabel] = useState("");

  const openEdit = useCallback((): void => {
    setDraftDate(toLocalInputValue(targetISO));
    setDraftLabel(label);
    setEditing(true);
  }, [targetISO, label]);

  const cancelEdit = useCallback((): void => setEditing(false), []);

  const saveEdit = useCallback((): void => {
    // datetime-local yields a local wall-clock string; new Date() reads it as
    // local. Ignore invalid parses — keep the existing target.
    const parsed = parseTarget(draftDate);
    if (parsed == null) return;
    setState({
      targetISO: new Date(parsed).toISOString(),
      label: draftLabel.trim().length > 0 ? draftLabel.trim() : label,
    });
    setEditing(false);
  }, [draftDate, draftLabel, label, setState]);

  const remaining = targetMs != null && now != null ? targetMs - now : null;
  const reached = remaining != null && remaining <= 0;
  const parts = remaining != null ? splitRemaining(remaining) : null;

  const cells: { value: number; label: string }[] = parts
    ? [
        { value: parts.days, label: "Days" },
        { value: parts.hours, label: "Hours" },
        { value: parts.mins, label: "Mins" },
        { value: parts.secs, label: "Secs" },
      ]
    : [];

  return (
    <div className={styles.body}>
      {editing ? (
        <form
          className={styles.editForm}
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Event</span>
            <input
              type="text"
              className={styles.input}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="End of term"
              maxLength={48}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date &amp; time</span>
            <input
              type="datetime-local"
              className={styles.input}
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
            />
          </label>
          <div className={styles.editActions}>
            <button type="submit" className={styles.primaryBtn}>
              Save
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.label}>{label}</span>
            <button
              type="button"
              className={styles.editBtn}
              onClick={openEdit}
              title="Edit the event name and target date"
              aria-label="Edit countdown target"
            >
              <TeachIcon name="cog" size={14} /> Edit
            </button>
          </div>

          {reached ? (
            <div className={styles.banner} role="status">
              <TeachIcon name="bell" size={18} />
              <span>It&apos;s here!</span>
            </div>
          ) : (
            <div className={styles.cells}>
              {cells.map((cell) => (
                <div key={cell.label} className={styles.cell}>
                  <span className={styles.value}>
                    {now == null ? "--" : String(cell.value).padStart(2, "0")}
                  </span>
                  <span className={styles.unit}>{cell.label}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
