"use client";

// use-settings-dirty — did the teacher change any setting this session?
//
// The Settings hub auto-persists every change to localStorage (there is no
// explicit "Save" button — switches, toggles, and inputs write through
// immediately, mirroring `lib/use-school-week.ts` and friends). The popup
// shell (app/settings/layout.tsx) calls `isDirty()` when the teacher clicks
// OUTSIDE the popup: a clean session closes silently; a dirty one surfaces the
// SaveConfirmDialog courtesy confirm.
//
// WHY WE OBSERVE WRITES instead of diffing a baseline snapshot. The naive
// "snapshot on open, diff on close" approach raises phantom prompts, because
// the hub WRITES localStorage for reasons that are NOT a teacher edit and that
// race the user: cross-device theme sync (`lib/theme-sync.ts`) resolves the
// remote preference after first paint; a freshly-mounted sub-page may seed its
// own defaults; navigating rewrites a breadcrumb. Any baseline captured before
// such a write diffs dirty against it even though nothing was edited.
//
// Instead, while the popup is mounted we wrap `localStorage.setItem` /
// `removeItem` and latch dirty ONLY when an in-scope settings key actually
// changes value AND the write follows a recent, genuine, mutation-capable user
// gesture (pointer / keyboard / input / change / blur that is not navigation).
// Background / async writes carry no recent gesture, so they never latch. This
// is precise about "the teacher changed a setting" and immune to navigation +
// seeding races.
//
// SSR-safe: all `window` / `document` access is guarded and lives in a
// post-mount effect, never in render. Storage acquisition is itself guarded —
// reading `window.localStorage` can throw under some privacy modes.

import { useCallback, useEffect, useRef } from "react";

// ── Scope + denylist ───────────────────────────────────────────────────────
//
// Only writes to a key under the app's `mycurricula:` namespace, minus the
// denylist, can mark the session dirty.

/** Namespace prefix for every app-owned localStorage key. */
const SETTINGS_PREFIX = "mycurricula:";

/**
 * Exact keys to exclude from the dirty check.
 *
 *   • settings-last-page — a navigation breadcrumb. The Settings layout
 *     rewrites it on every sub-page navigation, so moving between settings
 *     tabs would otherwise read as "dirty" even with no edits.
 *   • tooltips-off — the global onboarding-tooltip off switch
 *     (lib/tooltip-dismissal.ts GLOBAL_OFF_KEY). Turning onboarding hints
 *     on/off is a display preference, not a curriculum/school setting; it
 *     should not trigger the save-confirm courtesy.
 */
const DENYLIST_EXACT: readonly string[] = [
  "mycurricula:user:settings-last-page",
  "mycurricula:user:tooltips-off",
];

/**
 * Key PREFIXES to exclude. The tooltip-dismissed set
 * (lib/tooltip-dismissal.ts DISMISSED_KEY) is a single JSON array today, but
 * we match it by prefix so a future per-id key scheme is excluded too —
 * dismissing an onboarding tooltip is never a settings edit.
 */
const DENYLIST_PREFIX: readonly string[] = [
  "mycurricula:user:tooltip-dismissed",
];

/** True when `key` is excluded from the dirty check. */
function isDenied(key: string): boolean {
  if (DENYLIST_EXACT.includes(key)) return true;
  return DENYLIST_PREFIX.some((p) => key.startsWith(p));
}

/** True when a settings-key write should be able to mark the session dirty. */
function isTrackedKey(key: string): boolean {
  return key.startsWith(SETTINGS_PREFIX) && !isDenied(key);
}

/**
 * How long after a genuine user gesture a write still counts as "caused by"
 * it. Settings controls write synchronously inside their handlers (well under
 * a frame); blur-committed text fields write as the `change`/blur gesture
 * fires. A short window is ample while staying clear of unrelated async writes
 * that land seconds later.
 */
const GESTURE_WINDOW_MS = 1500;

/**
 * Keyboard keys that only move focus / dismiss and can never themselves mutate
 * a setting. Arrow / Home / End / Page keys are deliberately NOT here: they DO
 * mutate radio groups, range sliders, and `<select>`s, so they must still arm
 * a gesture.
 */
const NAVIGATION_KEYS = new Set(["Tab", "Escape"]);

/**
 * Events that count as a genuine user gesture. Pointer / key events PRECEDE a
 * control's localStorage write; input / change / focusout ACCOMPANY it, which
 * is what catches a text field committed on blur after a typing pause longer
 * than the gesture window.
 */
