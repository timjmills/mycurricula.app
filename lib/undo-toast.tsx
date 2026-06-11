"use client";

// undo-toast.tsx — provider + hook for the roadmap-02 UndoToast.
//
// Every undoable planner gesture (lesson move, completion toggle,
// first-time fork, revert) and every confirmation-only moment ("Link
// copied") fires through `showUndoToast({ message, onUndo? })`. One
// toast at a time: a new call replaces the visible one (last-in wins) —
// same key-bump replacement mechanic as lib/consequence-toast.tsx.
//
// ⌘Z / Ctrl+Z while a toast with an undo is live triggers THAT undo and
// dismisses the toast. The listener registers on window in the CAPTURE
// phase and stops propagation, so the top-bar's bubble-phase global
// undo handler (components/shell/top-bar.tsx) never also fires — one
// keypress, one undo. With no live toast the capture listener does
// nothing and the top-bar handler keeps its existing behavior.
//
// Undo consumption is SINGLE-SHOT (§4a review M2): the moment any undo
// path fires — Undo click, ⌘Z — or the exit animation begins, the toast
// is retired from ⌘Z eligibility synchronously. A reflexive ⌘Z right
// after clicking Undo falls through to the top-bar's normal handler
// (one more history step, exactly what the keypress means) instead of
// silently double-firing the toast's undo. Dismissal is key-checked so
// a stray exit callback from an unmounted toast can never clear its
// replacement (review M1).
//
// Mount once in the planner shell layout, inside PlannerProvider,
// alongside ConsequenceToastProvider.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UndoToast } from "@/components/ui/UndoToast";

export interface UndoToastInput {
  /** Single-line message. Lead with the outcome ("Moved to Tuesday"). */
  message: string;
  /** Undo callback; omit for confirmation-only toasts ("Link copied"). */
  onUndo?: () => void;
}

interface UndoToastContextValue {
  /** Show an undo toast. Replaces any visible one (last-in wins). */
  showUndoToast: (t: UndoToastInput) => void;
  /**
   * Retire + unmount whatever toast is live (no-op when none).
   *
   * WHY (§4a review M1): a toast's Undo fires the store's GENERIC
   * single-step undo, so the toast is only honest while the history entry
   * it describes is still the TOP of the undo stack. The moment any
   * non-toasting mutation advances history (a text edit, section plumbing,
   * a bulk batch, an undo/redo), a still-visible "Moved to Tuesday" would
   * silently revert THAT newer step instead. The bridge calls this on every
   * history advance that does not itself produce a toast, so a visible
   * toast can never outlive the step it describes.
   */
  clearUndoToast: () => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

interface ProviderState {
  key: number;
  toast: UndoToastInput | null;
}

/** Mirrors the top-bar guard: never hijack ⌘Z from a focused editor. */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = (target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return target.closest('[contenteditable="true"]') !== null;
}

export function UndoToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<ProviderState>({ key: 0, toast: null });

  // Monotonic key source + the key of the toast that currently owns ⌘Z.
  // -1 = none. Retirement is synchronous and one-way per key.
  const keyCounterRef = useRef(0);
  const liveKeyRef = useRef(-1);
  const toastRef = useRef<UndoToastInput | null>(null);

  const showUndoToast = useCallback((t: UndoToastInput): void => {
    keyCounterRef.current += 1;
    liveKeyRef.current = keyCounterRef.current;
    toastRef.current = t;
    setState({ key: keyCounterRef.current, toast: t });
  }, []);

  /** Retire + unmount ANY live toast — see the context-value doc for why
   *  (§4a M1: a toast must never outlive the history step it describes).
   *  Key-agnostic by design: the caller (the bridge) is reacting to a
   *  history advance, not to a specific toast, so whatever is visible is
   *  by definition stale. */
  const clearUndoToast = useCallback((): void => {
    liveKeyRef.current = -1; // retire from ⌘Z eligibility
    toastRef.current = null;
    setState((prev) => (prev.toast === null ? prev : { ...prev, toast: null }));
  }, []);

  /** Retire `key` from ⌘Z eligibility. No-op for any other key. */
  const retire = useCallback((key: number): void => {
    if (liveKeyRef.current === key) {
      liveKeyRef.current = -1;
      toastRef.current = null;
    }
  }, []);

  /** Unmount the toast for `key` — no-op if a newer toast replaced it. */
  const dismiss = useCallback(
    (key: number): void => {
      retire(key);
      setState((prev) => (prev.key === key ? { ...prev, toast: null } : prev));
    },
    [retire],
  );

  /** Fire `key`'s undo exactly once. */
  const fireUndo = useCallback(
    (key: number): void => {
      if (liveKeyRef.current !== key) return; // already consumed/retired
      const undo = toastRef.current?.onUndo;
      retire(key); // consume BEFORE invoking — re-entrancy safe
      undo?.();
    },
    [retire],
  );

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const fireUndoRef = useRef(fireUndo);
  fireUndoRef.current = fireUndo;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const key = liveKeyRef.current;
      if (key === -1 || !toastRef.current?.onUndo) return; // nothing live
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.shiftKey) return; // ⌘⇧Z is redo — not the toast's business
      if (e.key !== "z" && e.key !== "Z") return;
      if (isEditingTarget(e.target)) return;

      e.preventDefault();
      e.stopPropagation(); // pre-empt the top-bar bubble handler
      fireUndoRef.current(key);
      dismissRef.current(key);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  const value = useMemo<UndoToastContextValue>(
    () => ({ showUndoToast, clearUndoToast }),
    [showUndoToast, clearUndoToast],
  );

  const { key, toast } = state;
  return (
    <UndoToastContext.Provider value={value}>
      {children}
      {toast && (
        <UndoToast
          key={key}
          message={toast.message}
          onUndo={toast.onUndo ? () => fireUndo(key) : undefined}
          onExitStart={() => retire(key)}
          onDismiss={() => dismiss(key)}
        />
      )}
    </UndoToastContext.Provider>
  );
}

export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext);
  if (!ctx) {
    throw new Error("useUndoToast must be used inside <UndoToastProvider>");
  }
  return ctx;
}

/**
 * Provider-OPTIONAL accessor — returns null when no <UndoToastProvider> is
 * mounted instead of throwing. For surfaces that also render OUTSIDE the
 * planner shell (e.g. the lesson-card context menu, which the Settings →
 * Appearance live preview mounts with no providers): they degrade to "no
 * confirmation toast" rather than crashing. Same additive pattern as
 * lib/planner-store's useCatalogOptional.
 */
export function useUndoToastOptional(): UndoToastContextValue | null {
  return useContext(UndoToastContext);
}
