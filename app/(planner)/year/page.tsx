"use client";

// Year view — curriculum roadmap + progression surface.
//
// Mounts both the desktop/tablet <YearView> and the phone <YearMobile>.
// CSS visibility (display:none) swaps which is on-screen based on viewport
// width; both stay mounted to avoid flash on resize. The shared
// <MinimizedSubjectsProvider> means a lane minimized on desktop stays
// minimized after the viewport resizes into phone width.
//
// The off-screen variant is marked `aria-hidden="true"` so assistive tech
// only ever encounters one `<h1>Yearly View</h1>` and one set of landmarks
// at a time (audit fragment docs/audit-fragments/other-routes.md lines
// 78–85). The CLS / bundle-size concerns from that audit item are
// deferred — they want a true conditional render which would require a
// hook the codebase does not yet have.

import { useEffect, useState } from "react";
import { YearView, YearMobile } from "@/components/year";
import { MinimizedSubjectsProvider } from "@/lib/year-state";

/** Phone breakpoint matches the existing 480px responsive contract. */
const PHONE_MQ = "(max-width: 480px)";

export default function YearPage() {
  // SSR-safe phone detection — start with the desktop view so the server
  // render and first client render match, then hydrate to the real width.
  const [isPhone, setIsPhone] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(PHONE_MQ);
    setIsPhone(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setIsPhone(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      mq.addListener(handler);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return () => mq.removeListener(handler);
    }
  }, []);

  return (
    <MinimizedSubjectsProvider>
      <div
        style={{ display: isPhone ? "none" : "contents" }}
        aria-hidden={isPhone ? "true" : undefined}
      >
        <YearView />
      </div>
      <div
        style={{ display: isPhone ? "contents" : "none" }}
        aria-hidden={isPhone ? undefined : "true"}
      >
        <YearMobile />
      </div>
    </MinimizedSubjectsProvider>
  );
}
