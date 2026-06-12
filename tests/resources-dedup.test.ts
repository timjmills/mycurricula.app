import { describe, it, expect } from "vitest";

import { resourceIdentity, dedupeLessonResources } from "@/lib/resources-dedup";
import type { LessonResource } from "@/lib/types";

// Tests for the P1 duplicate-resolution contract (6.12.26 redesign):
// sections are the canonical owner; the lesson-level array merges by
// content identity; render each resource once. Pure helpers only.

const res = (overrides: Partial<LessonResource>): LessonResource => ({
  type: "link",
  label: "Resource",
  ...overrides,
});

describe("resourceIdentity — three identity tiers", () => {
  it("prefers resourceId over url and label", () => {
    const a = res({ resourceId: "r-1", url: "https://a.com/x", label: "A" });
    const b = res({ resourceId: "r-1", url: "https://b.com/y", label: "B" });
    expect(resourceIdentity(a)).toBe(resourceIdentity(b));
  });

  it("distinct resourceIds are distinct identities", () => {
    const a = res({ resourceId: "r-1", url: "https://a.com/x" });
    const b = res({ resourceId: "r-2", url: "https://a.com/x" });
    expect(resourceIdentity(a)).not.toBe(resourceIdentity(b));
  });

  it("normalizes host case + trailing slash on urls", () => {
    expect(resourceIdentity(res({ url: "https://Example.COM/Path/" }))).toBe(
      resourceIdentity(res({ url: "https://example.com/Path" })),
    );
  });

  it("does NOT strip www. — conservative identity beats false merges", () => {
    // www and apex can serve different content; a false merge hides a
    // teacher's resource, a missed merge only shows a duplicate.
    expect(
      resourceIdentity(res({ url: "https://www.example.com/path" })),
    ).not.toBe(resourceIdentity(res({ url: "https://example.com/path" })));
  });

  it("KEEPS the query string — two ?id= values are different docs", () => {
    expect(
      resourceIdentity(res({ url: "https://drive.google.com/open?id=AAA" })),
    ).not.toBe(
      resourceIdentity(res({ url: "https://drive.google.com/open?id=BBB" })),
    );
  });

  it("derives a type:label:body identity for url-less notecards", () => {
    const a = res({ type: "notecard", label: "  Week Plan " });
    const b = res({ type: "notecard", label: "week plan" });
    expect(resourceIdentity(a)).toBe("notecard:week plan:");
    expect(resourceIdentity(a)).toBe(resourceIdentity(b));
    // Different type, same label → different identity.
    expect(
      resourceIdentity(res({ type: "link", label: "week plan" })),
    ).not.toBe(resourceIdentity(a));
  });

  it("does NOT merge same-label notecards with different bodies (review H1)", () => {
    // makeNotecard defaults the label to "Notecard", so label-only identity
    // would routinely hide one of two distinct notes-only cards.
    const a = res({
      type: "notecard",
      label: "Notecard",
      body: "<p>warm-up</p>",
    });
    const b = res({
      type: "notecard",
      label: "Notecard",
      body: "<p>assessment</p>",
    });
    expect(resourceIdentity(a)).not.toBe(resourceIdentity(b));
  });

  it("keeps URL *path* case — mixed-case ids are distinct (review H2)", () => {
    const a = res({ url: "https://drive.google.com/file/d/AbCdEf" });
    const b = res({ url: "https://drive.google.com/file/d/abcdef" });
    expect(resourceIdentity(a)).not.toBe(resourceIdentity(b));
    // Host case is still neutral.
    expect(
      resourceIdentity(res({ url: "https://Drive.Google.com/file/d/AbCdEf" })),
    ).toBe(resourceIdentity(a));
  });

  it("handles root-relative hosted urls without throwing", () => {
    const a = res({ url: "/api/resources/abc/" });
    const b = res({ url: "/api/resources/abc" });
    expect(resourceIdentity(a)).toBe(resourceIdentity(b));
    // Path case stays significant for row ids too (review H2).
    expect(resourceIdentity(res({ url: "/api/resources/ABC" }))).not.toBe(
      resourceIdentity(a),
    );
  });
});

