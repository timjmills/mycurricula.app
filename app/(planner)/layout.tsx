import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";
import { AppStateProvider } from "@/lib/app-state";
import { USER_ID_HEADER } from "@/lib/supabase/user-header";
import { CatchupProvider } from "@/lib/catchup-state";
import { ConsequenceToastProvider } from "@/lib/consequence-toast";
import { EditModeProvider } from "@/lib/edit-mode-state";
import { NotebookProvider } from "@/lib/notebook-state";
import { PlannerProvider } from "@/lib/planner-store";
import { UndoToastProvider } from "@/lib/undo-toast";
import { UnitNotesProvider } from "@/lib/unit-notes";
import {
  FirstRunRedirect,
  GlobalShortcuts,
  LastRouteRecorder,
  MasterBanner,
  RightPanel,
  SideNav,
  TopBar,
  UndoToastBridge,
  WriteFailureBridge,
} from "@/components/shell";
import { ChromeShell } from "@/components/chrome";
import { PlannerSeedGate, PlannerServerSeed } from "@/components/planner-seed";
import {
  PLANNER_SERVER_SEED_ENABLED,
  SSR_USER_ID_FORWARDING_ENABLED,
} from "@/lib/planner/server-seed-enabled";
import { ComposerProvider } from "@/components/composer";
import { UnitWorkspaceProvider } from "@/components/year-v2/workspace-host";
import { V2 } from "@/lib/v2-flag";
import styles from "./layout.module.css";

/**
 * The planner CHROME seam (plan §0.1 — `NEXT_PUBLIC_V2` gates the shell/router).
 *
 * Flag ON  → the v2 corner-grammar chrome (`ChromeShell`).
 * Flag OFF → the v1.3 chrome it replaced: the red `MasterBanner` + `TopBar`.
 *
 * This is the CHROME half of the gate. The ROUTER half — which canvas mounts
 * per route — lives in the view surfaces (`components/daily/DailyView.tsx`,
 * `components/weekly/WeeklyShell.tsx`, `app/(planner)/year/page.tsx`) and is
 * owned by the view-surfaces session; each gates with the same `V2` const.
 *
 * ⚠ WHAT FLAG-OFF ACTUALLY IS TODAY (§4a High H2 — an earlier claim retracted):
 * a CHROME-ONLY DEV HARNESS. With the router half missing, `NEXT_PUBLIC_V2=0`
 * renders v1 chrome around still-mounted v2 canvases, and the v2
 * `.stage`/`.theme-tint` still paint. It is NOT a v1 rollback and it does NOT
 * yet satisfy the plan's Wave-13 flag-OFF regression gate. Two known artifacts
 * of that half-gated state, both resolved by the router half:
 *   • `/planner` (and the other immersive routes) lose `ImmersiveBar`, so the
 *     Back affordance disappears — those routes are v2-only and would not exist
 *     under a true v1 build. (§4a M2)
 *   • `ChromeShell` is the sole writer of `<html data-mode="team">`, so the v2
 *     canvases lose the pink team-glow signal. The v1 `MasterBanner` mounted
 *     below restores the *v1* team signal, not the glow. (§4a M3)
 * `scripts/check-v2-flag.mjs` refuses to BUILD a flag-OFF production artifact
 * while `V2_ROUTER_GATED` is false, so this state cannot ship.
 *
 * `V2` is build-time inlined, so this branch is identical on the server and the
 * client — no hydration tear. Both branches render the same `children` subtree,
 * so nothing below the chrome is aware of the flag.
 *
 * STRUCTURAL CONTRACT (§4a): `ChromeShell` renders `<div class="overlay">` —
 * `position:absolute; inset:var(--frame-inset); display:grid;
 * grid-template-rows:auto 1fr auto`, plus `.overlay > * { min-width: 0 }` —
 * which is the containing block for `children`. Dropping it for a bare fragment
 * would strand the child `flex:1` row inside the merely-`position:relative`
 * parent and break the `<main id="main-content">` overflow contract. The OFF
 * branch therefore keeps an equivalent fill wrapper (absolute inset:0, column
 * flex), minus the v2 frame inset that v1 never had. The `min-width: 0` that
 * `.overlay > *` supplied (it exists for `/daily`'s 457px h-scroll) is applied
 * directly to the shared content row below, so BOTH branches carry it.
 */
