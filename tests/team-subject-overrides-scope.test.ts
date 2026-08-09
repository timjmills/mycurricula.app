import { describe, it, expect, afterEach } from "vitest";
import { createElement, useLayoutEffect, useState, type ReactNode } from "react";

import { mountReact } from "./mount-react";
import { NotebookProvider, useNotebookState } from "@/lib/notebook-state";
import {
  loadTeamSubjectOverrides,
  teamSubjectOverridesStorageKey,
  useSubjectOverrides,
} from "@/lib/use-subject-settings";

// The TEAM subject-override key (`mycurricula:team:subject-overrides`) was
// FLAT, i.e. browser-GLOBAL: one value for every notebook and every workspace
// on the machine. Renaming "Explorers" or archiving "UFLI" in one notebook
// renamed and archived it in all of them.
//
// That is the same defect the ORDER key was fixed for (tests/team-subject-
// order.test.ts), with a worse symptom: order is arrangement, but an override
// changes what a subject is CALLED and whether it appears on the roster at
// all.
//
// The first block below is the PROOF, and it is deliberately a real mount
// rather than an assertion about the storage helper. The leak lived in an
// EFFECT — the hook read one key on mount and never re-read on a notebook
// switch — and effects do not run under `react-dom/server`. A pure-function
// test written after the fix could only assert that the new helper does what
// it was just written to do; this one fails against the pre-fix hook, because
// the pre-fix hook genuinely shows notebook A's rename while notebook B is
// active. Verified, not assumed: re-pointing the hook at the flat key and
// re-running this file fails at line ~125 with
//   AssertionError: expected 'Numeracy' to be ''
// i.e. notebook B rendering the rename made in notebook A.
//
// Every mount block here has been checked the same way — by mutating the
// behaviour out and confirming the assertion goes red, not by assuming it
// would. A test that has only ever been seen green proves nothing about the
// bug it claims to cover:
//   • flat key                → 'Numeracy' where '' was expected (above);
//   • state not key-bound     → notebook A's rename PERSISTED under B's key
//                               ({ math: { name: 'Numeracy' }, … } where only
//                               { grammar: { archived: true } } was expected);
//   • same-tab channel unkeyed → beta rendered alpha's rename.

// Two ACTIVE notebooks. The provider's mock list ships only one (`g5`), and a
// one-notebook fixture cannot express a cross-notebook leak at all — the
// injection prop exists for exactly this.
const NOTEBOOKS = [
  { gradeLevelId: "nb-alpha", name: "Grade 5", isActive: true },
  { gradeLevelId: "nb-beta", name: "Grade 6", isActive: true },
] as const;

/**
 * Reports the override state for the ACTIVE notebook, and exposes the two
 * mutations the leak is visible through. Every value is rendered as an
 * attribute so an assertion reads the DOM rather than the hook's internals.
 */
function Probe(): ReactNode {
  const { activeNotebookId, setActiveNotebookId } = useNotebookState();
  const { overrides, updateOverride } = useSubjectOverrides();
  return createElement(
    "div",
    null,
    createElement("span", {
      "data-probe": "state",
      "data-scope": activeNotebookId,
      "data-math-name": overrides.math?.name ?? "",
      "data-reading-archived": String(overrides.reading?.archived === true),
    }),
    // The same value again, as TEXT. Load-bearing for the hydration test
    // below and for no other block: React 19 does NOT route a mismatched
    // `data-*` ATTRIBUTE through onRecoverableError — it keeps the server's
    // value silently — so an attribute-only probe makes the hydration-error
    // channel untestable (measured, not assumed: the hydration-unsafe
    // counterfactual left `recoverable` empty). Text content IS reported.
    createElement(
      "span",
      { "data-probe": "math-text" },
      overrides.math?.name ?? "(none)",
    ),
    createElement(
      "button",
      {
        "data-act": "rename",
        onClick: () => updateOverride("math", { name: "Numeracy" }),
      },
      "rename",
    ),
    createElement(
      "button",
      {
        "data-act": "archive",
        onClick: () => updateOverride("reading", { archived: true }),
      },
      "archive",
    ),
    createElement(
      "button",
      {
        "data-act": "switch",
        onClick: () =>
          setActiveNotebookId(
            activeNotebookId === NOTEBOOKS[0].gradeLevelId
              ? NOTEBOOKS[1].gradeLevelId
              : NOTEBOOKS[0].gradeLevelId,
          ),
      },
      "switch",
    ),
  );
}

