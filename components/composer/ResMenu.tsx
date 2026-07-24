"use client";

// ResMenu — the shared resource action menu (B4.1).
//
// One portaled popover with the resource actions every surface needs:
//   Open · Open in new tab · Copy link · Edit · Remove
// It REUSES the ResourceCardFace kebab-menu recipe (components/resources/
// ResourceCardFace.tsx): portaled to <body>, position:fixed at z-1000 (the
// established card-menu band), role="menu" with WAI-ARIA roving keyboard nav
// (focus moves to the first item on open; ArrowUp/Down/Home/End rove; Tab/Esc/
// outside-click/scroll/resize close), and viewport clamping.
//
// URL SINK (single gate): Open-in-new-tab and Copy-link both derive their url
// from `resMenuOpenUrl(resource)` — which routes through lib/resource-embed's
// `isSafeUrl`, the one shipped sink shared by the planner surfaces and the
// Teach board. No new sink is introduced here; an unsafe/absent url simply
// hides those two items. ("Open" is a caller callback — a lightbox/preview the
// caller owns — not a url sink.)
//
// NO SHARE ITEM — share-links are user-deferred (forgeable base64 token), so
// this menu never offers one.
//
// Remove is DESTRUCTIVE, so its tooltip is `required` (CLAUDE.md §4 always-on
// list) — it renders regardless of the global onboarding-tooltip switch and
// carries no "turn off these tips" escape hatch.
//
// DORMANT in this tranche: exposed via ComposerProvider.openResMenu but no live
// surface calls it yet (the B4.3+ host migrations consume it).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@/components/ui";
import { resMenuOpenUrl, type ResMenuOptions } from "./composer-state";
import styles from "./ResMenu.module.css";

export interface ResMenuProps extends ResMenuOptions {
  /** Dismiss the menu (wired to the provider's closeResMenu by the host). */
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

export function ResMenu({
  resource,
  anchor,
  subjectId,
  onOpen,
  onEdit,
  onRemove,
  onCopied,
  triggerEl,
  onClose,
}: ResMenuProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: anchor.x, y: anchor.y });

  // The single isSafeUrl-gated url. Null ⇒ no safe url ⇒ open/copy items hide.
  const openUrl = resMenuOpenUrl(resource);
  const label = resource.label || "resource";

  // Clamp inside the viewport once measured (anchor.x is the menu's RIGHT edge,
  // matching the ResourceCardFace kebab convention).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = Math.min(
      anchor.x - width,
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    const ny = Math.min(
      anchor.y,
      window.innerHeight - height - VIEWPORT_MARGIN,
    );
    setPos({
      x: Math.max(VIEWPORT_MARGIN, nx),
      y: Math.max(VIEWPORT_MARGIN, ny),
    });
  }, [anchor]);

  // Dismiss on outside-click, Esc, scroll, or resize (context-menu idiom). The
  // trigger element is exempt from outside-click so its own click can toggle
  // the menu shut instead of immediately reopening it. Scroll/resize detach the
  // fixed-position popover from its anchor snapshot, so closing is correct.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(t) &&
        !(triggerEl && triggerEl.contains(t))
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDetach = () => onClose();
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onDetach, true);
    window.addEventListener("resize", onDetach);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDetach, true);
      window.removeEventListener("resize", onDetach);
    };
  }, [onClose, triggerEl]);

  // Move focus to the first item on open — the popover is portaled to <body>,
  // so without this Tab/arrows can never reach it. preventScroll so the scroll
  // listener above doesn't self-dismiss the menu on a focus-induced scroll.
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, []);

  // Return focus to the (still-connected) trigger after a KEYBOARD close or an
  // action selection — otherwise the focused portaled button unmounts and focus
  // falls to <body>, stranding keyboard users (§4a). Deliberately NOT called on
  // outside-click/scroll/resize dismissal: there the user has moved attention
  // elsewhere and yanking focus back would be worse.
  const restoreFocus = useCallback(() => {
    if (triggerEl && triggerEl.isConnected) {
      triggerEl.focus({ preventScroll: true });
    }
  }, [triggerEl]);

  // WAI-ARIA menu keyboard pattern: arrows rove focus over every menuitem in
  // DOM order (wrapping at the ends); Home/End jump; Tab and Esc close (a menu
  // is not a tab-stop sequence). Esc stops propagation so it doesn't also close
  // a parent dialog/lightbox.
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      restoreFocus();
      return;
    }
    if (e.key === "Tab") {
      // Close + hand focus back to the trigger, but do NOT preventDefault:
      // the browser computes the tab target at default-action time, so after
      // the restore the native Tab proceeds from the trigger to the next real
      // tab stop (WAI-APG: "Tab closes the menu and moves focus to the next
      // element in the tab sequence") instead of being swallowed.
      onClose();
      restoreFocus();
      return;
    }
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault(); // arrows must not scroll the page behind the menu
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? idx < 0
              ? 0
              : (idx + 1) % items.length
            : idx <= 0
              ? items.length - 1
              : idx - 1;
    items[next]?.focus();
  };

  const fire = useCallback(
    (action: () => void) => {
      // finally (§4a round-2): a throwing action must never leave the menu
      // mounted with focus stranded on it — close + restore always run.
      // Restore never fights a surface the action opened (a composer
      // focus-traps itself after mounting).
      try {
        action();
      } finally {
        onClose();
        restoreFocus();
      }
    },
    [onClose, restoreFocus],
  );

  const openInNewTab = useCallback(() => {
    if (!openUrl || typeof window === "undefined") return;
    window.open(openUrl, "_blank", "noopener,noreferrer");
  }, [openUrl]);

  const copyLink = useCallback(() => {
    if (!openUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard
      .writeText(openUrl)
      .then(() => onCopied?.(openUrl))
      .catch(() => {
        // Clipboard blocked (permissions / insecure context) — silent no-op;
        // the resource is still openable.
      });
  }, [openUrl, onCopied]);

  // A separator sits before Remove only when at least one prior item exists.
  const hasPrimary = Boolean(onOpen || openUrl || onEdit);

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${label}`}
      className={`${styles.menu} ${subjectId ? `cp-subj ${subjectId}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
      style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 1000 }}
    >
      {onOpen && (
        <button
          type="button"
          tabIndex={-1}
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onOpen)}
        >
          <OpenIcon /> Open
        </button>
      )}
      {openUrl && (
        <button
          type="button"
          tabIndex={-1}
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(openInNewTab)}
        >
          <ExternalIcon /> Open in new tab
        </button>
      )}
      {openUrl && (
        <button
          type="button"
          tabIndex={-1}
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(copyLink)}
        >
          <LinkIcon /> Copy link
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          tabIndex={-1}
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onEdit)}
        >
          <NoteIcon /> Edit
        </button>
      )}
      {onRemove && (
        <>
          {hasPrimary && <div role="separator" className={styles.menuSep} />}
          <Tooltip
            content="Remove this card from the lesson — the underlying file or link is not deleted, only unlinked here"
            required
          >
            <button
              type="button"
          tabIndex={-1}
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => fire(onRemove)}
            >
              <TrashIcon /> Remove
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(menu, document.body)
    : null;
}

// ── Icons — inline SVG, Lucide-family 24×24 ~2px stroke (matches CardMenu) ──

const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function OpenIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ExternalIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function LinkIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function NoteIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
