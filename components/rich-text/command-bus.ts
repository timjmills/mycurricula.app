"use client";

// command-bus.ts — shared focused-editor registry for EXTERNAL rich-text
// toolbars (6.11.26 daily-view redesign, §6 `.rtToolbar`).
//
// Problem this solves: the /daily redesign replaces the per-editor docked
// toolbar with ONE sticky toolbar at the top of the detail scroll body. That
// toolbar lives outside every RichTextEditor, so it needs a way to act on
// "whichever editor the teacher is working in" — including during the click
// on a toolbar button, when naive focus handling would have already lost the
// editor's selection.
//
// Design: a minimal module-level registry (no provider needed — the module
// instance IS the shared state, exactly like lib/tooltip-dismissal.ts).
//
//   • Each RichTextEditor rendered with `chromeless` registers a
//     RichTextCommandTarget on focus and unregisters on blur — via the
//     `useRichTextCommandTarget` hook below. Only ONE target is active at a
//     time (last focus wins), which matches the single-selection reality of
//     the document.
//   • An external toolbar consumes the bus via `useRichTextCommandBus()`,
//     which subscribes it to registry changes (target gained/lost, selection
//     moved) so disabled/active states stay live.
//
// Selection preservation — the classic external-toolbar problem — is solved
// twice over (belt and braces):
//   1. The toolbar calls e.preventDefault() on mousedown (container AND
//      buttons), so pressing a button never moves focus and never collapses
//      the editor's selection. This is the same trick the editor's own
//      floating toolbar uses.
//   2. The editor's blur handler keeps the registration alive when focus
//      moves INTO an element marked with RICH_TEXT_TOOLBAR_ATTR (keyboard
//      users Tab into the toolbar), and the chromeless editor snapshots its
//      last selection Range on every selectionchange — commands restore that
//      range if the live selection was lost (see rich-text-editor.tsx,
//      `captureSelectionRange` / `restoreFocusAndSelection`).
//
// All commands route through the EDITOR's own pipeline (the same
// runCommand / runLink / runImage paths its built-in toolbar uses), so
// execution stays selection-preserving, sanitized-on-emit, and undo-friendly.
// This module never touches the DOM and never calls execCommand itself.
//
// SSR-safe: registry mutation only happens from focus/blur handlers and
// effects (browser-only); `useRichTextCommandBus` supplies a server snapshot.

import { useEffect, useSyncExternalStore, type RefObject } from "react";

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * A document.execCommand identifier. The external /daily toolbar uses:
 *   "bold" | "italic" | "underline" | "strikeThrough"
 *   "formatBlock" (value: "h4" | "p")
 *   "insertUnorderedList" | "insertOrderedList" | "outdent" | "indent"
 *   "removeFormat"
 * Any other execCommand the editor's pipeline supports is also legal — the
 * type stays `string` so the bus never has to chase the full command list.
 */
export type RichTextCommand = string;

/**
 * What a focused editor exposes to external toolbars. Implementations are
 * created inside `useRichTextCommandTarget` and delegate to the editor's own
 * command pipeline — never to raw execCommand.
 */
export interface RichTextCommandTarget {
  /**
   * Execute a formatting command through the editor's selection-preserving,
   * sanitizing, undo-friendly pipeline (focus + range restore → execCommand →
   * format-state sync → sanitized onChange emit).
   */
  executeCommand(command: RichTextCommand, value?: string): void;
  /** Run the editor's link flow (URL prompt + createLink over the saved range). */
  requestLink(): void;
  /**
   * Run the editor's inline-image flow — the parent-driven
   * `onRequestImageUrl` resolver when the editor has one (the notecards-wave
   * upload path), else the URL-prompt fallback.
   */
  requestImage(): void;
  /**
   * queryCommandState passthrough for toggle highlighting (bold lit when the
   * selection is bold, etc.). Returns false when the state can't be read.
   */
  queryState(command: RichTextCommand): boolean;
  /** True when `node` is inside this editor's editable region. */
  contains(node: Node): boolean;
}

/**
 * The latest command implementations of one editor instance. Held in a ref by
 * the editor so the registered target object can stay REFERENCE-STABLE across
 * re-renders while always delegating to fresh closures.
 */
export interface RichTextCommandImpl {
  runCommand(command: RichTextCommand, value?: string): void;
  runLink(): void;
  runImage(): void;
}

/**
 * Attribute that marks an external toolbar's root element. The editor's blur
 * handler keeps its registration alive when focus moves into an element
 * carrying this attribute, so keyboard users can Tab from the editor onto the
 * toolbar without the buttons disabling under them.
 */
export const RICH_TEXT_TOOLBAR_ATTR = "data-rich-text-toolbar";

// ── Registry state (module-level — shared by import) ───────────────────────

let activeTarget: RichTextCommandTarget | null = null;
/** Monotonic change counter — the useSyncExternalStore snapshot. */
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  // Copy before iterating — a listener may unsubscribe itself mid-notify.
  for (const listener of Array.from(listeners)) listener();
}

// ── Registry API (editor side) ──────────────────────────────────────────────

/** Make `target` the active command target (last focus wins). */
export function registerRichTextCommandTarget(
  target: RichTextCommandTarget,
): void {
  if (activeTarget === target) return;
  activeTarget = target;
  bump();
}

/**
 * Clear `target` if it is still the active one. A stale unregister (another
 * editor already took over — focus moved editor→editor, where the new focus
 * fires before the old blur in some orders) is a safe no-op.
 */
