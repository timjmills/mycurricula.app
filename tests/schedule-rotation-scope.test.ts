import { describe, it, expect, afterEach } from "vitest";
import { createElement, useLayoutEffect, useState, type ReactNode } from "react";

import { mountReact } from "./mount-react";
import { NotebookProvider, useNotebookState } from "@/lib/notebook-state";
import {
  DEFAULT_ROTATION,
  loadScheduleRotation,
  scheduleRotationStorageKey,
  useScheduleRotation,
} from "@/lib/use-schedule-settings";
import { teamScopedKey, isScoped } from "@/lib/team-scoped-key";

// `mycurricula:team:schedule-rotation` was FLAT — one A/B pattern per browser,
// shared by every grade. USER-RULED as per-GRADE-LEVEL, so it is notebook-
// scoped on the same `activeNotebookId` seam as the subject keys (task #25).
//
// The three properties asserted here are the same three that mattered for the
// subject keys, and each is proven by its own assertion so a counterfactual
// can be attributed:
//   1. a save under one notebook does not appear under another;
//   2. a save made in the SWITCH WINDOW is not derived from the previous
//      notebook's value (React state survives a scope change);
//   3. the pre-scoping value is CLAIMED once, not offered to every notebook.
//
// Reaching the switch window needs a layout effect keyed on the notebook id:
// it runs in the commit that first carries the new key, before the passive
// load effect. A click cannot reach it — `act()` flushes passive effects, so
// the load has already settled by the time the click lands.

const NOTEBOOKS = [
  { gradeLevelId: "nb-alpha", name: "Grade 5", isActive: true },
  { gradeLevelId: "nb-beta", name: "Grade 6", isActive: true },
] as const;

const KEY_A = scheduleRotationStorageKey("nb-alpha");
const KEY_B = scheduleRotationStorageKey("nb-beta");
const BASE = scheduleRotationStorageKey(null);

/** What `rotation` READ as during the pre-load frame, from a layout effect
 *  that mutates nothing — the read-guard probe. */
const observedInWindow: string[] = [];

function Probe(): ReactNode {
  const { activeNotebookId, setActiveNotebookId } = useNotebookState();
  const { rotation, cycleLength, setRotation, setCycleLength } =
    useScheduleRotation();
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    observedInWindow.push(`${rotation}:${cycleLength}`);
    if (!armed) return;
    // Mutate from the stale frame: under the bug this merges onto notebook
    // A's rotation and persists it under B's key.
    setCycleLength(9);
    setArmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotebookId]);

  return createElement(
    "div",
    null,
    createElement("span", {
      "data-scope": activeNotebookId,
      "data-rotation": rotation,
      "data-cycle": String(cycleLength),
    }),
    createElement(
      "button",
      { "data-act": "set-cycle", onClick: () => setRotation("cycle") },
      "cycle",
    ),
    createElement(
      "button",
      { "data-act": "set-len", onClick: () => setCycleLength(7) },
      "len",
    ),
    createElement(
      "button",
      {
        "data-act": "switch",
        onClick: () => setActiveNotebookId(NOTEBOOKS[1].gradeLevelId),
      },
      "switch",
    ),
    createElement(
      "button",
      {
        "data-act": "switch-and-arm",
        onClick: () => {
          setActiveNotebookId(NOTEBOOKS[1].gradeLevelId);
          setArmed(true);
        },
      },
      "switch and arm",
    ),
  );
}

function Root(): ReactNode {
  return createElement(NotebookProvider, {
    notebooks: NOTEBOOKS,
    workspaceName: "Test Workspace",
    children: createElement(Probe),
  });
}

const click = async (
  h: Awaited<ReturnType<typeof mountReact>>,
  act: string,
): Promise<void> => {
  const el = h.query(`[data-act='${act}']`);
  if (!el) throw new Error(`no ${act} button — the test is lying`);
  await h.clickElement(el);
};