function PlannerChrome({ children }: { children: ReactNode }): ReactNode {
  if (!V2) {
    // `.v1-shell` (app/chrome.css) mirrors `.overlay`'s fill + its
    // `> * { min-width: 0 }` contract across ALL three children — not just the
    // content row, which an inline style could only reach. (§4a Codex Medium.)
    return (
      <div className="v1-shell">
        <MasterBanner />
        <TopBar />
        {children}
      </div>
    );
  }
  return <ChromeShell>{children}</ChromeShell>;
}

/**
 * The two singleton OVERLAY engines, kept together because they mount innermost
 * for the same reason: each renders a host that needs every planner provider
 * (usePlanner, the notebook/edit-mode state, both toast surfaces) in scope, and
 * each wraps `children` so any surface can reach it imperatively. Both emit ZERO
 * DOM until something opens them. Singleton-mount precedent: lib/undo-toast.tsx.
 *
 * • ComposerProvider (B4.0) — the Shared Composer engine. Surfaces open the
 *   composer / resource menu through useComposer() (ResourcesPanel,
 *   lesson-flow, LessonEditor) instead of declaring their own instances.
 * • UnitWorkspaceProvider (B5.1) — the ONE global mount of the unit workspace
 *   (<UnitExplorer> and everything B1–B3 built inside it). Surfaces open it with
 *   useUnitWorkspace().openUnitWorkspace(subjectId, unit) rather than mounting
 *   their own copy, which is how /daily and /weekly get a path to it at all.
 *   It nests INSIDE ComposerProvider because the workspace's Lesson Planner
 *   (components/lesson-flow) calls useComposer().
 */
function PlannerOverlayProviders({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <ComposerProvider>
      <UnitWorkspaceProvider>{children}</UnitWorkspaceProvider>
    </ComposerProvider>
  );
}

// Planner shell — the chrome shared by every primary view (Weekly, Daily,
// Subject, …). Routing picks which view renders in the canvas; this layout
// supplies the top bar, the collapsible left filter panel, and the
// contextual right panel around it.
//
// Settings lives outside this group: it is a separate full-page surface
// with its own layout, reached from the top-bar profile menu.
//
// A11Y-004: a "Skip to content" link is the first focusable element.
// It is visually hidden until keyboard focus lands on it, then slides
// into view above the top bar. The `<main>` element carries `id="main-content"`
// so the link's href="#main-content" delivers focus to the canvas.

