// PollWidget — an interactive live tally (Teach Phase 3 interactive widget
// library). There are no student devices, so the TEACHER taps to count: each
// option row is a ≥44px control that +1's that option (with a small −1), shown
// as a count + subject-tinted percentage bar. "Reset" zeroes the votes.
//
// Durable state (question, options[id,label,votes], kind) persists via
// useWidgetState; the question/options seed from `config.question` /
// `config.options` on first run. Bars are subject-tinted via `.cp-subj`.

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import { TeachIcon } from "./icons";
import type { WidgetBodyProps } from "./types";
import styles from "./PollWidget.module.css";

/** One poll option — label is structure (safe to persist), votes is the tally. */
interface PollOption {
  id: string;
  label: string;
  votes: number;
}

/** The poll's answer shape. "choice" is the must-have; the others are presets. */
type PollKind = "choice" | "yesno" | "smiley";

/** Durable slice — everything the poll needs to survive a reload. */
interface PollPersisted extends Record<string, unknown> {
  question: string;
  options: PollOption[];
  kind: PollKind;
}

const DEFAULT_QUESTION = "How are we feeling about today's work?";
const DEFAULT_CHOICE_LABELS = ["Option A", "Option B", "Option C"];
const YESNO_LABELS = ["Yes", "No"];
/** Smiley presets — rendered as inline SVG faces, not emoji glyphs. */
const SMILEY_LABELS = ["Got it", "Sort of", "Not yet"];

function readKind(config: Record<string, unknown>): PollKind {
  const raw = config.kind;
  return raw === "yesno" || raw === "smiley" ? raw : "choice";
}

function readQuestion(config: Record<string, unknown>): string {
  return typeof config.question === "string" && config.question.trim()
    ? config.question
    : DEFAULT_QUESTION;
}

/** Parse `config.options` (array of `{label}`) defensively into labels. */
function readChoiceLabels(config: Record<string, unknown>): string[] {
  const raw = config.options;
  if (Array.isArray(raw)) {
    const labels = raw
      .map((o) =>
        o && typeof o === "object" && !Array.isArray(o)
          ? (o as Record<string, unknown>).label
          : o,
      )
      .filter((l): l is string => typeof l === "string" && l.trim().length > 0);
    if (labels.length > 0) return labels;
  }
  return DEFAULT_CHOICE_LABELS;
}

/** Build the seed options for a kind, minting stable ids from the index. */
function seedOptions(
  kind: PollKind,
  config: Record<string, unknown>,
): PollOption[] {
  const labels =
    kind === "yesno"
      ? YESNO_LABELS
      : kind === "smiley"
        ? SMILEY_LABELS
        : readChoiceLabels(config);
  return labels.map((label, i) => ({ id: `opt-${i}`, label, votes: 0 }));
}

/** A small inline smiley face keyed off the option index (0 happiest). */
function SmileyFace({ rank }: { rank: number }): ReactNode {
  // rank 0 = smile, 1 = flat, 2 = frown (mouth curve flips by rank).
  const mouth =
    rank === 0
      ? "M8 14c1.3 1.6 6.7 1.6 8 0"
      : rank === 1
        ? "M8 14.5h8"
        : "M8 15c1.3 -1.6 6.7 -1.6 8 0";
  return (
    <svg
      className={styles.smiley}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <path d={mouth} />
    </svg>
  );
}

export function PollWidget({ widget, subjectId }: WidgetBodyProps): ReactNode {
  // Seed durable state from config on first run; the kind decides the options.
  const initial = useMemo<PollPersisted>(() => {
    const kind = readKind(widget.config);
    return {
      question: readQuestion(widget.config),
      options: seedOptions(kind, widget.config),
      kind,
    };
  }, [widget.config]);

  const { state, setState, reset } = useWidgetState<PollPersisted>(
    widget.id,
    initial,
  );

  const total = useMemo(
    () => state.options.reduce((sum, o) => sum + o.votes, 0),
    [state.options],
  );

  const tally = useCallback(
    (id: string, delta: number): void => {
      setState((prev) => ({
        ...prev,
        options: prev.options.map((o) =>
          o.id === id ? { ...o, votes: Math.max(0, o.votes + delta) } : o,
        ),
      }));
    },
    [setState],
  );

  const resetVotes = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      options: prev.options.map((o) => ({ ...o, votes: 0 })),
    }));
  }, [setState]);

  // `reset` is exposed by the hook but we keep question/options on reset —
  // only the votes zero out — so a teacher's configured poll survives. Touch
  // `reset` indirectly via resetVotes to keep its reference used.
  void reset;

  const isSmiley = state.kind === "smiley";

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      <div className={styles.head}>
        <div className={styles.question}>{state.question}</div>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={resetVotes}
          title="Clear every vote back to zero"
          disabled={total === 0}
        >
          <TeachIcon name="rotate" size={13} />
          Reset
        </button>
      </div>

      <div className={styles.options}>
        {state.options.map((o, i) => {
          const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
          return (
            <div key={o.id} className={styles.option}>
              {/* The whole label area is the ≥44px tap-to-count control. */}
              <button
                type="button"
                className={styles.tally}
                onClick={() => tally(o.id, 1)}
                aria-label={`Add a vote for ${o.label} (currently ${o.votes})`}
                title={`Tap to count one vote for "${o.label}"`}
              >
                <span className={styles.optHead}>
                  <span className={styles.optLabel}>
                    {isSmiley ? <SmileyFace rank={i} /> : null}
                    {o.label}
                  </span>
                  <span className={styles.optCount}>
                    {o.votes}
                    <span className={styles.optPct}>{pct}%</span>
                  </span>
                </span>
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.fill} style={{ width: `${pct}%` }} />
                </span>
              </button>
              <button
                type="button"
                className={styles.minus}
                onClick={() => tally(o.id, -1)}
                disabled={o.votes === 0}
                aria-label={`Remove a vote from ${o.label}`}
                title={`Remove one vote from "${o.label}"`}
              >
                <TeachIcon name="minus" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.total}>
        <TeachIcon name="poll" size={13} />
        {total} {total === 1 ? "vote" : "votes"}
      </div>
    </div>
  );
}
