"use client";

// StandardPill — the single canonical way to render a curriculum standard.
//
// Shows ONLY the compact dotted code (e.g. "5.NBT.A.1"); the full wording is
// revealed on demand — hover (desktop) and long-press (touch, via the native
// title= the Tooltip primitive mirrors for string content). Use this everywhere
// a standard appears. Per CLAUDE.md / the design brief, lesson notes + detail
// must NEVER print the full description inline — the pill + tooltip is the only
// standards presentation.
//
// The pill is a NON-interactive, non-focusable tag (no tabIndex): standards
// pills are frequently rendered INSIDE clickable lesson cards (<button>), and a
// focusable element nested in a button is invalid + traps keyboard focus. The
// code stays visible; the description surfaces via hover + the mirrored title=.
//
// Color follows the ambient `.cp-subj <id>` cascade (--cl fill / --cd text)
// when the pill sits inside a subject-scoped surface, and falls back to neutral
// ink tokens otherwise — so the same component reads correctly on a subject
// card and on a plain panel without any per-callsite styling.

import { useCatalogOptional } from "@/lib/planner-store";
import { formatStandardCode } from "@/lib/mock/standards";
import { Tooltip } from "./Tooltip";
import styles from "./StandardPill.module.css";

export interface StandardPillProps {
  /** The standard code, e.g. "5.NBT.A.1". */
  code: string;
  /** Extra layout-only class (margins/flex). Never pass color here. */
  className?: string;
}

export function StandardPill({ code, className }: StandardPillProps) {
  // Provider-optional catalog: real lookup under <PlannerProvider>, mock
  // fallback in the no-provider settings preview (never throws).
  const { describeStandard } = useCatalogOptional();
  const label = formatStandardCode(code);
  const description = describeStandard(code);

  return (
    <Tooltip content={description} side="top">
      <span
        className={["cp-mono", styles.pill, className]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </span>
    </Tooltip>
  );
}