const GESTURE_EVENTS = [
  "pointerdown",
  "keydown",
  "input",
  "change",
  "focusout",
] as const;

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns `{ isDirty }`. While the popup is mounted, this latches a dirty flag
 * the first time a tracked settings key is written within `GESTURE_WINDOW_MS`
 * of a genuine, non-navigation user gesture.
 *
 * `isDirty()` returns `false` for a touch-nothing session, for background /
 * async writes (theme sync, sub-page seeding) with no preceding gesture, and
 * on the server — never a false positive.
 */
export function useSettingsDirty(): { isDirty: () => boolean } {
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Acquire localStorage defensively — reading `window.localStorage` can
    // itself throw a SecurityError when storage is blocked. On failure we
    // never mark dirty (the popup still works; close is always silent).
    let store: Storage;
    try {
      store = window.localStorage;
      if (!store) return;
    } catch {
      return;
    }

    // Timestamp of the last genuine, mutation-capable user gesture inside
    // Settings. Navigation is excluded so a route change can't be mistaken for
    // an edit: `<a href>` tabs/cards, the search combobox/listbox, and the
    // pure-navigation keys (Tab / Escape).
    let lastGestureAt = Number.NEGATIVE_INFINITY;
    const markGesture = (e: Event): void => {
      if (e instanceof KeyboardEvent && NAVIGATION_KEYS.has(e.key)) return;
      const t = e.target;
      const el =
        t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
      if (el?.closest('a[href], [role="combobox"], [role="listbox"]')) return;
      lastGestureAt = Date.now();
    };
    for (const type of GESTURE_EVENTS) {
      document.addEventListener(type, markGesture, true);
    }

    // Wrap the two mutating Storage methods so a value-changing write to a
    // tracked key within the gesture window latches dirty. We always delegate
    // to the originals. Restore is descriptor-accurate: these are normally
    // inherited prototype methods, so on cleanup we delete our own-property
    // wrappers to re-expose them; if something had already shadowed them we put
    // that prior value back instead. Guarded so a non-writable environment
    // degrades to "never prompt" rather than throwing.
    const recentGesture = (): boolean =>
      Date.now() - lastGestureAt < GESTURE_WINDOW_MS;

    let restore: (() => void) | null = null;
    try {
      // Capture the EXACT prior state so cleanup is faithful: the own
      // descriptor if these were already shadowed, else `undefined` (the
      // normal case — they are inherited from Storage.prototype).
      const priorSet = Object.getOwnPropertyDescriptor(store, "setItem");
      const priorRemove = Object.getOwnPropertyDescriptor(store, "removeItem");
      const originalSet = store.setItem.bind(store);
      const originalRemove = store.removeItem.bind(store);

      const patchedSetItem = function (key: string, value: string): void {
        const changed =
          !dirtyRef.current &&
          isTrackedKey(key) &&
          recentGesture() &&
          store.getItem(key) !== value;
        originalSet(key, value);
        if (changed) dirtyRef.current = true;
      };
      const patchedRemoveItem = function (key: string): void {
        const removed =
          !dirtyRef.current &&
          isTrackedKey(key) &&
          recentGesture() &&
          store.getItem(key) !== null;
        originalRemove(key);
        if (removed) dirtyRef.current = true;
      };

      // Defined BEFORE the assignments so the catch can roll back a partial
      // patch. Each branch restores ONLY if our wrapper is still installed —
      // never clobbering a patch that some other code layered on after us —
      // putting back the exact prior descriptor, or deleting our own-property
      // shadow to re-expose the inherited prototype method.
      restore = () => {
        if (store.setItem === patchedSetItem) {
          if (priorSet) Object.defineProperty(store, "setItem", priorSet);
          else Reflect.deleteProperty(store, "setItem");
        }
        if (store.removeItem === patchedRemoveItem) {
          if (priorRemove) {
            Object.defineProperty(store, "removeItem", priorRemove);
          } else {
            Reflect.deleteProperty(store, "removeItem");
          }
        }
      };

      store.setItem = patchedSetItem;
      store.removeItem = patchedRemoveItem;
    } catch {
      // Patch failed (e.g. a non-writable Storage). Roll back whatever did get
      // installed; if nothing did, this is a no-op.
      restore?.();
      restore = null;
    }

    return () => {
      for (const type of GESTURE_EVENTS) {
        document.removeEventListener(type, markGesture, true);
      }
      restore?.();
    };
  }, []);

  const isDirty = useCallback((): boolean => dirtyRef.current, []);

  return { isDirty };
}
