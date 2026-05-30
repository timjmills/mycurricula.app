// MiniWhiteboardWidget — a small shared whiteboard surface for a worked example
// (5.31 handoff, Regulation & Teacher Tools #5). The full drawing engine lives in
// the board Fullscreen markup layer (Ultraplan §5.2); this body shows the prompt,
// a clean write-on surface, and a tool strip. INTERACTIVE only in the structural
// sense — it tracks the SELECTED TOOL index (persisted via useWidgetState), no
// strokes or PII are stored here.
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./MiniWhiteboardWidget.module.css";
import kit from "./widgets530.module.css";

interface Tool {
  icon: KitIconName;
  label: string;
}

const TOOLS: Tool[] = [
  { icon: "pencil", label: "Pen" },
  { icon: "marker", label: "Highlighter" },
  { icon: "boxIco", label: "Eraser" },
];

/** Structure-only persisted slice — the selected tool index. */
interface BoardState extends Record<string, unknown> {
  tool: number;
}

function readPrompt(config: Record<string, unknown>): string {
  const p = config.prompt ?? config.text;
  return typeof p === "string" && p.trim().length > 0
    ? p
    : "Solve it on the board — show your thinking!";
}

export function MiniWhiteboardWidget({ widget }: WidgetBodyProps): ReactNode {
  const prompt = readPrompt(widget.config);
  const initial = useMemo<BoardState>(() => ({ tool: 0 }), []);
  const { state, setState } = useWidgetState<BoardState>(widget.id, initial);

  const tool = ((state.tool % TOOLS.length) + TOOLS.length) % TOOLS.length;

  const pick = useCallback(
    (i: number): void => {
      setState({ tool: i });
    },
    [setState],
  );

  return (
    <div className={kit.body}>
      <WHead label="Mini Whiteboard" />
      <div className={styles.prompt}>{prompt}</div>

      <div className={styles.surface} aria-label="Whiteboard surface">
        <span className={styles.markerIcon} aria-hidden="true">
          <KitIcon name="marker" size={1.8} />
        </span>
      </div>

      <div className={styles.tools} role="group" aria-label="Drawing tools">
        {TOOLS.map((t, i) => {
          const on = tool === i;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.tool} ${on ? styles.toolOn : ""}`}
              style={on ? { borderColor: "var(--w-accent)" } : undefined}
              onClick={() => pick(i)}
              aria-pressed={on}
              title={`Use the ${t.label.toLowerCase()}`}
            >
              <KitIcon name={t.icon} size={1.2} />
              <span className={styles.toolLabel}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