function Root(): ReactNode {
  // `children` goes in the props object, not the variadic third argument.
  // vitest's include is `tests/**/*.test.ts`, so there is no JSX here, and
  // NotebookProviderProps declares `children` REQUIRED — which the variadic
  // createElement overload does not satisfy for the type-checker. Same form
  // tests/palette-css-injection.test.ts:58 already uses. (`react/
  // no-children-prop` flags it, but `next lint`'s default scope is
  // app/components/lib — tests are outside it, and the existing file carries
  // the identical pattern.)
  return createElement(NotebookProvider, {
    notebooks: NOTEBOOKS,
    workspaceName: "Test Workspace",
    children: createElement(Probe),
  });
}

describe("useSubjectOverrides — overrides do not leak across notebooks", () => {
  it("keeps a rename and an archive inside the notebook they were made in", async () => {
    const h = await mountReact(Root);
    try {
      await h.render({});

      const state = (): Element => {
        const el = h.query("[data-probe='state']");
        if (!el) throw new Error("probe did not render — the test is lying");
        return el;
      };
      const act = async (name: string): Promise<void> => {
        const el = h.query(`[data-act='${name}']`);
        if (!el) throw new Error(`no ${name} button — the test is lying`);
        await h.clickElement(el);
      };

      // Notebook A is the initial selection (first active notebook).
      expect(state().getAttribute("data-scope")).toBe("nb-alpha");
      await act("rename");
      await act("archive");
      expect(state().getAttribute("data-math-name")).toBe("Numeracy");
      expect(state().getAttribute("data-reading-archived")).toBe("true");

      // Switch to notebook B. THIS is the assertion the flat key failed:
      // B has never been configured, so it must show the locked defaults.
      await act("switch");
      expect(state().getAttribute("data-scope")).toBe("nb-beta");
      expect(state().getAttribute("data-math-name")).toBe("");
      expect(state().getAttribute("data-reading-archived")).toBe("false");

      // ...and B's untouched state must not have overwritten A's. A
      // re-keying bug that merely CLEARED on switch would pass the check
      // above and fail here.
      await act("switch");
      expect(state().getAttribute("data-scope")).toBe("nb-alpha");
      expect(state().getAttribute("data-math-name")).toBe("Numeracy");
      expect(state().getAttribute("data-reading-archived")).toBe("true");

      // The persisted shape backs the rendered one: A's key holds the value,
      // B's key was never written, and the bare pre-scoping key is untouched
      // by ordinary writes.
      const keyA = teamSubjectOverridesStorageKey("nb-alpha");
      const keyB = teamSubjectOverridesStorageKey("nb-beta");
      expect(h.storage.has(keyA)).toBe(true);
      expect(JSON.parse(h.storage.get(keyA) as string)).toEqual({
        math: { name: "Numeracy" },
        reading: { archived: true },
      });
      expect(h.storage.has(keyB)).toBe(false);
      expect(h.storage.has(teamSubjectOverridesStorageKey(null))).toBe(false);
    } finally {
      await h.unmount();
    }
  });
});

// ── The switch window (§4a Codex gate, Medium 1) ──────────────────────────
//
// Keying the storage and the channel is not enough on its own. React state
// SURVIVES a scope change, so between the render that resolves notebook B's
// key and the passive effect that loads it, the hook holds notebook A's map
// under B's key. A mutation dispatched in that window merged onto A's map and
// persisted it under B — the original leak, re-entering through the switch
// rather than through the key.
//
// HOW THIS REACHES THE WINDOW. `act()` flushes passive effects, so a plain
// click-to-switch followed by a click-to-mutate can never observe it: the load
// has already settled. A LAYOUT effect runs in the SAME commit as the stale
// render and BEFORE the passive load effect, which is exactly the window's
// definition — "code that runs while the component holds the new key and the
// previous scope's state". So the probe below switches and arms in one
// handler, and the armed layout effect both READS what the roster would have
// rendered in that frame and DISPATCHES a mutation from it.
//
// Not a contrivance for the harness's benefit: in a browser the same window is
// a real paint, and a teacher who clicks archive on the frame after switching
// notebooks lands in it.

/** What `overrides` reported during the stale-render frame. Module-level so
 *  the layout effect can hand it back out of the component tree. */
