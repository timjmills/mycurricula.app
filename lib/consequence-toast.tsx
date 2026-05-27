"use client";

// consequence-toast.tsx — provider + hook for the W2-B8 ConsequenceToast.
//
// Every team-scoped setting commit (curriculum-label edit, holiday
// add/remove, academic-year change, school-week change) calls
// `showConsequence({ message, onUndo? })` so the teacher gets a
// transient confirmation naming the team-wide effect. Catch-up is
// excluded — per Unified Audit Decision #7 it is per-teacher and not a
// team-scope action.
//
// One toast at a time: a new commit replaces the previous toast (the
// state is a single optional value plus a monotonically-increasing key
// so React unmounts the prior ConsequenceToast and mounts a fresh one
// — that resets the dismiss timer + the slide-in animation).
//
// Mount the provider once near the planner shell + once in the
// settings layout. The hook is safe to call from anywhere inside.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConsequenceToast } from "@/components/ui/ConsequenceToast";

interface ConsequenceTone {
  message: string;
  onUndo?: () => void;
}

interface ConsequenceToastContextValue {
  /** Show a consequence toast. Replaces any visible one. */
  showConsequence: (t: ConsequenceTone) => void;
}

const ConsequenceToastContext =
  createContext<ConsequenceToastContextValue | null>(null);

interface ProviderState {
  key: number;
  toast: ConsequenceTone | null;
}

export function ConsequenceToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<ProviderState>({ key: 0, toast: null });

  const showConsequence = useCallback((t: ConsequenceTone): void => {
    setState((prev) => ({ key: prev.key + 1, toast: t }));
  }, []);

  const handleDismiss = useCallback((): void => {
    setState((prev) => ({ ...prev, toast: null }));
  }, []);

  const value = useMemo<ConsequenceToastContextValue>(
    () => ({ showConsequence }),
    [showConsequence],
  );

  return (
    <ConsequenceToastContext.Provider value={value}>
      {children}
      {state.toast !== null && (
        <ConsequenceToast
          key={state.key}
          message={state.toast.message}
          onUndo={state.toast.onUndo}
          onDismiss={handleDismiss}
        />
      )}
    </ConsequenceToastContext.Provider>
  );
}

/** Read the showConsequence callback from any descendant of the provider.
 *  Outside the provider this returns a no-op (so callsites stay
 *  callable in unit tests + isolated stories — no need to mock). */
export function useConsequenceToast(): ConsequenceToastContextValue {
  const ctx = useContext(ConsequenceToastContext);
  if (ctx) return ctx;
  // Soft fallback — log once in dev so an orphan callsite is visible
  // but never crash the consumer.
  return {
    showConsequence: (t) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[ConsequenceToast] showConsequence called outside provider:",
          t.message,
        );
      }
    },
  };
}
