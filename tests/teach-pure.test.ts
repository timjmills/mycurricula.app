import { describe, it, expect } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// Pure-logic guardrails for the Teach board engines the v2 shell (Wave 11)
// composes. No React, no DB, no network — node-env vitest, no new deps. These
// lock in the load-bearing behaviour the shell relies on:
//   • lib/board-annotations — the annotation reducer transitions, the
//     drawable-stroke gate, and the object-eraser hit test.
//   • lib/teach/types       — the board-cell droppable id round-trip (the DnD
//     contract between a dragged resource and a board cell).
//   • lib/board-embed       — the render-kind branch, src resolution, and the
//     two iframe sandbox tiers (the ONE audited board-embed sink).
// ───────────────────────────────────────────────────────────────────────────

import {
  apply,
  initAnnotationState,
  isDrawableStroke,
  strokeHit,
  toAnnotations,
  EMPTY_ANNOTATIONS,
  type Stroke,
  type AnnotationState,
} from "@/lib/board-annotations";
import {
  boardCellDroppableId,
  parseBoardCellDroppableId,
} from "@/lib/teach/types";
import {
  boardEffectiveKind,
  resolveBoardSrc,
  boardSandboxFor,
  TRUSTED_PROVIDER_SANDBOX,
  GENERIC_LINK_SANDBOX,
} from "@/lib/board-embed";
import type { TeachResource } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function penStroke(points: { x: number; y: number }[]): Stroke {
  return { id: "s1", tool: "pen", color: "#000", width: 4, points };
}

function res(partial: Partial<TeachResource>): TeachResource {
  // The board-embed helpers only read url/resourceId/provider/mimeType/kind;
  // cast a minimal shape so we don't over-specify the full domain type.
  return { kind: "link", label: "x", tags: [], ...partial } as TeachResource;
}

// ── lib/board-annotations: reducer transitions ───────────────────────────────

describe("board-annotations reducer", () => {
  it("BEGIN → APPEND → COMMIT lands a stroke and marks the state a real edit", () => {
    let s: AnnotationState = initAnnotationState();
    expect(s.hydrating).toBe(true);
    s = apply(s, {
      type: "BEGIN",
      stroke: penStroke([{ x: 0.1, y: 0.1 }]),
    });
    s = apply(s, { type: "APPEND", point: { x: 0.2, y: 0.2 } });
    expect(s.draft?.points).toHaveLength(2);
    s = apply(s, { type: "COMMIT" });
    expect(s.strokes).toHaveLength(1);
    expect(s.draft).toBeNull();
    expect(s.hydrating).toBe(false);
  });

  it("COMMIT drops a non-drawable (single-point) freehand draft", () => {
    let s = initAnnotationState();
    s = apply(s, { type: "BEGIN", stroke: penStroke([{ x: 0.1, y: 0.1 }]) });
    s = apply(s, { type: "COMMIT" });
    expect(s.strokes).toHaveLength(0);
    expect(s.draft).toBeNull();
  });

  it("UNDO/REDO walk the committed history", () => {
    let s = initAnnotationState();
    s = apply(s, {
      type: "BEGIN",
      stroke: penStroke([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    });
    s = apply(s, { type: "COMMIT" });
    expect(s.strokes).toHaveLength(1);
    s = apply(s, { type: "UNDO" });
    expect(s.strokes).toHaveLength(0);
    s = apply(s, { type: "REDO" });
    expect(s.strokes).toHaveLength(1);
  });

  it("ERASE_AT removes only strokes hit within tolerance", () => {
    let s = initAnnotationState();
    s = apply(s, {
      type: "ADD",
      stroke: penStroke([
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ]),
    });
    // A far point is a no-op (state identity preserved).
    const before = s;
    s = apply(s, {
      type: "ERASE_AT",
      point: { x: 0.9, y: 0.9 },
      tol: 0.02,
      box: { width: 1000, height: 600 },
    });
    expect(s).toBe(before);
    // A near point erases the stroke.
    s = apply(s, {
      type: "ERASE_AT",
      point: { x: 0.55, y: 0.5 },
      tol: 0.02,
      box: { width: 1000, height: 600 },
    });
    expect(s.strokes).toHaveLength(0);
  });

  it("CLEAR empties the document and HYDRATE replaces it as a non-edit", () => {
    let s = initAnnotationState();
    s = apply(s, {
      type: "ADD",
      stroke: penStroke([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    });
    s = apply(s, { type: "CLEAR" });
    expect(s.strokes).toHaveLength(0);
    s = apply(s, {
      type: "HYDRATE",
      annotations: { version: 1, strokes: [penStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }])] },
    });
    expect(s.strokes).toHaveLength(1);
    expect(s.hydrating).toBe(true);
    expect(toAnnotations(s).strokes).toHaveLength(1);
  });

  it("EMPTY_ANNOTATIONS seeds an empty, versioned document", () => {
    expect(EMPTY_ANNOTATIONS).toEqual({ version: 1, strokes: [] });
  });
});

// ── isDrawableStroke ─────────────────────────────────────────────────────────

describe("isDrawableStroke", () => {
  it("needs ≥2 points for freehand, distinct endpoints for shapes, text for text", () => {
    expect(isDrawableStroke(penStroke([{ x: 0, y: 0 }]))).toBe(false);
    expect(isDrawableStroke(penStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toBe(true);
    const zeroRect: Stroke = {
      id: "r",
      tool: "rect",
      color: "#000",
      width: 2,
      points: [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }],
    };
    expect(isDrawableStroke(zeroRect)).toBe(false);
    const rect: Stroke = { ...zeroRect, points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.5 }] };
    expect(isDrawableStroke(rect)).toBe(true);
    const emptyText: Stroke = {
      id: "t",
      tool: "text",
      color: "#000",
      width: 2,
      points: [{ x: 0.1, y: 0.1 }],
      text: "   ",
    };
    expect(isDrawableStroke(emptyText)).toBe(false);
    expect(isDrawableStroke({ ...emptyText, text: "Hi" })).toBe(true);
  });
});

