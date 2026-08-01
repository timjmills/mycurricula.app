import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Task #45 — the unit workspace had no Assessments tab.
//
// The v2 handoff puts Assessments in the tab strip on BOTH of its unit
// surfaces: the Planning-Hub unit workspace
// (`mockup/New v2 Site Design.bundled.html:8651` — Overview · Lessons ·
// Standards · **Assessments** · Resources · Notes) and the Unit Explorer
// (`:7573`). We shipped it as a right-hand drawer pane instead, and a teacher
// reported the missing tab by name.
//
// Three things are pinned here, because three separate things could regress:
//
//   1. THE TAB EXISTS, AND IN THE HANDOFF'S POSITION — between Standards and
//      Resources. Scraped from the real `TABS` literal in UnitExplorer.tsx.
//   2. THE TAB BODY IS THE REAL PANEL, not a placeholder that links elsewhere.
//      Rendered through `react-dom/server`.
//   3. IT MOVED, IT WAS NOT COPIED. `WorkspaceDrawerPane` no longer admits
//      "assessments", and a device that stored that pane (it was the DEFAULT
//      until now, so many have) falls back instead of reopening the drawer on
//      a pane that no longer exists.
//
// ON THE SOURCE SCRAPE (test 1). UnitExplorer mounts the whole workspace —
// planner store, app state, the composer, the shell's portal — so rendering it
// to assert one array would mock more than it measures. The array literal is
// scraped instead, the way tests/unit-refine.test.ts scrapes RefineTab's real
// `registerCell` calls. Two guards keep that instrument honest:
//   • the block match is asserted BEFORE anything is read out of it, so a
//     refactor that moves the literal fails loudly rather than matching zero
//     entries and passing;
//   • the assertion is the FULL ordered key list, not "contains assessments".
//     UnitExplorer.tsx mentions assessments in half a dozen comments; a
//     containment check over the file would pass on those alone. Only a real
//     `{ key: "assessments", … }` entry can satisfy an exact-list match.

const UNIT_EXPLORER = fileURLToPath(
  new URL("../components/year-v2/UnitExplorer.tsx", import.meta.url),
);

describe("the tab strip carries Assessments, in the handoff's position", () => {
  const src = readFileSync(UNIT_EXPLORER, "utf8");
  const block = src.match(
    /const TABS: ReadonlyArray<\{ key: TabKey; label: string \}> = \[([\s\S]*?)\n\];/,
  );

  it("finds the TABS literal at all (the instrument's own check)", () => {
    // Fail loudly if the literal has been renamed or reshaped — otherwise every
    // assertion below would read an empty list and quietly agree with it.
    expect(block).not.toBeNull();
  });

  it("lists the six shipped tabs plus Assessments, in order", () => {
    const entries = [
      ...(block?.[1] ?? "").matchAll(/\{ key: "([a-z]+)", label: "([^"]+)" \}/g),
    ];
    expect(entries.map((m) => m[1])).toEqual([
      "overview",
      "lessons",
      "refine",
      "standards",
      "assessments",
      "resources",
      "notes",
    ]);
  });

  it("puts Assessments between Standards and Resources (mockup :8651)", () => {
    const keys = [
      ...(block?.[1] ?? "").matchAll(/\{ key: "([a-z]+)", label: "([^"]+)" \}/g),
    ].map((m) => m[1]);
    expect(keys.indexOf("assessments")).toBe(keys.indexOf("standards") + 1);
    expect(keys.indexOf("assessments")).toBe(keys.indexOf("resources") - 1);
  });

  it("labels it 'Assessments'", () => {
    const label = [
      ...(block?.[1] ?? "").matchAll(/\{ key: "([a-z]+)", label: "([^"]+)" \}/g),
    ].find((m) => m[1] === "assessments")?.[2];
    expect(label).toBe("Assessments");
  });

  it("the exact-list assertion cannot be satisfied by a comment (control)", () => {
    // The file talks about assessments repeatedly outside the array. If a
    // containment check were the instrument, it would pass with the tab
    // deleted — so this records that the file is full of decoys and the
    // assertions above deliberately do not look at them.
    const mentions = src.match(/[Aa]ssessments/g) ?? [];
    expect(mentions.length).toBeGreaterThan(3);
    const insideArray = ((block?.[1] ?? "").match(/[Aa]ssessments/g) ?? [])
      .length;
    expect(insideArray).toBeLessThan(mentions.length);
  });
});

// ── 2. The tab body is the real panel ────────────────────────────────────────
//
// AssessmentsTab is a thin host over the drawer's <AssessmentsPanel>, so the
// thing worth proving is that the panel's OWN structure comes through — both
// halves, and the tab geometry — rather than a stub. `renderToStaticMarkup`
// runs no effects, so `UnitAssessments` paints its pre-read state and never
// touches `plannerClient`; that is exactly the surface under test here.

const store = {
  editLesson: () => {},
};

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => store,
  usePlannerDataState: () => "settled",
}));

// The panel reads `editMode` to say whether an edit lands on the team's plan or
// the teacher's copy; the real provider is a context a static render cannot
// mount.
vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({ editMode: "personal", currentUser: { id: "t1" } }),
}));

