// screen-tour.ts — the guided-tour entry point. SEAM SHIPPED, TOUR
// COMMISSIONED — there is no tour yet, and nothing here should be described as
// if there were.
//
// What exists: this function, and a wizard button wired to it. What does not
// exist: a guided walkthrough of any screen. `startScreenTour()` navigates to
// /home — the natural first stop of a future tour — and does nothing else. The
// tour proper is a SEPARATE slice, commissioned next.
//
// Because of that, the wizard's second exit is labelled "Go to Home", not
// "Take the tour": a label may only promise what the code delivers. When the
// real tour lands it replaces the body of this function (opening the first
// coach-mark, tracking tour state, etc.) WITHOUT changing this signature, and
// the label can be revisited in the same change.

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