describe("dedupeLessonResources — sections are canonical (P1)", () => {
  it("drops a lesson-level row that duplicates a section row by url", () => {
    const inSection = res({ url: "https://example.com/worksheet" });
    const dupe = res({ url: "https://Example.com/worksheet/", label: "Copy" });
    const unique = res({ url: "https://example.com/other" });
    const out = dedupeLessonResources({
      sectionResources: [inSection],
      lessonResources: [dupe, unique],
    });
    expect(out).toEqual([inSection, unique]);
  });

  it("drops a lesson-level row that duplicates a section row by resourceId", () => {
    const inSection = res({ resourceId: "r-9", url: "https://a.com/x" });
    const dupe = res({ resourceId: "r-9", url: "https://b.com/renamed" });
    const out = dedupeLessonResources({
      sectionResources: [inSection],
      lessonResources: [dupe],
    });
    expect(out).toEqual([inSection]);
  });

  it("keeps section rows first, in order, then surviving lesson rows", () => {
    const s1 = res({ url: "https://a.com/1" });
    const s2 = res({ url: "https://a.com/2" });
    const l1 = res({ url: "https://a.com/3" });
    const l2 = res({ url: "https://a.com/1" }); // duplicate of s1
    const l3 = res({ url: "https://a.com/4" });
    const out = dedupeLessonResources({
      sectionResources: [s1, s2],
      lessonResources: [l1, l2, l3],
    });
    expect(out).toEqual([s1, s2, l1, l3]);
  });

  it("collapses within-array duplicates — first occurrence wins", () => {
    const a1 = res({ url: "https://a.com/x", label: "first" });
    const a2 = res({ url: "https://a.com/x/", label: "second" });
    const b1 = res({ type: "notecard", label: "Notes", body: "<p>same</p>" });
    const b2 = res({ type: "notecard", label: " notes ", body: "<p>same</p>" });
    const out = dedupeLessonResources({
      sectionResources: [a1, a2],
      lessonResources: [b1, b2],
    });
    expect(out).toEqual([a1, b1]);
  });

  it("merges url-less notecards across the two seams by type:label", () => {
    const inSection = res({ type: "notecard", label: "Exit ticket" });
    const dupe = res({ type: "notecard", label: "exit ticket" });
    const out = dedupeLessonResources({
      sectionResources: [inSection],
      lessonResources: [dupe],
    });
    expect(out).toEqual([inSection]);
  });

  it("returns lesson resources untouched when there is no overlap", () => {
    const s = res({ url: "https://a.com/1" });
    const l = res({ url: "https://a.com/2" });
    const out = dedupeLessonResources({
      sectionResources: [s],
      lessonResources: [l],
    });
    expect(out).toEqual([s, l]);
  });

  it("handles empty inputs", () => {
    expect(
      dedupeLessonResources({ sectionResources: [], lessonResources: [] }),
    ).toEqual([]);
  });
});

describe("dedupeLessonResources — cross-tier aliasing (id + url)", () => {
  // A persisted section row (has resourceId AND url) must absorb a
  // lesson-level row that carries only the same URL — the two tiers are
  // aliases of one content identity, not different resources. (§4a gate
  // finding: tier preference alone left this duplicate standing.)
  it("a resourceId+url section row absorbs a url-only lesson duplicate", () => {
    const hosted = res({
      resourceId: "r-1",
      url: "https://example.com/doc",
      label: "Hosted",
    });
    const urlOnly = res({ url: "https://example.com/doc", label: "Pasted" });
    const out = dedupeLessonResources({
      sectionResources: [hosted],
      lessonResources: [urlOnly],
    });
    expect(out).toEqual([hosted]);
  });

  it("aliases work in the other direction too (url row first)", () => {
    const urlOnly = res({ url: "https://example.com/doc" });
    const hosted = res({ resourceId: "r-1", url: "https://example.com/doc" });
    const out = dedupeLessonResources({
      sectionResources: [urlOnly],
      lessonResources: [hosted],
    });
    expect(out).toEqual([urlOnly]);
  });

  it("two ids sharing one normalized url collapse to the first row", () => {
    const a = res({ resourceId: "r-1", url: "https://Example.com/doc/" });
    const b = res({ resourceId: "r-2", url: "https://example.com/doc" });
    const out = dedupeLessonResources({
      sectionResources: [a],
      lessonResources: [b],
    });
    expect(out).toEqual([a]);
  });

  it("different urls under different ids do NOT merge (conservatism)", () => {
    const a = res({ resourceId: "r-1", url: "https://example.com/a" });
    const b = res({ resourceId: "r-2", url: "https://example.com/b" });
    const out = dedupeLessonResources({
      sectionResources: [a],
      lessonResources: [b],
    });
    expect(out).toEqual([a, b]);
  });
});
