"use client";

// settings-card.tsx — small shared primitives for the Appearance panel.
//
//   • SettingsCard — the white rounded panel with an eyebrow/title/hint
//     header. Every section in artboard A2 uses this frame.
//   • RadioDot     — the filled-circle radio indicator shared by the
//     style picker and palette toggle.

import type { ReactNode } from "react";

interface SettingsCardProps {
  /** Small uppercase label above the title. */
  eyebrow: string;
  /** Section title. */
  title?: string;
  /** Supporting one-liner under the title. */
  hint?: string;
  /** Optional element pinned to the top-right of the header. */
  action?: ReactNode;
  children: ReactNode;
}

/** White rounded panel with a consistent header — the A2 section frame. */
export function SettingsCard({
  eyebrow,
  title,
  hint,
  action,
  children,
}: SettingsCardProps): ReactNode {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid var(--ink-150)",
        borderRadius: 14,
        padding: "18px 18px 16px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-400)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {eyebrow}
          </div>
          {title && (
            <h2
              style={{
                margin: "4px 0 0",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ink-900)",
                letterSpacing: -0.2,
              }}
            >
              {title}
            </h2>
          )}
          {hint && (
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 12,
                color: "var(--ink-500)",
                lineHeight: 1.55,
                textWrap: "pretty",
              }}
            >
              {hint}
            </p>
          )}
        </div>
        {action && <div style={{ flex: "0 0 auto" }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Filled-circle radio indicator. */
export function RadioDot({ selected }: { selected: boolean }): ReactNode {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        flex: "0 0 auto",
        border: `2px solid ${selected ? "var(--ink-900)" : "var(--ink-300)"}`,
        background: selected ? "var(--ink-900)" : "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#fff",
          }}
        />
      )}
    </span>
  );
}
