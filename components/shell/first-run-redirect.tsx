"use client";

// first-run-redirect.tsx — invisible client leaf that sends a teacher who has
// not completed onboarding into the first-run wizard.
//
// Mounted once in app/(planner)/layout.tsx (alongside LastRouteRecorder). All
// the decision logic lives in lib/onboarding-v2-state.tsx's useFirstRunRedirect
// hook: it reads the authoritative server signal (isOnboardedRemote), combines
// it with the per-device finished flag and the Supabase-configured gate, and
// `router.replace`s to /onboarding ONLY on a resolved "needs onboarding". It is
// a no-op on /onboarding itself (which lives outside the (planner) group, so no
// loop is possible), during SSR, and — critically — while the answer is
// unresolved, so it never flash-bounces and never races the bypass login.
//
// This leaf renders nothing; it exists so the layout (a Server Component) can
// mount the client hook without becoming a client component itself.

import type { ReactNode } from "react";
import { useFirstRunRedirect } from "@/lib/onboarding-v2-state";

export function FirstRunRedirect(): ReactNode {
  useFirstRunRedirect();
  return null;
}
