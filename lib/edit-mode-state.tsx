"use client";

// edit-mode-state.tsx — W3.8b: the per-view View ↔ Edit mode, as SHARED state.
//
// The 7.2.26 bundle's `cc_editmode` map: which *rendering* of a view (polished
// read vs. planning/edit) the teacher last chose, persisted per view. W3.6
// mounted the toggle with the state living privately inside ViewEditToggle;
// W3.8b gives the map a reactive home because it now has MULTIPLE live
// consumers that must agree in real time:
//
//   • <ViewEditToggle> — the WRITER (the top-bar eye/pencil pill).
//   • <ChromeShell> — a READER: suppresses the bottom clock/console row while
//     Day is in Edit (the W3.8b chrome change).
//   • The Day-edit split view (components/daily, builder A′) — a READER.
//   • The force-reset nav callsites (Console/SideNav/home rows) — WRITERS
//     that flip Day back to View on the click that navigates.
//
// ── Why a Provider/Context (the weekly-schedule-state precedent) ──────────
// lib/weekly-schedule-state.ts:22-34 documents the bug this pattern exists to
// prevent: a provider-less hook gives every consumer its OWN useState copy, so
// a write updates the writer's copy + localStorage but leaves every reader
// stale until a full reload. Lifting the map into ONE context instance —
// mounted once in app/(planner)/layout.tsx, above both the SideNav and the
// ChromeShell subtree — makes a toggle flip (or a nav-time reset) reach the
// chrome and the view immediately, in-session.
//
// ⚠ NAME COLLISION (W3-HANDOFF §3) — this is NOT `useAppState().editMode`.
// That value is the forking `personal | master` axis (CLAUDE.md §2: the
// Personal/Team toggle). Same word, unrelated meaning; never conflate. This
// map never touches app-state.
//
// PERSISTENCE CONTRACT (LOCKED): localStorage key `cc_editmode`, shape
// `Record<string, boolean>` keyed by CAPITALIZED view name ("Day" / "Week") —
// bundle-exact casing, mirroring `ljson('cc_editmode',{})` / `sjson`. A
// lowercase-key finding was dismissed for this reason (W3-HANDOFF §3). Local
// UI state only — deliberately EXCLUDED from theme-sync (WAVE-3-PLAN C5).
//
// FORCE-RESET RULE (WAVE-3-PLAN W3.8b; bundle B:11978/B:11986): Day resets to
// View on Home→Day nav and on the Day nav item (even in place, when already
// on /daily); Week's mode truly persists across nav. Deep links (?lesson=),
// WeeklyList jumps, schedule jumps, the command palette, and rail icons NEVER
// reset — they intentionally preserve the mode. The nav callsites reset via
// the hook's setEdit(false) so the live state and storage move together;
// `resetEditModeToView` below is the storage-only fallback for any future
// callsite that lives OUTSIDE the provider tree.
//
// Hydration discipline (the weekly-schedule-state pattern, :149-169): the
// first render returns the empty map so the SSR HTML and the first client
// render match (server renders View); a post-mount effect hydrates the saved
// map. Writes are gated on `hydratedRef` so the hydration effect can never
// overwrite storage with the default.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

// ── Storage key + value types ─────────────────────────────────────────────

const STORAGE_KEY = "cc_editmode";

/** The views that carry a View↔Edit mode (bundle-exact capitalized keys). */
export type EditModeView = "Day" | "Week";

/** The persisted map — `Record<view, boolean>`; `isEdit = !!map[view]`. */
type EditModeMap = Record<string, boolean>;

// ── Read / write helpers — SSR-guarded, non-fatal on storage errors ──────
// (Moved here from ViewEditToggle.tsx, which now consumes the hook.)

function readEditModeMap(): EditModeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as EditModeMap;
    }
  } catch {
    // Malformed JSON or storage unavailable — resting default is View.
  }
  return {};
}

