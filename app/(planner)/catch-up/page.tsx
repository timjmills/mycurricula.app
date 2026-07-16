"use client";

// The Catch-Up route — a NEXT_PUBLIC_V2 gate over two shells:
//   • flag ON  → <CatchUpRouteV2/>, the Wave-10 modal route described below.
//   • flag OFF → <CatchupScreen/>, the v1 full-page catch-up that is live on
//     prod today (the rollback path).
// Wave 10 replaced the v1 screen here without a gate, so flag-OFF was serving
// v2 — the same rollback hole /home had. See lib/v2-flag.ts.
//
// ── The v2 branch (<CatchUpRouteV2/>) ────────────────────────────────────
// A thin surface that opens the standalone Catch-Up MODAL. The modal is the
// real UI (components/catchup-v2); the v2 route just drives the shared
// modal-state singleton so exactly ONE modal ever renders, whether it was
// opened here or from the chrome Tools-dock (Codex W10 gate — dual-modal
// hazard). The v2 route:
//   • renders <CatchUpModalHost/> (the single renderer — a chrome-mounted Host,
//     once the sibling wires it, is elected first and this one no-ops),
//   • opens the modal on mount via the singleton, and
//   • watches the shared open state; when the modal closes (✕ / Esc / backdrop /
//     dock toggle) it navigates back to /weekly.
// There is no separate controlled-modal mount path on the v2 branch.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CatchUpModalHost,
  closeCatchupModal,
  onCatchupModalClosed,
  openCatchupModal,
} from "@/components/catchup-v2";
import { CatchupScreen } from "@/components/catchup";
import { V2 } from "@/lib/v2-flag";

/** The v2 route body — the modal-singleton driver documented above.
 *
 *  It lives in its own component (rather than inline in CatchUpPage) so its
 *  hooks only ever mount on the v2 branch of the flag gate below. Inlining the
 *  effect in the page would run it under flag-OFF too: it would open the v2
 *  modal over the v1 screen and then bounce the teacher to /weekly — i.e. the
 *  "rollback" would be visibly broken. Conditional RENDER of two components is
 *  fine (each owns its own hooks); a conditional hook would not be. */
function CatchUpRouteV2() {
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

export default function CatchUpPage() {
  // ── NEXT_PUBLIC_V2 router gate (Wave-13 rollback half) ──────────────────
  // Wave 10 replaced the v1 full-page <CatchupScreen> with the v2 modal route
  // WITHOUT a gate, so flag-OFF was serving v2 here — the same rollback hole
  // /home had. Flag ON → the v2 modal route (unchanged). Flag OFF → the v1
  // full-page catch-up screen that is still live on prod today. V2 is
  // build-inlined → exactly one branch ships per build.
  return V2 ? <CatchUpRouteV2 /> : <CatchupScreen />;
}
