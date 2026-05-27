// resource-embed.ts — URL → ParsedResource. Pure, no I/O.
//
// Maps a pasted/typed URL to the metadata the <ResourceEmbed> renderer
// needs: which embed surface to use (iframe / img / video / link card),
// the rewritten embed URL (e.g. youtube.com/watch?v=X → youtube-nocookie
// /embed/X), and a thumbnail when one is cheaply derivable.
//
// The renderer reads `provider` + `embedUrl`; the composer also reads
// `displayName` + `thumbnailUrl` to draw the capture-strip preview.
//
// Security: only http(s) URLs are accepted; everything else degrades to
// the link fallback. The renderer never injects HTML — every URL flows
// through React `src`/`href` props.

import type { LessonResource, ResourceProvider } from "./types";

export interface ParsedResource {
  /** Coarse kind. Maps 1:1 to the renderer's branch. */
  kind: "embed" | "image" | "video" | "audio" | "pdf" | "link";
  provider: ResourceProvider;
  /** The URL the renderer should point an <iframe>/<img>/<video> at.
   *  Null for non-embeddable generic links. */
  embedUrl: string | null;
  /** OG image / YouTube poster / null. */
  thumbnailUrl: string | null;
  /** Human label suggestion — caller may override. */
  displayName: string;
  /** False when only a link/fallback card can be drawn. */
  canEmbed: boolean;
}

// ── Provider regexes ──────────────────────────────────────────────────────
// Capture group 1 is always the id we need.
const RX = {
  youtubeWatch:
    /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#&?]*&)*v=([A-Za-z0-9_-]{11})/i,
  youtubeShort: /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i,
  youtubeShorts:
    /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
  youtubeEmbed:
    /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/i,
  vimeo:
    /^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/|channels\/[^/]+\/)?(\d+)/i,
  gslides: /^https?:\/\/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/i,
  gdocs: /^https?:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/i,
  gsheets: /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/i,
  gdriveFile: /^https?:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i,
  gdriveOpen: /^https?:\/\/drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/i,
};

const EXTS = {
  image: /\.(jpe?g|png|gif|webp|avif|svg)(?:\?.*)?$/i,
  video: /\.(mp4|webm|mov|m4v)(?:\?.*)?$/i,
  audio: /\.(mp3|m4a|wav|ogg|aac)(?:\?.*)?$/i,
  pdf: /\.pdf(?:\?.*)?$/i,
};

const SAFE_SCHEME = /^https?:\/\//i;

// ── Main ──────────────────────────────────────────────────────────────────

