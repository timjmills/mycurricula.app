"use client";

// Year view — curriculum roadmap + progression surface.
//
// Mounts both the desktop/tablet <YearView> and the phone <YearMobile>
// inside a shared <MinimizedSubjectsProvider> so lane-minimization state
// survives a viewport resize.
//
// Visibility is split across two channels by design:
//   - CSS (year-page.module.css) owns the paint: a `@media (max-width:
//     480px)` rule swaps `display: contents`/`display: none` between the
//     two wrappers. This applies pre-paint at every viewport on every
//     engine, so the SSR HTML and the first client render match and there
//     is no desktop→phone CLS flash (audit M3, recommended Option 1 in
//     docs/research-deferred-year-items-2026-05-25.md).
//   - JS (`isPhone` below) owns the a11y tree: a matchMedia listener
//     keeps `aria-hidden` in sync so assistive tech only ever encounters
//     one `<h1>Yearly View</h1>` and one set of landmarks at a time.
//     CSS cannot drive an `aria-hidden` attribute, so this channel must
//     stay in JS. SSR starts with the desktop tree visible to AT
//     (`isPhone=false`) and the effect corrects the flag on mount.

import { useEffect, useState } from "react";
import { YearView, YearMobile } from "@/components/year";
import { MinimizedSubjectsProvider } from "@/lib/year-state";
import styles from "./year-page.module.css";

/** Phone breakpoint matches the existing 480px responsive contract. */
const PHONE_MQ = "(max-width: 480px)";

export default function YearPage() {
  // SSR-safe phone detection — start with the desktop tree exposed to
  // assistive tech so server render and first client render match, then
  // hydrate to the real viewport. Drives `aria-hidden` only; visibility
  // is owned by the CSS module above.
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
        className={styles.desktopOnly}
        aria-hidden={isPhone ? "true" : undefined}
      >
        <YearView />
      </div>
      <div
        className={styles.phoneOnly}
        aria-hidden={isPhone ? undefined : "true"}
      >
        <YearMobile />
      </div>
    </MinimizedSubjectsProvider>
  );
}
