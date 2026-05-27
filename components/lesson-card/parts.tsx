"use client";

// parts.tsx — small presentational pieces composed by the Lesson Card.
//
// Kept in one file because each is tiny and only the card consumes them.
// All colors come from CSS custom properties so the pieces follow the
// active palette/style without prop drilling:
//   • --c / --cl / --cd  — subject stripe / light fill / deep text
//     (set by the `.cp-subj <id>` class the card puts on its root).
//   • --ink-*            — neutrals from tokens.css.

import { useState } from "react";
import type { CSSProperties } from "react";
import type { LessonResource, LessonStatus } from "@/lib/types";
import { describeStandard } from "@/lib/mock";
import { Tooltip } from "@/components/ui";
import { Icon } from "./icon";
import type { IconName } from "./icon";
import { checkTitle } from "./status";

// ── Completion checkbox ─────────────────────────────────────────────────
// Three click-states render distinctly:
//   not_done → empty box
//   done     → filled green box + check
//   partial  → half-green / half-white box + check (reads "in progress")
// skipped / carried are menu-only and render their own neutral glyph.

interface CheckProps {
  status: LessonStatus;
  /** Square px size of the box. Touch target is padded to ≥44px. */
  size?: number;
  /** Cycle handler; receives the click position only — caller computes next. */
  onCycle?: () => void;
  /** Accessible label override. */
  label?: string;
}

export function CompletionCheck({
  status,
  size = 16,
  onCycle,
  label,
}: CheckProps) {
  const done = status === "done";
  const partial = status === "partial";
  const skipped = status === "skipped";
  const carried = status === "carried";

  let background = "transparent";
  let border = "1.4px solid var(--ink-300)";
  let glyph: React.ReactNode = null;

  if (done) {
    background = "var(--done)";
    border = "1.4px solid var(--done)";
    glyph = <Icon name="check" size={size - 5} />;
  } else if (partial) {
    background = "linear-gradient(135deg, var(--done) 50%, var(--paper) 50%)";
    border = "1.4px solid var(--done)";
    glyph = <Icon name="check" size={size - 5} />;
  } else if (skipped) {
    glyph = (
      <span
        style={{ fontSize: size * 0.7, color: "var(--ink-400)", lineHeight: 1 }}
      >
        –
      </span>
    );
  } else if (carried) {
    border = "1.4px solid var(--catchup)";
    glyph = (
      <span
        style={{ fontSize: size * 0.7, color: "var(--catchup)", lineHeight: 1 }}
      >
        ↻
      </span>
    );
  }

  return (
    <Tooltip content={checkTitle(status)} side="top">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycle?.();
        }}
        title={checkTitle(status)}
        aria-label={label ?? `Completion: ${status}`}
        className="cp-card-check"
        style={
          {
            "--box": `${size}px`,
          } as CSSProperties
        }
      >
        <span
          aria-hidden
          style={{
            width: size,
            height: size,
            borderRadius: 3,
            background,
            border,
            color: done || partial ? "var(--paper)" : "var(--ink-700)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {glyph}
        </span>
      </button>
    </Tooltip>
  );
}

// ── Subject monogram tile (Mid-Calm / Mid-Vivid header anchor) ──────────
// A rounded square showing the subject's two-letter glyph. Color comes
// from the resolved palette so it tracks Normal/Highlight.

interface MonogramProps {
  glyph: string;
  /** Light tile fill (subject `cl`). */
  fill: string;
  /** Deep text color (subject `cd`). */
  ink: string;
  size?: number;
}

export function SubjectMonogram({
  glyph,
  fill,
  ink,
  size = 32,
}: MonogramProps) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        background: fill,
        color: ink,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        lineHeight: 1,
        flex: "0 0 auto",
        letterSpacing: -0.3,
      }}
    >
      {glyph}
    </span>
  );
}

// ── Resource type row ───────────────────────────────────────────────────
// Collapsed view: a compact chip per distinct resource type with a count,
// painted in a brand-adjacent tint so a teacher reads "2 PDFs, 1 video"
// while scanning the grid.

const RES_ICON: Record<LessonResource["type"], IconName> = {
  pdf: "pdf",
  youtube: "youtube",
  slides: "slides",
  image: "image",
  doc: "doc",
  website: "website",
  link: "link",
};

const RES_TINT: Record<LessonResource["type"], { bg: string; fg: string }> = {
  pdf: {
    bg: "color-mix(in oklch, var(--urgent) 16%, white)",
    fg: "var(--urgent)",
  },
  youtube: {
    bg: "color-mix(in oklch, var(--youtube) 18%, white)",
    fg: "var(--youtube-deep)",
  },
  slides: {
    bg: "color-mix(in oklch, var(--important) 22%, white)",
    fg: "var(--important)",
  },
  image: {
    bg: "color-mix(in oklch, var(--writing) 18%, white)",
    fg: "var(--writing-deep)",
  },
  doc: { bg: "color-mix(in oklch, var(--fyi) 18%, white)", fg: "var(--fyi)" },
  website: {
    bg: "color-mix(in oklch, var(--grammar) 18%, white)",
    fg: "var(--grammar-deep)",
  },
  link: { bg: "var(--ink-100)", fg: "var(--ink-500)" },
};

