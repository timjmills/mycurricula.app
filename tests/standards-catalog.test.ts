// tests/standards-catalog.test.ts — the standards seed source + bundled sets.
//
// Locks in: catalog JSON integrity (frameworks-catalog.json is the source the
// committed supabase/seed-standards-catalog.sql is generated from — see
// scripts/gen-standards-catalog-sql.mjs), the licence gates the 2026-06-12
// research verified, the bundled item sets (lib/standards/items.ts), and the
// deterministic id bridge the seed generator + Supabase source share.
//
// The old picker-filter suites (filterFrameworks / filterItems) went with
// lib/standards/catalog.ts — the client-side catalog query layer deleted
// alongside its only consumer, the superseded StandardsPicker. The live
// standards path (StandardsTaggingPicker + app/api/standards/*) queries
// Supabase via lib/standards/queries.ts instead.

import { describe, expect, it } from "vitest";
import catalogJson from "@/lib/standards/frameworks-catalog.json";
import {
  availableGrades,
  bundledDescriptions,
  STANDARD_ITEMS,
} from "@/lib/standards/items";
import { slugToUuid, uuidV5 } from "@/lib/planner/id-bridge";

// Minimal shape for the fields these tests assert — the JSON's full column
// mirror lives in the generated seed, not in app code.
interface CatalogFramework {
  short_code: string;
  name: string;
  region: string;
  parent_short_code?: string;
  subdivision_code?: string;
  commercial_use: string;
}

const FRAMEWORKS = (catalogJson as { frameworks: CatalogFramework[] })
  .frameworks;
const BY_CODE = new Map(FRAMEWORKS.map((f) => [f.short_code, f]));

/** The seed's region vocabulary (was REGION_LABELS in the deleted catalog.ts). */
const REGIONS = new Set([
  "north_america",
  "europe",
  "mena",
  "asia_pacific",
  "africa",
  "latin_america",
  "global",
]);

describe("frameworks catalog (JSON integrity)", () => {
  it("loads every framework with unique short_codes and resolvable parents", () => {
    expect(FRAMEWORKS.length).toBeGreaterThanOrEqual(174);
    const codes = new Set<string>();
    for (const f of FRAMEWORKS) {
      expect(f.short_code).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(codes.has(f.short_code)).toBe(false);
      codes.add(f.short_code);
      expect(REGIONS.has(f.region)).toBe(true);
      if (f.parent_short_code) {
        expect(BY_CODE.get(f.parent_short_code)).toBeDefined();
      }
    }
  });

  it("carries every US state + DC as subdivision entries", () => {
    const states = FRAMEWORKS.filter((f) =>
      f.subdivision_code?.startsWith("US-"),
    );
    expect(states.length).toBe(51);
  });

  it("gates the frameworks that must not be ingested without a licence", () => {
    // The product decision the research verified 3/3: IB content requires a
    // written IBO licence; Cambridge requires written permission.
    expect(BY_CODE.get("IB-PYP")?.commercial_use).toBe("permission_required");
    expect(BY_CODE.get("IB-ATL")?.commercial_use).toBe("permission_required");
    expect(BY_CODE.get("CAM-PRI")?.commercial_use).toBe("permission_required");
    // And the open anchors stay open.
    expect(BY_CODE.get("AU-AC9")?.commercial_use).toBe("open_attribution");
    expect(BY_CODE.get("SE-LGR22")?.commercial_use).toBe("open");
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
