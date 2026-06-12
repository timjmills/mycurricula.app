"use client";

// settings-header.tsx — the persistent chrome row above the settings
// sidebar + content grid. Fixes the "Settings is a dead end" problem:
// before this header existed the settings layout hid the planner shell
// entirely and offered no way back.
//
//   ┌──────────────────────────────────────────────┐
//   │ Settings            [search slot]        [✕] │
//   └──────────────────────────────────────────────┘
//
// The ✕ (and the Escape key, handled here because the header is mounted
// on every settings route) return the teacher to the planner route they
// came from — recorded per-tab by components/shell/last-route-recorder
// — falling back to /weekly for direct visits.
//
// The Escape handler deliberately yields to anything that uses Escape
// itself: events that arrive defaultPrevented (an open overlay already
// consumed them) and events fired from editable controls (a teacher
// pressing Escape inside a text field is abandoning the field, not the
// page) are ignored.

import { useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { readSettingsReturnRoute } from "@/components/shell";
import styles from "./settings-header.module.css";

/** The house close glyph — same 14×14 stroke X used by the right-panel
 *  and overlay close buttons (components/shell/right-panel.tsx). */
function CloseIcon(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 2L12 12M12 2L2 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** True when an Escape keydown originated inside a control that owns
 *  the key (text entry, dropdowns, content-editable regions). */
function targetOwnsEscape(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

interface SettingsHeaderProps {
  /** Slot between the title and the ✕ — hosts the settings search. */
  children?: ReactNode;
}

export function SettingsHeader({ children }: SettingsHeaderProps): ReactNode {
  const router = useRouter();

  const exitSettings = useCallback((): void => {
    router.push(readSettingsReturnRoute());
  }, [router]);

  // Escape leaves Settings — the keyboard twin of the ✕. Registered on
  // document so it works from anywhere on the page, with the guards
  // described in the file header.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;
      if (targetOwnsEscape(e.target)) return;
      exitSettings();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [exitSettings]);

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Settings</h1>
      {children && <div className={styles.slot}>{children}</div>}
      <div className={styles.close}>
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel="Close settings"
          tooltip="Back to your planner (Esc works too)"
          onClick={exitSettings}
        >
          <CloseIcon />
        </Button>
      </div>
    </header>
  );
}
