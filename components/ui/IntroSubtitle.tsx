"use client";

// IntroSubtitle.tsx — W3-C10 once-per-view onboarding subtitle.
//
// A small dismissible row that sits below the page title on the four main
// views (Daily, Weekly, Year, Curriculum). Each view passes its own
// `viewKey` and the explanatory text as children; the primitive owns the
// localStorage gate. After a teacher clicks "Got it", the row writes
// `mycurricula:user:<viewKey>-intro-seen = "true"` and unmounts. Returning
// teachers (or subsequent visits to the same view) never see it again
// unless that key is cleared.
//
// Hydration discipline (SSR-safe):
//   Initial state is `visible = true` so the server-rendered HTML and the
//   first client render match — preventing hydration mismatch warnings.
//   A useEffect post-mount reads localStorage and flips to `visible = false`
//   if the key is already set. This mirrors the same pattern used by
//   lib/app-state.tsx:312-316 and lib/tooltip-dismissal.ts.
//
// localStorage writes happen ONLY inside the onClick handler (the dismiss
// button) — never during render. Reads happen ONLY inside useEffect. Both
// rules are required to keep SSR and CSR aligned.
//
// Accessibility:
//   • root has role="note" so screen readers announce it as a contextual aside;
//   • the dismiss control is a real <button type="button"> with an
//     `aria-label` describing the dismissal action;
//   • the row sits in normal document flow so keyboard tab order reaches
//     the dismiss button after the page header actions.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import styles from "./IntroSubtitle.module.css";

/** Closed set of view keys used to namespace the localStorage flag. */
export type IntroSubtitleViewKey = "daily" | "weekly" | "year" | "subject";

export interface IntroSubtitleProps {
  /** Which main view this subtitle belongs to — used as the storage key suffix. */
  viewKey: IntroSubtitleViewKey;
  /** The explanatory text. Short, voice = "what this view is FOR". */
  children: ReactNode;
}

/** Build the namespaced localStorage key. */
function storageKey(viewKey: IntroSubtitleViewKey): string {
  return `mycurricula:user:${viewKey}-intro-seen`;
}

/** Read the dismissed flag for a view. SSR-guarded. */
function readSeen(viewKey: IntroSubtitleViewKey): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(viewKey)) === "true";
  } catch {
    // Storage unavailable (private mode, quota, etc.) — fall through to
    // "not seen". The row will still render; dismissal just won't persist.
    return false;
  }
}

/** Persist the dismissed flag for a view. Non-fatal on failure. */
function writeSeen(viewKey: IntroSubtitleViewKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(viewKey), "true");
  } catch {
    // Same swallow-and-continue policy as other localStorage writers.
  }
}

export function IntroSubtitle({
  viewKey,
  children,
}: IntroSubtitleProps): ReactNode {
  // Start visible so SSR HTML matches the first client render. The mount
  // effect below hides the row if the teacher already dismissed it.
  const [visible, setVisible] = useState<boolean>(true);

  useEffect(() => {
    if (readSeen(viewKey)) setVisible(false);
  }, [viewKey]);

  const handleDismiss = useCallback((): void => {
    writeSeen(viewKey);
    setVisible(false);
  }, [viewKey]);

  if (!visible) return null;

  return (
    <div className={styles.root} role="note">
      <p className={styles.text}>{children}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={handleDismiss}
        aria-label="Got it — hide this intro"
        title="Hide this intro for future visits"
      >
        Got it
      </button>
    </div>
  );
}
