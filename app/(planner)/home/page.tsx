// /home — W3.4: the landing console.
//
// Replaces the v1 "Quiet Dawn" home. The corner-grammar console (greeting +
// centered segmented view switcher) is the v2 landing surface, floating over
// the app-wide stage background. See WAVE-3-PLAN W3.4 and the 7.2.26 bundled
// mockup's `Hero`.
//
// This page renders ONLY the console: the bottom-center quote and the
// context/clock botbar are supplied by ChromeShell on the /home route (it
// route-scopes them there), so there's nothing else to mount here. The
// greeting + entries live in <HomeConsole> (components/chrome) so the same
// vocabulary powers the compact view-nav variant atop Day/Week/Year.

import type { ReactNode } from "react";
import { HomeConsole } from "@/components/chrome";
import { HomeV1 } from "@/components/home";
import { V2 } from "@/lib/v2-flag";

export default function HomePage(): ReactNode {
  // ── NEXT_PUBLIC_V2 router gate (Wave-13 rollback half) ──────────────────
  // Flag ON → the v2 <HomeConsole> (corner-grammar landing console). Flag OFF →
  // <HomeV1>, a verbatim copy of master's live-on-prod "Quiet Dawn" home. V2 is
  // build-inlined → exactly one mounts per build. /home has a real v1 form on
  // master, so gating it keeps the flag-OFF rollback a faithful v1 restore.
  return V2 ? <HomeConsole /> : <HomeV1 />;
}
