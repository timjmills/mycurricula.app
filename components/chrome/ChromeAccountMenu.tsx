"use client";

// ChromeAccountMenu.tsx — the top-bar avatar + account menu (SideNav-retirement
// wave, R1d; USER decision locked 7.24).
//
// A small avatar button in the chrome control cluster opens a portaled menu:
//   • Account settings → /settings/account (the W3.2 soft-swap TransitionLink).
//   • Sign out        → the native form POST to /auth/signout, reusing the v1
//     TopBar's exact server-action logic (top-bar.tsx / top-bar-more-menu.tsx):
//     the route handler clears the Supabase session and redirects to /login. The
//     <button type="submit"> is load-bearing — the ui Button primitive hardcodes
//     type="button", so a bespoke submit button stays here.
//
// The menu follows the ResMenu / ResourceCardFace portal pattern (composer
// ResMenu.tsx): portaled to <body> so it escapes the chrome's stacking/overflow,
// role="menu" with WAI-ARIA roving keyboard nav (focus moves to the first item
// on open; ArrowUp/Down/Home/End rove; Tab/Esc/outside-click/scroll/resize
// close; focus restores to the trigger on a keyboard close). Because it portals
// to <body> — OUTSIDE `.cp-root` — the `.cp-root button` reset never reaches the
// menu items; chrome.css styles them via the `.chrome-menu` global recipe.
//
// Tooltip: the avatar is an icon-only control, so it carries a dismissible
// onboarding tooltip (CLAUDE.md §4 — not high-consequence). Sign out is a normal
// account action (not on the §4 destructive always-on list), so no `required`.

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
import Image from "next/image";
import { TransitionLink } from "@/lib/view-transition";
import { Tooltip } from "@/components/ui";
import { useAppState } from "@/lib/app-state";

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 10;

export function ChromeAccountMenu(): ReactNode {
  const { currentUser } = useAppState();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [photoFailed, setPhotoFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showPhoto = Boolean(currentUser.avatarUrl) && !photoFailed;

  const close = useCallback(() => setOpen(false), []);
  const restoreFocus = useCallback(() => {
    if (triggerRef.current?.isConnected) {
      triggerRef.current.focus({ preventScroll: true });
    }
  }, []);

  // Position the menu below the avatar, right-aligned to the trigger, once the
  // menu has measured (its right edge tracks the trigger's right edge). Clamp
  // to the viewport so it never spills off a narrow screen.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const tr = trigger.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(tr.right - width, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const top = Math.min(
      tr.bottom + MENU_GAP,
      window.innerHeight - height - VIEWPORT_MARGIN,
    );
    setPos({ top: Math.max(VIEWPORT_MARGIN, top), left });
  }, [open]);

  // Dismiss on outside-click, Escape, scroll, or resize (the ResMenu idiom).
  // The trigger is exempt from outside-click so its own click toggles shut.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(t) &&
        !triggerRef.current?.contains(t)
      ) {
        close();
      }
    };
    const onDetach = (): void => close();
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onDetach, true);
    window.addEventListener("resize", onDetach);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onDetach, true);
      window.removeEventListener("resize", onDetach);
    };
  }, [open, close]);

  // Move focus to the first item on open (the menu is portaled to <body>, so
  // without this Tab/arrows can never reach it).
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [open]);

  // WAI-ARIA menu keyboard pattern: arrows rove over the menuitems (wrapping);
  // Home/End jump; Tab and Esc close (a menu is not a tab-stop sequence).
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      restoreFocus();
      return;
    }
    if (e.key === "Tab") {
      close();
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
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
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

  const name = currentUser.name || "your account";

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Account — ${name}`}
      className="chrome-menu chrome-account-menu"
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
      onKeyDown={onMenuKeyDown}
    >
      <div className="chrome-menu-head" aria-hidden="true">
        <span className="chrome-menu-name">{currentUser.name}</span>
        {currentUser.curriculumLabel && (
          <span className="chrome-menu-sub">{currentUser.curriculumLabel}</span>
        )}
      </div>
      <TransitionLink
        href="/settings/account"
        role="menuitem"
        tabIndex={-1}
        className="chrome-menu-item"
        onClick={() => close()}
      >
        <UserIcon />
        <span>Account settings</span>
      </TransitionLink>
      {/* Native form POST — the server action clears the session + redirects to
          /login (reused from the v1 TopBar). */}
      <form action="/auth/signout" method="post" className="chrome-menu-form">
        <button
          type="submit"
          role="menuitem"
          tabIndex={-1}
          className="chrome-menu-item"
        >
          <SignOutIcon />
          <span>Sign out</span>
        </button>
      </form>
    </div>
  ) : null;

  return (
    <div className="chrome-account">
      <Tooltip
        content={`Your account — settings and sign out (${name})`}
        side="bottom"
        tooltipId="chrome-account-menu"
      >
        <button
          type="button"
          ref={triggerRef}
          className="iconbtn chrome-avatar"
          aria-label={`Account menu (${name})`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {showPhoto ? (
            <Image
              src={currentUser.avatarUrl!}
              alt=""
              width={34}
              height={34}
              className="chrome-avatar-img"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="chrome-avatar-initials" aria-hidden="true">
              {currentUser.initials}
            </span>
          )}
        </button>
      </Tooltip>
      {menu && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
function UserIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}
function SignOutIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
