// lib/resources-dedup.ts — duplicate resolution for the Resources panel.
//
// 6.12.26 redesign P1: a lesson carries resources in TWO seams — the
// per-section arrays (`LessonSectionContent.resources` in lib/lesson-flow.ts)
// and the lesson-level array (`Lesson.resources` in lib/types.ts). The panel
// renders the union, which today can paint the same resource twice.
//
// The canonical-owner rule (P1): SECTIONS ARE CANONICAL. Section resources
// render first, in their section order; the lesson-level array then merges in
// only the rows whose content identity is not already present. Render each
// resource once.
//
// Identity is CONSERVATIVE on purpose: two rows merge only when we are sure
// they are the same content (same server row id, or the same URL after a
// minimal normalization). A false merge silently hides a teacher's resource;
// a missed merge merely shows a duplicate. We therefore normalize only what
// is provably identity-neutral (host case, trailing slash) and never strip
// `www.`, the query string, or the fragment — `?id=A` vs `?id=B` are
// different Google docs, and `www.` vs apex can serve different content.
//
// Pure — no I/O, no React, no DOM.

import type { LessonResource } from "./types";

/**
 * Content identity for a resource. Three tiers, most reliable first:
 *
 *  1. `resourceId` — the persisted server row id. Same row, same resource.
 *  2. Normalized `url` — lowercased ORIGIN only (paths are case-sensitive:
 *     Drive file ids, youtu.be video ids, S3 keys…), trailing slash
 *     stripped, query string + fragment KEPT verbatim (see the
 *     conservatism note in the header).
 *  3. `${type}:${label}:${body}` — last resort for url-less rows (legacy
 *     fixtures, notes-only notecards). The `body` participates because
 *     url-less notecards routinely share the default "Notecard" label
 *     while carrying entirely different notes — label alone would merge
 *     them and silently hide one (§4a review H1).
 *
 * Tiers are prefixed (`id:` / `url:`) so a resourceId can never collide
 * with a url or a label across tiers.
 *
 * This returns the PRIMARY (most reliable) identity. For de-duplication use
 * {@link resourceAliases} — a row that carries BOTH a resourceId AND a url is
 * the same content as a row carrying only one of them, so dedup must match on
 * EITHER (§4a gate finding: a hosted section row `{resourceId, url}` and a
 * pasted lesson row `{url}` for the same link must collapse).
 */
export function resourceIdentity(r: LessonResource): string {
  return resourceAliases(r)[0];
}

/**
 * Every content-identity key a resource answers to. A persisted row exposes
 * BOTH its server-row alias (`id:`) and its url alias (`url:`) so it merges
 * with a url-only or id-only copy of the same content. Url-less rows fall
 * back to the single `${type}:${label}:${body}` alias. Order is reliability-
 * first, so `resourceIdentity` (the primary key) stays `id:` > `url:` > label.
 */
export function resourceAliases(r: LessonResource): string[] {
  const aliases: string[] = [];
  if (r.resourceId) aliases.push(`id:${r.resourceId}`);
  if (r.url) aliases.push(`url:${normalizeUrl(r.url)}`);
  if (aliases.length === 0) {
    aliases.push(`${r.type}:${r.label.trim().toLowerCase()}:${r.body ?? ""}`);
  }
  return aliases;
}

/** Minimal identity-neutral URL normalization: lowercase the ORIGIN
 *  (scheme + host are case-insensitive by spec), strip a trailing slash
 *  from the path, keep the path's case and the query + fragment
 *  byte-for-byte — URL paths are case-sensitive and routinely carry
 *  mixed-case identifiers (Drive file ids, youtu.be video ids, object
 *  keys). Root-relative / unparseable URLs get the same treatment applied
 *  textually (no origin to normalize, so nothing is lowercased). */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    // `URL` already lowercases protocol + host. Trailing slash on the
    // path is presentation, not identity; path CASE is identity.
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.origin.toLowerCase()}${path}${u.search}${u.hash}`;
  } catch {
    // Relative URL (e.g. hosted "/api/resources/{id}") or junk — strip a
    // trailing slash only; keep everything from "?"/"#" onward verbatim.
    const cut = trimmed.search(/[?#]/);
    const path = (cut === -1 ? trimmed : trimmed.slice(0, cut)).replace(
      /\/+$/,
      "",
    );
    return cut === -1 ? path : path + trimmed.slice(cut);
  }
}

/**
 * Merge the two resource seams into the single render list (P1).
 *
 * Section resources are canonical and come back first, in input order; the
 * lesson-level rows follow, minus any whose identity a section already owns.
 * Within-array duplicates collapse too — first occurrence wins, in both
 * arrays. Inputs are never mutated.
 */
export function dedupeLessonResources(input: {
  sectionResources: LessonResource[];
  lessonResources: LessonResource[];
}): LessonResource[] {
  const seen = new Set<string>();
  const out: LessonResource[] = [];
  for (const r of [...input.sectionResources, ...input.lessonResources]) {
    const aliases = resourceAliases(r);
    // Drop the row if it shares ANY identity alias with a row already kept —
    // a `{resourceId, url}` row and a `{url}`-only row are the same content.
    if (aliases.some((a) => seen.has(a))) continue;
    for (const a of aliases) seen.add(a);
    out.push(r);
  }
  return out;
}
