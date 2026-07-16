// wall-state.ts — persistence for the Resource Wall (Wave 9a): the teacher's
// custom walls, each section's background, and the color-by-subject switch.
//
// Storage is localStorage, per the wave's key contract:
//   cc_customwalls          — the "My Walls" list
//   cc_wall_secbg_<secId>   — a background pinned to ONE section
//   cc_wall_subjbg_<subjId> — a background pinned to a whole subject
//   cc_rw_subjcolor         — the color-sections-by-subject switch
//
// Everything here is READ DEFENSIVELY. localStorage is same-origin, but it is
// still untrusted input to this module: it survives across app versions (a wall
// saved by an older shape), it is user-editable, and a wall may later arrive
// from a sync or an import. So every read runs through a validator and a bad
// record is DROPPED, never partially applied — a wall that won't parse is a
// wall the teacher simply doesn't see, not a crashed route.
//
// Persisting to Supabase is out of scope for 9a (the planner/teach seams landed
// their own waves); these keys are the local seam the backend wave will adopt.

import { parseWallBackground, type WallBackground } from "./backgrounds";
import type { WallItem, WallSection, WallView } from "@/lib/wall-scope";
import type { WallPreset } from "@/lib/wall-scope";
import type { LessonResource } from "@/lib/types";

// ── Keys ─────────────────────────────────────────────────────────────────────

const CUSTOM_WALLS_KEY = "cc_customwalls";
const SUBJ_COLOR_KEY = "cc_rw_subjcolor";
const LAST_USED_KEY = "cc_wall_lastused"; // Record<wallId | presetId, epochMs>
const PINS_KEY = "cc_wall_pins"; // (wallId | presetId)[]
const PRESET_BG_KEY = "cc_wall_presetbg"; // Record<presetId, WallBackground>
// The section/subject background keys match the design bundle's names exactly
// (resource-wall.jsx:171-179) — this surface is net-new so there is no data to
// be compatible with, but keeping the documented key names avoids a silent
// divergence from any parallel reader.
const SECTION_BG_PREFIX = "cc_secbg_";
const SUBJECT_BG_PREFIX = "cc_subjbg_";

/** Cap on the stored wall list. localStorage is a ~5MB shared budget and a wall
 *  carries its whole section layout; without a cap, a teacher who saves on every
 *  edit eventually throws QuotaExceededError on an unrelated feature's write. */
const MAX_CUSTOM_WALLS = 60;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * How a saved wall came to exist. `forked` is the auto-fork product (the
 * teacher edited a preset — CLAUDE.md §2 lazy forking, applied to walls);
 * `section` is the single-section wall the "add section" flow saves;
 * `unanchored` is a wall built from scratch.
 */
export type WallAnchor = "forked" | "section" | "unanchored";

export interface CustomWall {
  id: string;
  name: string;
  anchor: WallAnchor;
  /** The preset this wall was forked from — the provenance line in the library. */
  forkedFrom?: string;
  /** The saved section layout. */
  layout: WallSection[];
  view: WallView;
  /** A wall-level backdrop set from the library's ⋯ → Set background. Stored as
   *  the same allowlisted descriptor as a section background, so the library's
   *  background sink (bundle wall-library.jsx:34) reuses the ONE gate. */
  bg?: WallBackground;
  /** A team-shared wall. There is no share/sync seam in 9a, so nothing sets
   *  this yet — it exists so the library's Personal/Team scope filter has a real
   *  field to read, and so a future shared wall lands in the right tab. */
  team?: boolean;
  /** Epoch ms. Sorted newest-first in the library. */
  created: number;
}

// ── localStorage helpers ─────────────────────────────────────────────────────

/** SSR-safe read. Returns null on the server and on any storage failure
 *  (Safari private mode throws on access, not just on write). */
function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** SSR-safe write. A failed write (quota, private mode) is swallowed: a
 *  background that doesn't persist is a cosmetic loss, not worth an error
 *  boundary — but it must not take the wall down with it. */
function writeRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private mode — the in-memory state stays correct. */
  }
}

function removeRaw(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* see writeRaw */
  }
}

// ── Custom walls ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const ANCHORS: readonly WallAnchor[] = ["forked", "section", "unanchored"];
const VIEWS: readonly WallView[] = ["med", "large", "icon", "list"];