const observedDuringWindow: (string | null)[] = [];

function WindowProbe(): ReactNode {
  const { activeNotebookId, setActiveNotebookId } = useNotebookState();
  const { overrides, updateOverride } = useSubjectOverrides();
  const [armed, setArmed] = useState(false);

  useLayoutEffect(() => {
    if (!armed) return;
    // 1. What would the roster have painted this frame? Under the bug this is
    //    notebook A's rename while notebook B is active.
    observedDuringWindow.push(overrides.math?.name ?? null);
    // 2. Mutate from that same frame. Under the bug the write is derived from
    //    A's map and lands under B's key.
    updateOverride("grammar", { archived: true });
    setArmed(false);
    // Deliberately keyed on `armed` alone: the closure must be the one from
    // the STALE render, which is what re-running on `updateOverride` identity
    // would destroy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  return createElement(
    "div",
    null,
    createElement("span", {
      "data-probe": "state",
      "data-scope": activeNotebookId,
      "data-math-name": overrides.math?.name ?? "",
    }),
    createElement(
      "button",
      {
        "data-act": "rename",
        onClick: () => updateOverride("math", { name: "Numeracy" }),
      },
      "rename",
    ),
    createElement(
      "button",
      {
        "data-act": "switch-and-arm",
        onClick: () => {
          // Batched into one render: B's key, A's state, armed.
          setActiveNotebookId(NOTEBOOKS[1].gradeLevelId);
          setArmed(true);
        },
      },
      "switch and arm",
    ),
  );
}

function WindowRoot(): ReactNode {
  return createElement(NotebookProvider, {
    notebooks: NOTEBOOKS,
    workspaceName: "Test Workspace",
    children: createElement(WindowProbe),
  });
}

describe("useSubjectOverrides — the notebook-switch window", () => {
  it("cannot derive a write from a map loaded under another key", async () => {
    observedDuringWindow.length = 0;
    const h = await mountReact(WindowRoot);
    try {
      await h.render({});
      const act = async (name: string): Promise<void> => {
        const el = h.query(`[data-act='${name}']`);
        if (!el) throw new Error(`no ${name} button — the test is lying`);
        await h.clickElement(el);
      };

      await act("rename"); // notebook A gets a rename
      await act("switch-and-arm"); // switch to B + mutate inside the window

      const keyA = teamSubjectOverridesStorageKey("nb-alpha");
      const keyB = teamSubjectOverridesStorageKey("nb-beta");
      const storedB = JSON.parse(h.storage.get(keyB) as string);

      // THE ASSERTION. B's persisted value must contain only the mutation
      // made under B — never A's rename carried across on stale state.
      expect(storedB).toEqual({ grammar: { archived: true } });
      // The mutation is not silently dropped either: refusing to write would
      // also satisfy the line above, and losing a teacher's click is its own
      // bug.
      expect(storedB.grammar.archived).toBe(true);
      // A is untouched by B's write.
      expect(JSON.parse(h.storage.get(keyA) as string)).toEqual({
        math: { name: "Numeracy" },
      });

      // And the frame itself did not LIE: the roster reported nothing for B
      // rather than A's rename. (Reported once — the effect disarms itself.)
      expect(observedDuringWindow).toEqual([null]);
    } finally {
      await h.unmount();
    }
  });
});

// ── Two instances, one tab ────────────────────────────────────────────────
//
// Settings → Subjects mounts several instances at once (one per card, plus
// the one inside useVisibleSubjects). Two cases matter and they pull in
// opposite directions: instances in the SAME scope must converge (including
// through the legacy migration, where the first to run deletes the bare key
// out from under the second), and instances in DIFFERENT scopes must not hear
// each other at all.

function TwoInOneScope(): ReactNode {
  const a = useSubjectOverrides();
  const b = useSubjectOverrides();
  return createElement(
    "div",
    null,
    createElement("span", {
      "data-inst": "a",
      "data-math-name": a.overrides.math?.name ?? "",
    }),
    createElement("span", {
      "data-inst": "b",
      "data-math-name": b.overrides.math?.name ?? "",
    }),
    createElement(
      "button",
      {
        "data-act": "rename-from-a",
        onClick: () => a.updateOverride("math", { name: "Numeracy" }),
      },
      "rename",
    ),
  );
}

function SameScopeRoot(): ReactNode {
  return createElement(NotebookProvider, {
    notebooks: [NOTEBOOKS[0]],
    workspaceName: "Test Workspace",
    children: createElement(TwoInOneScope),
  });
}

/** Two providers side by side, each owning ONE notebook, so the tree really
 *  does hold two live scopes at once — the only way to exercise a channel
 *  message crossing a scope boundary inside a single tab. */
function TwoScopesRoot(): ReactNode {
  return createElement(
    "div",
    null,
    createElement(NotebookProvider, {
      key: "alpha",
      notebooks: [NOTEBOOKS[0]],
      workspaceName: "W",
      children: createElement(ScopeProbe, { label: "alpha" }),
    }),
    createElement(NotebookProvider, {
      key: "beta",
      notebooks: [NOTEBOOKS[1]],
      workspaceName: "W",
      children: createElement(ScopeProbe, { label: "beta" }),
    }),
  );
}

function ScopeProbe({ label }: { label: string }): ReactNode {
  const { activeNotebookId } = useNotebookState();
  const { overrides, updateOverride } = useSubjectOverrides();
  return createElement(
    "span",
    null,
    createElement("span", {
      "data-scope-probe": label,
      "data-notebook": activeNotebookId,
      "data-math-name": overrides.math?.name ?? "",
    }),
    createElement(
      "button",
      {
        "data-act": `rename-${label}`,
        onClick: () => updateOverride("math", { name: `Renamed by ${label}` }),
      },
      "rename",
    ),
  );
}

describe("useSubjectOverrides — several instances in one tab", () => {
  it("converges two same-scope instances through the legacy migration", async () => {
    const h = await mountReact(SameScopeRoot);
    try {
      // Seed BEFORE the first render so both instances mount against a
      // pre-scoping value. Whichever runs first claims it and deletes the
      // bare key; the second must still end up with the same map rather
      // than the empty default it would read from a key that just vanished.
      h.storage.set(
        teamSubjectOverridesStorageKey(null),
        JSON.stringify({ math: { name: "Legacy" } }),
      );
      await h.render({});

      const names = h
        .queryAll("[data-inst]")
        .map((el) => el.getAttribute("data-math-name"));
      expect(names).toEqual(["Legacy", "Legacy"]);
      expect(h.storage.has(teamSubjectOverridesStorageKey(null))).toBe(false);

      // A write from one instance reaches the other through the same-tab
      // channel — no reload, no storage event (which fires cross-tab only).
      const btn = h.query("[data-act='rename-from-a']");
      if (!btn) throw new Error("no rename button — the test is lying");
      await h.clickElement(btn);
      expect(
        h.queryAll("[data-inst]").map((el) => el.getAttribute("data-math-name")),
      ).toEqual(["Numeracy", "Numeracy"]);
    } finally {
      await h.unmount();
    }
  });

  it("does not deliver a channel message across a scope boundary", async () => {
    const h = await mountReact(TwoScopesRoot);
    try {
      await h.render({});
      expect(
        h.queryAll("[data-scope-probe]").map((el) => [
          el.getAttribute("data-scope-probe"),
          el.getAttribute("data-notebook"),
        ]),
      ).toEqual([
        ["alpha", "nb-alpha"],
        ["beta", "nb-beta"],
      ]);

      const btn = h.query("[data-act='rename-alpha']");
      if (!btn) throw new Error("no rename button — the test is lying");
      await h.clickElement(btn);

      // alpha hears its own write; beta must not — the channel is keyed.
      const byLabel = Object.fromEntries(
        h
          .queryAll("[data-scope-probe]")
          .map((el) => [
            el.getAttribute("data-scope-probe"),
            el.getAttribute("data-math-name"),
          ]),
      );
      expect(byLabel).toEqual({ alpha: "Renamed by alpha", beta: "" });
      expect(h.storage.has(teamSubjectOverridesStorageKey("nb-beta"))).toBe(
        false,
      );
    } finally {
      await h.unmount();
    }
  });
});

// ── SSR → hydrate ─────────────────────────────────────────────────────────
//
// The first version of this block called `renderToStaticMarkup` with no
// `window` and asserted the markup carried defaults. That proves almost
// nothing: with no `window` the hook COULD NOT reach localStorage even if it
// tried, so the assertion cannot tell "correctly guarded" from "unreachable",
// and it would pass even if the client's first render disagreed with the
// server's — the exact defect the coverage claims to catch. It is replaced
// here with a real hydration, which does distinguish them.
//
// WHAT MAKES IT REAL: storage is populated with this scope's overrides BEFORE
// hydration. React then hydrates the server's default markup against the
// client's first render. If the hook read storage in its useState initializer,
// the client's first render would say "Numeracy" where the server said "" and
// React would report a recoverable hydration error. The contract is that the
// stored value arrives only in the post-mount effect, so hydration is silent
// and the value appears on the NEXT commit — both of which are asserted.
//
// `hydrateRoot` over linkedom IS reachable (checked, not assumed — the same
// question mount-react answered for `createRoot`).

const REACT_GLOBAL_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
  "navigator",
  "getComputedStyle",
] as const;

