// lib/board-embed.ts — pure helpers for rendering a TeachResource full-bleed
// in the Teach center canvas (plan §5.1).
//
// This module owns the three decisions BoardCanvasResource needs and keeps
// them React-free + unit-testable:
//   1. resolveBoardSrc  — the URL to point an <iframe>/<img>/<video> at,
//                          honouring the hosted-file indirection.
//   2. boardEffectiveKind — what to render, branching on provider/mimeType
//                          FIRST (so a hosted PDF/image still renders right
//                          even though its app-relative src never matches a
//                          provider regex), then falling back to parsed.kind.
//   3. the two sandbox tiers — TRUSTED_PROVIDER_SANDBOX (the exact
//                          ResourceEmbed allowlist, for the known
//                          Google/YouTube/Vimeo providers) and the stricter
//                          GENERIC_LINK_SANDBOX (drops allow-same-origin) for
//                          arbitrary HTTPS links that claim embeddability.
//
// Security (plan §15): we never inject HTML — only `src`/`href`. We always set
// referrerPolicy="no-referrer" and never grant allow-top-navigation, so a
// hostile embed can't redirect the parent window. Hosted files are ALWAYS
// served via `/api/resources/{id}` (which re-signs an inline R2 URL on each
// load), never a raw presigned URL that would leak / expire.

import type { ParsedResource } from "./resource-embed";
import type { ResourceProvider, TeachResource } from "./types";

// ── Sandbox tiers ───────────────────────────────────────────────────────────

/**
 * The trusted-provider sandbox — byte-for-byte the string `ResourceEmbed`'s
 * `IframeEmbed` uses (components/resources/ResourceEmbed.tsx). Applied to the
 * known Google / YouTube / Vimeo allowlist whose players genuinely need
 * same-origin + scripts to function. Intentionally omits `allow-top-navigation`
 * and `allow-forms` to limit the blast radius if a provider's embed ever turned
 * hostile.
 */
export const TRUSTED_PROVIDER_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation";

/**
 * The stricter sandbox for arbitrary HTTPS links that *claim* they can be
 * framed. Drops `allow-same-origin` so the framed page is forced into an opaque
 * origin and cannot read app cookies / storage or script the parent. Scripts +
 * presentation are kept so a generic slide/site still renders; popups stay
 * sandboxed.
 */
export const GENERIC_LINK_SANDBOX =
  "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation";

/** The `allow` attribute (feature-policy) for the player iframe — same set
 *  ResourceEmbed grants. No payment/geolocation/etc. */
export const BOARD_IFRAME_ALLOW =
  "autoplay; encrypted-media; picture-in-picture; fullscreen";

/** Provider set that earns the trusted sandbox tier. Everything else that is
 *  still framed (a generic embeddable link) gets GENERIC_LINK_SANDBOX. */
const TRUSTED_PROVIDERS: ReadonlySet<ResourceProvider> =
  new Set<ResourceProvider>([
    "youtube",
    "vimeo",
    "gslides",
    "gdocs",
    "gsheets",
    "gdrive",
  ]);

/** Pick the sandbox tier for an iframe given the resource's provider. */
export function boardSandboxFor(
  provider: ResourceProvider | undefined,
): string {
  return provider && TRUSTED_PROVIDERS.has(provider)
    ? TRUSTED_PROVIDER_SANDBOX
    : GENERIC_LINK_SANDBOX;
}

// ── Source resolution ─────────────────────────────────────────────────────────

/**
 * The URL to render this resource from. A link/embed resource carries its own
 * `url`; a hosted file (no public URL) is served indirectly through
 * `/api/resources/{resourceId}`, which 302-redirects to a short-lived inline
 * presigned R2 URL. Returns null when neither is available (a placeholder
 * fixture row) — the renderer falls back to the "can't display" card.
 *
 * NOTE: we deliberately prefer `resource.url` only when it is a real http(s)
 * embed/link target. We never hand a raw presigned URL out of here — hosted
 * files always go through the API indirection.
 */
export function resolveBoardSrc(resource: TeachResource): string | null {
  if (resource.url) return resource.url;
  if (resource.resourceId) return `/api/resources/${resource.resourceId}`;
  return null;
}

/** The render branches BoardCanvasResource switches on. Distinct from the
 *  coarse `TeachResource["kind"]` because the canvas needs `embed` vs `pdf` vs
 *  native media as separate paths. */
export type BoardRenderKind =
  | "embed"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "link";

/**
 * Resolve the effective render kind, branching on `provider`/`mimeType` FIRST,
 * then the parsed kind, then the resource's own derived `kind`. This ordering
 * matters: a hosted PDF or image is served from `/api/resources/{id}`, which
 * won't match any provider regex, so `parseResourceUrl` on that app-relative
 * src would mis-detect it as a generic link. By consulting the stored
 * `provider`/`mimeType` first we render hosted files correctly.
 */
export function boardEffectiveKind(
  resource: TeachResource,
  parsed: ParsedResource | null,
): BoardRenderKind {
  // 1) Fine-grained provider (set at link-creation time) is the strongest
  //    signal for known embeds + directly-hosted media.
  switch (resource.provider) {
    case "youtube":
    case "vimeo":
    case "gslides":
    case "gdocs":
    case "gsheets":
    case "gdrive":
      return "embed";
    case "pdf":
      return "pdf";
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    default:
      break;
  }

  // 2) mimeType for hosted files (no provider — the API-indirected src).
  const mime = resource.mimeType?.toLowerCase();
  if (mime) {
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
  }

  // 3) The URL-parsed kind (covers extension-based hosted media + generic
  //    embeds we didn't tag with a provider).
  if (parsed) {
    switch (parsed.kind) {
      case "embed":
        return "embed";
      case "pdf":
        return "pdf";
      case "image":
        return "image";
      case "video":
        return "video";
      case "audio":
        return "audio";
      case "link":
        return "link";
    }
  }

  // 4) Last resort — the resource's own derived presentation kind.
  switch (resource.kind) {
    case "pdf":
      return "pdf";
    case "image":
      return "image";
    case "video":
      return "video";
    case "slides":
    case "doc":
      return "embed";
    default:
      return "link";
  }
}

/**
 * Whether this resource can be shown in-canvas at all. False for bare links
 * that frame-block (the og-preview `canEmbed:false` signal) — the renderer
 * shows the "can't display" card with an Open-in-new-tab affordance instead of
 * a blank iframe.
 */
export function boardCanEmbed(
  resource: TeachResource,
  parsed: ParsedResource | null,
  kind: BoardRenderKind,
): boolean {
  // A known provider / hosted media / pdf always embeds.
  if (kind !== "link") return true;
  // Generic link: respect the og-preview embeddability signal when present.
  // `parsed.canEmbed` is false for plain website links.
  return parsed?.canEmbed ?? false;
}
