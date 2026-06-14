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
  composite,
  EMPTY_ANNOTATIONS,
  initAnnotationState,
  paintCommitted,
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

/**
 * Persist a buffered `BoardAnnotations` to the signed-in user's annotation store
 * ON DEMAND — the "Save these annotations?" path for ephemeral present mode
 * (F1/F2). Present-mode ink runs through an `ephemeral` hook (in-memory only, no
 * auto-persist); when the teacher chooses Save on exit, this writes the buffer
 * under the same `subKey` the editing surface reads, resolving the uid the same
 * way the hook does so it reloads under the right account. An empty buffer just
 * clears the key (writeEntry deletes on zero strokes). Resolves after the write.
 */
export async function persistBoardAnnotations(
  subKey: string,
  annotations: BoardAnnotations,
): Promise<void> {
  if (typeof window === "undefined") return;
  let uid = ANON_UID;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? ANON_UID;
  } catch {
    // Auth unavailable — fall back to the anon namespace (still persists locally).
  }
  writeEntry(uid, subKey, annotations);
}

/**
 * Read a saved `BoardAnnotations` for a sub-key from the signed-in user's store,
 * resolving the uid the same way the hook does. The counterpart to
 * `persistBoardAnnotations` — present mode pre-seeds its in-memory session buffer
 * with this on page-open so previously-saved ink REAPPEARS when presenting again
 * (and so an exit-Save merges with, rather than clobbers, the saved set). Returns
 * null when nothing is stored / storage is unavailable.
 */
