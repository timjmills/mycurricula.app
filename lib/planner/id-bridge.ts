// lib/planner/id-bridge.ts — slug ↔ uuid bridge (Wave A).
//
// The mock fixtures use human slugs as ids (lessons `m-12-0`, units `u-math-3`,
// subjects `math`, standard codes `5.NF.B.3`). The DB uses uuid primary keys.
// The importer assigns each row a DETERMINISTIC uuid v5 derived from its slug
// (within a fixed namespace), so:
//   • re-running the importer is stable (same slug → same uuid), and
//   • this bridge can resolve slug → uuid (and back, via a cache) WITHOUT a DB
//     round-trip for the common path.
//
// Pure + isomorphic (no I/O, no React) so both the server source and the
// importer share one source of truth for id mapping.

import { createHash } from "node:crypto";

/** Fixed namespace uuid for mycurricula planner slugs (random, frozen). */
const NS = "6f1d2c84-3b6a-4e2f-9a77-planner000000".replace(/[^0-9a-f]/g, "0");

/** RFC-4122 v5 (SHA-1, name-based) uuid from a namespace + name. Deterministic:
 *  the same (namespace, name) always yields the same uuid. */
export function uuidV5(name: string, namespace: string = NS): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(nsBytes)
    .update(Buffer.from(name, "utf8"))
    .digest();
  const bytes = hash.subarray(0, 16);
  // Set version (5) + RFC-4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Entity kinds get distinct sub-namespaces so a unit slug and a lesson slug
 *  that happen to collide as strings still map to different uuids. */
const KIND_SALT: Record<string, string> = {
  lesson: "lesson:",
  unit: "unit:",
  subject: "subject:",
  standard: "standard:",
  framework: "framework:",
};

/** Deterministic uuid for a mock entity slug of a given kind. */
export function slugToUuid(kind: keyof typeof KIND_SALT, slug: string): string {
  return uuidV5(`${KIND_SALT[kind] ?? `${kind}:`}${slug}`);
}

/** A reverse map (uuid → slug) for a known set of slugs of one kind. Built once
 *  per request from the entities actually loaded, so the source can map DB rows
 *  back to the slug ids the domain types + UI expect. */
export function buildReverseIndex(
  kind: keyof typeof KIND_SALT,
  slugs: readonly string[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const slug of slugs) m.set(slugToUuid(kind, slug), slug);
  return m;
}