describe("useSubjectOverrides — SSR then hydrate", () => {
  it("hydrates the server's defaults without a mismatch, then applies the scoped value", async () => {
    const { renderToString } = await import("react-dom/server");
    // Rendered with NO window in scope — a genuine server pass.
    const serverHtml = renderToString(createElement(Root));
    expect(serverHtml).toContain('data-math-name=""');

    const { parseHTML } = await import("linkedom");
    const dom = parseHTML(
      `<!doctype html><html><body><div id="root">${serverHtml}</div></body></html>`,
    );
    const g = globalThis as unknown as Record<string, unknown>;
    const w = dom.window as unknown as Record<string, unknown>;
    const saved = new Map(
      REACT_GLOBAL_KEYS.map((k) => [
        k,
        Object.getOwnPropertyDescriptor(globalThis, k),
      ]),
    );

    const store = new Map<string, string>([
      // THE POINT: this scope's overrides are already on disk before the
      // client starts. A hook that reads them too early mismatches.
      [
        teamSubjectOverridesStorageKey("nb-alpha"),
        JSON.stringify({ math: { name: "Numeracy" } }),
      ],
    ]);
    w.location = { protocol: "http:", href: "http://localhost/" };
    w.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    w.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    };
    g.window = dom.window;
    g.document = dom.document;
    g.HTMLElement = dom.HTMLElement;
    g.Element = dom.Element;
    g.Node = dom.Node;
    g.MutationObserver = dom.MutationObserver;
    g.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number;
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
    g.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, "navigator", {
      value: dom.navigator,
      configurable: true,
    });

    const recoverable: string[] = [];
    try {
      const { hydrateRoot } = await import("react-dom/client");
      const { act } = await import("react");
      const container = dom.document.getElementById(
        "root",
      ) as unknown as HTMLElement;

      let root: { unmount: () => void } | null = null;
      await act(async () => {
        root = hydrateRoot(container, createElement(Root), {
          // React routes hydration mismatches here rather than throwing.
          onRecoverableError: (err: unknown) =>
            recoverable.push(String((err as Error)?.message ?? err)),
        });
      });

      // 1. Hydration was silent — server markup and first client render
      //    agree. Asserted against the TEXT probe's channel, which React
      //    actually reports; see the note on `data-probe="math-text"`.
      expect(recoverable).toEqual([]);
      // 2. And the stored value DID arrive, post-mount. Without this the test
      //    would pass against a hook that simply never reads storage at all.
      expect(
        container
          .querySelector("[data-probe='state']")
          ?.getAttribute("data-math-name"),
      ).toBe("Numeracy");
      expect(
        container.querySelector("[data-probe='math-text']")?.textContent,
      ).toBe("Numeracy");

      await act(async () => {
        root?.unmount();
      });
    } finally {
      for (const [k, desc] of saved) {
        if (desc) Object.defineProperty(globalThis, k, desc);
        else delete (globalThis as unknown as Record<string, unknown>)[k];
      }
    }
  });
});

