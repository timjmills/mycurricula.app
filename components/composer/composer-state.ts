// composer-state.ts — the Shared Composer's pure state core (B4.0 + B4.1).
//
// No React, no DOM, no I/O — so it is unit-testable under the node vitest
// harness (`tests/**/*.test.ts`). The React wrappers (ComposerProvider,
// ComposerHost, ResMenu) are thin shells over the pieces defined here:
//
//   • ComposerState / composerReducer  — the singleton open/close state the
//     provider drives via useReducer.
//   • composerPropsFrom                — the opts → ResourceComposerProps
//     mapping the host uses to render the EXISTING ResourceComposer verbatim.
//   • resMenuOpenUrl                   — the isSafeUrl-gated URL every ResMenu
//     open/copy path consults (the single shipped sink; no new sink).
//
// Types are pulled from the existing ResourceComposer via `import type`, which
// is erased at compile time — so this module (and its tests) never load the
// heavy client component. That also LOCKS the opts shape to the component's
// real props: if ResourceComposerProps changes, `ComposerOpenOptions` and
// `composerPropsFrom` fail to type-check rather than drifting silently.

import { isSafeUrl } from "@/lib/resource-embed";
import type { LessonResource } from "@/lib/types";
import type { ResourceComposerProps } from "@/components/daily/ResourceComposer";

// ── openComposer options ───────────────────────────────────────────────────
//
// Every field maps 1:1 onto a ResourceComposerProps field. Two are handled by
// the host, not the caller:
//   • `open`    — the host injects `true` (the composer only exists in state
//                 while it should be open; closing clears the state entirely).
//   • `onClose` — the caller's `onClose` is OPTIONAL here; the host always
//                 composes it with the provider's `closeComposer` so the
//                 singleton state is cleared no matter how the dialog closes.
export type ComposerOpenOptions = Omit<
  ResourceComposerProps,
  "open" | "onClose"
> & {
  /** Optional caller hook fired on close, BEFORE the provider clears state. */
  onClose?: () => void;
};

// ── openResMenu options ────────────────────────────────────────────────────
//
// The shared resource action menu's inputs. Open / Open-in-new-tab / Copy-link
// are derived from `resource.url` through {@link resMenuOpenUrl} (the isSafeUrl
// sink); Edit / Remove are caller callbacks that render only when supplied.
export interface ResMenuOptions {
  /** The resource whose actions the menu offers. Its `url` is gated through
   *  isSafeUrl before any open/copy — an unsafe/absent url simply hides those
   *  items rather than rendering a dead action. */
  resource: LessonResource;
  /** Viewport anchor point, matching the ResourceCardFace kebab convention:
   *  `x` = the menu's RIGHT edge (usually the trigger's right edge), `y` = the
   *  menu's TOP (usually the trigger's bottom + a small gap). The menu clamps
   *  itself inside the viewport from here. */
  anchor: { x: number; y: number };
  /** Optional cp-subj id so the menu can carry the subject cascade. */
  subjectId?: string;
  /** "Open" — the primary open (e.g. a lightbox/preview the caller owns).
   *  Omit to hide. This is a caller callback, NOT a url sink — the url-based
   *  opens are the two items below. */
  onOpen?: () => void;
  /** "Edit / add note" — omit to hide. */
  onEdit?: () => void;
  /** "Remove" (destructive, rendered last after a separator) — omit to hide. */
  onRemove?: () => void;
  /** Fired after "Copy link" writes the (already-gated) url to the clipboard,
   *  e.g. so a caller can raise a "Link copied" confirmation toast. */
  onCopied?: (url: string) => void;
  /** The trigger element, exempted from the outside-click close so the same
   *  click that opened the menu can also toggle it shut. */
  triggerEl?: HTMLElement | null;
}

// ── Singleton state + reducer ──────────────────────────────────────────────

export interface ComposerState {
  /** The open composer's options, or null when no composer is open. */
  composer: ComposerOpenOptions | null;
  /** The open resource menu's options, or null when no menu is open. */
  resMenu: ResMenuOptions | null;
}

export const initialComposerState: ComposerState = {
  composer: null,
  resMenu: null,
};

export type ComposerAction =
  | { type: "open-composer"; opts: ComposerOpenOptions }
  | { type: "close-composer" }
  | { type: "open-res-menu"; opts: ResMenuOptions }
  | { type: "close-res-menu" };

