"use client";

// palette-reference.tsx — the 20-swatch palette reference (artboard A3).
//
// A table of every swatch with its Normal twin, Highlight twin, and the
// Deep text color. Static reference — it does not change with the active
// palette type, since the point is to show both columns side by side.

import type { ReactNode } from "react";
import { PALETTE_20 } from "@/lib/palette";
import { Tooltip } from "@/components/ui";
import { SettingsCard } from "./settings-card";

/** Shared header-cell style for the reference table. */
const headerCell: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--ink-400)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  padding: "8px 6px",
  borderBottom: "1px solid var(--ink-150)",
};

/** A color chip + its hex code. */
function ChipWithHex({
  hex,
  deep,
  chipWidth = 36,
}: {
  hex: string;
  deep: string;
  chipWidth?: number;
}): ReactNode {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span
        aria-hidden
        style={{
          width: chipWidth,
          height: 22,
          borderRadius: 5,
          background: hex,
          border: `1px solid ${deep}33`,
          flex: "0 0 auto",
        }}
      />
      <span
        className="cp-mono"
        style={{ fontSize: 11, color: "var(--ink-500)" }}
      >
        {hex}
      </span>
    </div>
  );
}

export function PaletteReference(): ReactNode {
  return (
    <SettingsCard
      eyebrow="The 20-color paired palette"
      title={
        <Tooltip
          content="Read-only reference of the full 20-color palette. The Core Curriculum picks one swatch per subject; your Normal/Highlight palette preference decides which column you actually see in the planner."
          side="bottom"
        >
          <span>Every swatch has a Normal and Highlight twin</span>
        </Tooltip>
      }
      hint="The Core Curriculum picks one swatch per subject. Each teacher's palette preference selects which column they see."
    >
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <div
          role="table"
          aria-label="20-color paired palette reference"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
            minWidth: 560,
          }}
        >
          {/* Header */}
          <div role="columnheader" style={headerCell}>
            Color
          </div>
          <div role="columnheader" style={headerCell}>
            Normal
          </div>
          <div role="columnheader" style={headerCell}>
            Highlight
          </div>
          <div role="columnheader" style={headerCell}>
            Deep (for text)
          </div>

          {/* One row per swatch */}
          {PALETTE_20.map((s) => (
            <div key={s.id} role="row" style={{ display: "contents" }}>
              <div
                role="cell"
                style={{
                  padding: "10px 6px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink-900)",
                  borderBottom: "1px solid var(--ink-100)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    background: s.normal,
                    border: `1px solid ${s.deep}33`,
                    flex: "0 0 auto",
                  }}
                />
                {s.name}
              </div>
              <div
                role="cell"
                style={{
                  padding: "10px 6px",
                  borderBottom: "1px solid var(--ink-100)",
                }}
              >
                <ChipWithHex hex={s.normal} deep={s.deep} />
              </div>
              <div
                role="cell"
                style={{
                  padding: "10px 6px",
                  borderBottom: "1px solid var(--ink-100)",
                }}
              >
                <ChipWithHex hex={s.highlight} deep={s.deep} />
              </div>
              <div
                role="cell"
                style={{
                  padding: "10px 6px",
                  borderBottom: "1px solid var(--ink-100)",
                }}
              >
                <ChipWithHex hex={s.deep} deep={s.deep} chipWidth={22} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SettingsCard>
  );
}
