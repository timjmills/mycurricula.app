// The first-run onboarding wizard (planning doc onboarding plan, §2).
//
// Flag-gated per the v2 seam rule: the v2 workspace-first wizard renders when
// NEXT_PUBLIC_V2 is on; NEXT_PUBLIC_V2=0 restores the v1 wizard untouched. The
// matching provider is selected in this route's layout.
import { V2 } from "@/lib/v2-flag";
import { OnboardingWizard } from "@/components/onboarding";
import { OnboardingWizardV2 } from "@/components/onboarding-v2";

export default function OnboardingPage() {
  return V2 ? <OnboardingWizardV2 /> : <OnboardingWizard />;
}
