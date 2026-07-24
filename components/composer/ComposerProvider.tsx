"use client";

// ComposerProvider — the Shared Composer engine (B4.0).
//
// A single provider that owns ONE composer + ONE resource-menu at a time and
// exposes imperative openers/closers, following the UndoToastProvider
// singleton-mount precedent (lib/undo-toast.tsx): the provider renders its
// singleton host (<ComposerHost/>) after `children`, so there is exactly one
// ResourceComposer / ResMenu instance for the whole planner shell instead of
// one declared per surface.
//
// Two contexts by design:
//   • ACTIONS — { openComposer, closeComposer, openResMenu, closeResMenu }.
//     Referentially STABLE (memo deps []), so future consumers that only call
//     openers never re-render when the composer state changes.
//   • STATE  — the live ComposerState. Consumed ONLY by ComposerHost.
//
// DORMANCY (B4.0 contract): nothing calls the actions in this tranche and no
// existing <ResourceComposer> callsite has migrated, so `state` stays
// {composer:null, resMenu:null} and ComposerHost renders nothing. Adding this
// provider therefore emits zero DOM and cannot change any surface's behavior —
// it is purely latent wiring for the B4.3+ host migrations.

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  composerReducer,
  initialComposerState,
  type ComposerOpenOptions,
  type ComposerState,
  type ResMenuOptions,
} from "./composer-state";
import { ComposerHost } from "./ComposerHost";

/** The imperative surface consumers reach through `useComposer()`. */
export interface ComposerActions {
  /** Open the shared composer with the given options (maps onto the existing
   *  ResourceComposer's props). Replaces any open composer (last-in wins). */
  openComposer: (opts: ComposerOpenOptions) => void;
  /** Close the shared composer (no-op when none is open). */
  closeComposer: () => void;
  /** Open the shared resource action menu at the given anchor. Replaces any
   *  open menu (last-in wins). */
  openResMenu: (opts: ResMenuOptions) => void;
  /** Close the shared resource action menu (no-op when none is open). */
  closeResMenu: () => void;
}

const ComposerActionsContext = createContext<ComposerActions | null>(null);
const ComposerStateContext = createContext<ComposerState | null>(null);

export function ComposerProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);

  // Actions wrap the stable `dispatch`, so this object never changes identity.
  const actions = useMemo<ComposerActions>(
    () => ({
      openComposer: (opts) => dispatch({ type: "open-composer", opts }),
      closeComposer: () => dispatch({ type: "close-composer" }),
      openResMenu: (opts) => dispatch({ type: "open-res-menu", opts }),
      closeResMenu: () => dispatch({ type: "close-res-menu" }),
    }),
    [],
  );

  return (
    <ComposerActionsContext.Provider value={actions}>
      <ComposerStateContext.Provider value={state}>
        {children}
        <ComposerHost />
      </ComposerStateContext.Provider>
    </ComposerActionsContext.Provider>
  );
}

/** Imperative composer/menu API. Throws if used outside <ComposerProvider>. */
export function useComposer(): ComposerActions {
  const ctx = useContext(ComposerActionsContext);
  if (!ctx) {
    throw new Error("useComposer must be used inside <ComposerProvider>");
  }
  return ctx;
}

/** Provider-optional accessor — returns null instead of throwing when no
 *  <ComposerProvider> is mounted (mirrors useUndoToastOptional). For surfaces
 *  that also render outside the planner shell (previews, standalone editors). */
export function useComposerOptional(): ComposerActions | null {
  return useContext(ComposerActionsContext);
}

/** Internal — the live singleton state, for ComposerHost only. Throws outside
 *  the provider so a stray host mount is caught immediately. */
export function useComposerState(): ComposerState {
  const ctx = useContext(ComposerStateContext);
  if (ctx === null) {
    throw new Error("useComposerState must be used inside <ComposerProvider>");
  }
  return ctx;
}
