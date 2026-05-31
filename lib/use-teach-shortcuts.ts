"use client";

// use-teach-shortcuts.ts — keyboard shortcut dispatcher for the Teach surface
// (docs/teach-view-plan.md §3, §14 Agent A). The Teach analogue of
// `lib/use-keyboard-shortcuts.ts`: it wires the in-class delivery shortcuts to
// the central `TeachWorkspaceState` reducer rather than to navigation.
//
// Shortcut map (plan §14):
//   ⌘/Ctrl + 1–9   select the Nth board (by display order)
//   ⌘/Ctrl + L     focus the Lessons / Lesson module (left panel)
//   ⌘/Ctrl + ⇧ + L focus the Boards module (left panel)
//   ⌘/Ctrl + R     focus the Resources module (right panel)
//   ⌘/Ctrl + J     focus the Chat module (right panel)
//   ⌘/Ctrl + K     focus the To-do module (right panel)
//   ⌘/Ctrl + /     open the layout switcher (1up → 3×3)
//   ⌘/Ctrl + P     enter Present mode
//   Esc            cascade: exit Focus → exit Full Screen → exit Present
//
// The module-focus shortcuts (L/⇧L/R/J/K) do not live in the central reducer —
// the left/right zones (Agents B/E) own panel/tab focus. This hook surfaces
// them as a single `onFocusModule` callback the integrating component (Wave 2)
// wires to the zones; until then it is a no-op default. The same applies to the
// layout switcher: ⌘/ calls `onOpenLayoutSwitcher` so Agent A's SubBar can open
// its layout popover, with a sensible fallback (cycle the layout) when no
// handler is supplied.
//
// CRITICAL CONSTRAINT (mirrors use-keyboard-shortcuts.ts): every shortcut is
// suppressed when the event originates from a text input (INPUT / TEXTAREA /
// SELECT / contenteditable) EXCEPT the modifier chords here are unambiguous, so
// we still allow them — but Esc inside a text input is left to the input (so a
// teacher editing a widget title can press Esc to cancel the edit, not exit
// Present). Undo/redo (⌘Z/⌘Y) are intentionally NOT wired here.

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { BoardLayout } from "./teach/types";
import { BOARD_LAYOUT_GRID } from "./teach/types";

// Re-declare the action union shape this hook dispatches against, structurally
// matching `TeachWorkspaceAction` from `components/teach/TeachWorkspace.tsx`.
// We avoid importing the component (a client tree) into a lib hook; the subset
// below is the frozen Wave-0 contract this hook needs.
type TeachShortcutAction =
  | { type: "selectBoard"; boardId: string | null }
  | { type: "setLayout"; layout: BoardLayout }
  | { type: "setPresent"; present: boolean }
  | { type: "setFullscreen"; fullscreen: boolean }
  | { type: "focusWidget"; widgetId: string | null };

/** A focusable Teach panel module the L/⇧L/R/J/K shortcuts target. */
export type TeachShortcutModule =
  | "lessons"
  | "boards"
  | "resources"
  | "chat"
  | "todo";

/** The minimal state slice the shortcut cascade reads. Structurally a subset of
 *  `TeachWorkspaceState` so callers pass the full state directly. */
export interface TeachShortcutState {
  present: boolean;
  fullscreen: boolean;
  focusedWidgetId: string | null;
  layout: BoardLayout;
}

export interface UseTeachShortcutsOptions {
  /** The central workspace state (read for the Esc cascade + layout cycle). */
  state: TeachShortcutState;
  /** The central reducer dispatch. */
  dispatch: Dispatch<TeachShortcutAction>;
  /** Board ids in display order — index N-1 maps to ⌘N (N = 1..9). */
  boardIds: readonly string[];
  /** Focus a panel module (L/⇧L/R/J/K). Wave 2 wires this to the zones; the
   *  default is a no-op so the hook is safe before that wiring lands. */
  onFocusModule?: (module: TeachShortcutModule) => void;
  /** Open the layout switcher popover (⌘/). When omitted the hook falls back to
   *  cycling to the next layout so the shortcut is never dead. */
  onOpenLayoutSwitcher?: () => void;
  /** Exit fullscreen via the Fullscreen API. The hook updates the reducer flag;
   *  the actual `document.exitFullscreen()` call is the caller's so the API and
   *  the state stay in one owner (the SubBar). Optional. */
  onExitFullscreen?: () => void;
}

/** True when the event target is a text-input context. */
function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const ce = target.getAttribute("contenteditable");
  return ce !== null && ce !== "false";
}

/** Ordered layout list for the ⌘/ fallback cycle. */
const LAYOUT_ORDER = Object.keys(BOARD_LAYOUT_GRID) as BoardLayout[];

