// Year view — the frame-routed curriculum surface (Wave 6).
//
// Mounts <YearShell>, a thin router on the v2 appearance frame:
//   • glass → <YearA/>          — subject lanes under a month scale.
//   • paper → <TimelineYear/>   — the existing merged drill view (sidebar,
//                                 lesson pane, standards coverage, ?subject=
//                                 drill), rendered untouched.
//   • color → <YearC/>          — the subject constellation of unit-progress
//                                 discs; a disc opens the Unit Explorer modal.
//
// The glass + color frames honor `?subject=<id>` by scrolling that subject's
// lane / cluster into view (the retired /subject/[slug] redirect stays
// meaningful on every frame). The /year/print route is untouched.

import { YearShell } from "@/components/year-v2";
import { TimelineYear } from "@/components/year";
import { V2 } from "@/lib/v2-flag";

export default function YearPage() {
  // ── NEXT_PUBLIC_V2 router gate (Wave-13 rollback half) ──────────────────
  // Flag ON → <YearShell> (frame-routed v2 Year: YearA/TimelineYear/YearC).
  // Flag OFF → <TimelineYear> directly — the pre-v2, live-on-prod Year (the
  // exact mount master's year/page.tsx used). YearShell already renders
  // TimelineYear on its paper frame, so the v1 path is a proven subset.
  // V2 is build-inlined → exactly one mounts per build.
  return V2 ? <YearShell /> : <TimelineYear />;
}