function writeEditMode(view: string, on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    // Read-modify-write against STORAGE itself (not the provider's state) so
    // a key another tab wrote is never clobbered by this tab's stale copy.
    // (Not atomic — two tabs writing DIFFERENT views in the same instant can
    // lose one update; localStorage has no transactions. Accepted Low: the
    // payload is a cosmetic per-view preference and every cc_*/mycurricula:*
    // key in the codebase shares this ceiling.)
    const map = readEditModeMap();
    map[view] = on;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private-mode failure — in-memory state still reflects the flip.
  }
}

/**
 * Storage-only reset: writes `map[view] = false` directly to localStorage.
 * FALLBACK for callsites outside the provider tree (none exist today — every
 * W3.8b reset callsite is a component under the (planner) layout and uses the
 * hook's setEdit(false), which updates the LIVE provider state too). A bare
 * storage write cannot reach mounted consumers; prefer the hook everywhere.
 */
export function resetEditModeToView(view: EditModeView): void {
  writeEditMode(view, false);
}

// ── Context ────────────────────────────────────────────────────────────────

interface EditModeContextValue {
  map: EditModeMap;
  setEdit: (view: EditModeView, on: boolean) => void;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

/**
 * Owns the `cc_editmode` map and shares ONE instance with every consumer
 * beneath it. Mounted once in app/(planner)/layout.tsx — above the SideNav
 * AND the ChromeShell subtree, so the toggle (writer), the chrome (reader),
 * the Day-edit view (reader), and the nav reset callsites (writers) all see
 * the same live state (the weekly-schedule-state desync lesson).
 */
export function EditModeProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [map, setMap] = useState<EditModeMap>({});

  // Post-mount hydration. Live state merges OVER storage (audit fix): a nav
  // reset clicked in the first-paint window lands in `prev` (and in storage,
  // below) before this effect runs — `{ ...stored, ...prev }` keeps that
  // explicit user write instead of resurrecting the stale stored value.
  // With no pre-hydration writes, prev is {} and storage wins as before.
  useEffect(() => {
    const stored = readEditModeMap();
    setMap((prev) => ({ ...stored, ...prev }));
  }, []);

  const setEdit = useCallback((view: EditModeView, on: boolean): void => {
    setMap((prev) => (!!prev[view] === on ? prev : { ...prev, [view]: on }));
    // ALWAYS persist — setEdit is an explicit user action, never the SSR
    // default (the precedent's hydration gate exists to keep DEFAULTS out
    // of storage; setEdit writes none). writeEditMode is read-modify-write
    // against storage, so a pre-hydration write is safe, and the hydration
    // merge above cannot undo it (audit: the pre-hydration reset race).
    writeEditMode(view, on);
  }, []);

  const value = useMemo<EditModeContextValue>(
    () => ({ map, setEdit }),
    [map, setEdit],
  );

  return (
    <EditModeContext.Provider value={value}>
      {children}
    </EditModeContext.Provider>
  );
}

// ── Public hook ──────────────────────────────────────────────────────────

export interface UseViewEditModeReturn {
  /** True when the given view is in Edit mode. */
  isEdit: boolean;
  /** Flip the given view's mode (persists + updates every live consumer). */
  setEdit: (on: boolean) => void;
}

/**
 * The per-view View↔Edit mode. Reads the shared instance from
 * <EditModeProvider>; writer and readers get the SAME state object, so a
 * toggle flip or nav-time reset is reflected across the chrome and the view
 * immediately, with no reload.
 *
 * Throws if used outside the provider — a loud failure beats silently
 * desynced copies (the weekly-schedule-state bug this pattern prevents).
 */
export function useViewEditMode(view: EditModeView): UseViewEditModeReturn {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error(
      "useViewEditMode must be used within an <EditModeProvider>",
    );
  }
  const { map, setEdit: setEditFor } = ctx;
  return useMemo<UseViewEditModeReturn>(
    () => ({
      isEdit: !!map[view],
      setEdit: (on: boolean) => setEditFor(view, on),
    }),
    [map, view, setEditFor],
  );
}