export default async function PlannerLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  // ── THE AUTH ROUND TRIP THE BROWSER NO LONGER HAS TO MAKE ─────────────────
  // Middleware already called `supabase.auth.getUser()` for the auth gate on
  // this very request and forwarded the answer on `x-mc-user-id`
  // (lib/supabase/middleware.ts). Reading it here costs ZERO extra calls —
  // notably NOT a second `getUser()`, which would be a real round trip on the
  // TTFB path, in a layout that is not behind a Suspense boundary.
  //
  // ⚠ CACHE-ISOLATION INVARIANT, NOW CARRYING IDENTITY. app/layout.tsx §95-98
  // already requires that this SSR HTML never enter a shared cache, because it
  // varies on the theme cookie. The payload now also contains the teacher's auth
  // uuid and (streamed below) their planner document, so a cache mistake would
  // leak IDENTITY AND DATA, not a colour scheme. No `revalidate`, no
  // `force-static`, no `"use cache"`, no `Cache-Control` on this path — reading
  // headers here keeps the route dynamic on its own account as well.
  //
  // Signed out → no header → null → byte-identical to the previous behaviour:
  // the store settles the empty document honestly rather than pretending.
  //
  // KNOWN GAP, deliberately not worked around: the Bearer-header form of the
  // Claude bypass mints session cookies onto the RESPONSE but never onto
  // `request.cookies` (lib/claude-bypass.ts), so middleware's `getUser()` sees
  // no session and this renders signed-out. The `?claude=` URL form redirects
  // first and is unaffected. Anyone smoke-testing SSR with a Bearer header will
  // see a signed-out render and should not file it as broken SSR.
  //
  // ⚠ GATED OFF (lib/planner/server-seed-enabled.ts). Forwarding the server's
  // identity is the ROOT CONDITION behind this lane's two cross-user findings:
  // it makes `currentUser.id` the SERVER's answer for the whole window before
  // the browser confirms who it is. With the switch off this reads null, and
  // `currentUser` stays FALLBACK_USER until the browser's own auth resolves —
  // the behaviour that shipped before any of this work.
  const initialUserId = SSR_USER_ID_FORWARDING_ENABLED
    ? (await headers()).get(USER_ID_HEADER)
    : null;
  // One id per SERVER render of this layout, handed to both halves of the
  // server-seed handshake. It is what lets the client channel tell a FRESH page
  // render — which supersedes any earlier seed, so a second planner navigation
  // is seeded too — from a re-render of the same one, which must not disturb a
  // hydrate already awaiting it. Never rendered into the DOM and never compared
  // against anything a client supplies, so it carries no security weight; it is
  // an identity, not a token.
  const seedRenderId = crypto.randomUUID();
  return (
    <AppStateProvider initialUserId={initialUserId}>
      {/* W-E NotebookProvider: workspace + notebook selection state.
          Sits inside AppStateProvider so Phase 1B can wire isWorkspaceAdmin
          from currentUser.id. Outside PlannerProvider — notebook selection
          is at the workspace tier, broader than any single planner session. */}
      <NotebookProvider>
        <PlannerProvider>
          {/* ── SERVER-SEEDED HYDRATE ────────────────────────────────────
              The planner document, read during THIS server render rather
              than ~2.5s later from the browser. Measured on production
              (scripts/probe-f3-ttu.mjs, n=5, cold): the client could not put
              the hydrate POST on the wire until 1961–2519ms — after the app
              bundle downloaded, React mounted, and the auth session
              resolved — while the server held the session cookie the whole
              time and did nothing with it.

              TWO PARTS, AND THE SPLIT IS LOAD-BEARING.
              • <PlannerSeedGate> never suspends, so it ships in the FIRST
                flush and its render announces "a seed is coming" before the
                store's hydrate effect runs and decides to fetch one.
              • <PlannerServerSeed> awaits the database, so it MUST sit
                behind <Suspense> — otherwise the whole document would block
                on the read and the browser could not start downloading JS
                until it finished, which is the serialisation this is
                removing, relocated to the server.

              Neither renders DOM. `fallback={null}` is the honest fallback:
              there is nothing to show a placeholder FOR, and the surfaces
              below already render their own loading state from the store's
              `hydration` lifecycle. Nothing about what a teacher sees while
              waiting changes — only how long they wait.

              The store is untouched: the seed is collected inside
              `loadPlannerHydrateBundle` (lib/planner/client.ts), the call the
              store already makes. Flag OFF (the mock path) the seed resolves
              `{ ok: false }` immediately and everything below is unchanged. */}
          {PLANNER_SERVER_SEED_ENABLED ? (
            <>
              <PlannerSeedGate renderId={seedRenderId} />
              <Suspense fallback={null}>
                <PlannerServerSeed renderId={seedRenderId} />
              </Suspense>
            </>
          ) : null}
          {/* UnitNotesProvider hosts per-unit "Don't miss" callout persistence.
              No seeds needed here — SubjectView reads from the live mock unit
              data; any saved notes come from localStorage post-mount.
              CatchupProvider hosts the three-layer Catch-up control state
              (planning-doc §1262) — the global on/off flag, per-week
              dismissals, and per-item action overlays.
              ConsequenceToastProvider hosts the W2-B8 toast surface so
              team-scoped settings can fire a transient confirmation
              naming the team-wide effect.
              UndoToastProvider hosts the roadmap-02 undo toast for
              personal planner gestures (move / complete / first fork /
              revert) and confirmation-only moments ("Link copied"). */}
          <ConsequenceToastProvider>
            <UndoToastProvider>
              <UnitNotesProvider>
                <CatchupProvider>
                  {/* EditModeProvider (W3.8b) hosts the per-view View↔Edit UI
                      mode (the bundle's cc_editmode map — NOT app-state's
                      forking editMode; same word, unrelated axis). It must
                      sit ABOVE both the SideNav (a force-reset writer) and
                      the ChromeShell subtree (the toggle writer + the botbar
                      reader + the Day-edit view) so every consumer shares
                      ONE live instance — the weekly-schedule-state desync
                      lesson (lib/edit-mode-state.tsx header). */}
                  <EditModeProvider>
                    {/* The singleton overlay engines — the Shared Composer
                        (B4.0) and the global unit workspace (B5.1). Innermost
                        so their hosts have usePlanner + the toast contexts, and
                        so both wrap `children` for useComposer() /
                        useUnitWorkspace() callers. See PlannerOverlayProviders
                        above. */}
                    <PlannerOverlayProviders>
                      {/* Skip-to-content (A11Y-004) — must be the first focusable element
                  in the DOM so keyboard users reach it before the top-bar chrome. */}
                      <a href="#main-content" className={styles.skipLink}>
                        Skip to content
                      </a>
                      <div
                        className="cp-root"
                        style={{
                          flex: 1,
                          minHeight: 0,
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* Global keyboard shortcuts, ⌘K palette, and ? overlay.
                    Mounted as a client leaf so the layout stays a Server Component. */}
                        <GlobalShortcuts />
                        {/* Remembers the active planner route so the Settings X /
                    Escape can return the teacher exactly where they left. */}
                        <LastRouteRecorder />
                        {/* First-run activation gate: bounces a teacher who has not
                    completed onboarding into the wizard. Render-nothing leaf;
                    it redirects ONLY on a resolved "needs onboarding" (never on
                    an unresolved/unknown server read), so it can't flash-bounce
                    or race the bypass login, and /onboarding lives outside this
                    group so no loop is possible. */}
                        <FirstRunRedirect />
                        {/* Roadmap-02 undo-toast bridge: a render-nothing client
                    leaf that watches the planner store's lastChange and fires
                    the undo toast for every undoable gesture (move /
                    completion / first fork / revert). Must sit inside BOTH
                    PlannerProvider and UndoToastProvider. */}
                        <UndoToastBridge />
                        {/* Sibling leaf, same contract: watches the store's
                    lastWriteFailure signal and tells the teacher when a write
                    did NOT save. Without it a failed write — most sharply an
                    RLS-denied Team Curriculum edit — leaves the optimistic
                    value on screen and vanishes on the next reload, with the
                    only trace in the console. Must sit inside BOTH
                    PlannerProvider and ConsequenceToastProvider. */}
                        <WriteFailureBridge />
                        {/* W3.3 shell: the v2 corner-grammar chrome (ChromeShell —
                    Framework §3 overlay grid: ChromeTopBar with brand +
                    Personal/Team icon toggle + bell · routed content in the
                    middle row · ctx BL + clock BR + quote bottom-center; with
                    the §9b immersive branch for /planner /post /teach). It
                    REPLACES the v1.3 TopBar and the red MasterBanner — team
                    mode now signals via the pink [data-mode="team"] glow
                    (CLAUDE.md §2), which ChromeShell mirrors onto <html>.

                    SIDENAV RETIREMENT (v2-path only): the left rail was a W3.4
                    interim nav for the surfaces the console didn't yet cover.
                    Those destinations are now re-homed — the six-tab console
                    (Day·Week·Year·Plan·Post·Teach) is app-wide, Catch-up/
                    Schedule/Archive/Settings live in the top-bar Tools popover,
                    the account menu is a top-bar avatar, and the workspace/
                    notebook switcher is the interactive botbar context chip —
                    so the v2 path renders NO SideNav (the corner grammar itself
                    carries the nav). The `!V2` branch below KEEPS the rail
                    byte-identically for the rollback build; SideNav.* is NOT
                    deleted. The content column is position:relative so the
                    absolute .overlay grid fills its area (right of the rail
                    under v1; the full width under v2). Teach remains a separate
                    route group with its own chrome. */}
                        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                          {!V2 && <SideNav />}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              minHeight: 0,
                              position: "relative",
                            }}
                          >
                            <PlannerChrome>
                              {/* minWidth:0 replicates `.overlay > * { min-width: 0 }`
                                (app/chrome.css) so the flag-OFF branch, which has
                                no `.overlay` ancestor, keeps /daily's h-scroll
                                containment. Harmless and identical under flag-ON.
                                (§4a M1) */}
                              <div
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  minHeight: 0,
                                  display: "flex",
                                }}
                              >
                                <main
                                  id="main-content"
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    minHeight: 0,
                                    overflow: "auto",
                                  }}
                                >
                                  {children}
                                </main>
                                <RightPanel />
                              </div>
                            </PlannerChrome>
                          </div>
                        </div>
                      </div>
                    </PlannerOverlayProviders>
                  </EditModeProvider>
                </CatchupProvider>
              </UnitNotesProvider>
            </UndoToastProvider>
          </ConsequenceToastProvider>
        </PlannerProvider>
      </NotebookProvider>
    </AppStateProvider>
  );
}
