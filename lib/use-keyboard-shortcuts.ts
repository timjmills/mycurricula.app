"use client";

// use-keyboard-shortcuts.ts — global keyboard shortcut dispatcher.
//
// Wires the app-wide single-key and modifier shortcuts described in KEYBOARD-001:
//   [  previous week         setWeek(week - 1)
//   ]  next week             setWeek(week + 1)
//   T  jump to current week  setWeek(CURRENT_WEEK)
//   1  navigate to /weekly
//   2  navigate to /daily
//   3  navigate to /subject/<current subjectView>
//   4  navigate to /schedule
//   /  focus the top-bar search input
//   ⌘/Ctrl+K  open command palette
//   ?  open shortcuts overlay
//   g c  two-key sequence → /catch-up (planning-doc §1262)
//
// Critical constraint: every single-key shortcut is suppressed when the
// keyboard event originates from a text input of any kind — INPUT,
// TEXTAREA, or any element with contenteditable="true" (or ""). Teachers
// type lesson titles in contenteditable RTE fields; those must not trigger
// navigation. Modifier shortcuts (⌘K) are always allowed — they are
// non-ambiguous even inside an editor.
//
// Undo / Redo (⌘Z / ⌘Y) live in the top bar and are intentionally NOT
// wired here to avoid double-binding.
//
// Usage:
//   useKeyboardShortcuts({ onOpenPalette, onOpenShortcuts });
//
// Mount this hook exactly once — in PlannerLayout — via a thin wrapper
// component that can call the React hooks it depends on (useRouter, etc.).

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/app-state";
import { CURRENT_WEEK } from "@/lib/mock";

// ── Two-key sequence state ────────────────────────────────────────────
// vim-style chord: pressing `g` arms a 1.5-second window during which a
// follow-up key can complete a sequence (e.g. `g c` → /catch-up). The
// window is generous enough for an unhurried second press but short
// enough that a stray `g` doesn't leave the chord dangling. The arm-state
// lives in a useRef so it survives across handler re-creations (the
// handleKeyDown closure rebuilds whenever its deps change).
const CHORD_WINDOW_MS = 1500;

export interface KeyboardShortcutsOptions {
  /** Called when ⌘/Ctrl+K or the palette shortcut fires. */
  onOpenPalette: () => void;
  /** Called when ? fires. */
  onOpenShortcuts: () => void;
}

/** Returns true when the event target is a text-input context where single-key
 *  shortcuts should be suppressed (INPUT, TEXTAREA, contenteditable). */
function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // contenteditable="true" or contenteditable="" (truthy/empty attr)
  const ce = target.getAttribute("contenteditable");
  return ce !== null && ce !== "false";
}

export function useKeyboardShortcuts({
  onOpenPalette,
  onOpenShortcuts,
}: KeyboardShortcutsOptions): void {
  const router = useRouter();
  const { week, setWeek, subjectView, setSearch } = useAppState();

  // Two-key chord state — outside the useCallback so the arm-state survives
  // every handler re-creation (the callback rebuilds whenever week changes).
  // null means "no chord currently armed"; populated when the teacher has
  // just pressed `g` and we're waiting for the completer.
  const chordRef = useRef<{ key: string; expiresAt: number } | null>(null);

  // Keep a stable ref to week so the event listener closure doesn't go stale.
  // useCallback on the handler re-creates it when week changes.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const inText = isTextInput(e.target);

      // ── ⌘/Ctrl+K — command palette ────────────────────────────────────────
      // Allowed even inside text inputs (it's a modifier chord, unambiguous).
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // All remaining shortcuts are suppressed inside text inputs.
      if (inText) return;

      // Ignore any shortcut combined with a modifier key (no accidental
      // ⌘1, Alt-/, etc.) — those are OS / browser reserved combinations.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ── Two-key chord — `g c` → /catch-up ─────────────────────────
      // First branch: an armed `g` is waiting for a completer.
      const armed = chordRef.current;
      if (armed && armed.expiresAt > Date.now()) {
        if (armed.key === "g" && e.key === "c") {
          e.preventDefault();
          chordRef.current = null;
          router.push("/catch-up");
          return;
        }
        // Any other key (or an expired chord) clears the arm-state and
        // falls through so the second key still gets its normal handling.
        chordRef.current = null;
      } else if (armed) {
        // Expired — drop it.
        chordRef.current = null;
      }

      // Second branch: a fresh `g` arms the chord. Note: a lone `g` has no
      // single-key meaning, so we don't preventDefault here — letting it
      // through avoids stealing focus from anything that might want it.
      if (e.key === "g") {
        chordRef.current = {
          key: "g",
          expiresAt: Date.now() + CHORD_WINDOW_MS,
        };
        return;
      }

      switch (e.key) {
        case "[":
          // Previous week — clamp at 1 so we never go below week 1.
          e.preventDefault();
          setWeek(Math.max(1, week - 1));
          break;

        case "]":
          // Next week — no upper clamp; the server would enforce max.
          e.preventDefault();
          setWeek(week + 1);
          break;

        case "T":
        case "t":
          // Jump to the current real week.
          e.preventDefault();
          setWeek(CURRENT_WEEK);
          break;

        case "1":
          e.preventDefault();
          router.push("/weekly");
          break;

        case "2":
          e.preventDefault();
          router.push("/daily");
          break;

        case "3":
          // Navigate to the subject view scoped to the current subjectView.
          e.preventDefault();
          router.push(`/subject/${subjectView}`);
          break;

        case "4":
          // Navigate to the dedicated Schedule timeline route.
          e.preventDefault();
          router.push("/schedule");
          break;

        case "/": {
          // Focus the top-bar search input — it carries [data-search-input].
          // If the search field is collapsed (icon-only mode), the input is not
          // yet in the DOM; click the trigger button first to expand it, then
          // focus the input on the next frame once it has mounted.
          e.preventDefault();
          const input = document.querySelector<HTMLInputElement>(
            "[data-search-input]",
          );
          if (input) {
            input.focus();
            // Select all existing text so the teacher can type immediately.
            input.select();
          } else {
            // Search is collapsed — trigger the icon button to expand it.
            const trigger = document.querySelector<HTMLButtonElement>(
              "[data-search-trigger]",
            );
            if (trigger) {
              trigger.click();
            } else {
              // Last resort: drive through app-state so the bar state updates.
              setSearch("");
            }
          }
          break;
        }

        case "?":
          e.preventDefault();
          onOpenShortcuts();
          break;

        default:
          break;
      }
    },
    [
      week,
      setWeek,
      subjectView,
      setSearch,
      router,
      onOpenPalette,
      onOpenShortcuts,
    ],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