describe("teamSubjectOverridesStorageKey — the scoping rule", () => {
  const BASE = "mycurricula:team:subject-overrides";

  it("falls back to the bare base key for null / undefined / empty scope", () => {
    // Empty string matters: on the MULTI_WORKSPACE ON path the notebook id is
    // "" while identity is still loading — that window must degrade to the
    // legacy base key, never write "…:" (a junk scope).
    expect(teamSubjectOverridesStorageKey(null)).toBe(BASE);
    expect(teamSubjectOverridesStorageKey(undefined)).toBe(BASE);
    expect(teamSubjectOverridesStorageKey("")).toBe(BASE);
  });

  it("gives two notebooks two distinct keys (the isolation property)", () => {
    expect(teamSubjectOverridesStorageKey("g5")).toBe(`${BASE}:g5`);
    expect(teamSubjectOverridesStorageKey("g5")).not.toBe(
      teamSubjectOverridesStorageKey("g6"),
    );
  });
});

// ── The pre-scoping migration ─────────────────────────────────────────────
//
// Same shape as the order key's, and pinned for the same reason: the first
// version of THAT fallback was described as "read-once" while being read once
// per SCOPE, which re-created the very leak the scoping removed. These pin
// that the first notebook to meet the legacy value CLAIMS it.

const BASE_KEY = teamSubjectOverridesStorageKey(null);
const KEY_A = teamSubjectOverridesStorageKey("notebook-a");
const KEY_B = teamSubjectOverridesStorageKey("notebook-b");
const LEGACY = { math: { name: "Numeracy" }, reading: { archived: true } };

