// screen-tour.ts — the guided-tour entry point (Wave 12c STUB).
//
// The onboarding wizard ends with a choice: "Take the tour" or "Start
// planning". The tour itself — a guided walkthrough of each major screen — is a
// SEPARATE slice commissioned next, so this is only the seam the wizard calls.
//
// For now `startScreenTour()` just navigates to /home (the natural first stop
// of any future tour) using the Next.js router the caller passes in. When the
// real tour lands it replaces the body of this function (opening the first
// coach-mark, tracking tour state, etc.) WITHOUT changing this signature, so
// the wizard's "Take the tour" button never has to change.

/**
 * The slice of the Next.js app router this seam needs — just `push`. A local
 * structural type keeps the module upgrade-proof (no next/dist internal import)
 * while still accepting a real `useRouter()` instance at the callsite.
 */
type TourRouter = { push: (href: string) => void };

/**
 * Begin the guided screen tour.
 *
 * @param router - the Next.js app router (from `useRouter()`), so this stays a
 *   plain function the wizard can call from an onClick without pulling routing
 *   internals into the tour seam.
 *
 * STUB: navigates to /home. The real multi-screen tour is a later slice.
 */
export function startScreenTour(router: TourRouter): void {
  router.push("/home");
}
