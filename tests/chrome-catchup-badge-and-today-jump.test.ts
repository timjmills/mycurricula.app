import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Two orphaned affordances, restored — and the tests that keep them mounted.
//
// Both losses were found by a reachability sweep, and both had the SAME shape:
// the code still existed, compiled, and type-checked; only the JSX that mounted
// it was gone. No render test on any surface goes red for that, because the
// component under test is simply never asked to render. So the assertions here
// are deliberately of two kinds:
//
//   • BEHAVIOUR — the restored control renders what it promises, and (for the
//     catch-up badge) does NOT render when it has nothing to say.
//   • REACHABILITY — the mount site itself. A behavioural test of
//     <TodayJumpButton> in isolation stayed green for the entire period the
//     button had zero mount sites, which is exactly how the affordance was lost
//     without a single failing test. Asserting the host's source is the only
//     assertion that would have caught it.

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// Comments stripped before any structural regex runs. Without this a mount
// wrapped in a JSX comment — which is EXACTLY the state DailyView was found in,
// TodayJumpButton surviving only as prose at :201 and :606 — reads as a live
// mount and the assertion fails open.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── Mutable store state the mocks below read ───────────────────────────────
// vi.mock factories are hoisted above the file body, so the state they close
// over has to be hoisted with them.
const store = vi.hoisted(() => ({
  lessons: [] as { id: string; week: number; status: string; archived: boolean }[],
  catchupEnabled: true,
  week: 3,
  currentWeek: 3,
  selectedDay: 0,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/daily",
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
    week: store.week,
    currentWeek: store.currentWeek,
    selectedDay: store.selectedDay,
    setWeek: () => {},
    setSelectedDay: () => {},
    currentUser: { id: "u1", name: "Tess Teacher", initials: "TT" },
    editMode: "personal",
    setEditMode: () => {},
  }),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({ lessons: store.lessons }),
}));

vi.mock("@/lib/catchup-state", () => ({
  useCatchup: () => ({ enabled: store.catchupEnabled, actions: new Map() }),
}));

// next/link (under TransitionLink) prefetches through requestIdleCallback,
// which reads `self` — absent under vitest's node environment, and it throws
// out of the mount effect rather than degrading. Nothing here asserts a link's
// behaviour; the views row only has to render.
vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href?: string }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/lib/use-school-week", () => ({
  useSchoolWeek: () => ({ days: ["sun", "mon", "tue", "wed", "thu"] }),
}));

const lesson = (
  id: string,
  status: "todo" | "done",
  week = 1,
): { id: string; week: number; status: string; archived: boolean } => ({
  id,
  week,
  status,
  archived: false,
});

async function renderTools(): Promise<string> {
  const { renderToString } = await import("react-dom/server");
  const { ChromeToolsMenu } = await import(
    "@/components/chrome/ChromeToolsMenu"
  );
  return renderToString(createElement(ChromeToolsMenu));
}

beforeEach(() => {
  store.lessons = [];
  store.catchupEnabled = true;
  store.week = 3;
  store.currentWeek = 3;
  store.selectedDay = 0;
});

// ── A. The catch-up ambient signal ─────────────────────────────────────────
// The year-wide COUNT was never lost — CatchUpModal has rendered it in its own
// header throughout. What was lost when the v1 top bar retired is that the
// number stopped reaching a teacher who had not already gone looking for it.
// So the thing under test is not "a count exists" but "it is visible without
// being asked for, and it stays silent when there is nothing to say".

