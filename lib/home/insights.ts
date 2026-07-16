// The home-screen insight bank: real, attributed short quotes mined from the
// teacher's own library (Documents/Books and Articles/) — author + source/work
// + link where available. Categories: classroom culture · learning · teaching ·
// leading. Generated into insights.data.json by scripts/quote-mining; this
// module is the typed loader + helpers the UI consumes.

// The app bundles only the trimmed, source-diverse HERO POOL (insights.hero.json,
// ~320 records). The full 4,088-quote bank lives in insights.data.json (the data
// artifact / deliverable) and is intentionally NOT imported here to keep the
// /home client bundle small.
import data from "./insights.hero.json";

export type InsightCategory =
  | "classroom culture"
  | "learning"
  | "teaching"
  | "leading";

export interface Insight {
  id: string;
  quote: string;
  author: string | null;
  source: string | null;
  work: string | null;
  url: string | null;
  category: InsightCategory;
  /** A short surrounding paragraph for the "Read more" expansion. */
  expand?: string | null;
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