describe("useScheduleRotation — the rotation does not leak across notebooks", () => {
  it("keeps a rotation inside the notebook it was set in", async () => {
    const h = await mountReact(Root);
    try {
      await h.render({});
      await click(h, "set-cycle");
      await click(h, "set-len");
      expect(h.query("[data-rotation]")?.getAttribute("data-rotation")).toBe(
        "cycle",
      );
      expect(h.query("[data-cycle]")?.getAttribute("data-cycle")).toBe("7");

      await click(h, "switch");
      // B was never configured — it must read the DEFAULT, not A's cycle.
      expect(h.query("[data-scope]")?.getAttribute("data-scope")).toBe(
        "nb-beta",
      );
      expect(h.query("[data-rotation]")?.getAttribute("data-rotation")).toBe(
        DEFAULT_ROTATION.rotation,
      );
      expect(h.query("[data-cycle]")?.getAttribute("data-cycle")).toBe(
        String(DEFAULT_ROTATION.cycleLength),
      );

      expect(JSON.parse(h.storage.get(KEY_A) as string)).toEqual({
        rotation: "cycle",
        cycleLength: 7,
      });
      expect(h.storage.has(KEY_B)).toBe(false);
    } finally {
      await h.unmount();
    }
  });

  it("cannot derive a write from a value loaded under another key", async () => {
    const h = await mountReact(Root);
    try {
      await h.render({});
      await click(h, "set-cycle");
      await click(h, "set-len");

      // Switch and mutate inside the same commit.
      await click(h, "switch-and-arm");

      // B's stored value must carry ONLY the mutation made under B — the
      // default rotation with the new cycle length — never A's "cycle".
      expect(JSON.parse(h.storage.get(KEY_B) as string)).toEqual({
        rotation: DEFAULT_ROTATION.rotation,
        cycleLength: 9,
      });
      // The mutation is not silently dropped, and A is untouched.
      expect(JSON.parse(h.storage.get(KEY_A) as string)).toEqual({
        rotation: "cycle",
        cycleLength: 7,
      });
    } finally {
      await h.unmount();
    }
  });

  it("paints the default in the pre-load frame, not notebook A's rotation", async () => {
    observedInWindow.length = 0;
    const h = await mountReact(Root);
    try {
      await h.render({});
      await click(h, "set-cycle");
      observedInWindow.length = 0;
      await click(h, "switch"); // no mutation — only the read guard can pass this
      expect(observedInWindow).toEqual([
        `${DEFAULT_ROTATION.rotation}:${DEFAULT_ROTATION.cycleLength}`,
      ]);
      expect(observedInWindow[0]).not.toBe("cycle:4");
    } finally {
      await h.unmount();
    }
  });
});

// ── The pre-scoping migration + the key builder ───────────────────────────

function installStorage(seed: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(seed));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  };
  return map;
}

describe("scheduleRotationStorageKey / teamScopedKey", () => {
  it("degrades to the bare key for an unresolved scope", () => {
    // `""` matters: activeNotebookId really is "" while identity loads, and
    // "base:" would be a junk scope no later read could match.
    expect(scheduleRotationStorageKey(null)).toBe(BASE);
    expect(scheduleRotationStorageKey(undefined)).toBe(BASE);
    expect(scheduleRotationStorageKey("")).toBe(BASE);
    expect(isScoped("")).toBe(false);
    expect(isScoped("nb-alpha")).toBe(true);
  });

  it("gives two notebooks two distinct keys", () => {
    expect(KEY_A).not.toBe(KEY_B);
    expect(KEY_A).toBe(`${BASE}:nb-alpha`);
  });

  it("teamScopedKey keeps the base as a verbatim prefix", () => {
    // The pre-scoping entry must stay addressable for the migration, and a
    // human reading localStorage must still be able to tell what a key is.
    expect(teamScopedKey("mycurricula:team:thing", "x")).toBe(
      "mycurricula:team:thing:x",
    );
    expect(teamScopedKey("mycurricula:team:thing", null)).toBe(
      "mycurricula:team:thing",
    );
  });
});

describe("loadScheduleRotation — the pre-scoping legacy migration", () => {
  const LEGACY = { rotation: "ab" as const, cycleLength: 6 };

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("surfaces the legacy rotation in the first notebook that asks", () => {
    installStorage({ [BASE]: JSON.stringify(LEGACY) });
    expect(loadScheduleRotation(KEY_A)).toEqual(LEGACY);
  });

  it("CLAIMS it — writes it under that notebook's key and drops the bare one", () => {
    const store = installStorage({ [BASE]: JSON.stringify(LEGACY) });
    loadScheduleRotation(KEY_A);
    expect(store.has(BASE)).toBe(false);
    expect(JSON.parse(store.get(KEY_A) as string)).toEqual(LEGACY);
  });

  it("does NOT leak into a second notebook — the bug this exists for", () => {
    installStorage({ [BASE]: JSON.stringify(LEGACY) });
    loadScheduleRotation(KEY_A);
    expect(loadScheduleRotation(KEY_B)).toEqual(DEFAULT_ROTATION);
  });

  it("keeps the legacy key when the scoped write FAILS (quota / private mode)", () => {
    // setItem throws, removeItem succeeds: deleting regardless would trade a
    // cosmetic leak for real data loss.
    const map = new Map<string, string>([[BASE, JSON.stringify(LEGACY)]]);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: (k: string) => void map.delete(k),
      },
    };
    expect(loadScheduleRotation(KEY_A)).toEqual(LEGACY);
    expect(map.has(BASE)).toBe(true);
  });

  it("seeds a fresh scope from onboarding, per scope", () => {
    // Onboarding is the teacher's SETUP answers, not another notebook's
    // configuration, so it is a legitimate per-scope default and is
    // deliberately NOT claim-and-deleted.
    const store = installStorage({
      "mycurricula:onboarding": JSON.stringify({
        data: { rotation: "cycle", cycleLength: 8 },
      }),
    });
    expect(loadScheduleRotation(KEY_A)).toEqual({
      rotation: "cycle",
      cycleLength: 8,
    });
    expect(loadScheduleRotation(KEY_B)).toEqual({
      rotation: "cycle",
      cycleLength: 8,
    });
    expect(store.has(KEY_A)).toBe(true);
    expect(store.has(KEY_B)).toBe(true);
  });

  it("returns the default when nothing is stored anywhere", () => {
    installStorage();
    expect(loadScheduleRotation(KEY_A)).toEqual(DEFAULT_ROTATION);
  });
});
