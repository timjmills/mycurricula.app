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

export default function YearPage() {
  return <YearShell />;
}
