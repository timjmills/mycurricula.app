"use client";

// The emotional centerpiece of the home hero: one large attributed insight that
// slowly rotates. Auto-advance is suppressed under prefers-reduced-motion;
// manual prev/next always work. aria-live stays "off" during the ambient
// auto-rotation (so screen readers aren't interrupted every interval) and is
// raised to "polite" only for user-initiated prev/next.
//
// Rotation order: quotes are randomized per visit and the categories alternate
// (classroom culture → learning → teaching → leading → …) so consecutive quotes
// change type. When the pool holds a single category (a future filtered view)
// this degenerates to a plain shuffle — no alternation possible, which is the
// correct behavior when someone has asked for just one category.

import { useEffect, useState } from "react";
import type { Insight } from "@/lib/home/insights";
import {
  INSIGHT_CATEGORY_LABELS,
  loadInsightExpand,
} from "@/lib/home/insights";
import styles from "./home.module.css";

// Fisher–Yates shuffle (returns a new array). Client-only: never runs during
// SSR / module eval, so it cannot desync hydration.
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

// Shuffle within each category, then round-robin interleave across categories
// so the rotation alternates type while staying random within each category.
function buildOrder(items: Insight[]): Insight[] {
  const byCat = new Map<string, Insight[]>();
  for (const it of items) {
    const g = byCat.get(it.category);
    if (g) g.push(it);
    else byCat.set(it.category, [it]);
  }
  const groups = [...byCat.values()].map(shuffled);
  const max = groups.reduce((m, g) => Math.max(m, g.length), 0);
  const out: Insight[] = [];
  for (let k = 0; k < max; k++) {
    for (const g of groups) if (k < g.length) out.push(g[k]);
  }
  return out;
}

export function RollingInsight({
  insights,
  intervalMs = 12000,
}: {
  insights: Insight[];
  intervalMs?: number;
}) {
  // SSR-safe: first paint uses the given order (so server + first client render
  // match); a post-mount effect swaps in the randomized, category-alternating
  // order so each visit opens on a fresh quote.
  const [order, setOrder] = useState<Insight[]>(insights);
  const [i, setI] = useState(0);
  const [showMore, setShowMore] = useState(false);
  // The "Read more" prose is code-split (lib/home/insights.expand.json — ~2/3
  // of the bank's bytes, click-only) and lazy-loaded when the reader expands;
  // null until loaded and for quotes without prose.
  const [expandText, setExpandText] = useState<string | null>(null);
  // "off" while auto-rotating (ambient — don't interrupt AT users); raised to
  // "polite" only when the user presses prev/next.
  const [live, setLive] = useState<"off" | "polite">("off");

  useEffect(() => {
    const built = buildOrder(insights);
    setOrder(built);
    // Open on a random quote (and thus a random category) each visit, not always
    // the first — the rotation still alternates category from there.
    setI(built.length ? Math.floor(Math.random() * built.length) : 0);
  }, [insights]);

  // Collapse the "Read more" paragraph whenever the quote changes.
  useEffect(() => setShowMore(false), [i]);

  // A new quote invalidates any previously loaded expansion prose.
  useEffect(() => {
    setExpandText(null);
  }, [i, order]);

  // Fetch the expansion prose when the reader opens "Read more". The async-
  // chunk import is cached, so later opens resolve from memory; the cancelled
  // guard drops a stale resolve if the quote rotates mid-fetch. (Derived
  // in-effect from order/i because `cur` is computed after the early return
  // below — hooks must stay above it.)
  useEffect(() => {
    if (!showMore || order.length === 0) return;
    const count = order.length;
    const current = order[((i % count) + count) % count];
    if (current?.hasExpand !== true) return;
    let cancelled = false;
    void loadInsightExpand(current.id).then((text) => {
      if (!cancelled) setExpandText(text);
    });
    return () => {
      cancelled = true;
    };
  }, [showMore, i, order]);

  useEffect(() => {
    if (typeof window === "undefined" || order.length <= 1) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const id = window.setInterval(() => {
      // Ambient advance — keep it silent for screen readers.
      setLive("off");
      setI((p) => (p + 1) % order.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [order.length, intervalMs]);

  if (!order.length) return null;
  const n = order.length;
  const cur = order[((i % n) + n) % n];
  const go = (d: number) => {
    // User-initiated — announce this one change.
    setLive("polite");
    setI((p) => (((p + d) % n) + n) % n);
  };

  return (
    <figure className={styles.insight} aria-live={live}>
      <blockquote key={cur.id} className={styles.insightQuote}>
        {`“${cur.quote}”`}
      </blockquote>
      <figcaption className={styles.insightCite}>
        {cur.author && (
          <span className={styles.insightAuthor}>{cur.author}</span>
        )}
        {cur.work && (
          <span className={styles.insightWork}>,&nbsp;{cur.work}</span>
        )}
        {cur.url && /^https?:\/\//i.test(cur.url) && (
          <a
            className={styles.insightLink}
            href={cur.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read source
          </a>
        )}
      </figcaption>
      {cur.hasExpand && (
        <div className={styles.insightExpandWrap}>
          <button
            type="button"
            className={styles.insightMore}
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
          >
            {showMore ? "Show less" : "Read more"}
          </button>
          {showMore && expandText && (
            <p className={styles.insightExpand}>{expandText}</p>
          )}
        </div>
      )}
      {n > 1 && (
        <div className={styles.insightNav}>
          <button
            type="button"
            className={styles.insightArrow}
            onClick={() => go(-1)}
            aria-label="Previous insight"
          >
            {"‹"}
          </button>
          <span className={styles.insightCat}>
            {INSIGHT_CATEGORY_LABELS[cur.category]}
          </span>
          <button
            type="button"
            className={styles.insightArrow}
            onClick={() => go(1)}
            aria-label="Next insight"
          >
            {"›"}
          </button>
        </div>
      )}
    </figure>
  );
}
