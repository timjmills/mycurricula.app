"use client";

// ImmersiveBarHost.tsx — the immersive bar, fully wired, as ONE mountable unit.
//
// WHY IT EXISTS. `ImmersiveBar` is deliberately dumb (it owns no timer and no
// slot contents) and `useImmersiveAutohide` is deliberately headless. Until now
// the only thing that joined them — the stillness timer, the back handler's
// deep-link guard, and the four slot fills (title / nav / tools / mode switch)
// — lived inline inside `ChromeShell`'s immersive branch. That made the wiring
// reachable ONLY from the `(planner)` route group, which is precisely why
// `/teach` had no bar at all despite being listed in `IMMERSIVE_PREFIXES`
// (finding A2, docs/audits/2026-07-31-post-teach-catchup-shell.md).
//
// Lifting it here gives every immersive surface the SAME bar from the SAME
// code, whichever route group it lives in. `ChromeShell` renders this in its
// immersive branch; `app/(teach)/layout.tsx` renders it directly, because the
// Teach workspace cannot host `ChromeShell` itself (see that file's header for
// the measured reason).
//
// THE HOOK MOVED WITH THE WIRING, and that is a real simplification.
// `ChromeShell` had to call `useImmersiveAutohide(immersive)` ABOVE its
// `if (immersive)` early return — a hook cannot sit after a conditional return
// — so the hook took an `enabled` flag and no-opped on every corner-grammar
// route. Here the host itself only mounts on an immersive surface, so the hook
// runs unconditionally inside it and unmounting IS the disable: the effect's
// cleanup clears the timer and drops every listener. `enabled` survives as a
// parameter (it still force-shows the bar when false) but every caller now
// passes true implicitly by virtue of mounting.
//
// SLOT CONTENTS are identical to what ChromeShell rendered inline, so /planner
// and /post are byte-identical across this move:
//   • title  — <ViewTitle/>, which self-derives from the route and renders null
//              where it has no entry.
//   • nav    — <ConsoleNav compact/>, the six-tab view console (R1b), matching
//              the handoff compact-bar's `.cb-center` `.views.nav`.
//   • tools  — <ChromeToolsMenu/> + <ChromeAccountMenu/> (R1a/c/d).
//   • mode   — Personal/Team, PLAN ONLY (bundle-verified, WAVE-3-PLAN §3 R1).
//              Callers pass `showModeSwitch`; Teach passes nothing and must
//              never opt in.

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { settlePendingNavigation } from "@/lib/view-transition";
import { ImmersiveBar } from "./ImmersiveBar";
import { ConsoleNav } from "./Console";
import { ChromeToolsMenu } from "./ChromeToolsMenu";
import { ChromeAccountMenu } from "./ChromeAccountMenu";
import { ViewTitle } from "./ViewTitle";
import { useImmersiveAutohide } from "./use-immersive-autohide";

export interface ImmersiveBarHostProps {
  /** Personal/Team toggle in the right slot. Plan ONLY, per the bundle. */
  showModeSwitch?: boolean;
  /**
   * Where Back goes when there is no in-app history entry to pop.
   *
   * Deep-link guard (§4a finding #11): with a single history entry, `back()`
   * exits the site entirely. Defaults to the app's default landing route.
   */
  fallbackHref?: string;
}

export function ImmersiveBarHost({
  showModeSwitch = false,
  fallbackHref = "/weekly",
}: ImmersiveBarHostProps): ReactNode {
  const router = useRouter();
  const autohide = useImmersiveAutohide(true);

  return (
    <ImmersiveBar
      title={<ViewTitle />}
      showModeSwitch={showModeSwitch}
      hidden={autohide.hidden}
      barRef={autohide.barRef}
      onShow={autohide.show}
      nav={<ConsoleNav compact />}
      tools={
        <>
          <ChromeToolsMenu />
          <ChromeAccountMenu />
        </>
      }
      onBack={() => {
        // Contract (WAVE-3-PLAN R1): settle any in-flight soft swap so the
        // snapshot cannot hold input through a back-navigation this module
        // didn't start. TODO(W3.4/Phase-2): honor the custom-wall back-pop
        // (cc-rw-back analogue) before leaving /post.
        settlePendingNavigation();
        if (window.history.length <= 1) {
          router.push(fallbackHref);
        } else {
          router.back();
        }
      }}
    />
  );
}
