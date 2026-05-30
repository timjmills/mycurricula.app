"use client";

// app/(planner)/teach/page.tsx — the Teach view route (Wave 0 skeleton).
//
// Renders <TeachShell/>, the 5-zone teaching workspace. Lives in the
// (planner) route group so it inherits auth + the Personal/Team banner + the
// top bar (so the Teach tab can highlight). TeachShell itself suppresses the
// planner's default left filter panel, right panel, and icon rails via the
// `data-teach-view` + globals.css pattern (mirrors the /weekly/print route),
// because Teach owns its own chrome.
//
// Suspense boundary: TeachShell calls `useSearchParams()` (to read
// ?present=1). The App Router requires that hook to sit under a <Suspense>
// boundary so a statically-rendered route can stream the param-dependent
// subtree; without it the build errors. The fallback is null — the shell
// paints in the same frame on the client, so there is no visible flash.

import { Suspense, type ReactNode } from "react";
import { TeachShell } from "@/components/teach";

export default function TeachPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <TeachShell />
    </Suspense>
  );
}
