"use client";

// /settings — landing page that redirects to the teacher's last-visited
// sub-page (or to /settings/curriculum on a fresh device).
//
// Both unified entry points — the Daily IconRail gear and the top-bar
// avatar — point here so there is one canonical Settings affordance.
// The layout (app/settings/layout.tsx) writes the active slug to
// localStorage on every sub-page mount; this page reads that slug and
// redirects, so re-entering Settings always lands where the teacher left
// off.
//
// Why client-side and not server-side: the redirect target is held in
// localStorage (per-device), which the server can't see. A short flash
// of an empty layout is acceptable — the localStorage read is synchronous
// and the redirect fires before any meaningful content renders.

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Keep these in sync with the TABS registry in app/settings/layout.tsx.
// Duplicated rather than imported because layout.tsx is a client module
// already in this tree; this avoids creating a shared barrel just for two
// small lists.
const VALID_SLUGS = new Set([
  "curriculum",
  "appearance",
  "catch-up",
  "lesson-templates",
]);
const DEFAULT_SLUG = "curriculum";
const LAST_PAGE_KEY = "mycurricula:user:settings-last-page";

export default function SettingsLanding(): ReactNode {
  const router = useRouter();

  useEffect(() => {
    let slug = DEFAULT_SLUG;
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(LAST_PAGE_KEY);
        if (stored && VALID_SLUGS.has(stored)) {
          slug = stored;
        }
      } catch {
        // Storage disabled — fall through to the default.
      }
    }
    router.replace(`/settings/${slug}`);
  }, [router]);

  // Render an a11y-friendly placeholder while the redirect resolves so
  // assistive tech announces that something is happening. The layout's
  // sidebar still renders around this content.
  return (
    <div
      style={{
        padding: 24,
        fontSize: "var(--t-13)",
        color: "var(--ink-500)",
      }}
      role="status"
      aria-live="polite"
    >
      Loading settings…
    </div>
  );
}
