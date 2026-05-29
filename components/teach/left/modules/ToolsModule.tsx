"use client";

// ToolsModule — quick teaching tools picker (plan §3.1). v1 STUB: a static
// picker list of the planned tools, each surfaced as a "Soon" affordance via
// the canonical FutureControl primitive. Live tools (picker / dice /
// randomizer) are the interactive-widget-library follow-up phase (plan §12,
// Phase 3).

import { type ReactNode } from "react";
import { FutureControl } from "@/components/ui";
import { ToolsIcon } from "../icons";
import styles from "../TeachLeft.module.css";

interface ToolDef {
  id: string;
  label: string;
  hint: string;
}

const TOOLS: readonly ToolDef[] = [
  { id: "picker", label: "Name picker", hint: "Randomly call on a student" },
  { id: "dice", label: "Dice", hint: "Roll one or more dice on screen" },
  { id: "timer", label: "Timer", hint: "Countdown / stopwatch overlay" },
  { id: "spinner", label: "Spinner", hint: "Spin to pick an option" },
  { id: "traffic", label: "Traffic light", hint: "Signal go / slow / stop" },
] as const;

export function ToolsModule(): ReactNode {
  return (
    <div>
      <p className={styles.muted} style={{ marginBottom: "var(--r-12)" }}>
        Quick teaching tools. Live versions arrive in a later phase.
      </p>
      {TOOLS.map((tool) => (
        <div key={tool.id} style={{ marginBottom: "var(--r-6)" }}>
          <FutureControl
            label={tool.label}
            tooltip={`${tool.hint} — coming in a later phase`}
            leadingIcon={<ToolsIcon size={16} />}
            tooltipSide="right"
          />
        </div>
      ))}
    </div>
  );
}
