"use client";

// lib/use-board-annotations.ts — React hook wrapping the pure annotation
// reducer (lib/board-annotations.ts) with localStorage persistence, rAF-batched
// redraw scheduling, pointer→normalized conversion, and DPR canvas sizing
// (plan §5.2, §13.5).
//
// PERSISTENCE: per-teacher, USER-scoped, persists ACROSS SESSIONS (plan §13.5).
// One localStorage blob PER AUTHENTICATED USER under
// `mycurricula:user:teach-annotations:<uid>`, an object sub-keyed by
// `lessonId:boardId:resourceId` (resourceId "" = the board grid itself).
// Removed only by an explicit Clear. SSR-safe in the use-rail-layout.ts mold:
// initial state is empty so server HTML == first client paint; a post-mount
// effect hydrates from storage.
//
// SHARED-BROWSER ISOLATION (finding #19): annotations are private board ink and
// MUST NOT leak across accounts on a shared machine. The storage key is
// namespaced by the authenticated user id (resolved from the Supabase session,
// the app's existing auth path — mirrors lib/teach/use-teach-groups.ts). Before
// a real uid resolves we use an anonymous namespace that is wiped on sign-in so
// pre-auth scratch ink never bleeds into an account, and switching accounts
// (A→B) re-hydrates from B's namespace instead of showing A's strokes.
//
// The `onChange` seam keeps the store decoupled — Phase 4 swaps localStorage
// for the owner-scoped `board_annotations` table with no change here.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  apply,
  EMPTY_ANNOTATIONS,
  initAnnotationState,
  redraw,
  toAnnotations,
  type AnnotationState,
  type BoardAnnotations,
  type BoardBox,
  type Pt,
  type Stroke,
  type StrokeTool,
} from "./board-annotations";

// ── Storage ─────────────────────────────────────────────────────────────────

/** localStorage key prefix. The full key is `${STORAGE_PREFIX}:<uid>` so each
 *  authenticated user gets an isolated annotation blob (finding #19). */
const STORAGE_PREFIX = "mycurricula:user:teach-annotations";

/** Namespace used before a real auth uid resolves (signed out / session not
 *  yet loaded). Cleared on sign-in so it can never leak into an account. */
const ANON_UID = "__anon";

