// tests/wall-state-parsers.test.ts — the Resource Wall's localStorage
// trust-boundary parsers (Wave 9a).
//
// The wall persists custom walls + per-section/subject backgrounds to
// localStorage, which is untrusted input (user-editable, cross-version, a future
// sync/import target). backgrounds.ts + wall-state.ts read it DEFENSIVELY —
// every record runs a validator and a bad one is DROPPED, never partially
// applied or turned into raw CSS. Those parsers are pure and node-testable but
// had zero tests; this file is that coverage.
//
// These modules are imported READ-ONLY (owned by Builder A); nothing here edits
// them. Two parsers are exported (parseWallBackground, isSafePhotoSrc) and
// tested directly; the wall/section/item parsers are module-local, so they are
// exercised through the public read path (loadCustomWalls over crafted raw
// storage) — which is the real trust boundary anyway. `cssUrl` (backgrounds.ts)
// is module-local and cannot be unit-tested in isolation (flagged to the team);
// its escaping is belt-and-suspenders behind isSafePhotoSrc, which IS tested to
// reject every break-out payload before cssUrl could ever see it.
//
// STORAGE SHIM: the vitest project is `environment: "node"` (no window /
// localStorage). readRaw/writeRaw guard on `typeof window === "undefined"`, so a
// Map-backed window.localStorage is installed per-test to make the boundary
// live. Tests assert the CURRENT semantics (section override > subject global >
// follow-page; wall-scoped section keys), not the pre-rework ones.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  backgroundStyle,
  isSafePhotoSrc,
  needsInverseInk,
  parseWallBackground,
  translucentValue,
  PHOTO_PRESETS,
  OPACITY_MIN,
  OPACITY_MAX,
} from "@/components/resource-wall-v2/backgrounds";
import {
  loadCustomWalls,
  loadSectionBackground,
  resetSectionBackground,
  resetSubjectBackground,
  saveSectionBackground,
  type CustomWall,
} from "@/components/resource-wall-v2/wall-state";

// ── localStorage shim ───────────────────────────────────────────────────────

class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
  /** Test helper — the raw keys currently stored. */
  keys(): string[] {
    return [...this.m.keys()];
  }
}

let store: MemStorage;

beforeEach(() => {
  store = new MemStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: store,
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

// The storage keys, mirrored from wall-state.ts (module-local consts there).
const CUSTOM_WALLS_KEY = "cc_customwalls";
const SUBJECT_BG_PREFIX = "cc_subjbg_";
const SECTION_BG_PREFIX = "cc_secbg_";

/** Seed the raw custom-walls blob the way a hand-edited / restored store would. */
function seedCustomWalls(raw: unknown): void {
  store.setItem(CUSTOM_WALLS_KEY, JSON.stringify(raw));
}

/** A minimal valid stored card (the shape parseWallItem accepts). */
function storedItem(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    key: "k1",
    type: "doc",
    label: "Deck",
    resource: { type: "doc", label: "Deck" },
    subjectId: "math",
    lessonId: "l1",
    lessonTitle: "Fractions",
    lessons: [],
    ...over,
  };
}

/** A minimal valid stored section. */
function storedSection(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "sec-1",
    title: "Sunday",
    meta: "",
    subjectId: "math",
    items: [storedItem()],
    ...over,
  };
}

/** A minimal valid stored wall. */
function storedWall(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "cw1",
    name: "My Wall",
    anchor: "unanchored",
    layout: [storedSection()],
    view: "med",
    created: 1000,
    ...over,
  };
}

// ── parseWallBackground (exported, direct) ──────────────────────────────────

