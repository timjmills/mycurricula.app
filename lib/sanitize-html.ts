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
// IMPLEMENTATION: we use `isomorphic-dompurify` (already a project dependency),
// which runs identically on the server (via jsdom) and the client (native
// DOMPurify). DOMPurify is the vetted, battle-tested choice and is preferred
// over a hand-rolled regex sanitizer. We layer a STRICT allowlist on top of
// its already-safe defaults so the output is limited to the formatting the
// editor can actually produce, and we harden <a> targets via a hook.

import DOMPurify from "isomorphic-dompurify";

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

// One-time hook registration. DOMPurify config is per-call, but hooks are
// global; register exactly once so links are always hardened.
let hookInstalled = false;
function ensureHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  // After sanitization, harden every surviving anchor:
  //   • force rel="noopener noreferrer" (reverse-tabnabbing + referrer leak).
  //   • if the link opens in a new tab keep target, else normalise to _blank
  //     so cross-origin links never share the opener.
  // DOMPurify's ALLOWED_URI_REGEXP (set per-call below) already guarantees the
  // href scheme is http/https/mailto, so we only need to fix rel/target here.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

// Only http(s) and mailto URLs may appear in href. This blocks javascript:,
// data:, vbscript:, file:, and protocol-relative tricks. (Tel/anchor refs are
// not needed by the editor, so they are excluded deliberately — err toward
// stripping.)
const SAFE_URI = /^(?:https?:|mailto:)/i;

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
 * Safe to call on the server (jsdom-backed) and the client. Non-string or
 * empty input returns "".
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  ensureHook();
  return DOMPurify.sanitize(dirty, {
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
