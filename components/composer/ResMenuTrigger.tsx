"use client";

// ResMenuTrigger — the "⋯" that opens the shared <ResMenu>.
//
// PLACEMENT (verified against the 7.21.26 handoff, not assumed): the design
// puts this control on the lesson editor's resource rows —
// `source-planning-hub/ph-workspace.jsx:400` and `:425`, a `.rmore` button
// titled "More — open, edit, remove" calling `openResMenu({res,x,y,edit,
// remove})` — and on the home planbook chips (`source-home/planbook-edit.jsx`).
// `README:96-98` states it in prose: "Used by workspace resource pills and the
// planbook chips." The resource wall (`ph-more.jsx`) contains no openResMenu at
// all — a wall card is ONE click target that opens the resource's lesson, not
// an action row — so this deliberately does not go there.
//
// WHY A COMPONENT rather than an inline button per callsite: two things are
// easy to get wrong and must not be re-derived.
//   1. The anchor convention. ResMenu reads `anchor.x` as the menu's RIGHT
//      edge and `anchor.y` as its TOP (the ResourceCardFace kebab convention),
//      then clamps into the viewport. Passing a raw click point — as the
//      mock's `x:e.clientX,y:e.clientY` does — right-aligns the menu on the
//      cursor and, on a keyboard-activated click, on (0,0).
//   2. The empty-menu guard (`hasResMenuActions`). A resource with no
//      isSafeUrl-passing url, no onEdit and no onRemove would open a popover
//      containing nothing. This renders no button in that case, so the
//      affordance exists only when it leads somewhere.
//
// It lives in its own module rather than in ResMenu.tsx to stay OUT of the
// ResMenu → ComposerProvider → ComposerHost → ResMenu import cycle: the
// trigger needs the provider's `openResMenu`, and ComposerHost renders ResMenu.
// (See the /teach TDZ lesson — a dev-only circular import is a real failure
// mode here, not a hypothetical.)

import { useCallback, type MouseEvent, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import type { LessonResource } from "@/lib/types";
import { useComposer } from "./ComposerProvider";
import { hasResMenuActions } from "./ResMenu";
import styles from "./ResMenu.module.css";

/** Gap between the trigger's bottom edge and the menu's top. */
const ANCHOR_GAP = 6;

export interface ResMenuTriggerProps {
  /** The resource whose actions the menu offers. */
  resource: LessonResource;
  /** The resource's human name, for the button's accessible name — "⋯" alone
   *  tells a screen-reader user nothing. */
  label: string;
  /** Optional cp-subj id so the menu carries the subject cascade. */
  subjectId?: string;
  /** "Open" — a preview/lightbox the CALLER owns. Omit to hide (the two
   *  url-derived opens are supplied by the menu itself). */
  onOpen?: () => void;
  /** "Edit" — omit to hide (e.g. a read-only host). */
  onEdit?: () => void;
  /** "Remove" — destructive, omit to hide (e.g. a read-only host). */
  onRemove?: () => void;
  /** Fired after "Copy link" writes the gated url to the clipboard. */
  onCopied?: (url: string) => void;
  /** Onboarding-tooltip id (CLAUDE.md §4). Omit to render no tooltip. The
   *  trigger is not itself destructive, so its tip is DISMISSIBLE — the
   *  always-on `required` treatment belongs to the Remove item inside the
   *  menu, which already carries it. */
  tooltipId?: string;
  /** Class for the button, so a host can size it into its own row/chip. */
  className?: string;
}

export function ResMenuTrigger({
  resource,
  label,
  subjectId,
  onOpen,
  onEdit,
  onRemove,
  onCopied,
  tooltipId,
  className,
}: ResMenuTriggerProps): ReactNode {
  const { openResMenu, closeResMenu } = useComposer();

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const el = e.currentTarget;
      // TOGGLE (§4a round-2). ResMenu marks its trigger aria-expanded="true"
      // for as long as it is mounted, so a second click DISMISSES the menu
      // instead of re-dispatching an open that changes nothing on screen — the
      // menu exempts its own trigger from the outside-click close precisely so
      // this click can be the toggle rather than a close-then-reopen race.
      if (el.getAttribute("aria-expanded") === "true") {
        closeResMenu();
        // The open menu had taken focus; unmounting it would drop focus to
        // <body>, so hand it back to the button the user just pressed.
        el.focus({ preventScroll: true });
        return;
      }
      // Anchor off the BUTTON's rect, never the click point: a keyboard
      // Enter/Space "click" reports (0,0), which would fling the menu into
      // the top-left corner. The rect is correct for pointer and keyboard
      // alike, and matches the menu's right-edge/top convention.
      const rect = el.getBoundingClientRect();
      openResMenu({
        resource,
        anchor: { x: rect.right, y: rect.bottom + ANCHOR_GAP },
        subjectId,
        onOpen,
        onEdit,
        onRemove,
        onCopied,
        // Exempts this button from the menu's outside-click close, so the
        // same click cannot close-then-reopen the menu.
        triggerEl: el,
      });
    },
    [
      openResMenu,
      closeResMenu,
      resource,
      subjectId,
      onOpen,
      onEdit,
      onRemove,
      onCopied,
    ],
  );

  if (!hasResMenuActions({ resource, onOpen, onEdit, onRemove })) return null;

  const button = (
    <button
      type="button"
      className={`${styles.trigger} ${className ?? ""}`}
      aria-haspopup="menu"
      // Resting value only. The LIVE value is owned by ResMenu, which sets it
      // "true" while mounted against this trigger and back to "false" on every
      // close path — the menu is a provider singleton, so it is the only thing
      // that can report the state accurately. React never fights that write:
      // this prop's value does not change between renders, so the DOM
      // attribute is not re-applied.
      aria-expanded={false}
      aria-label={`More actions for ${label}`}
      onClick={handleClick}
    >
      ⋯
    </button>
  );

  return tooltipId ? (
    <Tooltip
      content="Open, edit, or remove this resource — removing it unlinks the card here, it does not delete the file"
      tooltipId={tooltipId}
    >
      {button}
    </Tooltip>
  ) : (
    button
  );
}