describe("parseWallBackground — the allowlist gate", () => {
  it("round-trips every valid descriptor kind", () => {
    expect(parseWallBackground({ kind: "subject", tint: "soft" })).toEqual({
      kind: "subject",
      tint: "soft",
    });
    expect(parseWallBackground({ kind: "color", swatch: "honey" })).toEqual({
      kind: "color",
      swatch: "honey",
    });
    expect(parseWallBackground({ kind: "wash", wash: "mint" })).toEqual({
      kind: "wash",
      wash: "mint",
    });
    expect(
      parseWallBackground({ kind: "translucent", shade: "ink", opacity: 50 }),
    ).toEqual({ kind: "translucent", shade: "ink", opacity: 50 });
    expect(
      parseWallBackground({ kind: "photo", src: "/stage/p1.webp" }),
    ).toEqual({
      kind: "photo",
      src: "/stage/p1.webp",
    });
  });

  it("null / non-object / unknown kind → null (follow page)", () => {
    expect(parseWallBackground(null)).toBeNull();
    expect(parseWallBackground(undefined)).toBeNull();
    expect(parseWallBackground("photo")).toBeNull();
    expect(parseWallBackground(42)).toBeNull();
    expect(parseWallBackground({})).toBeNull();
    expect(parseWallBackground({ kind: "gradient" })).toBeNull();
  });

  it("tampered kind → null", () => {
    expect(parseWallBackground({ kind: "SUBJECT", tint: "soft" })).toBeNull();
    expect(parseWallBackground({ kind: 1, tint: "soft" })).toBeNull();
  });

  it("tampered swatch / wash / shade / tint key → null", () => {
    expect(parseWallBackground({ kind: "color", swatch: "neon" })).toBeNull();
    expect(parseWallBackground({ kind: "color", swatch: "#fff" })).toBeNull();
    expect(parseWallBackground({ kind: "wash", wash: "sunset" })).toBeNull();
    expect(parseWallBackground({ kind: "subject", tint: "loud" })).toBeNull();
    expect(
      parseWallBackground({
        kind: "translucent",
        shade: "rainbow",
        opacity: 40,
      }),
    ).toBeNull();
  });

  it("a missing sub-key → null (never a partial descriptor)", () => {
    expect(parseWallBackground({ kind: "color" })).toBeNull();
    expect(parseWallBackground({ kind: "wash" })).toBeNull();
    expect(parseWallBackground({ kind: "subject" })).toBeNull();
    expect(parseWallBackground({ kind: "photo" })).toBeNull();
  });

  it("clamps translucent opacity into [MIN, MAX], defaults a bad one", () => {
    const hi = parseWallBackground({
      kind: "translucent",
      shade: "ink",
      opacity: 9000,
    });
    const lo = parseWallBackground({
      kind: "translucent",
      shade: "ink",
      opacity: 2,
    });
    const bad = parseWallBackground({
      kind: "translucent",
      shade: "ink",
      opacity: "x",
    });
    const missing = parseWallBackground({ kind: "translucent", shade: "ink" });
    expect(hi).toMatchObject({ opacity: OPACITY_MAX });
    expect(lo).toMatchObject({ opacity: OPACITY_MIN });
    // Non-numeric / absent opacity resolves to the 35 default, still in-range.
    expect((bad as { opacity: number }).opacity).toBe(35);
    expect((missing as { opacity: number }).opacity).toBe(35);
  });
});

// ── isSafePhotoSrc (exported, direct) — PHOTO_PRESETS-only ───────────────────

describe("isSafePhotoSrc — PHOTO_PRESETS-only allowlist (R2 #1)", () => {
  it("accepts each bundled preset exactly", () => {
    for (const src of PHOTO_PRESETS) expect(isSafePhotoSrc(src)).toBe(true);
    expect(PHOTO_PRESETS).toHaveLength(5);
  });

  it("rejects EVERY non-preset src, including otherwise-'safe' schemes", () => {
    for (const bad of [
      "https://evil.example/x.png", // remote http(s) — a tracking beacon
      "http://localhost/x.png",
      "blob:https://mycurricula.app/abc", // the removed upload path
      "data:image/png;base64,AAAA", // a data-image is still not a preset
      "/stage/p6.webp", // adjacent path, not on the list
      "/stage/p1.webp ", // trailing space — not an exact match
      "/STAGE/p1.webp", // case — not an exact match
      "/api/resources/1", // same-origin root-relative — still not a preset
      "//evil.example/x.png", // protocol-relative
      "",
      null,
      undefined,
    ]) {
      expect(isSafePhotoSrc(bad)).toBe(false);
    }
  });

  it("photo parse rejects a CSS break-out payload before it can be stored", () => {
    // The bundle's `url('${v}')` sink let `')` close the url() and inject CSS.
    // The payload isn't a preset, so it never even lands in memory.
    const payload = `/stage/p1.webp") ; background: url("https://evil.example/x`;
    expect(isSafePhotoSrc(payload)).toBe(false);
    expect(parseWallBackground({ kind: "photo", src: payload })).toBeNull();
  });
});

