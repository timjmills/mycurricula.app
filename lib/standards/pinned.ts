"use client";

// lib/standards/pinned.ts — per-teacher pinned standards frameworks.
//
// Pinned frameworks float to the top of the StandardsPicker so a teacher's
// preferred systems are always one glance away. Persistence is localStorage
// for now (same pattern as the theme axes in lib/theme.tsx); Phase 1B moves
// this into teacher_ui_state so pins roam across devices.
//
// SSR-safe: the first render uses the defaults so server and client HTML
// match; the stored value arrives in a post-mount effect.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mycurricula:user:standards:pinned";

/** Beta defaults: the frameworks the first team tags against. Purely a
 *  starting point — fully editable, not a product assumption. */
export const DEFAULT_PINNED = [
  "CCSS-ELA",
  "CCSS-MATH",
  "CCSS-SMP",
  "NGSS",
] as const;

function readStored(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every((x): x is string => typeof x === "string")
    ) {
      return parsed;
    }
  } catch (err) {
    // Corrupt value — fall back to defaults below, but leave a breadcrumb:
    // a silent revert-to-defaults is otherwise undiagnosable.
    console.warn("[standards] ignoring corrupt pinned-frameworks value", err);
  }
  return null;
}

/** Pinned framework short_codes + toggle, persisted per browser. */
export function usePinnedFrameworks(): {
  pinned: readonly string[];
  isPinned: (shortCode: string) => boolean;
  togglePin: (shortCode: string) => void;
} {
  const [pinned, setPinned] = useState<readonly string[]>(DEFAULT_PINNED);
  // Persist only after the user toggles — never on mount (the stored value
  // is loaded below, and writing defaults on first paint would clobber it).
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) setPinned(stored);
  }, []);

  // Side effects live OUTSIDE the state updater (pure under StrictMode's
  // double-invoke): write-through happens here, keyed on user toggles.
  useEffect(() => {
    if (!dirty) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
    } catch (err) {
      // Storage full / private mode — keep in-memory state only, but surface
      // why pins won't persist across reloads.
      console.warn("[standards] could not persist pinned frameworks", err);
    }
  }, [pinned, dirty]);

  const togglePin = useCallback((shortCode: string) => {
    setDirty(true);
    setPinned((prev) =>
      // Newly pinned frameworks go FIRST — "pin to top" is literal.
      prev.includes(shortCode)
        ? prev.filter((c) => c !== shortCode)
        : [shortCode, ...prev],
    );
  }, []);

  const isPinned = useCallback(
    (shortCode: string) => pinned.includes(shortCode),
    [pinned],
  );

  return { pinned, isPinned, togglePin };
}