/** The resource types a `LessonResource` may carry (lib/types.ts). A stored
 *  item whose type is outside this set is malformed and dropped. */
const RESOURCE_TYPES: readonly LessonResource["type"][] = [
  "slides",
  "pdf",
  "doc",
  "image",
  "youtube",
  "website",
  "link",
  "notecard",
];

function isResourceType(v: unknown): v is LessonResource["type"] {
  return typeof v === "string" && (RESOURCE_TYPES as readonly string[]).includes(v);
}

/**
 * Validate one stored card into a WallItem, or null.
 *
 * `cc_customwalls` is untrusted input (user-editable, cross-version, and a
 * future sync/import target), so an item read from it is shape-checked the same
 * way a background descriptor is — a card whose fields don't hold is DROPPED,
 * never passed through to the renderers / lightbox / board-send flow. The
 * embedded `resource` is narrowed to a plausible LessonResource (valid `type` +
 * string `label`); its `url` — the one field a render surface treats as a
 * link/img src — is only ever consumed downstream through the audited
 * isSafeUrl/isSafeImgSrc sink, so we keep it as a string but don't re-gate it
 * here. `composing` is transient and never persisted, so it is not restored.
 */
function parseWallItem(value: unknown): WallItem | null {
  if (!isRecord(value)) return null;
  const { key, type, label, resource, subjectId, lessonId, lessonTitle, lessons } = value;
  if (typeof key !== "string" || !key) return null;
  if (!isResourceType(type)) return null;
  if (typeof label !== "string") return null;
  if (typeof subjectId !== "string" || !subjectId) return null;
  if (typeof lessonId !== "string") return null; // "" is allowed (wall-authored note)
  if (typeof lessonTitle !== "string") return null;
  if (!isRecord(resource) || !isResourceType(resource.type)) return null;
  if (typeof resource.label !== "string") return null;

  const refs = Array.isArray(lessons)
    ? lessons.filter(
        (l): l is { id: string; title: string } =>
          isRecord(l) && typeof l.id === "string" && typeof l.title === "string",
      )
    : [];

  return {
    key,
    type,
    label,
    resource: resource as unknown as LessonResource,
    subjectId,
    lessonId,
    lessonTitle,
    lessons: refs,
  } as WallItem;
}

/** Validate one stored section. A section whose items aren't an array, or whose
 *  identity fields are missing, is unusable — drop it rather than render a
 *  section with an undefined id that would break drag targeting. Individual
 *  malformed items are dropped; a section with all-invalid items survives as an
 *  empty section (still a valid drop target). */
function parseSection(value: unknown): WallSection | null {
  if (!isRecord(value)) return null;
  const { id, title, meta, subjectId, lessonIds, items } = value;
  if (typeof id !== "string" || !id) return null;
  if (typeof title !== "string") return null;
  if (typeof subjectId !== "string") return null;
  if (!Array.isArray(items)) return null;
  const validItems = items
    .map(parseWallItem)
    .filter((it): it is WallItem => it !== null);
  return {
    id,
    title,
    meta: typeof meta === "string" ? meta : "",
    subjectId,
    // Optional by contract: a rehydrated section carries only the persisted
    // display fields, so an absent lessonIds is normal, not a defect.
    ...(Array.isArray(lessonIds)
      ? { lessonIds: lessonIds.filter((v): v is string => typeof v === "string") }
      : {}),
    items: validItems,
  } as WallSection;
}

function parseWall(value: unknown): CustomWall | null {
  if (!isRecord(value)) return null;
  const { id, name, anchor, forkedFrom, layout, view, bg, created } = value;
  if (typeof id !== "string" || !id) return null;
  if (typeof name !== "string" || !name) return null;
  if (!Array.isArray(layout)) return null;
  const sections = layout
    .map(parseSection)
    .filter((s): s is WallSection => s !== null);
  // parseWallBackground is the allowlist gate — a tampered wall-level bg
  // resolves to null and is simply dropped from the record.
  const parsedBg = parseWallBackground(bg);
  return {
    id,
    name,
    anchor: ANCHORS.includes(anchor as WallAnchor)
      ? (anchor as WallAnchor)
      : "unanchored",
    ...(typeof forkedFrom === "string" ? { forkedFrom } : {}),
    layout: sections,
    view: VIEWS.includes(view as WallView) ? (view as WallView) : "med",
    ...(parsedBg ? { bg: parsedBg } : {}),
    // `team` is DELIBERATELY not restored from storage. There is no seam that
    // legitimately produces a team wall this wave, so honoring a stored
    // `team:true` would let a hand-edited localStorage record masquerade as a
    // shared wall in the library's Team tab. The field stays in the type for
    // when the sync seam lands; until then reads force it false (omitted).
    created: typeof created === "number" && Number.isFinite(created) ? created : 0,
  };
}

