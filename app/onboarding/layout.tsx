import type { ReactNode } from "react";
import { OnboardingProvider } from "@/lib/onboarding-state";

// Onboarding lives outside the planner shell — it is the full-screen
// first-run wizard a teacher completes before reaching the planner. No top
// bar, no side panels.

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
      <OnboardingProvider>{children}</OnboardingProvider>
    </main>
  );
}
