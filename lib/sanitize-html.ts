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
// allowlist, hook, and behavior are identical across client and server — only
// the DOM backing differs.

import createDOMPurify from "dompurify";
import { parseHTML, NodeFilter } from "linkedom";

// The narrow slice of DOMPurify's public surface we depend on. Using a local
// alias keeps us honest if the dependency's full type ever shifts.
type DOMPurifyInstance = {
  sanitize: (dirty: string, cfg: Record<string, unknown>) => string;
  addHook: (
    entryPoint: "afterSanitizeAttributes",
    hook: (node: Element) => void,
  ) => void;
  // false when DOMPurify can't run in this runtime. We treat that as fatal
  // (fail closed) rather than let sanitize() return the dirty input verbatim.
  isSupported: boolean;
};

// Allowed tags — the formatting vocabulary the rich-text editor can emit
// (bold/italic/underline/strike, sub/sup, headings, lists, links, code,
// blockquote, and the <font>/<span> wrappers execCommand produces for color,
// highlight, and font-family/size). Everything not listed is stripped.
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
  // execCommand('foreColor'/'hiliteColor'/'fontName'/'fontSize') wraps
  // selections in <font color|face|size>. Allowed, but its attributes are
  // constrained to the safe set below.
  "font",
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
];

// Force-strip these outright regardless of context — defence in depth on top
// of the allowlist (DOMPurify already drops most of these, but naming them is
// explicit and future-proof against config drift).
const FORBID_TAGS = [
  "script",
  "iframe",
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
  "img",
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
  "srcset",
  "src",
  "formaction",
  "xlink:href",
];

// Only http(s) and mailto URLs may appear in href. This blocks javascript:,
// data:, vbscript:, file:, and protocol-relative tricks. (Tel/anchor refs are
// not needed by the editor, so they are excluded deliberately — err toward
// stripping.)
const SAFE_URI = /^(?:https?:|mailto:)/i;

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

  // After sanitization, harden every surviving anchor:
  //   • force rel="noopener noreferrer" (reverse-tabnabbing + referrer leak).
  //   • force target="_blank" so cross-origin links never share the opener.
  // DOMPurify's ALLOWED_URI_REGEXP (set per-call below) already guarantees the
  // href scheme is http/https/mailto, so we only need to fix rel/target here.
  // Registered exactly once per instance (the instance itself is memoized).
  dompurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  instance = dompurify;
  return instance;
}

/**
 * Sanitize a teacher-authored HTML string against a strict allowlist.
 *
 * Strips <script>/<iframe>/<object>/<embed>/<svg>/<img> etc., all on*
 * event-handler attributes, and any javascript:/data:/vbscript: URLs. Forces
 * surviving <a> links to open safely (target=_blank + rel="noopener
 * noreferrer"). Returns a clean string safe to pass to
 * dangerouslySetInnerHTML. Errs toward stripping anything not explicitly
 * allowed.
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
