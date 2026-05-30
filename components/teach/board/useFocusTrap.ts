"use client";

// useFocusTrap — a minimal, correct focus trap for the Teach modal-like
// overlays (FocusMode, WidgetPicker — both declare `role="dialog"
// aria-modal="true"`, audit A1, docs/teach-view-plan.md §7.7).
//
// `aria-modal="true"` is a promise to assistive tech that the rest of the page
// is inert. Without trapping Tab/Shift+Tab that promise is false: focus escapes
// behind the overlay to the still-interactive board chrome underneath. This
// hook keeps the contract honest:
//
//   1. On mount it remembers `document.activeElement` (the trigger) and moves
//      focus into the dialog — onto `initialFocusRef` when supplied, else the
//      first focusable descendant, else the container itself.
//   2. While mounted, Tab at the last focusable wraps to the first and
//      Shift+Tab at the first wraps to the last (the focusable set is
//      re-queried on every Tab so dynamically-added controls are included).
//   3. On unmount it restores focus to the remembered trigger.
//
// The repo had no shared trap helper before this (audit A1 confirmed absent);
// it lives under components/teach/board because both current consumers do.
// Esc-to-close stays in each dialog (already bound there) — this hook owns
// containment + restoration only.

import { useEffect, type RefObject } from "react";

// The canonical "tabbable" selector. We additionally filter out elements that
// are disabled, hidden, or carry a negative tabindex at query time.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const tabindex = el.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) < 0) return false;
    // Skip elements that aren't rendered (no layout box).
    return (
      el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
  });
}

export interface UseFocusTrapOptions {
  /** The dialog container. Tab is trapped within it. */
  containerRef: RefObject<HTMLElement | null>;
  /** Optional element to focus on open (e.g. a search input). When omitted the
   *  first focusable descendant — else the container — receives focus. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false the trap is inert (focus is neither moved nor restored). */
  active?: boolean;
}

/**
 * Trap keyboard focus within `containerRef` while mounted, and restore focus
 * to whatever was focused on mount when it unmounts.
 */
export function useFocusTrap({
  containerRef,
  initialFocusRef,
  active = true,
}: UseFocusTrapOptions): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the trigger so focus can return to it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog on open.
    const initial = initialFocusRef?.current;
    if (initial && typeof initial.focus === "function") {
      initial.focus();
    } else {
      const first = focusableWithin(container)[0];
      (first ?? container).focus();
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Tab") return;
      const node = containerRef.current;
      if (!node) return;
      const focusable = focusableWithin(node);
      if (focusable.length === 0) {
        // Nothing to cycle — keep focus on the container.
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab off the first element (or focus escaped the dialog) → last.
        if (activeEl === first || !node.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab off the last element (or focus escaped) → first.
        if (activeEl === last || !node.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Restore focus to the trigger on close.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