// ── backgroundStyle / translucentValue / needsInverseInk (exported) ─────────

describe("backgroundStyle — CSS built only from tables", () => {
  it("a valid preset photo builds a DOUBLE-quoted url() (cssUrl format)", () => {
    // cssUrl is module-local (not exported) so its escaping can't be tested in
    // isolation — but the emitted format is asserted here, and the only value it
    // ever receives is a preset (no `"`/`\` to escape), because isSafePhotoSrc
    // gates the input.
    const style = backgroundStyle({ kind: "photo", src: "/stage/p2.webp" });
    expect(style.backgroundImage).toBe('url("/stage/p2.webp")');
    expect(style.backgroundSize).toBe("cover");
  });

  it("re-gates a photo at the sink — a non-preset src yields NO css", () => {
    // A descriptor constructed directly (bypassing the parser) with a hostile
    // src must still produce {} rather than a raw url() (defense in depth).
    const style = backgroundStyle({
      kind: "photo",
      src: "https://evil.example/x.png",
    } as never);
    expect(style).toEqual({});
  });

  it("null → follow-page (empty style)", () => {
    expect(backgroundStyle(null)).toEqual({});
  });

  it("table-driven kinds resolve to token CSS, never stored text", () => {
    expect(
      backgroundStyle({ kind: "wash", wash: "dawn" }).background,
    ).toContain("var(--grad-dawn)");
    expect(
      backgroundStyle({ kind: "subject", tint: "full" }).background,
    ).toContain("var(--sc)");
  });

  it("translucentValue clamps opacity like the parser", () => {
    expect(translucentValue("ink", 9000)).toContain(`${OPACITY_MAX}%`);
    expect(translucentValue("ink", 1)).toContain(`${OPACITY_MIN}%`);
  });

  it("needsInverseInk only for the known-dark descriptors", () => {
    expect(needsInverseInk({ kind: "color", swatch: "ink" })).toBe(true);
    expect(
      needsInverseInk({ kind: "translucent", shade: "ink", opacity: 60 }),
    ).toBe(true);
    expect(
      needsInverseInk({ kind: "translucent", shade: "ink", opacity: 40 }),
    ).toBe(false);
    expect(needsInverseInk({ kind: "color", swatch: "honey" })).toBe(false);
    expect(needsInverseInk({ kind: "photo", src: "/stage/p1.webp" })).toBe(
      false,
    );
    expect(needsInverseInk(null)).toBe(false);
  });
});

// ── parseWall / parseSection / parseWallItem via loadCustomWalls ─────────────

