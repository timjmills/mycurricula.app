import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// /teach mounts the immersive bar (audit finding A2,
// docs/audits/2026-07-31-post-teach-catchup-shell.md).
//
// WHAT WAS BROKEN. `/teach` is one of the three §9b immersive surfaces — the
// 7.21 handoff says so three times over (`source-home/compact-bar.css:1`
// "Compact top bar — Teach · Plan · Post"; `source-home/app.jsx:528`
// `compact = … (view==='Teach'||'Plan'||'Post')`; `README.md:142`) — and
// `ChromeShell.IMMERSIVE_PREFIXES` listed it. But `/teach` renders under route
// group `(teach)`, whose layout mounted data providers and never ChromeShell,
// so that entry was inert and the surface shipped with NO app chrome at all:
// no bar, no view nav, no Settings, no way back except the browser's Back.
//
// WHY THESE ASSERTIONS. The regression this guards against is not "the bar
// looks wrong" — it is "the bar silently stops being mounted", which renders
// identically to the bug it fixed and which no visual test on another route
// would catch. So the file asserts the MOUNT and the two PROVIDERS the bar's
// own contents throw without, then the rendered contract.

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// Source with comments removed, for the structural assertions below.
//
// NOT optional politeness — without it every regex in this file FAILS OPEN.
// Measured: wrapping the mount in a JSX comment left all 17 tests green,
// because the regex happily matched the commented-out tag. Both the sources
// and the stylesheets here are heavily commented, and several of those
// comments name the exact identifiers being asserted, so "the string appears
// in the file" is not evidence that the code does anything.
//
// Block comments go first (that also empties a JSX comment down to `{}`),
// then line comments. Handles CSS too — it has only the block form.
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const teachLayout = code(read("../app/(teach)/layout.tsx"));
const chromeShell = code(read("../components/chrome/ChromeShell.tsx"));
const teachLayoutCss = code(read("../app/(teach)/layout.module.css"));
const teachShellCss = code(read("../components/teach-v2/TeachV2Shell.module.css"));

// ── A. The mount ───────────────────────────────────────────────────────────

