import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  copyWallSectionBackgrounds,
  sweepOrphanPresetBackgrounds,
} from "@/components/resource-wall-v2/wall-state";
import { WALL_PRESETS } from "@/lib/wall-scope";

// Task #37 — the orphan records the pre-8d445df fork race left at
// `cc_secbg_<presetId>:…`, which nothing addresses any more except a teacher
// reopening that shared preset, where they show a background nobody pinned.
//
// THE DANGER IS THE CLEANUP, NOT THE ORPHANS. "The orphan is gone" is an
// absence assertion and passes on an empty store, on a no-op sweep that never
// found the key, and on a sweep that deleted the entire namespace. Every test
// below therefore seeds a LIVE custom wall's record alongside the orphan and
// asserts it survives IN THE SAME RUN — the sweep is only correct if it is both
// complete and narrow.
//
// The rule under test is deliberately the narrow one: delete only records whose
// wall key is EXACTLY a preset id. Since 8d445df no writer can produce one, so
// they are provably orphaned; and custom wall ids (`cw<uuid>`) can never equal a
// preset id, so live records are out of reach by construction.

const SECBG = "cc_secbg_";
/** A real custom wall id shape — `newWallId()` mints `cw` + a uuid. */
const LIVE_WALL = "cw12345678-1234-4321-8765-1234567890ab";

const store = new Map<string, string>();

function installStorage(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {
    localStorage: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  };
}

const PHOTO = JSON.stringify({ kind: "photo", src: "/stage/p1.webp" });
const HONEY = JSON.stringify({ kind: "color", swatch: "honey" });

beforeEach(() => {
  store.clear();
  installStorage();
  // The orphan: written by the OLD code under the preset the teacher forked from.
  store.set(`${SECBG}lesson:math:lesson:m-11-1`, PHOTO);
  // The live record: the same pin, on the teacher's own wall, where it belongs.
  store.set(`${SECBG}${LIVE_WALL}:math:lesson:m-11-1`, PHOTO);
  // A second live one on a day-column section, whose id CONTAINS a colon — the
  // shape a naive key re-parse mangles.
  store.set(`${SECBG}${LIVE_WALL}:reading:day:0`, HONEY);
  // Not section-scoped at all: the global subject pin and the wall list.
  store.set("cc_subjbg_math", HONEY);
  store.set("cc_customwalls", JSON.stringify([{ id: LIVE_WALL }]));
});

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).window;
});

describe("sweepOrphanPresetBackgrounds", () => {
  it("removes the preset-scoped orphan", () => {
    expect(sweepOrphanPresetBackgrounds(WALL_PRESETS)).toBe(1);
    expect(store.has(`${SECBG}lesson:math:lesson:m-11-1`)).toBe(false);
  });

  it("leaves a LIVE wall's records exactly as they were", () => {
    // The positive control, in the same run as the deletion above. Without it,
    // a sweep that wiped `cc_secbg_` wholesale would pass every other assertion
    // in this file.
    sweepOrphanPresetBackgrounds(WALL_PRESETS);
    expect(store.get(`${SECBG}${LIVE_WALL}:math:lesson:m-11-1`)).toBe(PHOTO);
    expect(store.get(`${SECBG}${LIVE_WALL}:reading:day:0`)).toBe(HONEY);
  });

  it("does not touch keys outside the section-background namespace", () => {
    sweepOrphanPresetBackgrounds(WALL_PRESETS);
    expect(store.get("cc_subjbg_math")).toBe(HONEY);
    expect(store.get("cc_customwalls")).toBeDefined();
  });

  it("clears an orphan under EVERY preset, not just the first", () => {
    // A per-preset loop that returned early would leave five of six behind and
    // still pass the single-orphan test above.
    for (const p of WALL_PRESETS) store.set(`${SECBG}${p}:math:sec-x`, PHOTO);
    const removed = sweepOrphanPresetBackgrounds(WALL_PRESETS);
    expect(removed).toBe(WALL_PRESETS.length + 1); // +1 = the seeded orphan
    for (const p of WALL_PRESETS) {
      expect(store.has(`${SECBG}${p}:math:sec-x`)).toBe(false);
    }
    expect(store.get(`${SECBG}${LIVE_WALL}:math:lesson:m-11-1`)).toBe(PHOTO);
  });

  it("is idempotent and reports nothing to do on a clean store", () => {
    expect(sweepOrphanPresetBackgrounds(WALL_PRESETS)).toBe(1);
    expect(sweepOrphanPresetBackgrounds(WALL_PRESETS)).toBe(0);
    // And the live records are still there after two passes.
    expect(store.get(`${SECBG}${LIVE_WALL}:math:lesson:m-11-1`)).toBe(PHOTO);
  });

  it("cannot reach a wall whose id merely CONTAINS a preset id", () => {
    // Guards the prefix boundary: the key is `cc_secbg_<wallKey>:`, so a wall id
    // starting with "lesson" must not be swept by the "lesson" preset.
    store.set(`${SECBG}lessonish-wall:math:sec-y`, PHOTO);
    sweepOrphanPresetBackgrounds(WALL_PRESETS);
    expect(store.get(`${SECBG}lessonish-wall:math:sec-y`)).toBe(PHOTO);
  });
});

describe("copyWallSectionBackgrounds — the same key shape, the other direction", () => {
  it("copies every record of the source wall and leaves the source intact", () => {
    copyWallSectionBackgrounds(LIVE_WALL, "cw-copy");
    expect(store.get(`${SECBG}cw-copy:math:lesson:m-11-1`)).toBe(PHOTO);
    // The colon-bearing section id survives the re-key unchanged.
    expect(store.get(`${SECBG}cw-copy:reading:day:0`)).toBe(HONEY);
    expect(store.get(`${SECBG}${LIVE_WALL}:math:lesson:m-11-1`)).toBe(PHOTO);
    expect(store.get(`${SECBG}${LIVE_WALL}:reading:day:0`)).toBe(HONEY);
  });

  it("copies nothing when the source has no records", () => {
    copyWallSectionBackgrounds("cw-empty", "cw-copy");
    expect(Array.from(store.keys()).some((k) => k.includes("cw-copy"))).toBe(false);
  });

  it("is a no-op onto itself", () => {
    const before = new Map(store);
    copyWallSectionBackgrounds(LIVE_WALL, LIVE_WALL);
    expect(new Map(store)).toEqual(before);
  });
});
