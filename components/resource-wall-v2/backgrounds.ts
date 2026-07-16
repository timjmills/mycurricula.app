// backgrounds.ts — the per-section background model for the Resource Wall
// (Wave 9a) and the CSS-safe builder that turns a stored descriptor into an
// inline style.
//
// SECURITY — why this file is structured and not free-text.
// The design bundle (resource-wall.jsx:198-202) stored a raw CSS string per
// background and interpolated it straight into a style object:
//     bg.type==='photo' ? { backgroundImage:`url('${bg.value}')` } : {}
// That is a CSS-injection sink: a value containing `')` closes the url() and
// everything after it is attacker-authored CSS. The descriptor also came back
// out of localStorage, so the sink's input is NOT trusted app state — it is
// whatever is in the store (hand-edited, corrupted, or restored from a future
// synced/shared wall).
//
// So this module never stores CSS. It stores an ALLOWLISTED DESCRIPTOR (a kind
// plus a key from a fixed table, or a photo src), and `backgroundStyle` is the
// only thing that builds CSS — from our own tables, not from stored text. The
// two consequences that matter:
//   • Every non-photo background is a table lookup. A tampered `swatch` /
//     `wash` / `shade` key simply fails to resolve and the section falls back
//     to follow-page. There is no string path into the CSS at all.
//   • The `photo.src` field is gated by `isSafePhotoSrc` — now a strict
//     `PHOTO_PRESETS.includes(src)` allowlist (the custom-upload path that once
//     justified an arbitrary-url gate was removed) — at PARSE time (so a hostile
//     value can't even land in memory) and again at RENDER time, then escaped
//     by `cssUrl`. Defense in depth on a value that is already a known constant.
//
// Tokens only (CLAUDE.md §4). The bundle's raw hex palette (#FFF6E6, #5BA8FF,
// …) is deliberately NOT ported — see COLOR_SWATCHES.

// ── The descriptor ───────────────────────────────────────────────────────────

/** Opacity bounds for a translucent background, mirroring the bundle's slider
 *  (resource-wall.jsx:244). Enforced on parse, so a stored 9000 can't paint an
 *  opaque section that hides its own cards. */
export const OPACITY_MIN = 10;
export const OPACITY_MAX = 85;

/** How much of the section's own subject color to lay down. `trans*` variants
 *  keep the frame material visible behind (the bundle's "see-through" swatches). */
export type SubjectTint = "full" | "soft" | "faint" | "transStrong" | "transSoft";

/** Keys into COLOR_SWATCHES. */
export type ColorSwatch = "surface" | "ink" | "honey" | "brand";

/** Keys into SHADES — the translucent shade the opacity slider acts on.
 *  "subject" resolves against the section's own color at render time. */
export type Shade = "subject" | "surface" | "ink" | "honey" | "brand";

/** Keys into WASHES. */
export type Wash = "dawn" | "honey" | "mint" | "brand";

/**
 * A section background. `null` (never a descriptor) means "follow page style" —
 * the section inherits the wall's frame material, which is the default and the
 * reset target.
 */
export type WallBackground =
  | { kind: "subject"; tint: SubjectTint }
  | { kind: "color"; swatch: ColorSwatch }
  | { kind: "translucent"; shade: Shade; opacity: number }
  | { kind: "wash"; wash: Wash }
  | { kind: "photo"; src: string };

// ── The tables (the ONLY source of background CSS) ───────────────────────────

/**
 * The "Color" row.
 *
 * The bundle offered ten raw hexes (#FFFFFF / #1C1B2E / #FFF6E6 / #FFE9D6 /
 * #FCE4EF / #F3E6FB / #E6F1FF / #E3F6EE / #FBE9E7 / #EEF1F4). Those cannot be
 * ported: CLAUDE.md §4 forbids a hard-coded hex, and — more than a lint rule —
 * a fixed hex is theme-blind. #FFFFFF is a white card punched into Night; the
 * warm pastels fight every non-Paper theme. So the row is rebuilt from the
 * token families that actually theme (surface / ink / honey / brand), mixed
 * toward the live surface so each swatch re-tints per theme. The pastel hues
 * the hex list reached for (mint / blossom / sky) have no token family of their
 * own — the Wash row below covers them via the --grad-* tokens instead.
 */
const COLOR_SWATCHES: Record<ColorSwatch, string> = {
  surface: "var(--surface)",
  ink: "var(--ink-900)",
  honey: "color-mix(in oklab, var(--honey-500) 18%, var(--surface))",
  brand: "color-mix(in oklab, var(--brand-500) 16%, var(--surface))",
};

