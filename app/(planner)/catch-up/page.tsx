"use client";

// The Catch-Up route (v2) — a thin surface that opens the standalone Catch-Up
// MODAL. The modal is the real UI (components/catchup-v2); this route just drives
// the shared modal-state singleton so exactly ONE modal ever renders, whether it
// was opened here or from the chrome Tools-dock (Codex W10 gate — dual-modal
// hazard). The route:
//   • renders <CatchUpModalHost/> (the single renderer — a chrome-mounted Host,
//     once the sibling wires it, is elected first and this one no-ops),
//   • opens the modal on mount via the singleton, and
//   • watches the shared open state; when the modal closes (✕ / Esc / backdrop /
//     dock toggle) it navigates back to /weekly.
// There is no separate controlled-modal mount path.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CatchUpModalHost,
  closeCatchupModal,
  onCatchupModalClosed,
  openCatchupModal,
} from "@/components/catchup-v2";

export default function CatchUpPage() {
  const router = useRouter();

  useEffect(() => {
    openCatchupModal();
    // Whenever the modal closes — by ✕ / Esc / backdrop / the dock toggle — leave
    // the route so it can never sit blank behind a closed modal. A direct close
    // callback (not watching the open flag for a transition) is deterministic
    // under React's effect ordering + StrictMode double-invoke. We unregister
    // BEFORE the unmount-time close so navigating away doesn't re-fire it.
    const off = onCatchupModalClosed((reason) => {
      // A "navigated" close means the modal (Plan/Teach) is already sending the
      // user to a specific destination — don't stomp it with the /weekly
      // fallback (Codex W10 R2). Only a dismiss falls back to /weekly.
      if (reason !== "navigated") router.push("/weekly");
    });
    return () => {
      off();
      closeCatchupModal();
    };
  }, [router]);

  return <CatchUpModalHost />;
}