const LESSON = {
  id: "l1",
  title: "Fractions on a number line",
  unit: "u-m3",
  week: 12,
  day: "sun",
  subject: "math",
  assessment: {
    kind: "formative",
    title: "Fractions exit ticket",
  },
} as unknown as import("@/lib/types").Lesson;

// Loaded once in `beforeAll`: the first import of this subtree costs several
// seconds of transform (the panel pulls in the whole ui barrel), which would
// otherwise land inside — and blow — the first test's 5s budget.
let AssessmentsTab: typeof import("@/components/year-v2/unit-tabs/AssessmentsTab").AssessmentsTab;

function renderTab(lessons: readonly unknown[]): string {
  return renderToStaticMarkup(
    createElement(AssessmentsTab, {
      unitId: "u-m3",
      lessons: lessons as readonly import("@/lib/types").Lesson[],
      onOpenLesson: () => {},
      dataState: "settled" as const,
    }),
  );
}

describe("the Assessments tab body is the real panel", () => {
  beforeAll(async () => {
    ({ AssessmentsTab } = await import(
      "@/components/year-v2/unit-tabs/AssessmentsTab"
    ));
  }, 60_000);

  it("renders BOTH halves — the unit-owned rows and the lesson roll-up", () => {
    const html = renderTab([LESSON]);
    expect(html).toContain("Unit assessments");
    expect(html).toContain("Lesson assessments");
  });

  it("shows a lesson's real assessment, not a placeholder", () => {
    const html = renderTab([LESSON]);
    expect(html).toContain("Fractions exit ticket");
    expect(html).toContain("Formative");
  });

  it("asks for the tab geometry, not the drawer's narrow column", () => {
    // The CSS split (two cards above 900px, card padding at every width) keys
    // off this attribute. Without it the tab would render the ~320px drawer
    // layout in a full-width pane.
    const html = renderTab([LESSON]);
    expect(html).toContain('data-ap-layout="tab"');
  });

  it("keeps the unit half when the unit has no lessons (positive control)", () => {
    // The unit owns assessments whether or not it has lessons yet, so an empty
    // lesson list must not blank the pane — it must blank only the roll-up.
    // This is the control for the assertions above: they would also pass on a
    // component that renders both headings unconditionally and nothing else,
    // so this one shows the lesson half really does respond to its input.
    const html = renderTab([]);
    expect(html).toContain("Unit assessments");
    expect(html).toContain("No lessons in this unit yet.");
    expect(html).not.toContain("Fractions exit ticket");
  });
});

// ── 3. The drawer pane is gone, and a stored preference survives it ──────────

describe("the drawer's Assessments pane moved rather than being copied", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to Insights when a device has the retired pane stored", async () => {
    // "assessments" was the DEFAULT pane, so this is the common case on every
    // device that ever opened the drawer — not an edge case. Left accepted, it
    // would reopen the drawer on a pane key that matches nothing: an empty
    // drawer with no tab selected.
    const store = new Map<string, string>([
      ["mycurricula:user:workspace-drawer-open", "1"],
      ["mycurricula:user:workspace-drawer-pane", "assessments"],
    ]);
    installStorage(store);
    try {
      const { readWorkspaceDrawer } = await import("@/lib/workspace-prefs");
      expect(readWorkspaceDrawer()).toEqual({ open: true, pane: "insights" });
    } finally {
      uninstallStorage();
    }
  });

  it("still honours a pane that DOES exist (positive control)", async () => {
    // Without this, the assertion above would also pass on a `readWorkspaceDrawer`
    // that had stopped reading localStorage altogether.
    const store = new Map<string, string>([
      ["mycurricula:user:workspace-drawer-open", "1"],
      ["mycurricula:user:workspace-drawer-pane", "prep"],
    ]);
    installStorage(store);
    try {
      const { readWorkspaceDrawer } = await import("@/lib/workspace-prefs");
      expect(readWorkspaceDrawer()).toEqual({ open: true, pane: "prep" });
    } finally {
      uninstallStorage();
    }
  });
});

// ── The minimum window/localStorage the pref reader needs ────────────────────
//
// vitest runs `environment: "node"`, and `readWorkspaceDrawer` returns its
// defaults unconditionally when `window` is undefined — so without a window
// installed here BOTH tests above would pass on the default alone and prove
// nothing about the stored value. Torn down in a `finally` so a later file in
// the same worker never inherits a client environment (the failure would be
// order-dependent and always toward a false green).

const GLOBAL_KEYS = ["window"] as const;
let saved: Array<[string, PropertyDescriptor | undefined]> = [];

function installStorage(store: Map<string, string>): void {
  saved = GLOBAL_KEYS.map((k) => [
    k,
    Object.getOwnPropertyDescriptor(globalThis, k),
  ]);
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
      },
    },
    configurable: true,
    writable: true,
  });
}

function uninstallStorage(): void {
  for (const [k, desc] of saved) {
    if (desc) Object.defineProperty(globalThis, k, desc);
    else delete (globalThis as unknown as Record<string, unknown>)[k];
  }
  saved = [];
}
