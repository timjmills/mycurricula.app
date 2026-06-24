// lib/sanitize-html.ts — strict HTML sanitization for teacher-authored rich
// text before it is rendered via dangerouslySetInnerHTML.
//
// WHY THIS EXISTS (audit finding #9 — stored XSS):
// The rich-text editor persists raw contentEditable HTML, and several render
// sites (weekly lesson card, lesson flow) inject that HTML directly with
// dangerouslySetInnerHTML. Once the forking model lets one teacher's content
// reach a teammate's screen, any <script>, on*-handler, javascript: URL, or
// data: payload in stored HTML would execute in the viewer's session. Every
// render AND every write must pass through sanitizeHtml() so stored data and
// rendered data are both clean.
//
// IMPLEMENTATION: we use DOMPurify (the vetted, battle-tested sanitizer,
// preferred over a hand-rolled regex). On the client it runs against the real
// browser window. On the server — including the Cloudflare Worker that hosts
// this app — there is no DOM, so we back DOMPurify with `linkedom`, a tiny,
// edge-friendly DOM. We deliberately do NOT use `isomorphic-dompurify`, which
// pulls in `jsdom` (multiple MB, including a ~2 MiB generated CSS module);
// jsdom blows past Cloudflare's worker size limit and is dead weight in a
// non-browser runtime. linkedom is a fraction of the size.
//
// The STRICT allowlist below is layered on top of DOMPurify's already-safe
// defaults so output is limited to the formatting the editor can actually
// produce, and an afterSanitizeAttributes hook hardens <a> targets. The
// allowlist, hooks, and behavior are identical across client and server — only
// the DOM backing differs.
//
// INLINE MEDIA (notecard bodies): <img> and safe <iframe> embeds are allowed,
// but tightly. An <img src> must be http(s)/blob:/data:image/root-relative; an
// <iframe> may only point at the trusted embed hosts (YouTube[-nocookie],
// Vimeo player, Google Docs/Drive), and its sandbox/allow/referrerpolicy are
// force-overwritten to safe values regardless of what the author wrote. Any
// other-origin iframe, or an img with an unsafe src, is removed outright. See
// the SAFE_IMG_SRC / TRUSTED_IFRAME_HOSTS constants and the two media hooks.

import createDOMPurify from "dompurify";
import { parseHTML, NodeFilter } from "linkedom";

// The narrow slice of DOMPurify's public surface we depend on. Using a local
// alias keeps us honest if the dependency's full type ever shifts.
// Shape of the per-attribute hook payload DOMPurify hands to
// `uponSanitizeAttribute`. We read attrName/attrValue to vet inline-media src
// and flip keepAttr to keep or drop it. `forceKeepAttr` is left untouched.
type SanitizeAttributeHookEvent = {
  attrName: string;
  attrValue: string;
  keepAttr: boolean;
  forceKeepAttr?: boolean;
};

type DOMPurifyInstance = {
  sanitize: (dirty: string, cfg: Record<string, unknown>) => string;
  addHook: {
    (
      entryPoint: "afterSanitizeAttributes",
      hook: (node: Element) => void,
    ): void;
    (
      entryPoint: "uponSanitizeAttribute",
      hook: (node: Element, data: SanitizeAttributeHookEvent) => void,
    ): void;
  };
  // false when DOMPurify can't run in this runtime. We treat that as fatal
  // (fail closed) rather than let sanitize() return the dirty input verbatim.
  isSupported: boolean;
};

