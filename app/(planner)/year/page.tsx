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
//
// Params:
//   ?preview=subject-led  — render the 7.21 handoff's subject-led Year on the
//                           PAPER frame instead of TimelineYear.
//   ?preview=frame-b      — render the 7.2 Frame-B progress list there instead.
//
// The preview parameter exists so the paper-Year candidates can be compared
// against real data before one is chosen; it changes nothing else, writes no
// preference, and dropping it restores today's Year exactly. Anything
// unrecognised parses to `null`, i.e. today's Year — a bad link must never
// print a blank surface. Parsed HERE rather than in the client shell because a
// server component reading `searchParams` and handing the result down is how
// this codebase reads a search param (see /weekly and /weekly/print), and it
// keeps the choice correct on the server, on the first paint, and across a
// client-side navigation that changes only the query.

import { YearShell, parseYearPreview } from "@/components/year-v2";
import { TimelineYear } from "@/components/year";
import { V2 } from "@/lib/v2-flag";

export default async function YearPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // ── NEXT_PUBLIC_V2 router gate (Wave-13 rollback half) ──────────────────
  // Flag ON → <YearShell> (frame-routed v2 Year: YearA/TimelineYear/YearC).
  // Flag OFF → <TimelineYear> directly — the pre-v2, live-on-prod Year (the
  // exact mount master's year/page.tsx used). YearShell already renders
  // TimelineYear on its paper frame, so the v1 path is a proven subset.
  // V2 is build-inlined → exactly one mounts per build.
  //
  // The flag-OFF branch takes NO preview, deliberately: it is the rollback
  // path, and its job is to be byte-for-byte the Year that is live on prod.
  return V2 ? (
    <YearShell preview={parseYearPreview(params.preview)} />
  ) : (
    <TimelineYear />
  );
}
