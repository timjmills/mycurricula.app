"use client";

// NotebookSwitcher.tsx — workspace label + notebook switcher for the SideNav.
//
// Wave W-E. Specification: docs/6.6.26 Workspace-Notebook-Team Build Ultraplan.md §3 W-E.
//
// Three render modes (decided at runtime from NotebookStateValue):
//
//   1. Single active notebook  → a quiet, non-interactive label pair:
//        "Al-Noor School"   (workspace — var(--faint) micro-caps)
//        "Grade 5"          (notebook  — var(--ink-soft) body weight)
//      No affordance; recedes to ambient context. Per the ultraplan: "the Workspace
//      label stays quiet" for solo users.
//
//   2. ≥2 active notebooks     → as above but the notebook row becomes a <button>
//      with a chevron. Click opens a portalled dropdown listing active notebooks.
//      The selected notebook drives the existing grade-scoped views via
//      `setActiveNotebookId` (notebook-state.tsx). A workspace-admin also sees a
//      "＋ New notebook" link (→ /settings/team) at the bottom of the dropdown.
//
//   3. Dropdown open            → the portalled list, anchored to the trigger's
//      BoundingClientRect. Click-outside + Escape + item-click close it.
//
// Tooltip: the switcher button is non-obvious → tooltipId="notebook-switcher"
// (dismissible, not `required`). Self-evident text labels ("Grade 5") get none.
//
// Responsive: the entire component hides at ≤900px (SideNav icon-only mode —
// there is no room in the 64px rail for a switcher). See NotebookSwitcher.module.css.
//
// A11y:
//   • The trigger <button> carries aria-expanded and aria-haspopup="listbox".
//   • The dropdown is role="listbox"; each option is role="option" with
//     aria-selected. Focus is trapped to the dropdown while open.
//   • Keyboard: Arrow keys move within the listbox; Enter/Space select;
//     Escape closes and returns focus to the trigger.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Tooltip } from "@/components/ui";
import { useNotebookState } from "@/lib/notebook-state";
import type { NotebookEntry } from "@/lib/notebook-state";
import styles from "./NotebookSwitcher.module.css";

// ── NotebookSwitcher ──────────────────────────────────────────────────────────

/** Workspace label + notebook switcher. Placed below the brand block in SideNav. */
export function NotebookSwitcher(): ReactNode {
  const {
    workspaceName,
    activeNotebooks,
    activeNotebookId,
    setActiveNotebookId,
    isWorkspaceAdmin,
  } = useNotebookState();

  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeNotebook =
    activeNotebooks.find((nb) => nb.gradeLevelId === activeNotebookId) ??
    activeNotebooks[0];

  // Compute dropdown position from the trigger's bounding rect so the portal
  // appears just below the trigger, flush with its left edge.
  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Prefer positioning to the right of the SideNav (left = rect.right + 8)
    // for a typical sidebar trigger. If the SideNav is on the left edge this
    // means the dropdown opens to the right of the rail, clear of the nav.
    setDropdownPos({
      top: rect.top,
      left: rect.right + 8,
    });
    setOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (nb: NotebookEntry) => {
      setActiveNotebookId(nb.gradeLevelId);
      closeDropdown();
    },
    [setActiveNotebookId, closeDropdown],
  );

  // Close on click-outside the dropdown.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open, closeDropdown]);

  // Close on Escape from anywhere; re-open with Enter/Space on the trigger.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, closeDropdown]);

  // Focus the first item when the dropdown opens.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>(
        "[role='option']:not([aria-disabled])",
      );
      first?.focus();
    });
  }, [open]);

  // Arrow-key navigation inside the listbox.
  const handleDropdownKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const items = Array.from(
        dropdownRef.current?.querySelectorAll<HTMLElement>(
          "[role='option']:not([aria-disabled])",
        ) ?? [],
      );
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[Math.min(idx + 1, items.length - 1)]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[Math.max(idx - 1, 0)]?.focus();
      }
    },
    [],
  );

  const isMulti = activeNotebooks.length >= 2;

  return (
    <div className={styles.root} aria-label="Notebook">
      {/* Workspace label — always visible, always quiet. */}
      <span
        className={styles.workspaceLabel}
        title={workspaceName}
        aria-label={`Workspace: ${workspaceName}`}
      >
        {workspaceName}
      </span>

      {/* Notebook row — static when single, interactive button when multi. */}
      {isMulti ? (
        // Multi-notebook: a dropdown trigger button.
        // tooltipId makes the onboarding explanation dismissible (W2-B3). Not
        // `required` — this is a navigation aid, not a high-consequence action.
        <Tooltip
          content="Switch between the notebooks (grade levels) in your workspace — each notebook is its own curriculum"
          side="right"
          tooltipId="notebook-switcher"
        >
          <button
            ref={triggerRef}
            type="button"
            className={styles.notebookBtn}
            onClick={open ? closeDropdown : openDropdown}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={`Active notebook: ${activeNotebook?.name ?? "—"}. Open notebook switcher`}
          >
            <span className={styles.notebookName}>
              {activeNotebook?.name ?? "—"}
            </span>
            <ChevronIcon className={open ? styles.chevronUp : styles.chevron} />
          </button>
        </Tooltip>
      ) : (
        // Single notebook: non-interactive label. No tooltip needed — it is
        // self-explanatory and has no action affordance.
        <span className={styles.notebookStatic}>
          <span
            className={styles.notebookName}
            aria-label={`Current notebook: ${activeNotebook?.name ?? "—"}`}
          >
            {activeNotebook?.name ?? "—"}
          </span>
        </span>
      )}

      {/* Portalled dropdown — only when multi-notebook and open. */}
      {isMulti &&
        open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className={styles.dropdown}
            role="listbox"
            aria-label="Select a notebook"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            onKeyDown={handleDropdownKeyDown}
          >
            {activeNotebooks.map((nb) => {
              const isActive = nb.gradeLevelId === activeNotebookId;
              return (
                <button
                  key={nb.gradeLevelId}
                  role="option"
                  aria-selected={isActive}
                  type="button"
                  className={`${styles.dropdownItem} ${isActive ? styles.dropdownItemActive : ""}`}
                  onClick={() => handleSelect(nb)}
                >
                  {isActive ? (
                    <CheckIcon className={styles.checkIcon} />
                  ) : (
                    // Invisible placeholder keeps text baseline consistent.
                    <span className={styles.dotIcon} aria-hidden="true" />
                  )}
                  {nb.name}
                </button>
              );
            })}

            {/* "＋ New notebook" — workspace-admin only → /settings/team. */}
            {isWorkspaceAdmin && (
              <>
                <div
                  className={styles.dropdownDivider}
                  role="separator"
                  aria-hidden="true"
                />
                {/* Tooltip: always-on `required` because creating a notebook is a
                    team-wide action (CLAUDE.md §4 always-on exception list). */}
                <Tooltip
                  content="Create a new notebook (grade level) for your workspace — takes you to Team Settings where you fill in the name"
                  side="right"
                  required
                >
                  <Link
                    href="/settings/team"
                    className={styles.newNotebookLink}
                    onClick={closeDropdown}
                    aria-label="Create a new notebook — opens Team Settings"
                  >
                    <PlusIcon />
                    New notebook
                  </Link>
                </Tooltip>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
// 16×16 grid, aria-hidden, inherit currentColor. Consistent with the 18×18
// top-bar icons but 2px smaller to match the SideNav's compact spacing.

function ChevronIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
