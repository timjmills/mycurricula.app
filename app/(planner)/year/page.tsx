"use client";

// Year view — curriculum roadmap + progression surface.
//
// Mounts both the desktop/tablet <YearView> and the phone <YearMobile>.
// CSS visibility (display:none) swaps which is on-screen based on viewport
// width; both stay mounted to avoid flash on resize. The shared
// <MinimizedSubjectsProvider> means a lane minimized on desktop stays
// minimized after the viewport resizes into phone width.

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
      <div style={{ display: isPhone ? "none" : "contents" }}>
        <YearView />
      </div>
      <div style={{ display: isPhone ? "contents" : "none" }}>
        <YearMobile />
      </div>
    </MinimizedSubjectsProvider>
  );
}