/** Human labels for the Color row (the popover's swatch tooltips). */
export const COLOR_SWATCH_LABELS: Record<ColorSwatch, string> = {
  surface: "Page surface",
  ink: "Deep ink",
  honey: "Honey tint",
  brand: "Brand tint",
};

/** The shade a translucent background mixes from. "subject" is resolved at
 *  render time against the section's own --sc, so it follows the palette. */
const SHADES: Record<Shade, string> = {
  subject: "var(--sc)",
  surface: "var(--surface)",
  ink: "var(--ink-900)",
  honey: "var(--honey-500)",
  brand: "var(--brand-500)",
};

export const SHADE_LABELS: Record<Shade, string> = {
  subject: "This subject's color",
  surface: "Page surface",
  ink: "Deep ink",
  honey: "Honey",
  brand: "Brand blue",
};

/** The "Wash" row — verbatim from the bundle's SECBG_WASH (resource-wall.jsx:182),
 *  including its "Sky" label for the brand gradient. These are gradient tokens,
 *  so they re-cut per theme. */
const WASHES: Record<Wash, string> = {
  dawn: "var(--grad-dawn)",
  honey: "var(--grad-honey)",
  mint: "var(--grad-mint)",
  brand: "var(--grad-brand)",
};

export const WASH_LABELS: Record<Wash, string> = {
  dawn: "Dawn",
  honey: "Honey",
  mint: "Mint",
  brand: "Sky",
};

/** Subject-tint recipes. The opaque three mix toward the surface (not toward
 *  white — a hard #fff would punch a hole in Night); the `trans*` two mix toward
 *  transparent so the frame material reads through. */
const SUBJECT_TINTS: Record<SubjectTint, string> = {
  full: "var(--sc)",
  soft: "color-mix(in oklab, var(--sc) 55%, var(--surface))",
  faint: "color-mix(in oklab, var(--sc) 26%, var(--surface))",
  transStrong: "color-mix(in oklab, var(--sc) 55%, transparent)",
  transSoft: "color-mix(in oklab, var(--sc) 28%, transparent)",
};

export const SUBJECT_TINT_LABELS: Record<SubjectTint, string> = {
  full: "Subject color",
  soft: "Subject color, softened",
  faint: "Subject color, faint",
  transStrong: "Subject tint, see-through",
  transSoft: "Subject tint, barely there",
};

/**
 * The bundled photo backgrounds — an EXACT-PATH ALLOWLIST, not a directory
 * convention. The bundle referenced fictional `photos/p1.png`; these are the
 * real shipped assets. An exact list (rather than a `/stage/*.webp` prefix
 * test) means a preset can never be talked into pointing somewhere else.
 */
export const PHOTO_PRESETS: readonly string[] = [
  "/stage/p1.webp",
  "/stage/p2.webp",
  "/stage/p3.webp",
  "/stage/p4.webp",
  "/stage/p5.webp",
];

// ── The photo gate ───────────────────────────────────────────────────────────

/**
 * True ONLY when `src` is one of the bundled presets (exact match).
 *
 * There is deliberately no `isSafeImgSrc` fallback anymore. That arm existed for
 * the custom-photo UPLOAD path (a `blob:` URL); the upload was removed (Codex
 * R1 #1), so the ONLY legitimate photo source is now this fixed allowlist. Once
 * the sole input is a known-good constant, accepting arbitrary
 * http(s)/blob:/root-relative/`data:image` is pure downside — a hand-edited or
 * restored localStorage descriptor could persist a REMOTE url (a tracking-pixel
 * beacon today; a cross-teacher vector once walls ever sync). Reject it at the
 * boundary (Codex R2 #1). Wall-level photo backgrounds share this gate via
 * `parseWallBackground`, so the tightening covers them too.
 */
export function isSafePhotoSrc(src: string | null | undefined): src is string {
  return typeof src === "string" && PHOTO_PRESETS.includes(src);
}

/**
 * Serialize an already-gated src into a CSS url() token.
 *
 * This is the escape half of the fix for the bundle's injection hole. The value
 * is wrapped in a DOUBLE-quoted CSS string, inside which exactly two characters
 * are special: `"` (closes the string) and `\` (escapes the next character).
 * Backslash-escaping both is therefore a complete break-out defense — the
 * `')` payload that defeats the bundle's `url('${v}')` cannot terminate this
 * string, and neither can `")`. Raw newline/CR/tab, the other way to break a
 * CSS string, are already rejected upstream by isSafeUrl's SMUGGLE_CHARS test.
 */