export function useTeachShortcuts({
  state,
  dispatch,
  boardIds,
  onFocusModule,
  onOpenLayoutSwitcher,
  onExitFullscreen,
}: UseTeachShortcutsOptions): void {
  // Keep every changing value behind a ref so the keydown listener (registered
  // once) never captures a stale closure — the same pattern the top bar uses
  // for undo/redo.
  const stateRef = useRef(state);
  const boardIdsRef = useRef(boardIds);
  const dispatchRef = useRef(dispatch);
  const focusModuleRef = useRef(onFocusModule);
  const openLayoutRef = useRef(onOpenLayoutSwitcher);
  const exitFullscreenRef = useRef(onExitFullscreen);
  stateRef.current = state;
  boardIdsRef.current = boardIds;
  dispatchRef.current = dispatch;
  focusModuleRef.current = onFocusModule;
  openLayoutRef.current = onOpenLayoutSwitcher;
  exitFullscreenRef.current = onExitFullscreen;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const inText = isTextInput(e.target);

    // ── Esc cascade — exit Focus → Full Screen → Present, one level per press
    // (most-immersive first). Suppressed inside a text input so a teacher
    // editing a field keeps Esc for the field's own cancel. Bare Esc only.
    if (e.key === "Escape" && !mod && !e.shiftKey && !e.altKey) {
      if (inText) return;
      const s = stateRef.current;
      if (s.focusedWidgetId !== null) {
        e.preventDefault();
        dispatchRef.current({ type: "focusWidget", widgetId: null });
        return;
      }
      if (s.fullscreen) {
        e.preventDefault();
        dispatchRef.current({ type: "setFullscreen", fullscreen: false });
        // Let the owner drop the real Fullscreen API if it manages it.
        exitFullscreenRef.current?.();
        return;
      }
      if (s.present) {
        e.preventDefault();
        dispatchRef.current({ type: "setPresent", present: false });
        return;
      }
      return;
    }

    // Every remaining shortcut is a modifier chord. Bail if no modifier.
    if (!mod) return;

    const key = e.key;
    const lower = key.toLowerCase();

    // ── ⌘1–9 — select the Nth board by display order ───────────────────────
    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1;
      const id = boardIdsRef.current[index];
      if (id !== undefined) {
        e.preventDefault();
        dispatchRef.current({ type: "selectBoard", boardId: id });
      }
      return;
    }

    // ── ⌘P — enter Present mode ─────────────────────────────────────────────
    // Plain ⌘P only. ⌘⇧P is spec'd as Pop-Out (plan §7, T11) — a Phase 2 "Soon"
    // feature — so it must NOT slam into Present. The `!e.shiftKey` guard keeps
    // the two distinct.
    if (lower === "p" && !e.shiftKey) {
      e.preventDefault();
      dispatchRef.current({ type: "setPresent", present: true });
      return;
    }

    // ── ⌘⇧P — Pop-Out (plan §7, T11) ────────────────────────────────────────
    // Deferred to Phase 2 (detached second-monitor board with cross-window
    // postMessage sync). Until that lands this is a graceful no-op: we consume
    // the chord so it does not fall through to any later branch or trigger
    // Present, but do nothing. The hook receives no `onPopOut` handler today, so
    // there is nothing to call — wire one here when Pop-Out ships.
    if (lower === "p" && e.shiftKey) {
      e.preventDefault();
      return;
    }

    // ── ⌘/ — open the layout switcher (fallback: cycle layout) ──────────────
    // Documented behavior (audit A2) is a layout-switcher popover, but the hook
    // is not supplied an `onOpenLayoutSwitcher` handler at the current call site,
    // so that popover is deferred. The cycle-to-next-layout fallback below keeps
    // the chord functional in the meantime; remove it once the popover is wired.
    if (key === "/") {
      e.preventDefault();
      if (openLayoutRef.current) {
        openLayoutRef.current();
      } else {
        const cur = stateRef.current.layout;
        const i = LAYOUT_ORDER.indexOf(cur);
        const next = LAYOUT_ORDER[(i + 1) % LAYOUT_ORDER.length];
        dispatchRef.current({ type: "setLayout", layout: next });
      }
      return;
    }

    // ── Module-focus shortcuts ──────────────────────────────────────────────
    // L → Lessons, ⇧L → Boards, R → Resources, J → Chat, K → To-do.
    if (lower === "l") {
      e.preventDefault();
      focusModuleRef.current?.(e.shiftKey ? "boards" : "lessons");
      return;
    }
    if (lower === "r" && !e.shiftKey) {
      e.preventDefault();
      focusModuleRef.current?.("resources");
      return;
    }
    if (lower === "j" && !e.shiftKey) {
      e.preventDefault();
      focusModuleRef.current?.("chat");
      return;
    }
    if (lower === "k" && !e.shiftKey) {
      e.preventDefault();
      focusModuleRef.current?.("todo");
      return;
    }

    // ── Arrow keys — move between widget cells when the grid is focused ──────
    // TODO(plan §7.6): arrow-key cell navigation needs a grid-focus model + an
    // onMoveCell callback from TeachWorkspace — deferred, see
    // docs/teach-view-plan.md "Deferred" section. The hook receives no cell
    // layout (cell positions / focused-cell coords) and no focus-move callback,
    // so real navigation cannot be implemented here without changing the call
    // site. We intentionally do NOT handle arrow keys (no preventDefault, no
    // dispatch) so they keep falling through to the tablist roving-arrow nav in
    // the sub-bar/panels rather than being swallowed by a faked implementation.
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