// Allowed tags — the formatting vocabulary the rich-text editor can emit
// (bold/italic/underline/strike, sub/sup, headings, lists, links, code,
// blockquote, figure/figcaption resource cards, and the <font>/<span> wrappers
// execCommand produces for color, highlight, and font-family/size). Everything
// not listed is stripped.
const ALLOWED_TAGS = [
  "p",
  "br",
  "div",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "sub",
  "sup",
  "mark",
  "small",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  // <figure>/<figcaption> wrap the editor's inline resource "cards" (an image
  // or embed with an optional caption). They carry no script surface — figure
  // is a plain grouping element and figcaption holds plain text — so allowing
  // them only widens the structural vocabulary, never the attack surface. The
  // media INSIDE a figure (<img>/<iframe>) is still individually vetted by the
  // hooks below. The interactive checklist the editor emits reuses <ul>/<li>
  // (already allowed) and carries its state on `data-checklist`/`data-checked`,
  // which DOMPurify keeps by default (ALLOW_DATA_ATTR) — no new attr needed.
  "figure",
  "figcaption",
  // execCommand('foreColor'/'hiliteColor'/'fontName'/'fontSize') wraps
  // selections in <font color|face|size>. Allowed, but its attributes are
  // constrained to the safe set below.
  "font",
  // Inline media for notecard / rich-resource bodies. BOTH are XSS-sensitive
  // and are hardened by the afterSanitizeAttributes hook below — an <img> with
  // an unsafe src has its src dropped; an <iframe> whose src is not on the
  // trusted embed-host allowlist is removed ENTIRELY. The tags only appear
  // here so DOMPurify keeps them long enough for that hook to vet them.
  "img",
  "iframe",
];

// Allowed attributes — only presentational / link attributes that cannot carry
// script. NOTE: `style` is intentionally allowed because the editor applies
// inline color/highlight via it, but DOMPurify scrubs dangerous CSS
// (url(), expression(), behaviour:) from style values by default. `on*`
// event-handler attributes are NOT in this list, so they are removed.
const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "title",
  // <font> presentational attributes from execCommand.
  "color",
  "face",
  "size",
  // inline color / highlight styling.
  "style",
  // list typing / alignment that execCommand can emit.
  "align",
  // Inline media (<img>/<iframe>). `src` is allowed here so the node survives
  // attribute scrubbing, then the afterSanitizeAttributes hook RE-VALIDATES it
  // (img: safe scheme; iframe: trusted host) and drops the src or the whole
  // node when it fails. `width`/`height` are layout-only and cannot carry
  // script. `alt`/`loading` are img metadata. `allow`/`sandbox`/
  // `referrerpolicy`/`allowfullscreen` are iframe hardening attributes the hook
  // FORCES to a known-safe value, so even a hostile authored value is
  // overwritten. NOTE: `srcset` is deliberately NOT allowed — it is a second
  // image-source channel that would bypass the single-`src` check, and it stays
  // in FORBID_ATTR below.
  "src",
  "width",
  "height",
  "alt",
  "loading",
  "allow",
  "sandbox",
  "referrerpolicy",
  "allowfullscreen",
];

// Force-strip these outright regardless of context — defence in depth on top
// of the allowlist (DOMPurify already drops most of these, but naming them is
// explicit and future-proof against config drift).
//
// NOTE: `img` and `iframe` were REMOVED from this list to support inline
// notecard media. They are now allow-listed in ALLOWED_TAGS and individually
// vetted by the afterSanitizeAttributes hook (img → safe src scheme only;
// iframe → trusted embed host only, else the whole element is removed). All the
// other heavyweight/script-capable elements remain force-stripped.
const FORBID_TAGS = [
  "script",
  "object",
  "embed",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "style",
  "link",
  "meta",
  "base",
  "video",
  "audio",
  "source",
  "track",
];

const FORBID_ATTR = [
  // belt-and-braces: never let any inline event handler through.
  "onerror",
  "onload",
  "onclick",
  "onmouseover",
  "onfocus",
  "onanimationstart",
  // `srcset` stays forbidden: it is a second image-source channel that would
  // sidestep the single-`src` validation in the hook. `src` itself is NO LONGER
  // force-stripped (inline media needs it) — it is allow-listed above and
  // re-validated per-element by the hook.
  "srcset",
  // `srcdoc` would let an <iframe> carry inline HTML (a direct script vector);
  // force-strip it so a trusted-host frame can still never run author markup.
  "srcdoc",
  // `name` enables window-name targeting tricks across frames; not needed.
  "name",
  "formaction",
  "xlink:href",
];

