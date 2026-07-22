// Merge the categorized ARTICLE quotes with the mined BOOK quotes into the final
// insight bank, enforce per-source diversity (no single work dominates a
// category — except Michael Linsin's Smart Classroom Management may carry
// classroom culture), dedupe, and write lib/home/insights.data.json.
//
// Run AFTER the book-mining agents land their books-cc-*.json files:
//   node scripts/quote-mining/finalize-bank.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:\\Users\\losey\\Projects\\mycurricula.app";
const QM = path.join(ROOT, "scripts", "quote-mining");
const OUT = path.join(QM, "output");
const LIB = path.join(ROOT, "lib", "home");

const CATS = ["classroom culture", "learning", "teaching", "leading"];
const PER_SOURCE_CAP = 45; // diversity: max quotes per work per category
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
let n = 0;
const slug = () => `q${(n++).toString(36)}`;

function rec(r, sourceType) {
  return {
    id: slug(),
    quote: norm(r.text || r.quote),
    author: norm(r.author) || null,
    source: sourceType === "article" ? norm(r.source) || null : null,
    work: norm(r.work) || null,
    url: r.url || null,
    sourceType,
    category: r.category,
    expand: norm(r.expand) || null,
  };
}

// Articles (accurate, article-level categories)
const arts = JSON.parse(
  fs.readFileSync(path.join(OUT, "articles-categorized.json"), "utf8"),
);

// Books — merge every books-cc-*.json / books-quotes*.json the agents produced
const bookFiles = fs
  .readdirSync(OUT)
  .filter(
    (f) =>
      /^books-(cc|learning|teaching|leading|quotes)/i.test(f) &&
      f.endsWith(".json"),
  );
let books = [];
for (const f of bookFiles) {
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
    if (Array.isArray(arr)) books.push(...arr);
  } catch (e) {
    console.log(`! skipped ${f}: ${e.message}`);
  }
}

const all = [];
for (const a of arts)
  if (CATS.includes(a.category)) all.push(rec(a, "article"));
for (const b of books) if (CATS.includes(b.category)) all.push(rec(b, "book"));

// Off-topic / controversial filter (reproducible + reversible). The 13-agent
// semantic review flagged quotes that aren't directly about teaching, learning,
// education-and-team leading, or classroom management — see merge-removals.mjs
// + QUOTE-REMOVALS.md. We re-derive each removed key with THIS file's norm so
// it matches the dedup key exactly; every matching quote drops from the bank
// AND the re-sampled hero pool. Restore by deleting removed-quotes.json.
// Two sources, unioned: removed-quotes.json (the 13-agent review) and
// removed-extra.json (hero-pool residuals re-admitted by re-derivation —
// build-removed-extra.mjs).
let removedKeys = new Set();
for (const file of ["removed-quotes.json", "removed-extra.json"]) {
  try {
    const rem = JSON.parse(fs.readFileSync(path.join(QM, file), "utf8"));
    if (Array.isArray(rem))
      for (const r of rem) removedKeys.add(norm(r.quote).toLowerCase());
  } catch {
    /* file absent — skip */
  }
}
const removedCount = removedKeys.size;

// Dedupe by quote text (and drop filtered quotes)
const seen = new Set();
const deduped = all.filter((r) => {
  const k = r.quote.toLowerCase();
  if (
    !r.quote ||
    k.length < 20 ||
    k.length > 340 ||
    seen.has(k) ||
    removedKeys.has(k)
  )
    return false;
  seen.add(k);
  return true;
});

// Per-category per-source cap (Linsin exempt in classroom culture)
const isLinsin = (r) =>
  /linsin|smart classroom manag/i.test(`${r.work || ""} ${r.author || ""}`);
const tally = {};
const bank = [];
for (const r of deduped) {
  const key = `${r.category}|${(r.work || "?").toLowerCase()}`;
  tally[key] = (tally[key] || 0) + 1;
  const exempt = r.category === "classroom culture" && isLinsin(r);
  if (!exempt && tally[key] > PER_SOURCE_CAP) continue;
  bank.push(r);
}

fs.writeFileSync(
  path.join(LIB, "insights.data.json"),
  JSON.stringify(bank, null, 2),
);

