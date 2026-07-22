"use client";

// SectionMenu.tsx — the W3.8 section banner's two small popovers:
//   • the ⋯ menu (Rename / Duplicate / Delete — Delete is HIDDEN for a
//     resources-labeled section, D7's editor-level permanence guard), and
//   • the ColorDot + its wash popover (10 curated swatches + the
//     header-only vs field-too tint toggle, D2).
//
// Both close on OUTSIDE CLICK and ESCAPE (the mock's mouseLeave-only
// dismissal is a ledgered defect — forbidden here), and both are
// touch-usable (≥44px effective targets via the module CSS).

import type { ReactNode, RefObject } from "react";
import { useEffect } from "react";
import type { SectionTintScope } from "@/lib/lesson-flow";
import { SECTION_SWATCH_TOKENS } from "@/lib/lesson-flow";
import { Tooltip } from "@/components/ui";
import styles from "./lesson-editor.module.css";

// ── Shared dismissal hook ────────────────────────────────────────────────
// Closes a popover on pointerdown outside `ref` and on Escape. The Escape
// listener registers in the CAPTURE phase and stops propagation so closing
// a menu never also closes the hosting LessonModal (which listens for
// Escape in the bubble phase — C's contract: the modal closes ONLY via
// Exit or Esc, and a menu's Esc must be consumed first).
export function useDismissableMenu(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        // Consume the key fully — preventDefault is part of the modal's
        // documented Escape contract (W3.8 gate fix); stopPropagation keeps
        // the bubble-phase modal listener from also closing the host.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, ref]);
}

// ── ⋯ menu ───────────────────────────────────────────────────────────────

export interface SectionMenuProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Anchoring wrapper ref (the banner's relative span) for outside-click. */
  wrapRef: RefObject<HTMLElement | null>;
  onRename: () => void;
  onDuplicate: () => void;
  /** Absent (undefined) hides Delete entirely — the resources-permanence
   *  guard (D7) and the single-remaining-section case both route here. */
  onDelete?: () => void;
  sectionLabel: string;
}

export function SectionMenu({
  open,
  onToggle,
  onClose,
  wrapRef,
  onRename,
  onDuplicate,
  onDelete,
  sectionLabel,
}: SectionMenuProps): ReactNode {
  useDismissableMenu(open, onClose, wrapRef);
  return (
    <>
      <Tooltip
        content="Rename, duplicate, or delete this section"
        tooltipId="lesson-editor-section-menu"
      >
        <button
          type="button"
          className={styles.menuBtn}
          aria-label={`Section options for ${sectionLabel}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggle}
        >
          ⋯
        </button>
      </Tooltip>
      {open && (
        <span className={styles.menuPop} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onRename();
              onClose();
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onDuplicate();
              onClose();
            }}
          >
            Duplicate
          </button>
          {onDelete && (
            <Tooltip
              content="Delete this section and everything typed in it"
              required
            >
              <button
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => {
                  onDelete();
                  onClose();
                }}
              >
                Delete
              </button>
            </Tooltip>
          )}
        </span>
      )}
    </>
  );
}

// ── ColorDot + wash popover ──────────────────────────────────────────────

export interface ColorDotProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Anchoring wrapper ref for outside-click dismissal. */
  wrapRef: RefObject<HTMLElement | null>;
  /** The section's EFFECTIVE wash token (resolved; drives the dot fill). */
  activeToken: string;
  onPick: (token: string) => void;
  tintScope: SectionTintScope;
  onTintScope: (scope: SectionTintScope) => void;
}

export function ColorDot({
  open,
  onToggle,
  onClose,
  wrapRef,
  activeToken,
  onPick,
  tintScope,
  onTintScope,
}: ColorDotProps): ReactNode {
  useDismissableMenu(open, onClose, wrapRef);
  const tinted = tintScope === "field";
  return (
    <>
      <Tooltip
        content="Choose this section's color wash, and whether it tints the text area too"
        tooltipId="lesson-editor-section-color"
      >
        <button
          type="button"
          className={styles.colorDot}
          aria-label="Section color"
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggle}
        />
      </Tooltip>
      {open && (
        <span className={styles.colorPop} role="menu">
          <span className={styles.swatches}>
            {SECTION_SWATCH_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                role="menuitem"
                className={styles.swatch}
                style={{ background: `var(${token})` }}
                data-selected={token === activeToken || undefined}
                aria-label={`Set section color ${token.replace(/^--/, "").replace(/-/g, " ")}`}
                onClick={() => onPick(token)}
              />
            ))}
          </span>
          <Tooltip
            content="Tinted: the section's color also washes its text area, not just the banner"
            tooltipId="lesson-editor-tint-scope"
          >
            <button
              type="button"
              role="menuitemcheckbox"
              className={`${styles.tintToggle} ${tinted ? styles.tintToggleOn : ""}`}
              aria-checked={tinted}
              onClick={() => onTintScope(tinted ? "header" : "field")}
            >
              {tinted ? "✓ Background tinted" : "Tint text background"}
            </button>
          </Tooltip>
        </span>
      )}
    </>
  );
}