/** Compose the uid-scoped localStorage blob key. */
function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}:${uid}`;
}

/** Compose the per-surface storage sub-key. `resourceId` empty/undefined keys
 *  the board grid itself (annotations drawn over the widget board, not a
 *  resource). */
export function annotationStoreKey(
  lessonId: string | null,
  boardId: string | null,
  resourceId: string | null | undefined,
): string {
  return `${lessonId ?? "_"}:${boardId ?? "_"}:${resourceId ?? ""}`;
}

type StoreShape = Record<string, BoardAnnotations>;

function readStore(uid: string): StoreShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as StoreShape;
    }
    return {};
  } catch {
    return {};
  }
}

function readEntry(uid: string, subKey: string): BoardAnnotations | null {
  const store = readStore(uid);
  const entry = store[subKey];
  if (
    entry &&
    typeof entry === "object" &&
    entry.version === 1 &&
    Array.isArray(entry.strokes)
  ) {
    return entry;
  }
  return null;
}

function writeEntry(
  uid: string,
  subKey: string,
  value: BoardAnnotations,
): void {
  if (typeof window === "undefined") return;
  try {
    const store = readStore(uid);
    if (value.strokes.length === 0) {
      delete store[subKey];
    } else {
      store[subKey] = value;
    }
    window.localStorage.setItem(storageKey(uid), JSON.stringify(store));
  } catch {
    // Storage disabled / quota exceeded — in-memory state still holds.
  }
}

/** Drop the anonymous-namespace blob. Called when a real uid resolves so
 *  pre-auth scratch ink never lingers for the next signed-in user. */
function clearAnonStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(ANON_UID));
  } catch {
    // Storage disabled — nothing to clear.
  }
}

// ── Pointer / DPR helpers ─────────────────────────────────────────────────

/** Convert a client pointer position to normalized board-space (0..1),
 *  clamped to the box. */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): Pt {
  const x = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
  const y = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

/** Default per-tool width (CSS px) + opacity. */
function toolDefaults(tool: StrokeTool): { width: number; opacity: number } {
  switch (tool) {
    case "highlighter":
      return { width: 8, opacity: 0.4 };
    case "pen":
      return { width: 3, opacity: 1 };
    case "text":
      return { width: 1, opacity: 1 };
    case "rect":
    case "line":
    case "arrow":
    default:
      return { width: 3, opacity: 1 };
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface BeginStrokeOpts {
  tool: StrokeTool;
  color: string;
  /** Override width (CSS px). Falls back to the tool default. */
  width?: number;
  /** Override opacity 0..1. Falls back to the tool default. */
  opacity?: number;
  /** Text content (text tool only). */
  text?: string;
}

export interface UseBoardAnnotationsApi {
  /** The committed strokes (live document). */
  strokes: Stroke[];
  /** The in-progress draft stroke, or null. */
  draft: Stroke | null;
  /** Register the canvas element so the hook owns sizing + redraw. */
  attachCanvas: (el: HTMLCanvasElement | null) => void;
  /** Call when the board box changes (resize) — re-sizes + repaints. */
  resize: (box: BoardBox) => void;

  // ── Stroke ops (pointer-driven) ──────────────────────────────────────────
  /** Begin a freehand/shape draft at `point`. */
  beginStroke: (point: Pt, opts: BeginStrokeOpts) => void;
  /** Extend a freehand draft (pen/highlighter). */
  extendStroke: (point: Pt) => void;
  /** Move the draft's trailing point — shape live-preview (rect/line/arrow). */
  updateStrokeEnd: (point: Pt) => void;
  /** Commit the current draft. */
  endStroke: () => void;
  /** Discard the current draft. */
  cancelStroke: () => void;
  /** Commit a finished text stroke at `point`. */
  addText: (point: Pt, text: string, color: string) => void;
  /** Object-erase: remove strokes hit at `point`. */
  eraseAt: (point: Pt) => void;

  // ── History ──────────────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Destructive — wipe every stroke for this surface. */
  clear: () => void;
}

export interface UseBoardAnnotationsOptions {
  /** Persistence sub-key parts. */
  lessonId: string | null;
  boardId: string | null;
  resourceId?: string | null;
  /** Notified after every committing change (persisted shape). */
  onChange?: (annotations: BoardAnnotations) => void;
  /**
   * SCRATCH surface — never read from or write to localStorage. The resource /
   * notecard preview passes this so its ink is genuinely live-only: it can't be
   * persisted (the product promises preview ink is "never saved"), and a tab
   * killed mid-draw can't orphan a stroke blob in storage (the random-key
   * approach alone would leak one dead entry per crashed session). Board
   * surfaces leave this false/undefined so their ink persists across sessions
   * (plan §13.5). When true the hook also skips the auth round-trip — there is
   * no per-user namespace to resolve.
   */
  ephemeral?: boolean;
}

/**
 * Owns the annotation state for one board/resource surface. The component
 * passes the canvas element via `attachCanvas`; the hook sizes it to
 * box × devicePixelRatio and rAF-batches every repaint.
 */
export function useBoardAnnotations(
  options: UseBoardAnnotationsOptions,
): UseBoardAnnotationsApi {
  const {
    lessonId,
    boardId,
    resourceId,
    onChange,
    ephemeral = false,
  } = options;
  const subKey = annotationStoreKey(lessonId, boardId, resourceId);

  const [state, dispatch] = useReducer(
    apply,
    EMPTY_ANNOTATIONS,
    initAnnotationState,
  );

  // ── Authenticated user id (finding #19) ───────────────────────────────────
  // Resolved post-mount from the Supabase session (the app's existing auth
  // path — mirrors lib/teach/use-teach-groups.ts). Held in a ref so the stable
  // persist callback always reads the latest uid; a sibling `uidVersion`
  // counter bumps on every uid change to retrigger the hydrate effect (which
  // must re-read from the new user's namespace). Anon until a real uid
  // resolves.
  const uidRef = useRef<string>(ANON_UID);
  const [uidVersion, bumpUidVersion] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    // Ephemeral surfaces never touch storage, so there is no per-user namespace
    // to resolve — skip the auth round-trip entirely (also avoids a Supabase
    // getUser() call every time a preview opens/closes).
    if (ephemeral) return;
    const supabase = createClient();
    let active = true;

    const applyUid = (nextUid: string): void => {
      if (!active) return;
      if (uidRef.current === nextUid) return; // no-op — same user
      // Switching INTO a real account: clear the pre-auth scratch namespace so
      // it can never be re-read by (or bleed into) the signed-in user.
      if (nextUid !== ANON_UID) clearAnonStorage();
      uidRef.current = nextUid;
      // Retrigger the hydrate effect so the visible ink swaps to the new user's
      // namespace (drops the prior user's in-memory strokes via HYDRATE).
      bumpUidVersion();
    };

    supabase.auth.getUser().then(({ data }) => {
      applyUid(data.user?.id ?? ANON_UID);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUid(session?.user?.id ?? ANON_UID);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [ephemeral]);

  // Canvas + box refs. The box is the CSS-pixel size of the board.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<BoardBox>({ width: 0, height: 0 });
  const dprRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);
  // Latest state captured for the rAF redraw + persistence without stale closures.
  const stateRef = useRef<AnnotationState>(state);
  stateRef.current = state;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Persist gate (declared before the hydrate effect so the hydrate effect
  // can reset it) ───────────────────────────────────────────────────────────
  // The persist effect below skips its first run after each (re)hydrate so it
  // doesn't echo the just-loaded value back to storage / `onChange`. We reset
  // this on EVERY surface change (not just mount) because switching surface
  // A→B re-runs HYDRATE, which changes `state.strokes` and would otherwise fire
  // a spurious persist of B's freshly-hydrated value.
  const hydratedRef = useRef(false);

  // ── Hydrate from storage post-mount (SSR-safe) + on surface OR uid change ──
  // Re-runs when the resolved uid changes (uidVersion) so an account switch on
  // a shared browser re-hydrates from the new user's namespace.
  useEffect(() => {
    // Suppress the immediate post-hydrate persist run for THIS surface. The
    // hydrate effect is declared before the persist effect, so this reset lands
    // before the persist effect re-runs in the same commit.
    hydratedRef.current = false;
    // Ephemeral surfaces never read storage — they always hydrate empty, so the
    // next preview open starts blank and nothing on disk is ever consulted.
    const stored = ephemeral ? null : readEntry(uidRef.current, subKey);
    dispatch({ type: "HYDRATE", annotations: stored ?? EMPTY_ANNOTATIONS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKey, uidVersion, ephemeral]);

  // ── rAF-batched repaint ───────────────────────────────────────────────────
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const s = stateRef.current;
      redraw(ctx, s.strokes, s.draft, boxRef.current, dprRef.current);
    });
  }, []);

  // Repaint whenever the committed/draft state changes.
  useEffect(() => {
    scheduleRedraw();
  }, [state.strokes, state.draft, scheduleRedraw]);

  // Cancel any pending frame on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Persist on committed-document change (not draft) ──────────────────────
  // Skip the first run after each (re)hydrate (see `hydratedRef` above) so we
  // don't echo the loaded value back to storage / `onChange`.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const annotations = toAnnotations(stateRef.current);
    // Ephemeral surfaces never write to disk — the ink lives only in this hook's
    // in-memory reducer and is gone the moment the component unmounts.
    if (!ephemeral) writeEntry(uidRef.current, subKey, annotations);
    onChangeRef.current?.(annotations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.strokes, subKey]);

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr =
      typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio) : 1;
    dprRef.current = dpr;
    const { width, height } = boxRef.current;
    const nextW = Math.round(width * dpr);
    const nextH = Math.round(height * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    scheduleRedraw();
  }, [scheduleRedraw]);

  const attachCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) sizeCanvas();
    },
    [sizeCanvas],
  );

  const resize = useCallback(
    (box: BoardBox) => {
      boxRef.current = box;
      sizeCanvas();
    },
    [sizeCanvas],
  );

  // ── Stroke ops ────────────────────────────────────────────────────────────
  const idCounter = useRef(0);
  const newId = useCallback((): string => {
    idCounter.current += 1;
    return `stroke-${Date.now().toString(36)}-${idCounter.current}`;
  }, []);

  const beginStroke = useCallback(
    (point: Pt, opts: BeginStrokeOpts) => {
      const def = toolDefaults(opts.tool);
      const isShape =
        opts.tool === "rect" || opts.tool === "line" || opts.tool === "arrow";
      const stroke: Stroke = {
        id: newId(),
        tool: opts.tool,
        color: opts.color,
        width: opts.width ?? def.width,
        opacity: opts.opacity ?? def.opacity,
        // Shapes start with two coincident points so UPDATE_LAST can move the
        // second; freehand starts with one and APPENDs.
        points: isShape ? [point, point] : [point],
        text: opts.text,
      };
      dispatch({ type: "BEGIN", stroke });
    },
    [newId],
  );

  const extendStroke = useCallback((point: Pt) => {
    dispatch({ type: "APPEND", point });
  }, []);

  const updateStrokeEnd = useCallback((point: Pt) => {
    dispatch({ type: "UPDATE_LAST", point });
  }, []);

  const endStroke = useCallback(() => {
    dispatch({ type: "COMMIT" });
  }, []);

  const cancelStroke = useCallback(() => {
    dispatch({ type: "CANCEL_DRAFT" });
  }, []);

  const addText = useCallback(
    (point: Pt, text: string, color: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      dispatch({
        type: "ADD",
        stroke: {
          id: newId(),
          tool: "text",
          color,
          width: 1,
          opacity: 1,
          points: [point],
          text,
        },
      });
    },
    [newId],
  );

  // Object-eraser tolerance in normalized units (~2% of the board's longer
  // edge) — generous enough to feel forgiving without erasing distant ink.
  const ERASE_TOL = 0.02;
  const eraseAt = useCallback((point: Pt) => {
    const box = boxRef.current;
    // Before the first measure the box is 0×0; `strokeHit` would then divide the
    // tolerance by `|| 1` and produce a wildly oversized normalized reach that
    // could erase distant strokes. No measured box → nothing to hit-test yet.
    if (box.width === 0 || box.height === 0) return;
    dispatch({
      type: "ERASE_AT",
      point,
      tol: ERASE_TOL,
      box,
    });
  }, []);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  return useMemo(
    () => ({
      strokes: state.strokes,
      draft: state.draft,
      attachCanvas,
      resize,
      beginStroke,
      extendStroke,
      updateStrokeEnd,
      endStroke,
      cancelStroke,
      addText,
      eraseAt,
      undo,
      redo,
      canUndo: state.undo.length > 0,
      canRedo: state.redo.length > 0,
      clear,
    }),
    [
      state.strokes,
      state.draft,
      state.undo.length,
      state.redo.length,
      attachCanvas,
      resize,
      beginStroke,
      extendStroke,
      updateStrokeEnd,
      endStroke,
      cancelStroke,
      addText,
      eraseAt,
      undo,
      redo,
      clear,
    ],
  );
}