// Trimmed, source-diverse HERO POOL for the client bundle (the full bank above
// is the data artifact, NOT imported by the app — it's 6.5 MB). Round-robin
// across works so the rotation stays diverse; display-friendly lengths only.
function heroPool(rows) {
  // Round-robin across a list of per-work buckets, allowing multiple passes,
  // until we have `want` quotes (or every bucket is empty). Keeps the draw
  // spread across many works rather than concentrated in a few.
  const rrPick = (works, want) => {
    const out = [];
    if (!works.length || want <= 0) return out;
    let idx = 0;
    let guard = 0;
    while (out.length < want && guard < 200000) {
      const bucket = works[idx % works.length];
      if (bucket && bucket.length) out.push(bucket.shift());
      idx++;
      guard++;
      if (works.every((w) => !w.length)) break;
    }
    return out;
  };
  // Interleave two arrays so the rotation alternates sources for display variety.
  const interleave = (a, b) => {
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i < a.length) out.push(a[i]);
      if (i < b.length) out.push(b[i]);
    }
    return out;
  };

  const PER_CAT = 80;
  const picked = [];
  for (const c of CATS) {
    // Split candidates into book- vs article-sourced, each grouped by work.
    // Books carry the named-author gravitas the bank was mined for, so reserve
    // ~45% of each category's hero slots for books where they exist; articles
    // fill the rest (and either source backfills if the other falls short).
    const bookBy = {};
    const artBy = {};
    for (const r of rows) {
      if (r.category !== c || !r.author) continue;
      if (r.quote.length < 55 || r.quote.length > 230) continue;
      const m = r.sourceType === "book" ? bookBy : artBy;
      (m[r.work || "?"] ||= []).push(r);
    }
    const bookWorks = Object.values(bookBy);
    const artWorks = Object.values(artBy);
    const bookPick = rrPick(bookWorks, Math.round(PER_CAT * 0.45));
    const artPick = rrPick(artWorks, PER_CAT - bookPick.length);
    let combined = interleave(bookPick, artPick);
    if (combined.length < PER_CAT) {
      // One source ran short — backfill from whatever quotes remain.
      combined = combined.concat(
        interleave(rrPick(bookWorks, PER_CAT), rrPick(artWorks, PER_CAT)),
      );
    }
    picked.push(...combined.slice(0, PER_CAT));
  }
  return picked;
}
const hero = heroPool(bank);
// The hero pool is split into TWO files (perf — see lib/home/insights.ts):
//   insights.hero.json   — the eagerly-bundled records, WITHOUT the `expand`
//                          prose (it was ~2/3 of the payload and renders only
//                          after a click). Records that have prose carry
//                          `hasExpand: true` so the UI can gate the affordance.
//   insights.expand.json — { [id]: expand } — loaded via dynamic import the
//                          first time a reader opens a "Read more"/context
//                          expansion, so it code-splits into an async chunk.
// Keep this split in place when regenerating — writing `expand` back inline
// silently re-adds ~280 kB to the /home first-load bundle.
const expandById = {};
let expandCount = 0;
const heroSlim = hero.map((r) => {
  const { expand, ...rest } = r;
  if (typeof expand === "string" && expand.trim() !== "") {
    expandById[r.id] = expand;
    expandCount += 1;
    return { ...rest, hasExpand: true };
  }
  return rest;
});
fs.writeFileSync(
  path.join(LIB, "insights.hero.json"),
  JSON.stringify(heroSlim, null, 2),
);
fs.writeFileSync(
  path.join(LIB, "insights.expand.json"),
  JSON.stringify(expandById, null, 2),
);
console.log(
  `Hero pool (client-bundled): ${heroSlim.length} (+${expandCount} lazy expand entries)`,
);

// Report
const byCat = {};
for (const r of bank) (byCat[r.category] ||= []).push(r);
console.log(
  `Final bank: ${bank.length} insights (from ${deduped.length} deduped; ${bookFiles.length} book files merged)`,
);
for (const c of CATS) {
  const arr = byCat[c] || [];
  const works = new Set(arr.map((r) => r.work || "?"));
  const bookN = arr.filter((r) => r.sourceType === "book").length;
  console.log(
    `  ${String(arr.length).padStart(5)}  ${c.padEnd(18)} · ${works.size} works · ${bookN} from books / ${arr.length - bookN} from articles`,
  );
}