describe("/teach mounts the immersive bar", () => {
  it("the (teach) layout renders ImmersiveBarHost", () => {
    // THE headline assertion. Everything else in this file is downstream of it.
    expect(
      /<ImmersiveBarHost\b/.test(teachLayout),
      "app/(teach)/layout.tsx no longer renders <ImmersiveBarHost/> — /teach is back to having no chrome at all (audit A2), which is invisible from every other route's tests",
    ).toBe(true);
    expect(/from "@\/components\/chrome"/.test(teachLayout)).toBe(true);
  });

  it("it mounts EditModeProvider — ConsoleNav THROWS without it", () => {
    // `ConsoleNav` calls `useViewEditMode("Day")` so its Day tab can force Day
    // back to View on the click that navigates, and that hook throws outside
    // the provider rather than degrading. Dropping this provider does not
    // render a slightly-wrong bar; it takes the whole route down.
    expect(
      /<EditModeProvider>/.test(teachLayout),
      "app/(teach)/layout.tsx dropped <EditModeProvider> — ConsoleNav's useViewEditMode(\"Day\") throws outside it, so /teach would crash on render",
    ).toBe(true);
  });

  it("it mounts CatchupProvider + the Catch-Up host — the Tools item needs both", () => {
    // The bar's Tools popover dispatches CATCHUP_MODAL_TOGGLE_EVENT. Without a
    // host mounted here nothing listens and the item is a dead control; without
    // CatchupProvider the modal throws on `useCatchup()` when it does open.
    expect(/<CatchupProvider>/.test(teachLayout)).toBe(true);
    expect(/<CatchUpModalHost mount="chrome" \/>/.test(teachLayout)).toBe(true);
  });

  it("the mount is V2-gated, so the rollback build does not get TWO bars", () => {
    // On `NEXT_PUBLIC_V2=0` TeachWorkspace mounts TeachV1Zones, which renders
    // its OWN v1 TeachTopBar inside the workspace (wordmark · grade chip · view
    // tabs · help · avatar). Ungated, this layout would stack the v2 immersive
    // bar on top of that one and reserve headroom for both. Flag-ON,
    // TeachV2Shell renders no top bar at all — which is the gap being closed.
    expect(
      /\{V2 && <ImmersiveBarHost\b/.test(teachLayout),
      "the (teach) layout mounts <ImmersiveBarHost/> unconditionally — on the flag-OFF build TeachV1Zones still renders TeachTopBar, so /teach would show two stacked bars",
    ).toBe(true);
  });

  it("the clearance rides the same gate as the bar", () => {
    // Otherwise flag-OFF reserves 60px of headroom for a bar that is not there.
    expect(/styles\.barHost/.test(teachLayout)).toBe(true);
    expect(/\.barHost\s*\{[^}]*--immersbar-clear/.test(teachLayoutCss)).toBe(
      true,
    );
    // And the reserve must NOT live on the always-applied class.
    const shellRule = teachLayoutCss.match(/\.teachShell\s*\{[^}]*\}/)?.[0];
    expect(shellRule).toBeDefined();
    expect(shellRule!).not.toContain("--immersbar-clear");
  });

  it("it does NOT mount ChromeShell", () => {
    // Deliberate, and the layout header carries the measurement: ChromeShell's
    // `.overlay.immersive` is `inset:var(--frame-inset,30px); overflow:hidden`,
    // which would clip 60px off the 100dvh Teach workspace — taking the writing
    // bar with it — and would nest the Present/fullscreen escapes inside a
    // clipping, z-indexed ancestor.
    expect(/<ChromeShell/.test(teachLayout)).toBe(false);
  });

  it("Personal/Team is NOT offered on Teach", () => {
    // Bundle-verified: the mode switch belongs in the immersbar on Plan ONLY
    // (ChromeShell's IMMERSIVE_MODESW_PREFIXES = ["/planner"]). The host
    // defaults `showModeSwitch` to false, so Teach must simply not pass it —
    // asserted because passing it would be a one-word change that silently puts
    // a team-wide-write control on a projection surface.
    //
    // Matched on the JSX TAG, not the file: a bare /showModeSwitch/ over the
    // source passes right up until someone mentions the prop in a comment, and
    // then fails for a reason that has nothing to do with the rendered tree.
    // (It did exactly that on the first run — the layout header names the prop.)
    const tag = teachLayout.match(/<ImmersiveBarHost\b[^>]*\/>/)?.[0];
    expect(tag, "no self-closing <ImmersiveBarHost … /> tag found").toBeDefined();
    expect(
      tag,
      "the (teach) layout passes showModeSwitch — Personal/Team is a team-wide-write control and belongs on Plan only",
    ).not.toMatch(/showModeSwitch/);
  });
});

// ── B. One implementation, two shells ──────────────────────────────────────

describe("the bar's wiring is not duplicated", () => {
  it("ChromeShell mounts the same host rather than its own copy", () => {
    expect(/<ImmersiveBarHost\b/.test(chromeShell)).toBe(true);
  });

  it("ChromeShell no longer calls useImmersiveAutohide itself", () => {
    // The timer, the back handler's deep-link guard, and the four slot fills
    // used to live inline in ChromeShell's immersive branch — which is exactly
    // why they were unreachable from `(teach)`. If a second call reappears
    // here, the two shells have drifted apart again and /teach will quietly get
    // a different bar from /planner and /post.
    expect(
      /useImmersiveAutohide/.test(chromeShell),
      "ChromeShell calls useImmersiveAutohide again — the wiring has been re-inlined, so the (teach) group and the (planner) group no longer share one bar",
    ).toBe(false);
  });

  it("Personal/Team is still Plan-only in the shell that owns the rule", () => {
    expect(/IMMERSIVE_MODESW_PREFIXES = \["\/planner"\]/.test(chromeShell)).toBe(
      true,
    );
  });
});

// ── C. The clearance contract ──────────────────────────────────────────────

