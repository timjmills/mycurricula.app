import type { ReactNode } from "react";
import { V2 } from "@/lib/v2-flag";
import { OnboardingProvider } from "@/lib/onboarding-state";
import { OnboardingV2Provider } from "@/lib/onboarding-v2-state";

// Onboarding lives outside the planner shell — it is the full-screen
// first-run wizard a teacher completes before reaching the planner. No top
// bar, no side panels.
//
// Flag-gated per the v2 seam rule: the v2 provider hosts the workspace-first
// wizard when NEXT_PUBLIC_V2 is on; NEXT_PUBLIC_V2=0 restores the v1 provider
// (and, via page.tsx, the v1 wizard) untouched. Only one provider ever mounts,
// so the two never race on the shared `mycurricula:onboarding` storage key.

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <main
      className="cp-root"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--ink-50)",
      }}
    >
      {V2 ? (
        <OnboardingV2Provider>{children}</OnboardingV2Provider>
      ) : (
        <OnboardingProvider>{children}</OnboardingProvider>
      )}
    </main>
  );
}