describe("the Tools menu's catch-up signal", () => {
  it("shows the count on the Catch-up item once the popover is OPEN", async () => {
    // A real mount, not a server string: the popover only exists after a click,
    // and `renderToString` cannot click. Asserting the closed markup instead
    // would have been a test that can never see the thing it names.
    store.lessons = [
      lesson("a", "todo"),
      lesson("b", "todo"),
      lesson("c", "done"),
    ];
    const { mountReact } = await import("./mount-react");
    const { ChromeToolsMenu } = await import(
      "@/components/chrome/ChromeToolsMenu"
    );
    const h = await mountReact(ChromeToolsMenu);
    try {
      await h.render({});
      expect(h.query(".toolcount"), "the popover was open before it was opened")
        .toBeNull();

      await h.click((el) => el.getAttribute("aria-label")?.startsWith("Tools") ?? false);

      const count = h.query(".toolcount");
      expect(count, "the Catch-up item carries no count pill").not.toBeNull();
      expect(count?.textContent).toBe("2");
      // On the item that says what it counts — not floating in the popover.
      expect(
        count?.closest("button")?.textContent,
        "the count pill is not inside the Catch-up control",
      ).toContain("Catch-up");
    } finally {
      await h.unmount();
    }
  });

  it("puts a dot on the CLOSED trigger — otherwise nothing reaches the teacher unprompted", async () => {
    // The whole loss being repaired. A badge that only exists inside the
    // popover is seen by exactly the teachers who already suspected there was
    // something to see, which is the state this restoration started from.
    store.lessons = [lesson("a", "todo")];
    const html = await renderTools();

    expect(html).toContain('class="toolsdot"');
    // The popover is closed on first render, so the count itself is not in the
    // document — proving the dot is carrying the signal on its own.
    expect(html).not.toContain('class="toolcount"');
  });

  it("carries the fact in the accessible name, not only in a coloured dot", async () => {
    store.lessons = [lesson("a", "todo")];
    const html = await renderTools();
    expect(html).toContain('aria-label="Tools — 1 lesson not covered"');
  });

  it("says nothing at all when nothing is uncovered", async () => {
    // A badge reading "0" costs a glance and teaches nothing.
    store.lessons = [lesson("a", "done"), lesson("b", "done")];
    const html = await renderTools();

    expect(html).not.toContain("toolsdot");
    expect(html).not.toContain("toolcount");
    expect(html).toContain('aria-label="Tools"');
  });

  it("says nothing when the teacher switched Catch-up off", async () => {
    store.lessons = [lesson("a", "todo"), lesson("b", "todo")];
    store.catchupEnabled = false;
    const html = await renderTools();

    expect(html).not.toContain("toolsdot");
    expect(html).not.toContain("toolcount");
  });

  it("counts on the BROWSED week's horizon, exactly as CatchUpModal does", async () => {
    // Both read `useAppState().week`, so paging back shrinks the badge and the
    // modal's header together. A badge on a different horizon would promise
    // rows the modal then declines to list.
    store.lessons = [lesson("a", "todo", 1), lesson("b", "todo", 9)];
    store.week = 3;
    const html = await renderTools();
    expect(html).toMatch(/aria-label="Tools — 1 lesson not covered"/);
  });

  it("reuses coverageSummary rather than counting again", async () => {
    // The failure this guards is a SECOND count drifting from the modal's.
    // lib/catchup-data states the equality outright ("Equals items.length when
    // no status filter is active"); this asserts the menu still goes through it.
    const src = stripComments(read("../components/chrome/ChromeToolsMenu.tsx"));
    expect(src).toContain("coverageSummary");
    expect(src).not.toContain("deriveCatchupItems");
  });
});

// ── B. The Day's "Today" jump ──────────────────────────────────────────────

describe("TodayJumpButton", () => {
  it("is actually MOUNTED in the live v2 Day", async () => {
    // The assertion that would have caught the loss. The component, its module
    // CSS and its SSR-safe today rule all survived intact; only this line was
    // missing, and nothing went red.
    const src = stripComments(read("../components/daily/DailyView.tsx"));
    expect(
      /<TodayJumpButton\b/.test(src),
      "components/daily/DailyView.tsx no longer mounts <TodayJumpButton/> — a teacher who pages off today has no one-tap route back, and no other test notices because the component simply stops being rendered",
    ).toBe(true);
    expect(/from "\.\/TodayJumpButton"/.test(src)).toBe(true);
  });

  it("is fed the VIEWED week/day, not the shared ones", async () => {
    // During the one paint where a `?lesson=` deep link has resolved at render
    // time but its effect has not yet moved the shared state, the two differ —
    // and a button reading the shared value would sit disabled on the very day
    // the teacher most needs the jump.
    const src = stripComments(read("../components/daily/DailyView.tsx"));
    expect(src).toMatch(/<TodayJumpButton\s+week=\{viewWeek\}\s+day=\{viewDay\}/);
  });

  it("renders disabled-neutral on the server, whatever the clock says", async () => {
    // The SSR-safety rule the component was built around: a UTC server and a
    // UTC+3 school browser must not disagree about the disabled state. The
    // clock is read in a post-mount effect, so the server HTML is always the
    // disabled one — here even though the store says we are NOT on today's
    // week, which is the case that would render ENABLED after mount.
    const { renderToString } = await import("react-dom/server");
    const { TodayJumpButton } = await import(
      "@/components/daily/TodayJumpButton"
    );
    store.week = 7;
    store.currentWeek = 3;

    const html = renderToString(createElement(TodayJumpButton));
    expect(html).toContain("Today");
    expect(html).toContain("disabled");
  });

  it("moves the DAY as well as the week", async () => {
    // The keyboard `T` shortcut (lib/use-keyboard-shortcuts.ts) only calls
    // setWeek — it lands the teacher in the right week on the wrong day. A
    // visible control that did the same would look like it worked while
    // quietly lying, which is worse than the missing button was.
    const src = stripComments(read("../components/daily/TodayJumpButton.tsx"));
    expect(src).toContain("setWeek(currentWeek)");
    expect(src).toContain("setSelectedDay(todayIdx)");
  });
});
