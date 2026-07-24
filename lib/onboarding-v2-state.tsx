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
  computeNeedsOnboarding,
  defaultV2Data,
  readFinishedFlag,
  readV2Persist,
  writeV2Persist,
} from "@/lib/onboarding-v2-shape";
import type {
  OnboardingV2Data,
  OnboardingV2StepId,
} from "@/lib/onboarding-v2-shape";
import {
  markOnboardedRemote,
  readFirstRunState,
} from "@/lib/onboarding-v2-remote";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";

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
  // Finishing the wizard — via EITHER exit ("Take the tour" / "Start planning"),
  // both of which route through this — persists the per-device flag AND, on the
  // deployed path, stamps the authoritative server signal (idempotent RPC,
  // fire-and-forget). It also LATCHES the session gate synchronously so the
  // post-finish navigation into the planner never bounces back to /onboarding on
  // a stale `false` read while the fire-and-forget stamp is still in flight
  // (the finish→navigate race).
  const finish = useCallback(() => {
    setFinished(true);
    // Arm the identity-keyed grace window synchronously (the uid resolves from
    // the stamp call), then latch permanently once the write CONFIRMS whose
    // row it stamped (or immediately for the single-identity prototype path).
    const stampCall = markOnboardedRemote();
    pendingFinish = {
      until: Date.now() + FINISH_GRACE_MS,
      uid: stampCall.then((r) => r.uid).catch(() => null),
    };
    void stampCall.then((r) => {
      if (r.stamped && r.uid) satisfiedForUid = r.uid;
      else if (!isPlannerSupabaseConfigured()) satisfiedForUid = PROTOTYPE_UID;
    });
  }, []);

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

// Session-scoped latch, KEYED BY USER: once first-run is satisfied for a given
// identity — the wizard was just finished, or a planner navigation resolved to
// "no redirect needed" — the gate stops re-checking for that identity for the
// rest of this page's lifetime. Onboarding is monotonic within a session, so a
// satisfied check never needs re-running; keying by uid (not a bare boolean)
// matters because Next.js keeps module state across soft navigations — a
// sign-out/sign-in WITHOUT a full reload must not let a brand-new teacher on a
// shared device inherit the previous teacher's satisfied state (§4a High).
// The prototype (Supabase-off) path has no uid and uses a fixed sentinel — it
// is single-identity by construction (per-device localStorage).
// A deployed-path UNKNOWN (null uid or null answer) never latches: it also
// never redirects (fail-safe), so the only cost is a re-read on a later mount.
let satisfiedForUid: string | null = null;
const PROTOTYPE_UID = "__prototype__";
// Closes the finish→navigate race: finish() arms this synchronously so the
// post-wizard navigation into the planner cannot bounce back to /onboarding on
// a stale remote `false` read while the fire-and-forget stamp is in flight.
// Time-bounded AND identity-keyed (§4a round-3): the grace applies only when
// the CURRENT identity matches the FINISHER's identity (resolved from the
// stamp call — known even when the write itself fails), so a same-tab account
// switch inside the window cannot let a different, never-onboarded teacher
// skip the check. The uid-keyed latch takes over once the stamp confirms.
let pendingFinish: { until: number; uid: Promise<string | null> } | null = null;
const FINISH_GRACE_MS = 90_000;

/**
 * FIRST-RUN REDIRECT SEAM.
 *
 * Mounted once inside the (planner) layout via
 * components/shell/first-run-redirect.tsx (a render-nothing client leaf). It
 * bounces a teacher who has not completed onboarding into the wizard.
 *
 * Behaviour: after mount it reads the async authoritative signal
 * (readFirstRunState) and combines it with the per-device `finished` flag and
 * the Supabase-configured gate via the pure `computeNeedsOnboarding` matrix. It
 * redirects ONLY on a RESOLVED decision — never while the answer is unresolved —
 * so there is no flash-bounce and it never races the bypass login:
 *   • DEPLOYED path (Supabase configured): redirect only on remote === false
 *     (row exists, onboarded_at is null). remote === null (pre-migration, no
 *     session, read error) never redirects.
 *   • PROTOTYPE path (Supabase off): remote is always null → the local
 *     `finished` flag governs, exactly as before this gate existed.
 * No-op on /onboarding itself (so it can never loop) and during SSR.
 */
export function useFirstRunRedirect(): void {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Never redirect away from the wizard itself — that would loop.
    if (pathname === "/onboarding") return;

    const configured = isPlannerSupabaseConfigured();
    // Prototype path is single-identity per device — its latch can short-circuit
    // before any read. The deployed path must resolve the CURRENT uid first, so
    // its latch check happens after the (local-session) read below.
    if (!configured && satisfiedForUid === PROTOTYPE_UID) return;

    let cancelled = false;
    void (async () => {
      const { uid, onboarded } = await readFirstRunState();
      if (cancelled) return;
      const identity = configured ? uid : PROTOTYPE_UID;
      // Already satisfied for THIS identity this session — nothing to do.
      if (identity !== null && satisfiedForUid === identity) return;
      // Finish-grace: the wizard was finished moments ago in this tab BY THIS
      // identity — never bounce the post-finish navigation while the stamp
      // write is in flight. Identity-checked so a same-tab account switch
      // inside the window still gets a real check (§4a round-3).
      if (pendingFinish && Date.now() < pendingFinish.until) {
        // Bound the identity wait to the window's REMAINING life and re-check
        // the deadline after — a stalled stamp call must neither grant grace
        // past the deadline nor block another user's gate check (§4a round-4).
        const grace = pendingFinish;
        const finisherUid = await Promise.race([
          grace.uid,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), Math.max(0, grace.until - Date.now())),
          ),
        ]);
        if (cancelled) return;
        if (Date.now() < grace.until) {
          const finisherIdentity = configured ? finisherUid : PROTOTYPE_UID;
          if (identity !== null && identity === finisherIdentity) return;
        }
      }
      const needs = computeNeedsOnboarding(
        readFinishedFlag(),
        onboarded,
        configured,
      );
      if (needs) {
        router.replace("/onboarding");
      } else if (identity !== null && (onboarded === true || !configured)) {
        // Latch only a POSITIVE resolution keyed to a known identity. A
        // deployed-path UNKNOWN (null answer) stays unlatched — it never
        // redirects anyway, and the next mount re-reads (fail-safe both ways).
        satisfiedForUid = identity;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);
}
