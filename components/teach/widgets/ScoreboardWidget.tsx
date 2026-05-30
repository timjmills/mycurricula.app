// ScoreboardWidget — an interactive team scoreboard (Teach Phase 3 interactive
// widget library). Each team is a card with an editable label, a score, and big
// ≥44px +1 / −1 controls. Add / remove teams (capped at 6) and "Reset scores"
// zeroes every team. The current leader is flagged with a trophy + --teach-go
// accent.
//
// Durable state (teams: {id,label,score}[]) persists via useWidgetState. Team
// LABELS are plain text (NOT student names) so they are safe to persist.

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import { TeachIcon } from "./icons";
import type { WidgetBodyProps } from "./types";
import styles from "./ScoreboardWidget.module.css";

/** One team — label is free text (safe to persist), score is the running total. */
interface Team {
  id: string;
  label: string;
  score: number;
}

interface ScorePersisted extends Record<string, unknown> {
  teams: Team[];
}

const MAX_TEAMS = 6;
const INITIAL: ScorePersisted = {
  teams: [
    { id: "t1", label: "Team 1", score: 0 },
    { id: "t2", label: "Team 2", score: 0 },
  ],
};

/** Mint a locally-unique team id (labels, not names — DB-safe). */
function teamId(): string {
  return `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

export function ScoreboardWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  const { state, setState } = useWidgetState<ScorePersisted>(
    widget.id,
    INITIAL,
  );
  const teams = state.teams;

  // Leader rule: the single highest score, but ONLY when it is strictly higher
  // than every other team AND non-zero. A tie (or an all-zero board) yields no
  // leader, so we never crown an arbitrary team.
  const leaderId = useMemo<string | null>(() => {
    if (teams.length === 0) return null;
    const max = Math.max(...teams.map((t) => t.score));
    if (max <= 0) return null;
    const top = teams.filter((t) => t.score === max);
    return top.length === 1 ? top[0].id : null;
  }, [teams]);

  const bump = useCallback(
    (id: string, delta: number): void => {
      setState((prev) => ({
        ...prev,
        teams: prev.teams.map((t) =>
          t.id === id ? { ...t, score: Math.max(0, t.score + delta) } : t,
        ),
      }));
    },
    [setState],
  );

  const rename = useCallback(
    (id: string, label: string): void => {
      setState((prev) => ({
        ...prev,
        teams: prev.teams.map((t) => (t.id === id ? { ...t, label } : t)),
      }));
    },
    [setState],
  );

  const addTeam = useCallback((): void => {
    setState((prev) =>
      prev.teams.length >= MAX_TEAMS
        ? prev
        : {
            ...prev,
            teams: [
              ...prev.teams,
              {
                id: teamId(),
                label: `Team ${prev.teams.length + 1}`,
                score: 0,
              },
            ],
          },
    );
  }, [setState]);

  const removeTeam = useCallback(
    (id: string): void => {
      setState((prev) => ({
        ...prev,
        teams: prev.teams.filter((t) => t.id !== id),
      }));
    },
    [setState],
  );

  const resetScores = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      teams: prev.teams.map((t) => ({ ...t, score: 0 })),
    }));
  }, [setState]);

  const hasScores = teams.some((t) => t.score > 0);

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      <div className={styles.teams}>
        {teams.map((t) => {
          const isLeader = t.id === leaderId;
          return (
            <div
              key={t.id}
              className={`${styles.team} ${isLeader ? styles.teamLeader : ""}`}
            >
              <div className={styles.teamHead}>
                {isLeader ? (
                  <span className={styles.trophy} aria-label="Leading">
                    <TeachIcon name="trophy" size={14} />
                  </span>
                ) : null}
                <input
                  className={styles.labelInput}
                  value={t.label}
                  onChange={(e) => rename(t.id, e.target.value)}
                  aria-label="Team name"
                  title="Edit this team's name"
                  maxLength={24}
                />
                {teams.length > 1 ? (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeTeam(t.id)}
                    aria-label={`Remove ${t.label}`}
                    title={`Remove ${t.label}`}
                  >
                    <TeachIcon name="x" size={13} />
                  </button>
                ) : null}
              </div>

              <div className={styles.score} aria-live="polite">
                {t.score}
              </div>

              <div className={styles.scoreBtns}>
                <button
                  type="button"
                  className={styles.minus}
                  onClick={() => bump(t.id, -1)}
                  disabled={t.score === 0}
                  aria-label={`Subtract a point from ${t.label}`}
                  title="Subtract a point"
                >
                  <TeachIcon name="minus" size={18} />
                </button>
                <button
                  type="button"
                  className={styles.plus}
                  onClick={() => bump(t.id, 1)}
                  aria-label={`Add a point to ${t.label}`}
                  title="Add a point"
                >
                  <TeachIcon name="plus" size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={addTeam}
          disabled={teams.length >= MAX_TEAMS}
          title={
            teams.length >= MAX_TEAMS
              ? "Up to six teams"
              : "Add another team to the scoreboard"
          }
        >
          <TeachIcon name="plus" size={14} />
          Add team
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={resetScores}
          disabled={!hasScores}
          title="Set every team's score back to zero"
        >
          <TeachIcon name="rotate" size={14} />
          Reset scores
        </button>
      </div>
    </div>
  );
}
