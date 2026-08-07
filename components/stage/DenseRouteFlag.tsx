"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * `<html data-dense="1">` — the route-derived cinematics suppressor.
 *
 * WHAT IT IS FOR. `app/themes.css` drifts `.stage::before` (the fixed,
 * full-viewport photo/wash backdrop) from scale(1.02) to scale(1.08) over
 * 40–54s. That layer sits BEHIND every `backdrop-filter` glass surface in the
 * app, so on a dense view its drift forces each of those surfaces to re-blur
 * on every frame. The 7.21 handoff hit exactly this and answered it with a
 * `data-dense` flag set on every view except home:
 *
 *   Documents/Claude Design/7.21.26 Design Handoff Update/source-home/home.css
 *     :65-72  — "Dense views (anything but home): still the backdrop.
 *     Continuous photo zoom + long cross-fades force per-frame re-rendering
 *     beneath the views' large backdrop-filter surfaces — enough to saturate
 *     the main thread (blank screen)."
 *   …/source-home/app.jsx:546 — `data-dense={view!=='home'?'1':'0'}`
 *
 * WHY IT IS MOUNTED IN THE ROOT LAYOUT, NOT IN ChromeShell. ChromeShell is the
 * planner group's chrome and is NOT mounted on `/teach` — `app/(teach)/layout.tsx`
 * mounts data providers only (docs/audits/2026-07-31-post-teach-catchup-shell.md
 * finding A2). Teach is one of the densest surfaces in the app, so a
 * ChromeShell-hosted flag would miss the case that needs it most. Mounted at the
 * root it also covers `/login`, `/welcome`, `/onboarding`, `/settings/*`,
 * `/invite/*` and every future route group for free.
 *
 * WHICH ROUTES KEEP THE CINEMATICS. Exactly one: `/home`. That is the handoff's
 * own rule ("anything but home") and it is the right one here:
 *   • `/home` is the surface the ambient backdrop was designed for — it renders
 *     the console floating over the stage and nothing else.
 *   • Every planner view (`/daily`, `/weekly`, `/year`, `/planner`, `/post`,
 *     `/catch-up`, …), `/teach`, and `/settings/*` are glass-over-stage data
 *     surfaces — the exact shape the handoff's rationale describes.
 *   • `/login` and `/welcome` are not judgement calls at all: both paint an
 *     OPAQUE `background: var(--canvas)` on their own `.page` root
 *     (app/login/page.module.css, app/welcome/page.module.css), so the stage is
 *     fully occluded there. Suppressing its drift on those routes removes work
 *     that was never visible — a pure win, no aesthetic cost.
 * `/home` is a deliberate destination, not the landing route (CLAUDE.md §1: the
 * default landing route is `/weekly`), so this is not "the default is static" —
 * it is "the one showcase surface stays cinematic".
 *
 * `/` is checked and deliberately left as dense: app/page.tsx renders `null` and
 * client-redirects to the teacher's preferred startup view, so the flag is set
 * for the instant a blank frame is on screen and is then re-derived from the
 * destination — including removing it again if that destination is `/home`.
 *
 * SET-OR-DELETE, NEVER "0". Mirrors the `<html data-mode="team">` idiom in
 * ChromeShell.tsx:66-76: the attribute's PRESENCE is the signal, so the resting
 * DOM on `/home` stays byte-identical to the pre-change markup. This is a
 * deliberate divergence from the handoff's `app.jsx`, which writes the string
 * `'0'`; the CSS keys on `="1"` either way, and an absent attribute is the
 * cleaner resting state. Cleanup on unmount restores that resting state.
 *
 * NOT AN APPEARANCE AXIS. `data-dense` is derived from the ROUTE, never from a
 * teacher preference. It is deliberately absent from the CLAUDE.md §4 five-
 * surface allowlist lockstep (`lib/theme.tsx`, `lib/theme-init.tsx`, the
 * `teacher_preferences` CHECK constraints, `app/layout.tsx`'s SSR attrs,
 * `scripts/probe-theme-wave.mjs`) — there is nothing to keep in sync.
 *
 * ⚠ KNOWN GAP — pre-hydration. Client effects do not run during SSR, so the
 * attribute is absent in the server HTML and the stage drifts on a dense route
 * until this effect runs (dev hydration here is 5–30s; production ~1–3s).
 * Closing it would need an inline pre-paint script alongside `<ThemeInit>`;
 * that is deliberately NOT done here to keep this change small and to avoid
 * delaying ThemeInit's own no-FOUC script. The larger, permanent cost — the
 * document-wide `--accent` animation — is pure CSS and is already gone.
 */

/** The only route that keeps the full ambient cinematics. */
const CINEMATIC_ROUTES: readonly string[] = ["/home"];

export function DenseRouteFlag(): null {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    // A null pathname (defensive — usePathname can be null outside an App
    // Router tree) must NOT be read as "dense": guessing wrong in that
    // direction would silently kill the cinematics on the one route that keeps
    // them. Unknown ⇒ leave the resting state alone.
    if (pathname === null) return;
    if (CINEMATIC_ROUTES.includes(pathname)) {
      delete root.dataset.dense;
    } else {
      root.dataset.dense = "1";
    }
    return () => {
      delete root.dataset.dense;
    };
  }, [pathname]);

  return null;
}