describe("wall / section / item parsers (via loadCustomWalls)", () => {
  it("a fully valid wall round-trips", () => {
    seedCustomWalls([storedWall()]);
    const walls = loadCustomWalls();
    expect(walls).toHaveLength(1);
    const w = walls[0];
    expect(w.id).toBe("cw1");
    expect(w.layout).toHaveLength(1);
    expect(w.layout[0].items).toHaveLength(1);
    expect(w.layout[0].items[0].label).toBe("Deck");
  });

  it("non-array storage / non-object wall → dropped, never throws", () => {
    store.setItem(CUSTOM_WALLS_KEY, "{ not json");
    expect(loadCustomWalls()).toEqual([]);
    seedCustomWalls({ not: "an array" });
    expect(loadCustomWalls()).toEqual([]);
    seedCustomWalls([null, 42, "x", { no: "id" }]);
    expect(loadCustomWalls()).toEqual([]);
  });

  it("a wall missing id or name is dropped; siblings survive", () => {
    seedCustomWalls([
      storedWall({ id: "" }),
      storedWall({ id: "cw-ok", name: "" }),
      storedWall({ id: "cw-good", name: "Good", created: 5 }),
    ]);
    const walls = loadCustomWalls();
    expect(walls.map((w) => w.id)).toEqual(["cw-good"]);
  });

  it("a malformed ITEM is dropped, its section SURVIVES (empty if all bad)", () => {
    seedCustomWalls([
      storedWall({
        layout: [
          storedSection({
            id: "sec-mixed",
            items: [
              storedItem({ key: "ok" }),
              storedItem({ type: "bogus" }),
              { junk: 1 },
            ],
          }),
          storedSection({
            id: "sec-allbad",
            items: [{ nope: true }, storedItem({ subjectId: 123 })],
          }),
        ],
      }),
    ]);
    const [w] = loadCustomWalls();
    const mixed = w.layout.find((s) => s.id === "sec-mixed")!;
    const allbad = w.layout.find((s) => s.id === "sec-allbad")!;
    expect(mixed.items.map((i) => i.key)).toEqual(["ok"]); // only the valid one
    expect(allbad.items).toEqual([]); // survives as an empty (valid) drop target
  });

  it("a section missing its id (drag-target identity) is dropped", () => {
    seedCustomWalls([
      storedWall({
        layout: [storedSection({ id: "" }), storedSection({ id: "sec-ok" })],
      }),
    ]);
    const [w] = loadCustomWalls();
    expect(w.layout.map((s) => s.id)).toEqual(["sec-ok"]);
  });

  it("a section with non-array items is dropped", () => {
    seedCustomWalls([
      storedWall({ layout: [storedSection({ id: "sec-x", items: "nope" })] }),
    ]);
    const [w] = loadCustomWalls();
    expect(w.layout).toEqual([]);
  });

  it("`composing` is transient — NEVER restored from storage", () => {
    seedCustomWalls([
      storedWall({
        layout: [storedSection({ items: [storedItem({ composing: true })] })],
      }),
    ]);
    const [w] = loadCustomWalls();
    // The parser omits composing entirely; the restored item is a settled card.
    expect("composing" in w.layout[0].items[0]).toBe(false);
  });

  it("only well-formed lesson refs survive on an item", () => {
    seedCustomWalls([
      storedWall({
        layout: [
          storedSection({
            items: [
              storedItem({
                lessons: [
                  { id: "a", title: "A" },
                  { id: "b" }, // missing title → dropped
                  "nope", // not an object → dropped
                  { id: 1, title: "x" }, // non-string id → dropped
                ],
              }),
            ],
          }),
        ],
      }),
    ]);
    const [w] = loadCustomWalls();
    expect(w.layout[0].items[0].lessons).toEqual([{ id: "a", title: "A" }]);
  });

  it("a tampered wall-level bg resolves to null and is dropped from the record", () => {
    seedCustomWalls([
      storedWall({ bg: { kind: "photo", src: "https://evil/x.png" } }),
    ]);
    const [w] = loadCustomWalls();
    expect("bg" in w).toBe(false);
    // ...a valid one is kept.
    seedCustomWalls([storedWall({ bg: { kind: "wash", wash: "mint" } })]);
    expect(loadCustomWalls()[0].bg).toEqual({ kind: "wash", wash: "mint" });
  });

  it("an out-of-range anchor / view falls back to a safe default", () => {
    seedCustomWalls([storedWall({ anchor: "hacked", view: "3d" })]);
    const [w] = loadCustomWalls();
    expect(w.anchor).toBe("unanchored");
    expect(w.view).toBe("med");
  });

  it("a stored `team: true` is NOT honored on read (no forged shared wall)", () => {
    seedCustomWalls([storedWall({ team: true })]);
    const [w] = loadCustomWalls() as CustomWall[];
    // The field is deliberately omitted, so it can't masquerade in the Team tab.
    expect(w.team).toBeUndefined();
    expect("team" in w).toBe(false);
  });

  it("walls are returned newest-first", () => {
    seedCustomWalls([
      storedWall({ id: "old", created: 100 }),
      storedWall({ id: "new", created: 900 }),
      storedWall({ id: "mid", created: 500 }),
    ]);
    expect(loadCustomWalls().map((w) => w.id)).toEqual(["new", "mid", "old"]);
  });
});