export function parseResourceUrl(raw: string): ParsedResource {
  const trimmed = raw.trim();
  if (!SAFE_SCHEME.test(trimmed)) {
    return fallback(trimmed);
  }

  let m: RegExpMatchArray | null;

  // YouTube — watch / short / shorts / already-embed forms all collapse
  // to the privacy-enhanced /embed/ID URL.
  if (
    (m = trimmed.match(RX.youtubeWatch)) ||
    (m = trimmed.match(RX.youtubeShort)) ||
    (m = trimmed.match(RX.youtubeShorts)) ||
    (m = trimmed.match(RX.youtubeEmbed))
  ) {
    const id = m[1];
    return {
      kind: "embed",
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      displayName: `YouTube · ${id}`,
      canEmbed: true,
    };
  }

  // Vimeo
  if ((m = trimmed.match(RX.vimeo))) {
    return {
      kind: "embed",
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${m[1]}`,
      // Vimeo's thumbnail API needs an OAuth token; defer to OG fetch.
      thumbnailUrl: null,
      displayName: `Vimeo · ${m[1]}`,
      canEmbed: true,
    };
  }

  // Google Slides — /edit → /embed
  if ((m = trimmed.match(RX.gslides))) {
    return {
      kind: "embed",
      provider: "gslides",
      embedUrl: `https://docs.google.com/presentation/d/${m[1]}/embed`,
      thumbnailUrl: null,
      displayName: "Google Slides",
      canEmbed: true,
    };
  }

  // Google Docs — /edit → /preview
  if ((m = trimmed.match(RX.gdocs))) {
    return {
      kind: "embed",
      provider: "gdocs",
      embedUrl: `https://docs.google.com/document/d/${m[1]}/preview`,
      thumbnailUrl: null,
      displayName: "Google Doc",
      canEmbed: true,
    };
  }

  // Google Sheets — /edit → /preview
  if ((m = trimmed.match(RX.gsheets))) {
    return {
      kind: "embed",
      provider: "gsheets",
      embedUrl: `https://docs.google.com/spreadsheets/d/${m[1]}/preview`,
      thumbnailUrl: null,
      displayName: "Google Sheet",
      canEmbed: true,
    };
  }

  // Google Drive — /view or /open?id= → /preview
  if (
    (m = trimmed.match(RX.gdriveFile)) ||
    (m = trimmed.match(RX.gdriveOpen))
  ) {
    return {
      kind: "embed",
      provider: "gdrive",
      embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`,
      thumbnailUrl: null,
      displayName: "Google Drive",
      canEmbed: true,
    };
  }

  // Extension-based fallbacks (directly hosted media).
  if (EXTS.image.test(trimmed)) {
    return {
      kind: "image",
      provider: "image",
      embedUrl: trimmed,
      thumbnailUrl: trimmed,
      displayName: basename(trimmed),
      canEmbed: true,
    };
  }
  if (EXTS.video.test(trimmed)) {
    return {
      kind: "video",
      provider: "video",
      embedUrl: trimmed,
      thumbnailUrl: null,
      displayName: basename(trimmed),
      canEmbed: true,
    };
  }
  if (EXTS.audio.test(trimmed)) {
    return {
      kind: "audio",
      provider: "audio",
      embedUrl: trimmed,
      thumbnailUrl: null,
      displayName: basename(trimmed),
      canEmbed: true,
    };
  }
  if (EXTS.pdf.test(trimmed)) {
    return {
      kind: "pdf",
      provider: "pdf",
      embedUrl: trimmed,
      thumbnailUrl: null,
      displayName: basename(trimmed),
      canEmbed: true,
    };
  }

  // Generic link — the renderer chooses literal/hyperlink/thumbnail
  // based on the resource's displayMode.
  return {
    kind: "link",
    provider: "website",
    embedUrl: null,
    thumbnailUrl: null,
    displayName: safeHostname(trimmed) ?? trimmed,
    canEmbed: false,
  };
}

function basename(url: string): string {
  try {
    const p = new URL(url).pathname;
    return decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)) || url;
  } catch {
    return url;
  }
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function fallback(raw: string): ParsedResource {
  return {
    kind: "link",
    provider: "website",
    embedUrl: null,
    thumbnailUrl: null,
    displayName: raw.slice(0, 80),
    canEmbed: false,
  };
}

/** Convenience: project a parsed result onto a LessonResource patch
 *  so the composer can spread it into the planner-store mutation. */
export function parsedToLessonResource(
  parsed: ParsedResource,
  url: string,
): Partial<LessonResource> {
  return {
    url,
    provider: parsed.provider,
    thumbnailUrl: parsed.thumbnailUrl ?? undefined,
    label: parsed.displayName,
  };
}

/** Map a parsed result to the legacy `LessonResource["type"]` field so
 *  the existing render sites (which still switch on `type` for the glyph)
 *  keep producing a sensible icon. The renderer prefers `provider`. */
export function parsedToLegacyType(
  parsed: ParsedResource,
): LessonResource["type"] {
  switch (parsed.provider) {
    case "youtube":
    case "vimeo":
    case "video":
      return "youtube";
    case "gslides":
      return "slides";
    case "gdocs":
      return "doc";
    case "gsheets":
      return "doc";
    case "gdrive":
    case "pdf":
      return "pdf";
    case "image":
      return "image";
    case "audio":
      return "link";
    case "website":
    default:
      return "website";
  }
}