/** The teacher's saved walls, newest first. Never throws. */
export function loadCustomWalls(): CustomWall[] {
  const raw = readRaw(CUSTOM_WALLS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseWall)
      .filter((w): w is CustomWall => w !== null)
      .sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}

export function saveCustomWalls(walls: CustomWall[]): void {
  writeRaw(CUSTOM_WALLS_KEY, JSON.stringify(walls.slice(0, MAX_CUSTOM_WALLS)));
}

/** A fresh, collision-free id for a wall, section, or card.
 *
 * `crypto.randomUUID` rather than the bundle's `'cw'+Date.now()`: Date.now()
 * collides when two ids are minted in the same millisecond (duplicate →
 * duplicate faster than the clock ticks), and a module-global counter is
 * cross-request shared mutable state under SSR. randomUUID is neither — and
 * this is never called during render (only in event handlers), so it cannot
 * diverge the server and client trees. The `cw` prefix keeps ids readable as
 * "custom wall" in storage. */
export function newWallId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `cw${uuid}`;
}

// ── Section backgrounds ──────────────────────────────────────────────────────

/** Which walls a background applies to. "subject" paints every section of that
 *  subject across every wall; "section" paints just this one. */
export type BackgroundScope = "section" | "subject";

function readBackground(key: string): WallBackground | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    // parseWallBackground is the allowlist gate — a tampered or stale-shape
    // descriptor resolves to null (follow-page), never to raw CSS.
    return parseWallBackground(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * PRECEDENCE (the one rule apply/reset both implement):
 *   explicit section override (this wall) > subject global > follow-page.
 *
 * The "this section" key is scoped by BOTH the wall and the subject:
 * `cc_secbg_<wallKey>:<subjectId>:<sectionId>`.
 *   • wallKey — section ids are not unique across walls (a fork/duplicate keeps
 *     them), so without it a "this section" background leaks onto every wall
 *     sharing that id (Codex R1 #4). A preset passes its preset id; a custom
 *     wall passes its wall id.
 *   • subjectId — lets "apply whole subject" find and clear THIS wall's stale
 *     section overrides for that subject via a prefix scan, so the subject
 *     value actually reaches every one of its sections (Codex R2 #3).
 * (sectionId may itself contain ":" — e.g. "day:0" — but that only ever sits at
 *  the END of the key, so the `<wallKey>:<subjectId>:` prefix stays unambiguous.)
 */
function sectionBgPrefix(wallKey: string, subjectId: string): string {
  return `${SECTION_BG_PREFIX}${wallKey}:${subjectId}:`;
}
function sectionBgKey(wallKey: string, subjectId: string, sectionId: string): string {
  return `${sectionBgPrefix(wallKey, subjectId)}${sectionId}`;
}

/** Remove every "this section" override for one subject on one wall — the
 *  mechanism behind "apply whole subject" and a whole-subject reset. */
function clearWallSubjectSectionKeys(wallKey: string, subjectId: string): void {
  if (typeof window === "undefined") return;
  const prefix = sectionBgPrefix(wallKey, subjectId);
  try {
    // Snapshot keys first — removing during iteration reindexes localStorage.
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) removeRaw(k);
  } catch {
    /* private mode / access denied — nothing to clear */
  }
}

/**
 * The background for a section: its own (wall-scoped) override first, then its
 * subject's global pin, then null (follow the page). Enforces the precedence
 * above — the narrower override wins.
 */
export function loadSectionBackground(
  wallKey: string,
  sectionId: string,
  subjectId: string,
): WallBackground | null {
  return (
    readBackground(sectionBgKey(wallKey, subjectId, sectionId)) ??
    readBackground(SUBJECT_BG_PREFIX + subjectId)
  );
}

/**
 * Pin a background.
 *   • "section" scope writes ONLY this wall's section-override key — no
 *     cross-wall, cross-subject side effect.
 *   • "subject" scope writes the global subject pin AND clears every stale
 *     section override for that subject on THIS wall, so the subject value
 *     actually reaches all of its sections here (otherwise a leftover section
 *     override would keep winning per the precedence rule — Codex R2 #3). Other
 *     walls' section overrides are theirs to keep.
 */
export function saveSectionBackground(
  wallKey: string,
  sectionId: string,
  subjectId: string,
  bg: WallBackground,
  scope: BackgroundScope,
): void {
  if (scope === "subject") {
    writeRaw(SUBJECT_BG_PREFIX + subjectId, JSON.stringify(bg));
    clearWallSubjectSectionKeys(wallKey, subjectId);
    return;
  }
  writeRaw(sectionBgKey(wallKey, subjectId, sectionId), JSON.stringify(bg));
}

/**
 * "Follow page style" on a SECTION — clears ONLY that section's own override
 * (this wall). It must NOT touch the global subject pin: resetting one section
 * used to delete `cc_subjbg_<subject>`, wiping the background from every section
 * of that subject on every wall (Codex R2 #2). After this the section falls
 * through to the subject pin (if any), then follow-page.
 */
export function resetSectionBackground(
  wallKey: string,
  sectionId: string,
  subjectId: string,
): void {
  removeRaw(sectionBgKey(wallKey, subjectId, sectionId));
}

/**
 * "Follow page style" at SUBJECT scope — the explicit whole-subject reset the
 * per-section reset deliberately no longer does. Drops the global subject pin
 * AND this wall's section overrides for that subject, so every one of the
 * subject's sections here returns to follow-page in one action. Other walls'
 * section overrides are untouched.
 */
export function resetSubjectBackground(wallKey: string, subjectId: string): void {
  removeRaw(SUBJECT_BG_PREFIX + subjectId);
  clearWallSubjectSectionKeys(wallKey, subjectId);
}

// ── Color-by-subject switch ──────────────────────────────────────────────────

export function loadSubjectColorPref(): boolean {
  return readRaw(SUBJ_COLOR_KEY) === "1";
}

export function saveSubjectColorPref(on: boolean): void {
  writeRaw(SUBJ_COLOR_KEY, on ? "1" : "0");
}

// ── Library: last-used, pins, preset backgrounds ─────────────────────────────

/** Epoch-ms of the last time each wall/preset was opened — the library's
 *  default "Last used" sort. A malformed entry is dropped, never trusted as a
 *  sort key. Keyed by wall id or preset id (both are opaque strings). */
export function loadLastUsed(): Record<string, number> {
  const raw = readRaw(LAST_USED_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Stamp a wall/preset as just-opened. */
export function touchLastUsed(id: string): Record<string, number> {
  const next = { ...loadLastUsed(), [id]: Date.now() };
  writeRaw(LAST_USED_KEY, JSON.stringify(next));
  return next;
}

/** The pinned wall/preset ids — floated to the top of every library sort. */
export function loadPins(): string[] {
  const raw = readRaw(PINS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function savePins(pins: string[]): void {
  writeRaw(PINS_KEY, JSON.stringify(pins));
}

/** Backgrounds pinned to a PRESET (a preset has no CustomWall record to hang a
 *  `bg` on, so its backdrop lives here, keyed by preset id). Every value is run
 *  through the allowlist gate on read. */
export function loadPresetBackgrounds(): Partial<Record<WallPreset, WallBackground>> {
  const raw = readRaw(PRESET_BG_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const out: Partial<Record<WallPreset, WallBackground>> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const bg = parseWallBackground(v);
      if (bg) out[k as WallPreset] = bg;
    }
    return out;
  } catch {
    return {};
  }
}

export function savePresetBackgrounds(
  map: Partial<Record<WallPreset, WallBackground>>,
): void {
  writeRaw(PRESET_BG_KEY, JSON.stringify(map));
}