export async function readBoardAnnotations(
  subKey: string,
): Promise<BoardAnnotations | null> {
  if (typeof window === "undefined") return null;
  let uid = ANON_UID;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? ANON_UID;
  } catch {
    // Auth unavailable — fall back to the anon namespace.
  }
  return readEntry(uid, subKey);
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
  /**
   * EPHEMERAL-ONLY hydrate source (F1/F2). When `ephemeral` is true the surface
   * normally hydrates EMPTY; pass `hydrateFrom` to instead seed it from an
   * in-memory buffer whenever the surface (sub-key) changes. Present mode uses
   * this to restore a page's ephemeral ink when the teacher navigates back to it
   * within the same unsaved present session — without ever touching storage.
   * Read only at hydrate time (on sub-key change) via a ref, so updating it
   * mid-stroke never wipes in-progress ink. Ignored when not `ephemeral`.
   */
  hydrateFrom?: BoardAnnotations | null;
  /**
   * Bump to force a re-hydrate of the CURRENT sub-key (e.g. after an async load
   * has populated `hydrateFrom`). Part of the hydrate effect's deps. Leave
   * stable when not needed. Present mode bumps this once a page's saved ink has
   * been read into the session buffer so it re-hydrates from the seeded value.
   */
  hydrateKey?: string | number;
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
    hydrateFrom,
    hydrateKey,
  } = options;
  const subKey = annotationStoreKey(lessonId, boardId, resourceId);
  // Latest hydrate-from buffer, read only at hydrate time (sub-key change) so a
  // mid-stroke update never re-hydrates and wipes in-progress ink (F1/F2).
  const hydrateFromRef = useRef(hydrateFrom);
  hydrateFromRef.current = hydrateFrom;

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
  // Offscreen cache of the COMMITTED strokes (F5/F6). Re-painted only when the
  // committed document or the canvas size changes; every animation frame then
  // composites this layer + the live draft onto the visible canvas, so a drag
  // re-renders just the one draft stroke instead of every committed stroke.
  // Created lazily, browser-only.
  const committedRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<BoardBox>({ width: 0, height: 0 });
  const dprRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);
  // Latest state captured for the rAF redraw + persistence without stale closures.
  const stateRef = useRef<AnnotationState>(state);
  stateRef.current = state;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Hydrate from storage post-mount (SSR-safe) + on surface OR uid change ──
  // Re-runs when the resolved uid changes (uidVersion) so an account switch on
  // a shared browser re-hydrates from the new user's namespace.
  useEffect(() => {
    // Ephemeral surfaces never read storage. They hydrate from the in-memory
    // `hydrateFrom` buffer when one is supplied (present-mode session re-visit),
    // else empty — so a fresh preview/page starts blank and nothing on disk is
    // ever consulted.
    const stored = ephemeral
      ? (hydrateFromRef.current ?? null)
      : readEntry(uidRef.current, subKey);
    const annotations = stored ?? EMPTY_ANNOTATIONS;
    // dispatch() records the action type ("HYDRATE") so the persist effect skips
    // the resulting echo — however many times we re-hydrate.
    dispatch({ type: "HYDRATE", annotations });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKey, uidVersion, ephemeral, hydrateKey]);

  // ── Layered redraw (F5/F6) ────────────────────────────────────────────────
  // Lazily create + size the offscreen committed layer to match the visible
  // canvas's device-pixel size, so a 1:1 `drawImage` blit composites it.
  const ensureCommittedCanvas = useCallback((): HTMLCanvasElement | null => {
    if (typeof document === "undefined") return null;
    let c = committedRef.current;
    if (!c) {
      c = document.createElement("canvas");
      committedRef.current = c;
    }
    const w = canvasRef.current?.width ?? 0;
    const h = canvasRef.current?.height ?? 0;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }, []);

  // Re-render every committed stroke onto the offscreen layer. Called only on a
  // committed-document change (commit / undo / redo / erase / clear / hydrate)
  // or a resize — NOT per pointer sample.
  const repaintCommitted = useCallback(() => {
    const c = ensureCommittedCanvas();
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    paintCommitted(
      ctx,
      stateRef.current.strokes,
      boxRef.current,
      dprRef.current,
    );
  }, [ensureCommittedCanvas]);

  // rAF-batched composite of the cached committed layer + the live draft.
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      composite(
        ctx,
        committedRef.current,
        stateRef.current.draft,
        boxRef.current,
        dprRef.current,
      );
    });
  }, []);

  // Committed document changed → re-render the cached layer, then composite.
  useEffect(() => {
    repaintCommitted();
    scheduleRedraw();
  }, [state.strokes, repaintCommitted, scheduleRedraw]);

  // Draft changed (every pointer sample during a drag) → composite only. The
  // committed layer is untouched, so this is O(draft), not O(all strokes).
  useEffect(() => {
    scheduleRedraw();
  }, [state.draft, scheduleRedraw]);

  // Cancel any pending frame on unmount AND clear the ref. Clearing is critical:
  // React StrictMode (dev) runs effects mount → cleanup → mount. If cleanup
  // cancelled the frame but left `rafRef.current` holding the (now-cancelled) id,
  // the re-mount's `scheduleRedraw` would see a non-null ref, bail forever, and
  // never composite — so the committed layer would never paint. Resetting to
  // null lets the next mount schedule a fresh frame.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  // ── Persist on committed-document change (not draft) ──────────────────────
  // Skip HYDRATE echoes by ACTION (the reducer marks `hydrating` on HYDRATE,
  // clears it on every real mutation): a strokes change produced by a hydrate is
  // not a user edit, so it must not write or notify `onChange`. A genuine edit
  // that returns the document to the hydrated baseline (undo / erase-all) is NOT
  // hydrating, so it DOES fire — keeping consumer buffers (the present-mode
  // session buffer) in sync with the visible canvas. Robust to any number of
  // re-hydrates (unlike a one-shot flag or a content-equality check).
  useEffect(() => {
    if (stateRef.current.hydrating) return;
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
    // Re-render the committed layer at the new device size (this also resizes
    // the offscreen canvas to match), then composite.
    repaintCommitted();
    scheduleRedraw();
  }, [repaintCommitted, scheduleRedraw]);

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
