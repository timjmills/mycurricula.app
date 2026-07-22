"use client";

// onboarding-v2-state.tsx — the v2 onboarding wizard's React state (Wave 12c).
//
// The provider hosts the workspace-first configuration the wizard collects,
// the current step, and step navigation. All the PURE logic — the step order,
// the storage shape + round-trip, and the first-run matrix — lives in the
// React-free leaf lib/onboarding-v2-shape.ts (so it is unit-testable in node);
// this module is only the client wiring around it.
//
// Persistence is localStorage-only today (no backend seam here yet), under the
// SAME `mycurricula:onboarding` key + `{ stepIndex, data, finished }` shape the
// v1 wizard used, so the three live seeders keep reading it (see the shape
// module's header). Phase 1B replaces the storage behind these setters with a
// Supabase write; the hook API is stable across that migration.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ONBOARDING_V2_STEPS,
  defaultV2Data,
  needsOnboarding,
  readV2Persist,
  writeV2Persist,
} from "@/lib/onboarding-v2-shape";
import type {
  OnboardingV2Data,
  OnboardingV2StepId,
} from "@/lib/onboarding-v2-shape";

interface OnboardingV2ContextValue {
  /** Current step index into `ONBOARDING_V2_STEPS`. */
  stepIndex: number;
  stepId: OnboardingV2StepId;
  totalSteps: number;
  data: OnboardingV2Data;
  /** Merge a partial change into the collected data. */
  update: (patch: Partial<OnboardingV2Data>) => void;
  next: () => void;
  back: () => void;
  goTo: (index: number) => void;
  /** True once the teacher finishes the wizard. */
  finished: boolean;
  finish: () => void;
  /** True after the localStorage resume effect has run — suppress step
   *  content until then so a flash of default state never paints. */
  hydrated: boolean;
  /**
   * HONEST-PERSISTENCE FLAG. The wizard's config — and the `finished` flag —
   * persist to THIS browser's localStorage ONLY; nothing reaches the backend
   * yet. The summary step uses this to keep its "all set" copy honest. Flips
   * to false once Phase 1B wires onboarding through Supabase.
   */
  localOnly: boolean;
}

const OnboardingV2Context = createContext<OnboardingV2ContextValue | null>(null);

/** Read the v2 onboarding state. Throws outside the provider. */
export function useOnboardingV2(): OnboardingV2ContextValue {
  const ctx = useContext(OnboardingV2Context);
  if (!ctx) {
    throw new Error(
      "useOnboardingV2 must be used within an <OnboardingV2Provider>",
    );
  }
  return ctx;
}

/** Hosts the v2 onboarding state and persists it to localStorage. */
export function OnboardingV2Provider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<OnboardingV2Data>(defaultV2Data);
  const [finished, setFinished] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Resume from a previous session, if any. Runs once, client-side. The shape
  // module's normalizer merges saved fields over the defaults, so a record
  // written by any wizard version resumes cleanly.
  useEffect(() => {
    const saved = readV2Persist();
    if (saved) {
      setData(saved.data);
      setStepIndex(saved.stepIndex);
      setFinished(saved.finished);
    }
    setHydrated(true);
  }, []);

  // Persist on every change, but only after hydration so we never overwrite
  // saved progress with the defaults.
  useEffect(() => {
    if (!hydrated) return;
    writeV2Persist({ stepIndex, data, finished });
  }, [hydrated, stepIndex, data, finished]);

  const update = useCallback((patch: Partial<OnboardingV2Data>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const goTo = useCallback((index: number) => {
    setStepIndex(Math.min(Math.max(index, 0), ONBOARDING_V2_STEPS.length - 1));
  }, []);
  const next = useCallback(
    () => setStepIndex((i) => Math.min(i + 1, ONBOARDING_V2_STEPS.length - 1)),
    [],
  );
  const back = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);
  const finish = useCallback(() => setFinished(true), []);

  const value = useMemo<OnboardingV2ContextValue>(
    () => ({
      stepIndex,
      stepId: ONBOARDING_V2_STEPS[stepIndex],
      totalSteps: ONBOARDING_V2_STEPS.length,
      data,
      update,
      next,
      back,
      goTo,
      finished,
      finish,
      hydrated,
      localOnly: true,
    }),
    [stepIndex, data, update, next, back, goTo, finished, finish, hydrated],
  );

  return (
    <OnboardingV2Context.Provider value={value}>
      {children}
    </OnboardingV2Context.Provider>
  );
}

/**
 * FIRST-RUN REDIRECT SEAM (new — nothing detects first-run today).
 *
 * Mount this hook ONCE on a planner landing surface to bounce a teacher who
 * has not completed onboarding into the wizard. It is intentionally NOT wired
 * into the (planner) routes here (those files are owned elsewhere this wave) —
 * the orchestrator places the one-liner. The canonical mount is a single call
 * at the top of the landing client component, e.g. in
 * app/(planner)/home/page.tsx (or the planner layout's client shell):
 *
 *     useFirstRunRedirect();
 *
 * Behaviour: after mount it checks `needsOnboarding()` (the shape module's
 * local-flag + remote-check matrix) and, when true, `router.replace`s to
 * /onboarding. It is a no-op on /onboarding itself (so it can never loop) and
 * during SSR. Once the remote onboarding column lands, `isOnboardedRemote()`
 * becomes authoritative and this hook needs no change.
 */
export function useFirstRunRedirect(): void {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Never redirect away from the wizard itself — that would loop.
    if (pathname === "/onboarding") return;
    if (needsOnboarding()) router.replace("/onboarding");
  }, [router, pathname]);
}
