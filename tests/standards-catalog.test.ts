// tests/standards-catalog.test.ts — the standards menu's data layer.
//
// Locks in: catalog JSON integrity (the same file seeds Supabase), the
// picker's filter semantics (pinned-first, subject/grade narrowing, item-code
// search), the bundled item sets, and the deterministic id bridge the seed
// generator + Supabase source share (scripts/gen-standards-catalog-sql.mjs).

import { describe, expect, it } from "vitest";
import {
  allFrameworks,
  filterFrameworks,
  filterItems,
  getFramework,
  REGION_LABELS,
} from "@/lib/standards/catalog";
import {
  availableGrades,
  bundledDescriptions,
  STANDARD_ITEMS,
} from "@/lib/standards/items";
import { slugToUuid, uuidV5 } from "@/lib/planner/id-bridge";

describe("frameworks catalog (JSON integrity)", () => {
  it("loads every framework with unique short_codes and resolvable parents", () => {
    const all = allFrameworks();
    expect(all.length).toBeGreaterThanOrEqual(174);
    const codes = new Set<string>();
    for (const f of all) {
      expect(f.short_code).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(codes.has(f.short_code)).toBe(false);
      codes.add(f.short_code);
      expect(REGION_LABELS[f.region]).toBeTruthy();
      if (f.parent_short_code) {
        expect(getFramework(f.parent_short_code)).toBeDefined();
      }
    }
  });

  it("carries every US state + DC as subdivision entries", () => {
    const states = allFrameworks().filter((f) =>
      f.subdivision_code?.startsWith("US-"),
    );
    expect(states.length).toBe(51);
  });

  it("gates the frameworks that must not be ingested without a licence", () => {
    // The product decision the research verified 3/3: IB content requires a
    // written IBO licence; Cambridge requires written permission.
    expect(getFramework("IB-PYP")?.commercial_use).toBe("permission_required");
    expect(getFramework("IB-ATL")?.commercial_use).toBe("permission_required");
    expect(getFramework("CAM-PRI")?.commercial_use).toBe("permission_required");
    // And the open anchors stay open.
    expect(getFramework("AU-AC9")?.commercial_use).toBe("open_attribution");
    expect(getFramework("SE-LGR22")?.commercial_use).toBe("open");
  });
});

describe("filterFrameworks", () => {
  it("returns pinned frameworks first, in pin order, never duplicated", () => {
    const { pinned, rest } = filterFrameworks({}, ["NGSS", "CCSS-MATH"]);
    expect(pinned.map((f) => f.short_code)).toEqual(["NGSS", "CCSS-MATH"]);
    expect(rest.some((f) => f.short_code === "NGSS")).toBe(false);
  });

  it("narrows by app subject through the slug bridge", () => {
    const { rest } = filterFrameworks({ subject: "math" }, []);
    const codes = new Set(rest.map((f) => f.short_code));
    expect(codes.has("CCSS-MATH")).toBe(true);
    expect(codes.has("CCSS-SMP")).toBe(true);
    expect(codes.has("NGSS")).toBe(false); // science-only
    expect(codes.has("AU-AC9")).toBe(true); // all_subjects passes every subject
  });

  it("surfaces a framework when the query matches one of its ITEM codes", () => {
    const { pinned, rest } = filterFrameworks({ query: "5-PS1" }, ["NGSS"]);
    const codes = new Set([...pinned, ...rest].map((f) => f.short_code));
    expect(codes.has("NGSS")).toBe(true);
  });

  it("does NOT hide partially-bundled frameworks on a grade filter (review M-1)", () => {
    const { pinned } = filterFrameworks({ grade: "1" }, [
      "CCSS-ELA",
      "CCSS-MATH",
      "CCSS-SMP",
      "NGSS",
    ]);
    // Grade-5 sample sets have no grade-1 items, but the frameworks must stay
    // visible (the catalog covers K-12; only the bundled SAMPLE is grade-5).
    expect(pinned.length).toBe(4);
  });

  it("keeps no-item catalog frameworks browsable under any grade filter", () => {
    const { rest } = filterFrameworks({ grade: "7" }, []);
    expect(rest.some((f) => f.short_code === "ENG-NC")).toBe(true);
  });
});

describe("filterItems", () => {
  it("filters by grade band and passes grade-independent items", () => {
    const g3 = filterItems("NGSS", { grade: "3" });
    expect(g3.some((i) => i.code === "3-5-ETS1-1")).toBe(true);
    expect(g3.some((i) => i.code === "5-PS1-1")).toBe(false);
    expect(filterItems("CCSS-SMP", { grade: "2" })).toHaveLength(8);
  });

  it("maps the explorers subject onto science + social studies", () => {
    expect(
      filterItems("NGSS", { subject: "explorers" }).length,
    ).toBeGreaterThan(0);
    expect(filterItems("NGSS", { subject: "math" })).toHaveLength(0);
  });
});

describe("bundled item sets", () => {
  it("never reuses a code across sets (codes are app-global tag keys)", () => {
    const seen = new Set<string>();
    for (const items of Object.values(STANDARD_ITEMS)) {
      for (const it of items) {
        expect(seen.has(it.code)).toBe(false);
        seen.add(it.code);
      }
    }
    expect(seen.size).toBe(Object.keys(bundledDescriptions()).length);
  });

  it("derives the grade options from data, never a hard-coded grade", () => {
    // Sample sets are grade-5-flavored today; the list must follow the data.
    expect(availableGrades()).toEqual(["3", "4", "5"]);
  });

  it("ships the 8 Mathematical Practices and the 5 IB ATL categories", () => {
    expect(STANDARD_ITEMS["CCSS-SMP"]).toHaveLength(8);
    expect(STANDARD_ITEMS["IB-ATL"]).toHaveLength(5);
  });
});

describe("id bridge (seed ↔ Supabase source contract)", () => {
  it("derives stable RFC-4122 v5 uuids per (kind, slug)", () => {
    const a = slugToUuid("standard", "5.NF.B.3");
    expect(a).toBe(slugToUuid("standard", "5.NF.B.3"));
    expect(a).not.toBe(slugToUuid("framework", "5.NF.B.3"));
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(uuidV5("x")).toBe(uuidV5("x"));
  });

  it("every bundled item's seed uuid is unique (codes are uuid-global)", () => {
    const ids = new Set<string>();
    for (const items of Object.values(STANDARD_ITEMS)) {
      for (const it of items) ids.add(slugToUuid("standard", it.code));
    }
    expect(ids.size).toBe(
      Object.values(STANDARD_ITEMS).reduce((n, i) => n + i.length, 0),
    );
  });
});