// Only http(s) and mailto URLs may appear in href. This blocks javascript:,
// data:, vbscript:, file:, and protocol-relative tricks. (Tel/anchor refs are
// not needed by the editor, so they are excluded deliberately — err toward
// stripping.)
//
// NOTE: this regex is passed to DOMPurify as ALLOWED_URI_REGEXP, which governs
// EVERY URI attribute it recognises — including <img src> and <iframe src>.
// We deliberately do NOT widen it to permit data:/blob: globally (that would
// reopen `<a href="data:text/html,…">` and similar). It stays strict and owns
// the `href` decision.
//
// Inline-media `src` is handled on a SEPARATE, stricter path so this regex never
// gets a vote on it: the `uponSanitizeAttribute` hook fires for each attribute
// BEFORE DOMPurify's URI check, validates `src` against SAFE_IMG_SRC (img) or
// isTrustedIframeSrc (iframe), and sets `forceKeepAttr` to push the already-
// vetted value through — bypassing this regex (which would otherwise reject a
// legitimate `data:image/png`/`blob:` <img src>). The later
// `afterSanitizeAttributes` hook then removes any element whose src failed the
// gate and force-hardens surviving iframes. See both hooks below.
const SAFE_URI = /^(?:https?:|mailto:)/i;

// ── Inline-media src validation (XSS-sensitive) ───────────────────────────────
//
// These matchers are applied by the afterSanitizeAttributes hook to the raw,
// author-supplied src of inline media. They are intentionally strict; anything
// that does not match is dropped.

// <img src> may be: http(s), blob:, a base64 data:IMAGE payload (NEVER
// data:text/html or any non-image data: type — those are script/markup
// vectors), or a same-origin ROOT-RELATIVE path ("/api/resources/{id}").
// Protocol-relative "//host" and backslash tricks ("/\host") are rejected
// because browsers resolve them to a foreign origin. Mirrors
// ResourceEmbed.isSafeUrl, extended with the data:image allowance the
// composer's local-preview path needs.
//
// data:image/svg+xml is allowed ONLY because an SVG loaded as an <img> SOURCE
// runs in image context, where the browser disables all scripting (inline
// <script>, on* handlers, external refs) — the well-established safe boundary
// for SVG. We additionally require `;base64,`, so a plain
// `data:image/svg+xml,<svg onload=…>` (non-base64) is rejected outright. SVG is
// never allowed as an element (it stays in FORBID_TAGS), only as an image src.
const SAFE_IMG_SRC =
  /^(?:https?:\/\/|blob:|data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,|\/(?![/\\]))/i;

// The ONLY hosts whose frames may be embedded. This is the same trusted set the
// runtime <iframe> renderers ship (ResourceEmbed / BoardCanvasResource) and the
// hosts parseResourceUrl rewrites to. An <iframe> whose src host is not on this
// list is removed in full — we never render an arbitrary-origin frame.
const TRUSTED_IFRAME_HOSTS = [
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "www.youtube.com",
  "youtube.com",
  "player.vimeo.com",
  "docs.google.com",
  "drive.google.com",
];

// Forced iframe hardening — identical to the values the React <iframe>
// renderers ship (components/resources/ResourceEmbed.tsx). The hook OVERWRITES
// whatever the author supplied with these, so a hostile sandbox/allow value
// cannot widen the frame's privileges. `sandbox` withholds allow-top-navigation
// and allow-forms (no use-case; smaller blast radius if a provider turns
// hostile); `referrerpolicy` stops referrer leakage; `allow` matches the
// players' feature needs.
const IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation";
const IFRAME_ALLOW =
  "autoplay; encrypted-media; picture-in-picture; fullscreen";
const IFRAME_REFERRERPOLICY = "no-referrer";

