// The home-screen insight bank: real, attributed short quotes mined from the
// teacher's own library (Documents/Books and Articles/) — author + source/work
// + link where available. Categories: classroom culture · learning · teaching ·
// leading. Generated into insights.data.json by scripts/quote-mining; this
// module is the typed loader + helpers the UI consumes.

// The app ships only the trimmed, source-diverse HERO POOL (insights.hero.json,
// ~320 records). The full 4,088-quote bank lives in insights.data.json (the data
// artifact / deliverable) and is intentionally NOT imported here to keep the
// client bundles small.
//
// PERF SPLIT, part 1 (expand prose): the hero records' `expand` prose (~280 kB,
// ~2/3 of the old payload) lives in a SIBLING file, insights.expand.json, and
// renders only after a click ("Read more" / the quote-context popover), so it
// loads via dynamic import the first time an expansion opens (webpack
// code-splits it into an async chunk; see loadInsightExpand below). Records
// carry `hasExpand: true` so the UI can gate the affordance without the prose.
// scripts/quote-mining/finalize-bank.mjs emits BOTH files — keep the split
// when regenerating.
//
// PERF SPLIT, part 2 (the hero pool itself — bundle-slim lever C): even the
// trimmed insights.hero.json is ~123 kB parsed / ~34 kB gzip, and this module
// sat in the (planner) layout's client graph via the v2 chrome's ChromeQuote —
// every planner route paid for the quote bank before first paint. There is
// deliberately NO static `import ... from "./insights.hero.json"` here anymore:
// the pool loads through loadHeroInsights() (dynamic import → its own async
// chunk, fetched post-mount by the two quote surfaces), and this module stays
// a light leaf (types + category constants + loaders) that anything can import
// for free.

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

// ── The hero pool (lazy — header note, PERF SPLIT part 2) ────────────────

// Cached in-flight/settled promise so the async chunk is fetched at most
// once per session; every later call resolves from memory. A FAILED fetch
// is retried once in-loader (below) — ChromeQuote is layout-mounted and
// never remounts across navigations, so without the in-loader retry one
// flaky request at app start would silence the quote for the whole
// session (§4a finding). After the final failure the cache is cleared so
// any LATER mount (e.g. /home's HomeHero) still gets a fresh attempt.
let heroPoolPromise: Promise<Insight[]> | null = null;

/** One retry, short delay — enough to ride out a transient network blip
 *  without turning a hard outage into a hang. */
const HERO_RETRY_DELAY_MS = 1_500;

function importHeroPool(): Promise<Insight[]> {
  return import("./insights.hero.json").then(
    (mod) => mod.default as Insight[],
  );
}

function loadHeroPool(): Promise<Insight[]> {
  if (heroPoolPromise === null) {
    heroPoolPromise = importHeroPool().catch(
      () =>
        // First fetch failed (offline blip, deploy skew) — retry once after
        // a short delay before giving up for this call.
        new Promise<Insight[]>((resolve) => {
          setTimeout(() => {
            importHeroPool()
              .then(resolve)
              .catch(() => {
                // Still failing — degrade to an empty pool (the quote
                // surfaces render nothing, matching their pre-mount state)
                // and clear the cache so a later mount can retry.
                heroPoolPromise = null;
                resolve([]);
              });
          }, HERO_RETRY_DELAY_MS);
        }),
    );
  }
  return heroPoolPromise;
}

// A balanced, display-friendly subset for the hero rotation — display-length
// quotes with an attribution, capped per category so the carousel stays
// light. Async because the pool itself is code-split (header note): callers
// (ChromeQuote, HomeHero) load it post-mount and render their existing
// "no quote yet" state until it resolves.
export async function loadHeroInsights(perCategory = 60): Promise<Insight[]> {
  const all = await loadHeroPool();
  const out: Insight[] = [];
  for (const cat of INSIGHT_CATEGORIES) {
    const pool = all.filter(
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