/** Minimal localStorage over a Map — the module reads `window.localStorage`
 *  at call time, so installing it on globalThis is enough in the node env. */
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

describe("loadTeamSubjectOverrides — the pre-scoping legacy migration", () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("surfaces the legacy overrides in the first notebook that asks", () => {
    installStorage({ [BASE_KEY]: JSON.stringify(LEGACY) });
    expect(loadTeamSubjectOverrides(KEY_A)).toEqual(LEGACY);
  });

  it("CLAIMS them — writes to the notebook's own key and drops the bare one", () => {
    const store = installStorage({ [BASE_KEY]: JSON.stringify(LEGACY) });
    loadTeamSubjectOverrides(KEY_A);
    expect(store.has(BASE_KEY)).toBe(false);
    // Written BEFORE the delete: the value survives the migration.
    expect(JSON.parse(store.get(KEY_A) as string)).toEqual(LEGACY);
  });

  it("does NOT leak into a second notebook — the bug this exists for", () => {
    installStorage({ [BASE_KEY]: JSON.stringify(LEGACY) });
    loadTeamSubjectOverrides(KEY_A); // A claims it
    expect(loadTeamSubjectOverrides(KEY_B)).toEqual({});
  });

  it("leaves an existing scoped value alone and never consults the bare key", () => {
    const own = { writing: { archived: true } };
    const store = installStorage({
      [BASE_KEY]: JSON.stringify(LEGACY),
      [KEY_A]: JSON.stringify(own),
    });
    expect(loadTeamSubjectOverrides(KEY_A)).toEqual(own);
    // Untouched: only a notebook with NO overrides of its own may claim it.
    expect(store.has(BASE_KEY)).toBe(true);
  });

  it("keeps the legacy key when the scoped write FAILS (quota / private mode)", () => {
    // The dangerous interleaving: setItem throws, removeItem succeeds.
    // Deleting regardless would trade a cosmetic leak for real data loss —
    // the team's only saved renames, gone.
    const map = new Map<string, string>([[BASE_KEY, JSON.stringify(LEGACY)]]);
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: (k: string) => void map.delete(k),
      },
    };

    // The caller still gets the right map in memory...
    expect(loadTeamSubjectOverrides(KEY_A)).toEqual(LEGACY);
    // ...and the only persisted copy survives.
    expect(map.has(BASE_KEY)).toBe(true);
  });

  it("seeds a fresh scope from onboarding — but only its academic flags", () => {
    // The onboarding key is the teacher's SETUP answers, not another
    // notebook's configuration, and only `isAcademic: false` is lifted from
    // it. So unlike the legacy key it is a legitimate per-scope default and
    // is deliberately NOT claim-and-deleted.
    const store = installStorage({
      "mycurricula:onboarding": JSON.stringify({
        data: { subjects: [{ id: "sel", isAcademic: false }] },
      }),
    });
    expect(loadTeamSubjectOverrides(KEY_A)).toEqual({
      sel: { isAcademic: false },
    });
    expect(loadTeamSubjectOverrides(KEY_B)).toEqual({
      sel: { isAcademic: false },
    });
    // Seeded once per scope — the scoped key IS the already-seeded marker.
    expect(store.has(KEY_A)).toBe(true);
    expect(store.has(KEY_B)).toBe(true);
  });

  it("returns an empty map when nothing is stored anywhere", () => {
    installStorage();
    expect(loadTeamSubjectOverrides(KEY_A)).toEqual({});
  });
});