/**
 * Pure reducer for the composer singleton. The composer and the resource menu
 * are INDEPENDENT axes — opening/closing one never touches the other (a caller
 * that wants "Edit closes the menu, then opens the composer" gets that for free
 * because the menu fires its own close on any item select). Close actions no-op
 * when already closed so the provider avoids a needless re-render.
 */
export function composerReducer(
  state: ComposerState,
  action: ComposerAction,
): ComposerState {
  switch (action.type) {
    case "open-composer":
      // Modal-priority invariant (§4a): the composer is a modal surface — an
      // open res-menu must never stay interactive above it (it would steal
      // Escape/outside-click and defeat focus isolation). Opening the
      // composer therefore ALWAYS clears the menu; this is also the natural
      // flow for the menu's own "Edit" item (menu → composer).
      return { composer: action.opts, resMenu: null };
    case "close-composer":
      return state.composer === null ? state : { ...state, composer: null };
    case "open-res-menu":
      // Modal-priority, other direction (§4a round-2): while a composer is
      // open, a res-menu open is REJECTED outright — a portaled menu must
      // never float interactive above the modal. (If a future composer build
      // wants per-attachment menus, it owns its own inline menu UI; this
      // singleton stays subordinate to the modal.)
      return state.composer !== null ? state : { ...state, resMenu: action.opts };
    case "close-res-menu":
      return state.resMenu === null ? state : { ...state, resMenu: null };
    default:
      return state;
  }
}

// ── opts → props mapping ───────────────────────────────────────────────────

/**
 * Map `ComposerOpenOptions` onto the full `ResourceComposerProps` the host
 * renders. Injects `open: true` and composes the caller's optional `onClose`
 * with the provider's `close` so state is ALWAYS cleared when the dialog
 * dismisses (Escape, scrim click, ×, or a successful commit). Every other
 * field passes through verbatim.
 */
export function composerPropsFrom(
  opts: ComposerOpenOptions,
  close: () => void,
): ResourceComposerProps {
  const { onClose, ...rest } = opts;
  return {
    ...rest,
    open: true,
    onClose: () => {
      // try/finally (§4a): a throwing caller onClose must never strand the
      // singleton in the "open" state — close() always runs.
      try {
        onClose?.();
      } finally {
        close();
      }
    },
  };
}

// ── The shared url sink for the resource menu ──────────────────────────────

/**
 * The safe, openable url for a resource, or null when it has none the shipped
 * sink gate accepts. Open-in-new-tab and Copy-link BOTH consult this — routing
 * every url through `isSafeUrl` (lib/resource-embed), the single sink shared by
 * the planner surfaces and the Teach board, so this menu adds NO new sink.
 * A javascript:/data:/protocol-relative/smuggle-char/absent url yields null and
 * the corresponding items are not rendered.
 */
export function resMenuOpenUrl(
  resource: Pick<LessonResource, "url">,
): string | null {
  return isSafeUrl(resource.url) ? resource.url : null;
}

/**
 * Would a ResMenu built from these options render ANY item?
 *
 * Open / Edit / Remove each render only when their callback is supplied, and
 * the two url items only when `resMenuOpenUrl` (the isSafeUrl sink) yields a
 * url — so a resource with no safe url and no callbacks paints an EMPTY
 * popover. A trigger consults this to decide whether to render at all: a
 * control whose only outcome is a blank menu should not exist.
 *
 * LIVES HERE, NOT IN ResMenu.tsx (bundle boundary): ResMenuTrigger renders on
 * the lesson-editor resource chips, which are in /weekly's initial module
 * graph. Importing this predicate from ResMenu.tsx made the menu itself —
 * portal, Tooltip, icons, CSS — statically reachable and defeated the
 * next/dynamic wrapper in ComposerHost. It depends only on `resMenuOpenUrl`
 * above, so this module is its natural home. It must stay in sync with
 * ResMenu's render logic (which items actually appear).
 */
export function hasResMenuActions(
  opts: Pick<ResMenuOptions, "resource" | "onOpen" | "onEdit" | "onRemove">,
): boolean {
  return Boolean(
    opts.onOpen ||
      opts.onEdit ||
      opts.onRemove ||
      resMenuOpenUrl(opts.resource),
  );
}
