"use client";

// last-route-recorder.tsx — invisible client leaf that remembers which
// planner route the teacher is on, so the Settings X / Escape can return
// them exactly where they came from.
//
// Mounted once in app/(planner)/layout.tsx (alongside GlobalShortcuts).
// On every planner route change it writes the current pathname to
// sessionStorage under SETTINGS_RETURN_KEY. The settings layout reads the
// key when the teacher closes Settings and falls back to /weekly when it
// is unset (direct visit, fresh tab, storage disabled).
//
// sessionStorage (not localStorage) on purpose: "where I came from" is a
// per-tab navigation breadcrumb, not a durable preference — two tabs on
// different views should each return to their own view.

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** sessionStorage key holding the last planner pathname. Session-scoped
 *  navigation state — not part of the mycurricula:user/team preference
 *  namespaces. */
export const SETTINGS_RETURN_KEY = "mycurricula:session:last-planner-route";

/** Resolve where the Settings X / Escape should land. Exported for the
 *  settings layout; falls back to /weekly (the canonical home view). */
export function readSettingsReturnRoute(): string {
  if (typeof window === "undefined") return "/weekly";
  try {
    const stored = window.sessionStorage.getItem(SETTINGS_RETURN_KEY);
    // Only honor in-app planner paths — defensive against a corrupted or
    // hand-edited value becoming an open-redirect style surprise.
    if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
      return stored;
    }
  } catch {
    // Storage disabled — fall through.
  }
  return "/weekly";
}

export function LastRouteRecorder(): ReactNode {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      window.sessionStorage.setItem(SETTINGS_RETURN_KEY, pathname);
    } catch {
      // Storage disabled / quota — the settings X falls back to /weekly.
    }
  }, [pathname]);

  return null;
}
