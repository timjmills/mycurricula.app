// The home-screen insight bank: real, attributed short quotes mined from the
// teacher's own library (Documents/Books and Articles/) — author + source/work
// + link where available. Categories: classroom culture · learning · teaching ·
// leading. Generated into insights.data.json by scripts/quote-mining; this
// module is the typed loader + helpers the UI consumes.

// The app bundles only the trimmed, source-diverse HERO POOL (insights.hero.json,
// ~320 records). The full 4,088-quote bank lives in insights.data.json (the data
// artifact / deliverable) and is intentionally NOT imported here to keep the
// /home client bundle small.
//
// PERF SPLIT: the hero records' `expand` prose (~280 kB, ~2/3 of the old
// payload) lives in a SIBLING file, insights.expand.json, and is NOT imported
// statically — it renders only after a click ("Read more" / the quote-context
// popover), so it loads via dynamic import the first time an expansion opens
// (webpack code-splits it into an async chunk; see loadInsightExpand below).
// Records carry `hasExpand: true` so the UI can gate the affordance without
// the prose. scripts/quote-mining/finalize-bank.mjs emits BOTH files — keep
// the split when regenerating.
import data from "./insights.hero.json";

export type InsightCategory =
  "classroom culture" | "learning" | "teaching" | "leading";

export interface Insight {
  id: string;
  quote: string;
  author: string | null;
  source: string | null;
  work: string | null;
  url: string | null;
  category: InsightCategory;
  /** True when a "Read more" expansion paragraph exists for this insight.
   *  The prose itself lives in insights.expand.json — fetch it with
   *  loadInsightExpand(id) when the reader opens the expansion. */
  hasExpand?: boolean;
}

/**
 * Load one insight's "Read more" expansion paragraph.
 *
 * The expand map is code-split into an async chunk (dynamic import) because
 * it is ~2/3 of the insight bank's bytes and renders only after a click.
 * The import is cached by the module system, so every call after the first
 * resolves from memory. Returns null when the id has no expansion (or the
 * chunk fails to load — the UI simply shows no paragraph, matching the
 * pre-split behavior for records without `expand`).
 */
export async function loadInsightExpand(id: string): Promise<string | null> {
  try {
    const mod = await import("./insights.expand.json");
    const map = mod.default as Record<string, string>;
    return map[id] ?? null;
  } catch {
    // Chunk fetch failed (offline, deploy skew) — degrade to "no expansion".
    return null;
  }
}

export const INSIGHT_CATEGORIES: readonly InsightCategory[] = [
  "classroom culture",
  "learning",
  "teaching",
  "leading",
];

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  "classroom culture": "Classroom culture",
  learning: "Learning",
  teaching: "Teaching",
  leading: "Leading",
};

export const INSIGHTS = data as Insight[];

export function insightsByCategory(category: InsightCategory): Insight[] {
  return INSIGHTS.filter((i) => i.category === category);
}

// A balanced, display-friendly subset for the hero rotation — display-length
// quotes with an attribution, capped per category so the carousel stays light.
export function heroInsights(perCategory = 60): Insight[] {
  const out: Insight[] = [];
  for (const cat of INSIGHT_CATEGORIES) {
    const pool = INSIGHTS.filter(
      (i) =>
        i.category === cat &&
        !!i.author &&
        i.quote.length >= 55 &&
        i.quote.length <= 230,
    );
    out.push(...pool.slice(0, perCategory));
  }
  return out;
}