describe("the Teach workspace clears the floating bar", () => {
  it("the (teach) layout publishes a non-zero --immersbar-clear", () => {
    const m = teachLayoutCss.match(/--immersbar-clear:\s*(\d+)px/);
    expect(
      m,
      "app/(teach)/layout.module.css no longer sets --immersbar-clear — the bar is position:absolute, so the Teach board header (including Present/fullscreen) goes back under it",
    ).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    // The bar's solid controls occupy padding-top (14) + control height (44) =
    // 58px; the remaining ~22px is gradient falloff, drawn over content on
    // purpose. Measured live at 1440/768/375.
    expect(Number(m![1])).toBeGreaterThanOrEqual(58);
  });

  it("the Teach shell reserves it as padding, keeping the shell at 100dvh", () => {
    // Padding, not margin and not a smaller height: with border-box (Tailwind
    // preflight) the shell stays exactly 100dvh, which is what keeps the
    // writing bar on screen — the reason the `height: 100dvh` comment exists.
    expect(/padding-top:\s*var\(--immersbar-clear, 0px\)/.test(teachShellCss)).toBe(
      true,
    );
    expect(/height:\s*100dvh/.test(teachShellCss)).toBe(true);
  });

  it("the fallback is 0px, so the Teach shell is inert without that layout", () => {
    // Every consumption site must default to 0 — the shell must not depend on
    // a variable only one layout supplies.
    const uses = teachShellCss.match(/var\(--immersbar-clear[^)]*\)/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toContain("0px");
  });

  it("Present / true-fullscreen reclaims the reserved band", () => {
    // Present must escape the chrome entirely — the reason the (teach) route
    // group exists. The takeover is z-50 over the bar's z-40, so the reserve
    // would be a dead strip it is already covering.
    const trueFull = teachShellCss.match(/\.teach\.trueFull\s*\{[^}]*\}/)?.[0];
    expect(trueFull).toBeDefined();
    expect(
      /padding-top:\s*0/.test(trueFull!),
      ".teach.trueFull no longer zeroes padding-top — the projected board carries a dead band where the (hidden) bar used to be",
    ).toBe(true);
  });

  it("the top-anchored absolute children are pushed past the bar too", () => {
    // An abs-positioned child resolves against the PADDING box, so the reserve
    // does not move it. `.mobToggle` is the phone-tier route to the lesson
    // panel and auto-hide is OFF below 640px, so leaving it under the bar makes
    // it permanently unreachable — measured at 375 before this was added.
    expect(
      /top:\s*calc\(8px \+ var\(--immersbar-clear, 0px\)\)/.test(teachShellCss),
      ".mobToggle is no longer offset by --immersbar-clear — at 375 it sits under a bar that never auto-hides, so the lesson panel becomes unreachable on a phone",
    ).toBe(true);
  });
});

// ── C2. The board header's own touch/collision floors ──────────────────────
// Not the immersive bar, but the row directly beneath it — and the row this
// lane's clearance work moved. Guarded here so the two cannot drift apart.

describe("the board header survives a touch screen", () => {
  const coarseBlock = teachShellCss.match(
    /@media \(any-pointer: coarse\), \(max-width: 900px\) \{[\s\S]*?\n\}/,
  )?.[0];

  it("every board-header control meets the 44px touch floor", () => {
    // Measured at 375x812 and 820x1180, isMobile+hasTouch, DSF 3/2, with
    // `pointer: coarse` verified true: FIVE controls sat at 32px — Start timer,
    // Reset timer, Board settings, Expand board, Present fullscreen. The block
    // only bumped `.mobToggle`/`.zoomReset`. min-WIDTH too: they are icon-only
    // squares, so height alone leaves a 44x32 target.
    expect(coarseBlock, "the coarse-pointer block is gone or reformatted").toBeDefined();
    expect(
      /\.boardTools button \{[^}]*min-height:\s*44px/.test(coarseBlock!),
      "`.boardTools button` lost its 44px floor — the timer, settings, expand and Present controls go back to 32px on a touch screen",
    ).toBe(true);
    expect(/\.boardTools button \{[^}]*min-width:\s*44px/.test(coarseBlock!)).toBe(
      true,
    );
  });

  it("the header reserves room for the floating Lesson pill", () => {
    // `.mobToggle` is `position:absolute; right:8px`, so it sits OVER this row.
    // Measured before the reserve: 45px of overlap on the lesson title at 375,
    // and at 820 a tap at "Browse boards" centre hit-tested to the pill.
    const rule = teachShellCss.match(/\.boardHead \{[^}]*flex-wrap: wrap;[^}]*\}/)?.[0];
    expect(rule, "the <=900px .boardHead rule is gone or reformatted").toBeDefined();
    expect(
      /padding-inline-end:\s*\d+px/.test(rule!),
      "`.boardHead` lost its inline-end reserve — the floating Lesson pill goes back to covering the header's trailing control",
    ).toBe(true);
  });
});

// ── D. The chrome.css recipes survive outside `.overlay` ───────────────────

