// lib/teach/toTeachResource.ts — LessonResource → TeachResource adapter.
//
// The Teach surface reuses the existing resource data path (plan §11.3): there
// is NO new resource fetch. This pure adapter derives the presentation `kind`
// the center canvas branches on from the resource's `provider`/`type` via the
// `lib/resource-embed.ts` taxonomy, applies a sensible default render target,
// and seeds empty `tags`. A `SectionResource` is a `LessonResource` with an
// `id`, so both inputs are accepted.

import type {
  LessonResource,
  ResourceRenderTarget,
  ResourceProvider,
  TeachResource,
} from "../types";
import { parseResourceUrl } from "../resource-embed";

/** Map a (provider, legacy type) pair to the Teach presentation kind. We branch
 *  on the fine-grained `provider` first (set at link-creation time), then fall
 *  back to the coarse legacy `type` for placeholder fixture rows without a URL. */
function deriveKind(
  provider: ResourceProvider | undefined,
  type: LessonResource["type"],
): TeachResource["kind"] {
  switch (provider) {
    case "youtube":
    case "vimeo":
    case "video":
      return "video";
    case "gslides":
      return "slides";
    case "gdocs":
    case "gsheets":
    case "gdrive":
      return "doc";
    case "pdf":
      return "pdf";
    case "image":
      return "image";
    case "audio":
      return "video"; // audio rides the native media branch alongside video
    case "website":
      return "link";
    default:
      break;
  }
  // No provider — lean on the legacy `type` glyph hint.
  switch (type) {
    case "slides":
      return "slides";
    case "pdf":
      return "pdf";
    case "doc":
      return "doc";
    case "image":
      return "image";
    case "youtube":
      return "video";
    case "website":
    case "link":
    default:
      return "link";
  }
}

/** Pick the default surface for a resource: embeddable kinds open full-bleed;
 *  bare links can only open externally. */
function defaultRenderTarget(
  kind: TeachResource["kind"],
  canEmbed: boolean,
): ResourceRenderTarget {
  if (kind === "link" && !canEmbed) return "external";
  return "embed";
}

/**
 * Project a `LessonResource` (or `SectionResource`) onto a `TeachResource`.
 * Pure — no I/O. When the resource carries a real URL we run it through
 * `parseResourceUrl` to recover the provider + embeddability; when it doesn't
 * (placeholder fixtures), we fall back to the row's own `provider`/`type`.
 */
export function toTeachResource(resource: LessonResource): TeachResource {
  const parsed = resource.url ? parseResourceUrl(resource.url) : null;
  const provider = resource.provider ?? parsed?.provider;
  const kind = deriveKind(provider, resource.type);
  const canEmbed = parsed?.canEmbed ?? false;
  return {
    ...resource,
    // Carry the derived provider back so the canvas renderer never re-detects.
    provider: provider ?? resource.provider,
    kind,
    defaultRenderTarget: defaultRenderTarget(kind, canEmbed),
    tags: [],
  };
}
