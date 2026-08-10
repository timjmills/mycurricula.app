import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";

// `selectedDay` opens on TODAY, not on the week's first day.
//
// WHAT THIS GUARDS. `AppStateProvider` used to seed the selected day with a
// bare `useState(0)` while seeding the WEEK from a real derivation of now. The
// planner therefore opened on the right week and the wrong day: on a Monday,
// `/daily` painted Sunday's pane and captioned it "No lessons planned for this
// day" while the strip beside it marked a lesson as happening now.
//
// It survived because nothing asserted it. `DailyView` resolves today's column
// but spends it only on EMPHASIS, and the one control that could rescue a
// teacher from the wrong day — the Day's "Today" jump — had lost its mount
// site, so there was not even a manual path back.
//
// The three properties below are the whole contract, and each has a way of
// failing that looks like success: landing on today (the fix), NOT overriding a
// teacher who has navigated (the `weekTouchedRef` precedent this mirrors), and
// staying out of the way on a non-school day rather than coercing to a
// confident wrong column.

const state = vi.hoisted(() => ({
  schoolWeek: ["sun", "mon", "tue", "wed", "thu"] as string[],
}));

// A stable array identity per configuration: `useSchoolWeek`'s real return is
// state-backed and only changes when the configuration does, and the effect
// under test keys on it. Handing back a fresh array every render would re-run
// the effect on every render and hide a missing dependency guard.
// PARTIAL mock — `lib/now-anchor` imports the real `WEEKDAY_ORDER` from this
// same module to map a Date onto a weekday token. Replacing the module wholesale
// left that export undefined and the derivation threw, which is a different
// failure wearing this test's name.
vi.mock("@/lib/use-school-week", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-school-week")>()),
  useSchoolWeek: () => ({
    days: state.schoolWeek,
    setDays: () => {},
    saveState: { status: "idle" },
  }),
}));

// AppStateProvider opens a Supabase browser client in a mount effect to resolve
// the signed-in teacher. No credentials exist under vitest and the identity is
// irrelevant here — stub it to a signed-out session.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));

beforeEach(() => {
  state.schoolWeek = ["sun", "mon", "tue", "wed", "thu"];
});

afterEach(() => {
  vi.useRealTimers();
});

/** Mount the provider around a probe that prints the selected day and exposes
 *  a button that navigates to a fixed one. */
async function mountProvider(): Promise<
  Awaited<ReturnType<typeof import("./mount-react").mountReact<object>>>
> {
  const { mountReact } = await import("./mount-react");
  const { AppStateProvider, useAppState } = await import("@/lib/app-state");

  const Probe = (): ReactNode => {
    const { selectedDay, setSelectedDay } = useAppState();
    return createElement(
      "div",
      null,
      createElement("output", { id: "day" }, String(selectedDay)),
      createElement(
        "button",
        { type: "button", onClick: () => setSelectedDay(4) },
        "navigate",
      ),
    );
  };

  const Host = (): ReactNode =>
    createElement(AppStateProvider, null, createElement(Probe));

  return mountReact(Host);
}

const dayOf = (h: { query: (s: string) => Element | null }): string | null =>
  h.query("#day")?.textContent ?? null;

describe("AppStateProvider seeds selectedDay from the clock", () => {
  it("lands on today's column in the CONFIGURED week", async () => {
    // Tuesday 2026-08-11, local time. On a Sun–Thu week that is column 2 —
    // NOT `Date.getDay()` (2 here by coincidence of Sun-first ordering), which
    // is why the next case uses a week that does not start on Sunday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 10, 0, 0));

    const h = await mountProvider();
    try {
      await h.render({});
      expect(dayOf(h)).toBe("2");
    } finally {
      await h.unmount();
    }
  });

  it("indexes the school's OWN week, not a Sun-first weekday number", async () => {
    // A Mon–Fri school. Tuesday is column 1 there, and 2 in Sun-first terms —
    // so a naive `getDay()` seed passes the case above and fails here, which is
    // the entire reason this second case exists.
    state.schoolWeek = ["mon", "tue", "wed", "thu", "fri"];
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 10, 0, 0));

    const h = await mountProvider();
    try {
      await h.render({});
      expect(dayOf(h)).toBe("1");
    } finally {
      await h.unmount();
    }
  });

  it("leaves the default alone on a NON-school day", async () => {
    // Saturday 2026-08-15 on a Sun–Thu week: there is no today column. Coercing
    // to 0 would be the same bug in a narrower window, so the derivation
    // refuses and the neutral default stands.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 10, 0, 0));

    const h = await mountProvider();
    try {
      await h.render({});
      expect(dayOf(h)).toBe("0");
    } finally {
      await h.unmount();
    }
  });

  it("never overrides a teacher who has already navigated", async () => {
    // The `weekTouchedRef` rule, applied to the day. The school week settles
    // asynchronously (SSR default → cache → server), so the derivation re-runs
    // AFTER the teacher may have moved — and must not haul them back to today.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 10, 0, 0));

    const h = await mountProvider();
    try {
      await h.render({});
      expect(dayOf(h)).toBe("2");

      await h.click((el) => el.textContent === "navigate");
      expect(dayOf(h)).toBe("4");

      // The configured week arrives from the server and the effect fires again.
      state.schoolWeek = ["sun", "mon", "tue", "wed", "thu", "fri"];
      await h.render({});
      expect(
        dayOf(h),
        "the re-derivation dragged the teacher back to today after they navigated away",
      ).toBe("4");
    } finally {
      await h.unmount();
    }
  });
});