const RES_LABEL: Record<LessonResource["type"], string> = {
  pdf: "PDF",
  youtube: "Video",
  slides: "Slides",
  image: "Image",
  doc: "Doc",
  website: "Website",
  link: "Link",
};

interface ResourceTypeRowProps {
  resources: LessonResource[];
  dense?: boolean;
}

/** Compact by-type summary chips for the collapsed footer. */
export function ResourceTypeRow({ resources, dense }: ResourceTypeRowProps) {
  if (resources.length === 0) return null;
  const counts = new Map<LessonResource["type"], number>();
  for (const r of resources) {
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  }
  return (
    <Tooltip
      content={`${resources.length} ${
        resources.length === 1 ? "resource" : "resources"
      } attached — open the Resources panel to see them.`}
      side="top"
    >
      <span
        style={{ display: "inline-flex", gap: 3, alignItems: "center" }}
        title={`${resources.length} ${
          resources.length === 1 ? "resource" : "resources"
        } attached`}
        tabIndex={0}
      >
        {[...counts.entries()].map(([type, n]) => {
          const tint = RES_TINT[type];
          return (
            <span
              key={type}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                padding: dense ? "0 4px 0 3px" : "1px 5px 1px 4px",
                background: tint.bg,
                color: tint.fg,
                borderRadius: 3,
                fontSize: dense ? 9.5 : 10,
                fontWeight: 600,
                lineHeight: 1.3,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <Icon name={RES_ICON[type]} size={dense ? 10 : 11} />
              {n > 1 && <span>{n}</span>}
            </span>
          );
        })}
      </span>
    </Tooltip>
  );
}

/** Full resource list shown in the expanded card body. */
export function ResourceList({ resources }: { resources: LessonResource[] }) {
  if (resources.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--ink-400)", margin: 0 }}>
        No resources attached.
      </p>
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {resources.map((r, i) => {
        const tint = RES_TINT[r.type];
        return (
          <li key={`${r.type}-${r.label}-${i}`}>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="cp-card-reslink"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 7px",
                borderRadius: 4,
                color: "var(--ink-700)",
                textDecoration: "none",
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  alignItems: "center",
                  justifyContent: "center",
                  background: tint.bg,
                  color: tint.fg,
                  flex: "0 0 auto",
                }}
              >
                <Icon name={RES_ICON[r.type]} size={13} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
              <span style={{ fontSize: 10, color: "var(--ink-400)" }}>
                {RES_LABEL[r.type]}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// ── Standards ───────────────────────────────────────────────────────────

/** Collapsed footer badge — `CCSS·N`, with the first code on hover. */
export function StandardsBadge({ codes }: { codes: string[] }) {
  const [hovered, setHovered] = useState(false);
  if (codes.length === 0) return null;
  const first = codes[0];
  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        fontWeight: 500,
        color: "var(--ink-500)",
        background: "var(--ink-100)",
        padding: "1px 6px",
        borderRadius: 3,
        letterSpacing: 0.2,
        cursor: "default",
      }}
      title={`The CCSS / curriculum standards this lesson covers — ${codes.length} aligned standard${codes.length === 1 ? "" : "s"}. Hover to see the codes.`}
    >
      <span className="cp-mono" style={{ fontSize: 10, fontWeight: 500 }}>
        CCSS
      </span>
      ·{codes.length}
      {hovered && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            width: 220,
            padding: "7px 9px",
            background: "var(--ink-900)",
            color: "var(--paper)",
            borderRadius: 6,
            boxShadow: "var(--shadow-popover)",
            fontSize: 11,
            fontWeight: 400,
            lineHeight: 1.45,
            letterSpacing: 0,
          }}
        >
          <span
            className="cp-mono"
            style={{ fontWeight: 600, display: "block", marginBottom: 2 }}
          >
            {first}
          </span>
          {describeStandard(first)}
        </span>
      )}
    </span>
  );
}

/** Full standards list shown in the expanded card body. */
export function StandardsList({ codes }: { codes: string[] }) {
  if (codes.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--ink-400)", margin: 0 }}>
        No standards tagged.
      </p>
    );
  }
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      {codes.map((code) => (
        <li key={code} style={{ display: "flex", gap: 8 }}>
          <span
            className="cp-mono"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--cd)",
              background: "var(--cl)",
              padding: "1px 5px",
              borderRadius: 3,
              flex: "0 0 auto",
              height: "fit-content",
            }}
          >
            {code}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--ink-600, var(--ink-700))",
              lineHeight: 1.45,
            }}
          >
            {describeStandard(code)}
          </span>
        </li>
      ))}
    </ul>
  );
}