describe("the bar's bare-button recipes are not scoped to ChromeShell", () => {
  // Comment-stripped: chrome.css's own commentary quotes this selector.
  const css = code(read("../app/chrome.css"));

  it("`.ib-exit` and `.ib-peek` accept the (teach) host as their second class", () => {
    // Both need a >=2-class selector to beat `.cp-root button` (0,1,1), and
    // both used `.overlay` for it — which only ChromeShell renders. Outside it
    // the rules stopped matching: the Back control degraded to a bare chevron
    // and `.ib-peek` fell back to `position:static; display:inline-block`, an
    // in-flow 18px line box that shoved the whole workspace down the moment the
    // bar hid. `:is()` takes its most specific argument, so the cascade on
    // /planner and /post is unchanged.
    expect(
      /:is\(\.overlay, \.immersbar-host\) \.ib-exit\s*\{/.test(css),
      "`.ib-exit`'s recipe is scoped to `.overlay` again — /teach renders the bar outside it, so Back loses its glass circle",
    ).toBe(true);
    expect(
      /:is\(\.overlay, \.immersbar-host\) \.ib-peek\s*\{/.test(css),
      "`.ib-peek`'s recipe is scoped to `.overlay` again — outside it the peek tab becomes a static in-flow element that displaces the page",
    ).toBe(true);
  });

  it("the (teach) layout carries the `immersbar-host` marker those rules key on", () => {
    expect(/immersbar-host/.test(teachLayout)).toBe(true);
  });
});

// ── E. The rendered bar ────────────────────────────────────────────────────
// Rendered on `/teach` through the REAL EditModeProvider, so the provider
// requirement asserted in section A is exercised rather than described.

vi.mock("next/navigation", () => ({
  usePathname: () => "/teach",
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    refresh: () => {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    currentUser: { id: "u1", name: "Tess Teacher", initials: "TT" },
    editMode: "personal",
    setEditMode: () => {},
    // The Tools menu's catch-up count uses the BROWSED week as its horizon,
    // the same value CatchUpModal passes to the same function.
    week: 1,
  }),
}));

// The Tools menu now reads the catch-up count for its ambient badge, so this
// harness stubs the two stores that feed it. Deliberately stubs rather than
// mounting the real providers: section A already asserts — against the layout
// SOURCE — that `(teach)/layout.tsx` mounts CatchupProvider, which is where
// that guarantee belongs. Wrapping the real providers here would make this
// render test drag in the planner's whole hydration path to prove a fact the
// static assertions already prove, and a provider dropped from the layout
// would still be caught there. Zero lessons ⇒ no badge, so section E keeps
// asserting the bar's own contract without a count in the way.
vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({ lessons: [] }),
}));

vi.mock("@/lib/catchup-state", () => ({
  useCatchup: () => ({ enabled: true, actions: new Map() }),
}));

describe("the bar /teach actually renders", () => {
  it("carries Back, the view console with Teach active, Tools — and no mode switch", async () => {
    const { renderToString } = await import("react-dom/server");
    const { ImmersiveBarHost } = await import(
      "@/components/chrome/ImmersiveBarHost"
    );
    const { EditModeProvider } = await import("@/lib/edit-mode-state");

    const html = renderToString(
      createElement(EditModeProvider, null, createElement(ImmersiveBarHost)),
    );

    // The bar itself, and the Back control the surface had no equivalent of.
    expect(html).toContain('class="immersbar"');
    expect(html).toContain('class="ib-exit"');
    // The six-tab console — the thing whose absence meant a teacher on /teach
    // could not reach Day, Week or Year at all.
    for (const word of ["Day", "Week", "Year", "Plan", "Post", "Teach"]) {
      expect(html).toContain(`>${word}<`);
    }
    // Teach reads as the current view. The tab's href is `/boards`, so a plain
    // href match lit nothing here and the console claimed the teacher was
    // nowhere; `alsoActiveOn` fixes that.
    expect(html).toMatch(/aria-current="page"[^>]*>\s*<span class="vw-word">Teach/);
    // Tools (Catch-up / Schedule / Archive / Settings) is reachable.
    expect(html).toContain('class="toolsmenu"');
    // Personal/Team is Plan-only — a team-wide-write control must not appear on
    // a projection surface.
    expect(html).not.toContain("modesw");
  });

  it("names the surface with the handoff's own title", () => {
    // `VIEW_TITLES = { … Teach:'Teach Board' }` — 7.21 source-home/app.jsx:23.
    // Not the console tab's "Teach", which is the nav word.
    const viewTitle = read("../components/chrome/ViewTitle.tsx");
    expect(viewTitle).toMatch(/\{ match: "\/teach", title: "Teach Board" \}/);
  });
});