function cssUrl(src: string): string {
  return `url("${src.replace(/[\\"]/g, (ch) => `\\${ch}`)}")`;
}

// ── Parse (the trust boundary) ───────────────────────────────────────────────

function clampOpacity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 35;
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(n)));
}

function hasKind(value: unknown): value is { kind: unknown } {
  return typeof value === "object" && value !== null && "kind" in value;
}

/**
 * Validate an untrusted value (a localStorage read, a restored wall) into a
 * WallBackground, or null for "follow page style" / anything unrecognized.
 *
 * This is the trust boundary: every field is checked against the tables above,
 * the opacity is clamped, and a photo src must pass {@link isSafePhotoSrc}.
 * Returning null on garbage is deliberate — an unreadable background is a
 * section that follows the page, never a section that throws or paints
 * attacker CSS.
 */
export function parseWallBackground(value: unknown): WallBackground | null {
  if (!hasKind(value)) return null;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case "subject":
      return typeof v.tint === "string" && v.tint in SUBJECT_TINTS
        ? { kind: "subject", tint: v.tint as SubjectTint }
        : null;
    case "color":
      return typeof v.swatch === "string" && v.swatch in COLOR_SWATCHES
        ? { kind: "color", swatch: v.swatch as ColorSwatch }
        : null;
    case "translucent":
      return typeof v.shade === "string" && v.shade in SHADES
        ? {
            kind: "translucent",
            shade: v.shade as Shade,
            opacity: clampOpacity(v.opacity),
          }
        : null;
    case "wash":
      return typeof v.wash === "string" && v.wash in WASHES
        ? { kind: "wash", wash: v.wash as Wash }
        : null;
    case "photo":
      // Only a bundled preset survives the gate. A stored non-preset src (a
      // remote url a tampered/restored record slipped in) resolves to null →
      // follow-page, never a fetch.
      return typeof v.src === "string" && isSafePhotoSrc(v.src)
        ? { kind: "photo", src: v.src }
        : null;
    default:
      return null;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

/** The inline style properties a background contributes. Kept to background-*
 *  only: a background must never be able to reposition or resize its section. */
export interface BackgroundStyle {
  background?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
}

/**
 * Build the inline style for a background descriptor. `null` → an empty style
 * (follow page). Subject-relative recipes resolve against `--sc`, which the
 * Section sets from useSubjectColor — so this never needs the subject id and a
 * palette change re-tints without touching stored state.
 */
export function backgroundStyle(bg: WallBackground | null): BackgroundStyle {
  if (!bg) return {};
  switch (bg.kind) {
    case "subject":
      return { background: SUBJECT_TINTS[bg.tint] };
    case "color":
      return { background: COLOR_SWATCHES[bg.swatch] };
    case "translucent":
      return { background: translucentValue(bg.shade, bg.opacity) };
    case "wash":
      return { background: WASHES[bg.wash] };
    case "photo":
      // Re-gate at the sink. isSafePhotoSrc already ran at parse time; this
      // second check is the one that matters if a descriptor ever reaches here
      // by a path that skipped the parser (a future sync payload, a direct
      // construction in a test). Rejected → follow-page, never a raw url().
      if (!isSafePhotoSrc(bg.src)) return {};
      return {
        backgroundImage: cssUrl(bg.src),
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
  }
}

/** The CSS color for a translucent shade at an opacity — also used by the
 *  popover's live preview swatch, so preview and applied value can't drift. */
export function translucentValue(shade: Shade, opacity: number): string {
  const pct = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(opacity)));
  return `color-mix(in oklab, ${SHADES[shade]} ${pct}%, transparent)`;
}

/** True when the background is dark enough that the section's own ink would
 *  disappear into it, so the Section flips to the inverse ink ramp. Only the
 *  two descriptors we KNOW are dark qualify — a photo is unknowable without
 *  sampling it, and gets a scrim instead (see Section.module.css). */
export function needsInverseInk(bg: WallBackground | null): boolean {
  if (!bg) return false;
  if (bg.kind === "color") return bg.swatch === "ink";
  if (bg.kind === "translucent") {
    return bg.shade === "ink" && bg.opacity >= 55;
  }
  return false;
}
