"use client";

// shortcuts-overlay.tsx — ? keyboard shortcut reference overlay (BIG-5).
//
// Opens when the user presses ? (or from a menu button). Shows a clean
// two-column reference table of every global shortcut plus the card-level
// shortcuts. Esc closes.
//
// A11y contract — mirrors save-target-dialog.tsx:
//   • role="dialog" + aria-modal="true" + aria-labelledby the heading.
//   • Focus trap: Tab / Shift-Tab cycle inside the panel.
//   • On open: focus moves to the close button (the only interactive element).
//   • On close: focus restores to the element that was focused before opening.
//
// Token rules: var(--token) only — no hard-coded hex or px font sizes.

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui";
import { helpForPathname } from "@/lib/help-copy";
import styles from "./shortcuts-overlay.module.css";

// ── Shortcut table data ────────────────────────────────────────────────────────

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  heading: string;
  rows: ShortcutRow[];
}

// ⌘ renders as "⌘" on Mac; "Ctrl" on Windows/Linux. Since this is a
// curriculum planning tool used on school devices (usually Windows), we
// show both. The actual event handlers detect metaKey || ctrlKey.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    heading: "Navigation",
    rows: [
      { keys: ["1"], description: "Go to Weekly planner" },
      { keys: ["2"], description: "Go to Daily schedule" },
      { keys: ["3"], description: "Go to Subject view" },
      { keys: ["4"], description: "Go to Schedule" },
      { keys: ["["], description: "Previous week" },
      { keys: ["]"], description: "Next week" },
      { keys: ["T"], description: "Jump to current week" },
      { keys: ["g", "c"], description: "Open Catch-up screen" },
    ],
  },
  {
    heading: "Global actions",
    rows: [
      { keys: ["⌘K", "Ctrl K"], description: "Open command palette" },
      { keys: ["/"], description: "Focus search" },
      { keys: ["?"], description: "Open this shortcuts reference" },
      { keys: ["⌘Z", "Ctrl Z"], description: "Undo" },
      { keys: ["⌘Y", "Ctrl Y"], description: "Redo" },
    ],
  },
  {
    heading: "Lesson card",
    rows: [
      { keys: ["⌘D"], description: "Mark lesson done / not done" },
      { keys: ["⌘P"], description: "Open lesson print view" },
      { keys: ["Esc"], description: "Close expanded card / dialog" },
    ],
  },
];

// ── Focus trap helper ──────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ShortcutsOverlay({
  open,
  onClose,
}: ShortcutsOverlayProps): ReactNode {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Wraps the close Button — used to programmatically focus the button on open.
  // We cannot pass a ref directly to Button (no forwardRef), so we query the
  // button element inside this wrapper span on mount.
  const closeBtnWrapRef = useRef<HTMLSpanElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // W3-C8: route-aware Help section. The pathname is read on every render
  // so the overlay reflects the current route; `helpForPathname` returns
  // null for routes outside the registry — we simply skip the section.
  const pathname = usePathname();
  const routeHelp = helpForPathname(pathname);

  // ── Open / close effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const frame = requestAnimationFrame(() => {
        // Query the button inside the wrapper span since Button has no forwardRef.
        closeBtnWrapRef.current
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus();
      });
      return () => cancelAnimationFrame(frame);
    } else {
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        const timer = setTimeout(() => prev.focus(), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [open]);

  // ── Keyboard handling ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={styles.panel}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id={headingId} className={styles.heading}>
            Keyboard shortcuts
          </h2>
          <span ref={closeBtnWrapRef}>
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Close keyboard shortcuts"
              onClick={onClose}
            >
              <CloseIcon />
            </Button>
          </span>
        </div>

        {/* Shortcut groups */}
        <div className={styles.body}>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.heading} className={styles.group}>
              <h3 className={styles.groupHeading}>{group.heading}</h3>
              <table className={styles.table} role="table">
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.description} className={styles.row}>
                      {/* Key badges */}
                      <td className={styles.keysCell} aria-label="Keys">
                        {row.keys.map((k) => (
                          <kbd key={k} className={styles.kbd}>
                            {k}
                          </kbd>
                        ))}
                      </td>
                      {/* Description */}
                      <td className={styles.descCell}>{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {/* W3-C8: route-aware Help section. Appended after the keyboard
              shortcuts so the table stays the primary content (this
              overlay's original job) and the route help reads as "and
              here's what THIS surface does". Skipped when the current
              pathname has no registered help copy. */}
          {routeHelp && (
            <section className={styles.group}>
              <h3 className={styles.groupHeading}>{routeHelp.title}</h3>
              <ul className={styles.helpList}>
                {routeHelp.bullets.map((bullet) => (
                  <li key={bullet} className={styles.helpItem}>
                    {bullet}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* W3-C8: Replay onboarding tour CTA. The /onboarding wizard is
              resumable per lib/onboarding-state.tsx (state persisted to
              localStorage), so this link returns the teacher to wherever
              they left off — or to the start if they completed it before.
              Closing the overlay first lets the route transition register
              focus restoration cleanly. */}
          <section className={styles.group}>
            <h3 className={styles.groupHeading}>New here?</h3>
            <p className={styles.replayCopy}>
              Walk through the first-run tour again — schedule, subjects,
              standards, and the team setup. Your existing answers are
              preserved.
            </p>
            <Link
              href="/onboarding"
              className={styles.replayLink}
              onClick={onClose}
            >
              Replay the onboarding tour
              <ReplayArrowIcon />
            </Link>
          </section>
        </div>

        {/* Footer hint */}
        <div className={styles.footer}>
          <span className={styles.footerText}>
            Press <kbd className={styles.footerKbd}>?</kbd> again to close
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Inline SVG ─────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2L12 12M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Small chevron-arrow shown inside the "Replay the onboarding tour" link.
// Inherits currentColor so it tints with the link state (hover/focus).
function ReplayArrowIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
