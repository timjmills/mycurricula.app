// v2-flag.ts — the single gate for the v2 redesign shell + router.
//
// ⚠ THIS MODULE IS DELIBERATELY SIDE-EFFECT-FREE. It exports two constants and
// nothing else: no throws, no validation, no logging. That is a hard-won rule,
// not an oversight — see "WHY NO GUARDS HERE" below. All policy enforcement
// lives in `scripts/check-v2-flag.mjs`, which runs at BUILD time.
//
// WHAT IT GATES (plan §0.1): the SHELL and the ROUTER — which chrome mounts and
// which screen mounts per route. It does NOT gate tokens: `app/tokens.css` is
// imported app-wide and `:root` is singular, so v2 tokens are additive and
// back-compatible (Wave 2). Flipping this flag must never require a token change.
//
// WHY IT EXISTS: plan §0.1 chose "feature-flagged incremental" and rejected a
// full-replace branch ("constant master re-merges and one terrifying cutover").
// Flag flips are redeploy-gated: NEXT_PUBLIC_* is inlined by `next build` and
// frozen into the artifact, so changing it in a RUNTIME environment does
// nothing.
//
// ── POLARITY: DEFAULT ON; ONLY THE EXACT STRING "0" TURNS IT OFF ───────────
// `RAW !== "0"`. Default ON is deliberate: this branch IS the v2 build, and a
// concurrent session builds views against it. Defaulting OFF would silently
// render v1 for anyone who hasn't set the var. A typo'd value (`"false"`,
// `"off"`) therefore reads as ON — which is why the build-time check rejects
// any value that is not exactly `"0"`, `"1"`, or unset.
//
// ── WHY NO GUARDS HERE (§4a findings, with the record corrected) ───────────
// An earlier revision threw from this module on invalid/production-unsafe
// values. Two real problems, plus one that was hypothesised and then DISPROVED
// by experiment. Recorded honestly, because the disproof is the useful part:
//
//   1. REAL (the reason it was NO-GO): an "unset in production" throw breaks
//      `deploy.yml`, `preview-deploy.yml`, and every local `npm run build` —
//      no build environment set the var. Measured: `npm run build` with the
//      var unset exits 1. It also breaks the §4a-mandated local verification
//      stack for every developer. Loud, but a hard break. (Both workflows now
//      declare `NEXT_PUBLIC_V2: "1"` explicitly.)
//   2. REAL: the moment a "use client" file imports `V2` — and the router
//      gates ARE client components — a module-level throw ships into the
//      CLIENT bundle and degrades to a blank page rather than a message.
//   3. DISPROVED: it was argued that because `app/layout.tsx` awaits
//      `cookies()`, every route is dynamic, prerender is skipped, `next build`
//      never imports this module, the build goes green, and the throw
//      relocates to the Worker's first request. **Empirically false.** Next's
//      "Collecting page data" phase imports every route's server module to
//      read its segment-config exports — that is HOW it learns a route is
//      dynamic — so the throw fires during the build. Measured: `✓ Compiled
//      successfully`, then `Failed to collect configuration for /daily`, exit
//      1. Routes being dynamic and the module being imported at build time
//      coexist.
//
// So build-time enforcement buys ROBUSTNESS AND CLARITY, not a bug fix: it is
// legible, fails at a predictable point, is testable in milliseconds without a
// four-minute build, ships in no bundle, and does not depend on a Next-internal
// import phase that could change between minor versions. Keep this module pure.

/**
 * True when the v2 redesign shell + router are active.
 *
 * Inlined by `next build` and frozen into the artifact — a runtime env change
 * has NO effect. Default ON; `NEXT_PUBLIC_V2=0` selects v1.
 *
 * Safe to import from client components (no side effects).
 */
export const V2: boolean = process.env.NEXT_PUBLIC_V2 !== "0";

/**
 * Whether the ROUTER half of the gate exists yet.
 *
 * The flag has two halves. The CHROME half is implemented
 * (`app/(planner)/layout.tsx`). The ROUTER half — which canvas mounts per route
 * (`components/daily/DailyView.tsx`, `components/weekly/WeeklyShell.tsx`,
 * `app/(planner)/year/page.tsx`) — is not.
 *
 * ⚠ While this is `false`, `NEXT_PUBLIC_V2=0` yields **v1 chrome around v2
 * canvases** (and the v2 `.stage`/`.theme-tint` still paint). That is a
 * CHROME-ONLY DEV HARNESS. It is *not* a v1 rollback, and it does *not* yet
 * satisfy the plan's Wave-13 "flag-OFF v1 regression" gate — an earlier version
 * of this comment claimed it did; that claim was wrong and is retracted.
 *
 * `scripts/check-v2-flag.mjs` reads this constant and refuses to BUILD a
 * flag-OFF production artifact while it is `false`. Flip it to `true` in the
 * same change that lands the router gates.
 */
export const V2_ROUTER_GATED = false;