// ── Source ledger (QUOTE-SOURCES.md) ──────────────────────────────────────
// Record which works each category drew from and how many quotes each gave, so
// a future mining pass can see at a glance what's already heavily used and keep
// the bank source-diverse. Regenerated on every finalize run.
const ledger = {};
for (const r of bank) {
  const work = r.work || "(unattributed)";
  const cat = (ledger[r.category] ||= {});
  const entry = (cat[work] ||= {
    count: 0,
    sourceType: r.sourceType,
    byline: r.author || r.source || "",
  });
  entry.count++;
}
const esc = (s) => String(s).replace(/\|/g, "\\|");
const stamp = new Date().toISOString().slice(0, 10);
const allWorks = new Set(bank.map((r) => r.work || "?")).size;
let md = "# Quote Bank — Source Ledger\n\n";
md += `_Auto-generated by \`scripts/quote-mining/finalize-bank.mjs\` on ${stamp}. Do not edit by hand — re-run finalize to refresh._\n\n`;
md += `**${bank.length}** quotes across **${allWorks}** distinct works. Consult this before mining more quotes so no single resource dominates a category. The per-work hero-pool cap is ${PER_SOURCE_CAP}; Michael Linsin's Smart Classroom Management is the one deliberate exemption (classroom culture).\n`;

// ── Topic scope (what belongs in this bank) ───────────────────────────────
// The inclusion/exclusion limits every quote is held to. Enforced by a
// semantic review (by meaning, not keywords); off-topic/controversial quotes
// are filtered via removed-quotes.json — see QUOTE-REMOVALS.md.
md += `\n## What belongs in this bank — topic scope\n\n`;
md += `Every quote must be **directly** about one of the four categories below. The bank is held to these limits by a semantic review (judged by meaning, not keyword matching)`;
if (removedCount) {
  md += `; **${removedCount}** off-topic/controversial quotes have been filtered out (see \`QUOTE-REMOVALS.md\`)`;
}
md += `.\n\n`;
md += `**In scope**\n\n`;
md += `- **classroom culture** — management, climate, routines, relationships, behavior.\n`;
md += `- **learning** — how students learn: cognition, motivation, assessment *for* learning.\n`;
md += `- **teaching** — instructional practice, pedagogy, planning, feedback.\n`;
md += `- **leading** — *education & team* leadership only: leading teachers, departments, schools, PLCs.\n\n`;
md += `**Out of scope (removed)**\n\n`;
md += `- **Corporate / CEO leadership** — generic management, business strategy, org performance (not education or teams of educators).\n`;
md += `- **EdTech politics & futurism** — AI/tech-adoption philosophy, tool/product descriptions, futurism with no concrete teaching practice.\n`;
md += `- **Law, religion, partisan politics** — and any otherwise controversial or off-topic social content.\n`;
md += `- **Parenting / home** — unless it maps directly to the classroom.\n`;
md += `- **Fragments** — cut-off phrases, citation lead-ins, worked-example scaffolding, garbled OCR.\n`;
for (const c of CATS) {
  const works = ledger[c] || {};
  const rows = Object.entries(works).sort((a, b) => b[1].count - a[1].count);
  const total = rows.reduce((sum, [, v]) => sum + v.count, 0);
  const bookN = rows
    .filter(([, v]) => v.sourceType === "book")
    .reduce((sum, [, v]) => sum + v.count, 0);
  md += `\n## ${c} — ${total} quotes · ${rows.length} works · ${bookN} books / ${total - bookN} articles\n\n`;
  md += "| Quotes | Type | Work | Author / source |\n|---:|:--|:--|:--|\n";
  for (const [work, v] of rows) {
    md += `| ${v.count} | ${v.sourceType} | ${esc(work)} | ${esc(v.byline)} |\n`;
  }
}
const ledgerPath = path.join(
  ROOT,
  "scripts",
  "quote-mining",
  "QUOTE-SOURCES.md",
);
fs.writeFileSync(ledgerPath, md);
console.log(
  `Wrote source ledger: scripts/quote-mining/QUOTE-SOURCES.md (${allWorks} works)`,
);