export function unregisterRichTextCommandTarget(
  target: RichTextCommandTarget,
): void {
  if (activeTarget !== target) return;
  activeTarget = null;
  bump();
}

/**
 * Signal that the active target's formatting state changed (selection moved,
 * command executed) WITHOUT changing which target is active. Subscribed
 * toolbars re-render and re-query `queryState`. No-op when nothing is active.
 */
export function notifyRichTextStateChanged(): void {
  if (activeTarget === null) return;
  bump();
}

// ── Registry API (toolbar side) ─────────────────────────────────────────────

/** The currently-focused (or toolbar-held) editor target, if any. */
export function getRichTextCommandTarget(): RichTextCommandTarget | null {
  return activeTarget;
}

/** Subscribe to registry changes. Returns the unsubscribe function. */
export function subscribeRichTextCommandBus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current change-counter — useSyncExternalStore snapshot. */
export function getRichTextCommandBusVersion(): number {
  return version;
}

/**
 * Facade for external toolbars: every method targets whichever editor is
 * active right now, and every method is a safe no-op (or `false`) when no
 * editor is focused — so a toolbar can render unconditionally and simply
 * disable its buttons off `canExecute()`.
 */
export const RichTextCommandBus = {
  /** True when an editor is focused (or held via the toolbar) — i.e. commands will land somewhere. */
  canExecute(): boolean {
    return activeTarget !== null;
  },
  executeCommand(command: RichTextCommand, value?: string): void {
    activeTarget?.executeCommand(command, value);
  },
  requestLink(): void {
    activeTarget?.requestLink();
  },
  requestImage(): void {
    activeTarget?.requestImage();
  },
  queryState(command: RichTextCommand): boolean {
    return activeTarget?.queryState(command) ?? false;
  },
  /** True when `node` lives inside the active editor's editable region. */
  targetContains(node: Node): boolean {
    return activeTarget?.contains(node) ?? false;
  },
  /**
   * Drop the active target. The toolbar calls this when keyboard focus
   * leaves it for somewhere that is neither the toolbar nor the held editor
   * (the editor's own blur handler intentionally kept the registration alive
   * while focus sat on the toolbar).
   */
  release(): void {
    if (activeTarget === null) return;
    activeTarget = null;
    bump();
  },
} as const;

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Editor-side hook — registers `editorRef`'s element with the bus while it
 * has focus. Used internally by RichTextEditor when `chromeless` is set; not
 * intended for other callers, but exported for completeness/testing.
 *
 *   • Registers on focus (and immediately, if the element already holds
 *     focus when the effect attaches — the autoFocus case).
 *   • On blur, keeps the registration when focus moved into an external
 *     toolbar (`RICH_TEXT_TOOLBAR_ATTR`) so the buttons stay usable; clears
 *     it otherwise.
 *   • Unregisters on unmount / when `enabled` flips off.
 *
 * The registered target object is created once per effect run and delegates
 * through `implRef`, so prop/closure churn in the editor never re-registers.
 */
export function useRichTextCommandTarget(
  editorRef: RefObject<HTMLElement | null>,
  implRef: RefObject<RichTextCommandImpl>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const el = editorRef.current;
    if (!el) return;

    const target: RichTextCommandTarget = {
      executeCommand: (command, value) =>
        implRef.current?.runCommand(command, value),
      requestLink: () => implRef.current?.runLink(),
      requestImage: () => implRef.current?.runImage(),
      queryState: (command) => {
        // queryCommandState reads the document selection — correct even at a
        // collapsed caret, and still correct while focus momentarily sits on
        // the external toolbar (browsers keep the document selection alive).
        try {
          return document.queryCommandState(command);
        } catch {
          return false;
        }
      },
      contains: (node) => el.contains(node),
    };

    const handleFocus = (): void => {
      registerRichTextCommandTarget(target);
    };

    const handleBlur = (e: FocusEvent): void => {
      // Focus moving INTO an external toolbar must not drop the target —
      // that's the keyboard path onto the toolbar buttons. (Mouse presses on
      // the toolbar preventDefault their mousedown, so no blur fires at all.)
      const next = e.relatedTarget as Element | null;
      if (next?.closest?.(`[${RICH_TEXT_TOOLBAR_ATTR}]`)) return;
      unregisterRichTextCommandTarget(target);
    };

    el.addEventListener("focus", handleFocus);
    el.addEventListener("blur", handleBlur);

    // The editor may already be focused when this effect attaches (autoFocus
    // editors focus in their own mount effect) — register immediately.
    if (document.activeElement === el) {
      registerRichTextCommandTarget(target);
    }

    return () => {
      el.removeEventListener("focus", handleFocus);
      el.removeEventListener("blur", handleBlur);
      unregisterRichTextCommandTarget(target);
    };
  }, [enabled, editorRef, implRef]);
}

/**
 * Toolbar-side hook — subscribes the component to the bus so it re-renders
 * whenever the active target or its formatting state changes, then returns
 * the `RichTextCommandBus` facade. Read `bus.canExecute()` for the disabled
 * state and `bus.queryState("bold")` etc. for toggle highlighting on each
 * render — the subscription guarantees those reads stay fresh.
 */
export function useRichTextCommandBus(): typeof RichTextCommandBus {
  useSyncExternalStore(
    subscribeRichTextCommandBus,
    getRichTextCommandBusVersion,
    // Server snapshot: nothing can be focused during SSR.
    () => 0,
  );
  return RichTextCommandBus;
}