/** True when an iframe src points at a trusted embed host (and only then).
 *  Parses via the URL API so we compare the real host, not a substring that
 *  could be spoofed ("youtube.com.evil.test", "evil.test/youtube.com", a
 *  "@"-userinfo trick, etc.). Relative/blob/data srcs have no trusted host and
 *  are rejected. */
function isTrustedIframeSrc(src: string): boolean {
  let host: string;
  try {
    // Resolve against a fixed absolute base so a relative src cannot
    // accidentally inherit a trusted host; relative inputs land on example.test
    // and fail the allowlist. Only absolute http(s) inputs keep their own host.
    const u = new URL(src, "https://invalid.example.test");
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return TRUSTED_IFRAME_HOSTS.includes(host);
}

// Build a DOMPurify instance for the current runtime, exactly once. On the
// client we hand it the real browser window. On the server we hand it a window
// backed by linkedom (see makeServerWindow). Memoized so the (comparatively
// expensive) server DOM is built a single time and the hook is registered once.
let instance: DOMPurifyInstance | null = null;

// On the server, linkedom keeps `nodeType`/`parentNode` as instance-OWN data
// properties, and its `window`/`DOMParser` are not the shapes DOMPurify probes
// for. makeServerWindow() returns a minimal, writable window shim that exposes
// exactly the surface DOMPurify reads, delegating the actual DOM to linkedom.
// This is only ever CALLED on the server branch of getInstance(); linkedom is
// statically imported so the Cloudflare Worker bundle includes it (and never
// jsdom). On the client this function is never invoked.
function makeServerWindow(): Window {
  const base = parseHTML(
    "<!DOCTYPE html><html><head></head><body></body></html>",
  );
  const linkedomWindow = base.window as unknown as Record<string, unknown>;
  const linkedomDocument = base.document as unknown as Document &
    Record<string, unknown>;

  // DOMPurify reads nodeType/parentNode via lookupGetter on the Node/Element
  // prototypes. linkedom stores them as instance-own data properties, so the
  // prototype lookup misses them and DOMPurify would strip every node. Expose
  // prototype accessors: the getter reads the instance own value, the setter
  // re-creates the own data property so linkedom's own constructor assignment
  // (`this.nodeType = n`) still works and normal reads stay correct (the own
  // data property shadows the accessor for `.`-access).
  const NodeCtor = linkedomWindow.Node as { prototype: object };
  for (const prop of ["nodeType", "parentNode"] as const) {
    if (!Object.getOwnPropertyDescriptor(NodeCtor.prototype, prop)) {
      Object.defineProperty(NodeCtor.prototype, prop, {
        configurable: true,
        get(this: object) {
          return Object.getOwnPropertyDescriptor(this, prop)?.value;
        },
        set(this: object, value: unknown) {
          Object.defineProperty(this, prop, {
            value,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        },
      });
    }
  }

  // A DOMParser whose parseFromString actually populates the body. linkedom's
  // native DOMParser returns an EMPTY document, which would make DOMPurify's
  // primary parse path silently drop all content (a fail-open hole). parseHTML
  // does the real parsing.
  class LinkeDOMParser {
    parseFromString(markup: string): Document {
      return parseHTML(
        "<!DOCTYPE html><html><head></head><body>" +
          String(markup) +
          "</body></html>",
      ).document as unknown as Document;
    }
  }

  // document.implementation.createHTMLDocument is required both for
  // DOMPurify.isSupported and as its createDocument fallback. linkedom's
  // document has no `implementation`, so provide a minimal one.
  if (!linkedomDocument.implementation) {
    Object.defineProperty(linkedomDocument, "implementation", {
      configurable: true,
      value: {
        createHTMLDocument(title?: string): Document {
          return parseHTML(
            "<!DOCTYPE html><html><head><title>" +
              (title == null ? "" : String(title)) +
              "</title></head><body></body></html>",
          ).document as unknown as Document;
        },
      },
    });
  }

  // linkedom's own `window` rejects assignment of DOMParser/NodeFilter (they
  // live on a prototype as read-only accessors), so we cannot mutate it. Hand
  // DOMPurify a plain, writable object exposing only what it reads, delegating
  // the DOM to linkedom.
  const windowShim: Record<string, unknown> = {
    document: linkedomDocument,
    DocumentFragment: linkedomWindow.DocumentFragment,
    HTMLTemplateElement: linkedomWindow.HTMLTemplateElement,
    HTMLFormElement: linkedomWindow.HTMLFormElement,
    Node: linkedomWindow.Node,
    Element: linkedomWindow.Element,
    NodeFilter: linkedomWindow.NodeFilter ?? NodeFilter,
    NamedNodeMap: linkedomWindow.NamedNodeMap,
    DOMParser: LinkeDOMParser,
    trustedTypes: undefined,
  };

  return windowShim as unknown as Window;
}

function getInstance(): DOMPurifyInstance {
  if (instance) return instance;

  // Client: a real browser window with a real document. Server (incl. the
  // Cloudflare Worker): build a linkedom-backed window. The `window.document`
  // guard avoids false positives from non-DOM globals that define `window`.
  const hasBrowserDOM =
    typeof window !== "undefined" &&
    typeof window.document !== "undefined" &&
    window.document.nodeType === 9;

  const factory = createDOMPurify as unknown as (
    win: Window,
  ) => DOMPurifyInstance;
  const dompurify = hasBrowserDOM
    ? factory(window)
    : factory(makeServerWindow());

  // Fail CLOSED. When DOMPurify can't run, its sanitize() returns the dirty
  // input unchanged — which would silently ship unsanitized teacher HTML to a
  // teammate's screen (stored XSS, the exact threat this module exists to
  // stop). If the runtime DOM ever fails DOMPurify's support probe, refuse to
  // operate rather than hand back attacker-controlled markup.
  if (!dompurify.isSupported) {
    throw new Error(
      "sanitizeHtml: DOMPurify is not supported in this runtime; refusing to " +
        "return unsanitized HTML.",
    );
  }

  // ── Inline-media src gate (runs BEFORE DOMPurify's own URI check) ──────────
  // DOMPurify's ALLOWED_URI_REGEXP (SAFE_URI) is intentionally strict and would
  // strip blob:/data:image <img src> values before afterSanitizeAttributes ever
  // sees them. uponSanitizeAttribute fires earlier — for each attribute, with
  // the raw author value — and lets us decide an attribute's fate ourselves.
  //
  // We ONLY special-case the `src` of <img>/<iframe>:
  //   • <img src>   — keep iff it matches SAFE_IMG_SRC (http(s)/blob/data:image/
  //     root-relative); otherwise drop the attribute (the bare <img> is then
  //     removed by the afterSanitize hook).
  //   • <iframe src> — keep iff isTrustedIframeSrc (host on the allowlist);
  //     otherwise drop it (the bare <iframe> is removed by the afterSanitize
  //     hook). We set forceKeepAttr so our stricter check — not SAFE_URI —
  //     decides, since a valid embed src is http(s) and would actually PASS
  //     SAFE_URI anyway; forceKeepAttr keeps the two code paths uniform.
  // Every other attribute is left to DOMPurify's normal allowlist + URI checks.
  dompurify.addHook(
    "uponSanitizeAttribute",
    (node: Element, data: SanitizeAttributeHookEvent) => {
      if (data.attrName !== "src") return;
      const tag = node.tagName; // already upper-cased by the DOM
      if (tag !== "IMG" && tag !== "IFRAME") {
        // No other element is allowed to carry src under this config; drop it.
        data.keepAttr = false;
        return;
      }
      const value = String(data.attrValue ?? "");
      const ok =
        tag === "IMG" ? SAFE_IMG_SRC.test(value) : isTrustedIframeSrc(value);
      if (ok) {
        // Our matcher is stricter than SAFE_URI for these elements; force the
        // already-vetted value through so DOMPurify's generic URI regex (which
        // would otherwise reject blob:/data:image) does not strip it.
        data.forceKeepAttr = true;
      } else {
        data.keepAttr = false;
      }
    },
  );

  // ── After sanitization ────────────────────────────────────────────────────
  dompurify.addHook("afterSanitizeAttributes", (node: Element) => {
    // Harden every surviving anchor:
    //   • force rel="noopener noreferrer" (reverse-tabnabbing + referrer leak).
    //   • force target="_blank" so cross-origin links never share the opener.
    // DOMPurify's ALLOWED_URI_REGEXP (set per-call below) already guarantees the
    // href scheme is http/https/mailto, so we only need to fix rel/target here.
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }

    // <img>: drop the global `style` attribute — media never needs inline CSS
    // (the editor only applies style to TEXT), and stripping it here closes a
    // CSS-borne vector (e.g. background:url(javascript:…)) that DOMPurify's
    // default style handling does not deep-scrub on the linkedom server path.
    if (node.tagName === "IMG") {
      node.removeAttribute("style");
      // An <img> that lost its src in the gate above is useless and could carry
      // a dangling alt/title — remove the element entirely (KEEP_CONTENT does
      // not apply: an img has no text children to preserve).
      if (!node.hasAttribute("src")) {
        node.remove();
        return;
      }
    }

    // <iframe>: if the src did not survive the trusted-host gate, the frame is
    // untrusted — remove it outright (never render an arbitrary-origin frame).
    // Otherwise OVERWRITE every privilege-bearing attribute with our forced
    // safe values so a hostile authored sandbox/allow/referrerpolicy cannot
    // widen the frame. (srcdoc/name are already force-stripped via FORBID_ATTR;
    // width/height are layout-only and left as authored.)
    if (node.tagName === "IFRAME") {
      const src = node.getAttribute("src");
      if (!src || !isTrustedIframeSrc(src)) {
        node.remove();
        return;
      }
      // Strip inline CSS for the same reason as <img> — an embed never needs it,
      // and it closes the CSS-borne vector on the iframe.
      node.removeAttribute("style");
      node.setAttribute("sandbox", IFRAME_SANDBOX);
      node.setAttribute("allow", IFRAME_ALLOW);
      node.setAttribute("referrerpolicy", IFRAME_REFERRERPOLICY);
      node.setAttribute("loading", "lazy");
      // `allowfullscreen` is a boolean attr; normalise it on so the fullscreen
      // permission in `allow` actually works. (Either presence form is safe.)
      node.setAttribute("allowfullscreen", "");
    }
  });

  instance = dompurify;
  return instance;
}

/**
 * Sanitize a teacher-authored HTML string against a strict allowlist.
 *
 * Strips <script>/<object>/<embed>/<svg> etc., all on* event-handler
 * attributes, and any javascript:/data:text/html/vbscript: URLs. Allows inline
 * media within tight limits: <img> only with a safe src
 * (http(s)/blob/data:image/root-relative) and <iframe> only for the trusted
 * embed hosts (YouTube/Vimeo/Google) with a forced safe sandbox — any other
 * iframe or unsafe-src img is removed. Forces surviving <a> links to open
 * safely (target=_blank + rel="noopener noreferrer"). Returns a clean string
 * safe to pass to dangerouslySetInnerHTML. Errs toward stripping anything not
 * explicitly allowed.
 *
 * Safe to call on the server (linkedom-backed) and the client. Non-string or
 * empty input returns "".
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  return getInstance().sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI,
    // Never allow data: URIs anywhere (e.g. <a href="data:text/html,...">).
    ADD_DATA_URI_TAGS: [],
    // Keep text content of removed elements, but drop the elements themselves.
    KEEP_CONTENT: true,
    // Return a string, not a DOM node.
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    // Block all unknown protocols in any remaining URI attribute.
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
