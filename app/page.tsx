"use client";

// The root path forwards to the teacher's preferred startup view
// (Settings → Account → Default view, persisted under
// `mycurricula:user:default-view`). The preference lives in
// localStorage, which only the client can read — so this is a client
// redirect rather than the previous server-side redirect("/weekly").
//
// `readDefaultView()` is defensive: unset, invalid, or unreadable values
// all resolve to "/weekly" (the pre-preference behavior), so a teacher
// who never opens the Account page sees no change.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readDefaultView } from "@/lib/use-account-settings";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // replace (not push) so "/" never lingers in history — Back from the
    // landing view should leave the app, not bounce through the redirect.
    router.replace(readDefaultView());
  }, [router]);

  // Nothing to paint — the redirect fires on mount. Rendering null keeps
  // the frame blank for the same instant the old server redirect did.
  return null;
}