// ── strokeHit (object eraser) ────────────────────────────────────────────────

describe("strokeHit", () => {
  const box = { width: 1000, height: 600 };
  it("hits a polyline near the segment and misses when far", () => {
    const s = penStroke([{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }]);
    expect(strokeHit(s, { x: 0.5, y: 0.405 }, 0.02, box)).toBe(true);
    expect(strokeHit(s, { x: 0.5, y: 0.8 }, 0.02, box)).toBe(false);
  });
});

// ── lib/teach/types: board-cell droppable id round-trip ──────────────────────

describe("board-cell droppable id", () => {
  it("round-trips boardId/col/row", () => {
    const id = boardCellDroppableId("board-9", 2, 1);
    expect(id).toBe("cell:board-9:2:1");
    expect(parseBoardCellDroppableId(id)).toEqual({ boardId: "board-9", col: 2, row: 1 });
  });

  it("rejects non-cell ids and malformed shapes", () => {
    expect(parseBoardCellDroppableId("rail-left")).toBeNull();
    expect(parseBoardCellDroppableId("cell:board:2")).toBeNull();
    expect(parseBoardCellDroppableId("cell:board:x:1")).toBeNull();
  });
});

// ── lib/board-embed: kind + src + sandbox tiers ──────────────────────────────

describe("board-embed", () => {
  it("resolveBoardSrc prefers a public url, else the hosted-file API indirection", () => {
    expect(resolveBoardSrc(res({ url: "https://x.test/a" }))).toBe("https://x.test/a");
    expect(resolveBoardSrc(res({ resourceId: "abc" }))).toBe("/api/resources/abc");
    expect(resolveBoardSrc(res({}))).toBeNull();
  });

  it("boardEffectiveKind branches on provider, then mimeType, then parsed/kind", () => {
    expect(boardEffectiveKind(res({ provider: "youtube" }), null)).toBe("embed");
    expect(boardEffectiveKind(res({ provider: "pdf" }), null)).toBe("pdf");
    expect(boardEffectiveKind(res({ mimeType: "application/pdf" }), null)).toBe("pdf");
    expect(boardEffectiveKind(res({ mimeType: "image/png" }), null)).toBe("image");
    expect(boardEffectiveKind(res({ kind: "slides" }), null)).toBe("embed");
    expect(boardEffectiveKind(res({ kind: "link" }), null)).toBe("link");
  });

  it("boardSandboxFor gives trusted providers same-origin and generic links the strict tier", () => {
    expect(boardSandboxFor("youtube")).toBe(TRUSTED_PROVIDER_SANDBOX);
    expect(boardSandboxFor("gslides")).toBe(TRUSTED_PROVIDER_SANDBOX);
    expect(boardSandboxFor(undefined)).toBe(GENERIC_LINK_SANDBOX);
    // The strict tier must NOT grant same-origin (opaque origin for random links).
    expect(GENERIC_LINK_SANDBOX).not.toContain("allow-same-origin");
    expect(TRUSTED_PROVIDER_SANDBOX).toContain("allow-same-origin");
  });
});