// ── Section-background precedence (the CURRENT semantics) ────────────────────

describe("section background precedence: section override > subject global > follow-page", () => {
  const WALL = "cw1";
  const SUBJ = "math";
  const SEC = "day:0"; // a section id that itself contains ":" (still unambiguous)
  const sectionKey = `${SECTION_BG_PREFIX}${WALL}:${SUBJ}:${SEC}`;
  const subjectKey = `${SUBJECT_BG_PREFIX}${SUBJ}`;
  const secBg = { kind: "wash", wash: "dawn" } as const;
  const subjBg = { kind: "wash", wash: "mint" } as const;

  it("follow-page when nothing is stored", () => {
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toBeNull();
  });

  it("section scope writes ONLY the wall-scoped section key", () => {
    saveSectionBackground(WALL, SEC, SUBJ, secBg, "section");
    expect(store.keys()).toEqual([sectionKey]);
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toEqual(secBg);
  });

  it("subject scope writes the global subject pin + clears this wall's section overrides", () => {
    // Pre-existing section override for this subject on this wall...
    saveSectionBackground(WALL, SEC, SUBJ, secBg, "section");
    // ...then apply whole-subject: the stale override must be cleared so the
    // subject value actually reaches the section (else it would keep winning).
    saveSectionBackground(WALL, SEC, SUBJ, subjBg, "subject");
    expect(store.keys()).toEqual([subjectKey]);
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toEqual(subjBg);
  });

  it("the section override WINS over the subject global (precedence)", () => {
    store.setItem(subjectKey, JSON.stringify(subjBg));
    store.setItem(sectionKey, JSON.stringify(secBg));
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toEqual(secBg);
  });

  it("resetSection clears ONLY the section override; the subject pin survives", () => {
    store.setItem(subjectKey, JSON.stringify(subjBg));
    store.setItem(sectionKey, JSON.stringify(secBg));
    resetSectionBackground(WALL, SEC, SUBJ);
    // The section falls THROUGH to the subject pin (not to follow-page).
    expect(store.getItem(subjectKey)).not.toBeNull();
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toEqual(subjBg);
  });

  it("resetSubject drops the subject pin AND this wall's section overrides for it", () => {
    store.setItem(subjectKey, JSON.stringify(subjBg));
    store.setItem(sectionKey, JSON.stringify(secBg));
    resetSubjectBackground(WALL, SUBJ);
    expect(store.getItem(subjectKey)).toBeNull();
    expect(store.getItem(sectionKey)).toBeNull();
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toBeNull();
  });

  it("section keys are WALL-scoped — the same section id on another wall is independent (R1 #4)", () => {
    saveSectionBackground("cwA", SEC, SUBJ, secBg, "section");
    // A different wall with the same section+subject sees nothing of cwA's.
    expect(loadSectionBackground("cwB", SEC, SUBJ)).toBeNull();
    expect(loadSectionBackground("cwA", SEC, SUBJ)).toEqual(secBg);
  });

  it("subject scope on one wall does NOT clear another wall's section overrides", () => {
    saveSectionBackground("cwA", SEC, SUBJ, secBg, "section");
    saveSectionBackground("cwB", SEC, SUBJ, subjBg, "subject");
    // cwB's whole-subject apply only cleared cwB's own section keys (there were
    // none); cwA's section override is untouched and still wins on cwA.
    expect(loadSectionBackground("cwA", SEC, SUBJ)).toEqual(secBg);
  });

  it("a tampered stored section background reads as follow-page, never raw CSS", () => {
    store.setItem(
      sectionKey,
      JSON.stringify({ kind: "photo", src: "https://evil/x" }),
    );
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toBeNull();
  });

  it("corrupt JSON at a background key is swallowed → follow-page", () => {
    store.setItem(sectionKey, "{ broken");
    expect(loadSectionBackground(WALL, SEC, SUBJ)).toBeNull();
  });
});
