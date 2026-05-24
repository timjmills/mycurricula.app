"use client";

// Shoutbox.tsx — the Day Shoutbox: the Daily view's team-visible, by-date
// conversation thread (planning doc §5.3 / §4 `anchor_type = day_shoutbox`).
//
// The clean split the spec draws: Daily Notes are "what I want to remember"
// (personal, the banner up top); the Day Shoutbox is "what we're talking
// about" (team-visible, this panel). It is a FLAT list — no threading —
// with author + timestamp on each post and a chat-style composer at the
// bottom.
//
// ── Visual treatment (Image 13) ──────────────────────────────────────────
// A WHITE card matching the Resources + To-do List cards above. The head
// row shows "Day Shoutbox", a small "Team chat" fyi-blue pill clarifying
// that this is the team-visible counterpart to the personal Daily Notes
// banner, and a small red unread badge (Phase 1A: stub count). Messages
// each render as a compact bubble: a circular avatar on the left, then a
// stack of author first-name + timestamp + the message bubble itself.
// The composer at the bottom is a chat-style "Type a message…" input with
// right-aligned icon buttons (emoji / attach / send).
//
// Posting is a prototype stub: it appends to local component state only
// (no store, no persistence) — enough to feel interactive while the
// realtime backend is unbuilt. Auto-archive after 7 days (spec) is a
// backend query concern and is out of scope for the mock.

import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode, FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TEACHER_BY_ID, ME, shoutboxForDay } from "@/lib/mock";
import type { ShoutboxMessage } from "@/lib/mock";
import { DRAG_MOTION } from "@/lib/collapse-on-drag";
import { Button } from "@/components/ui";
import type { PanelDragHandleProps } from "./RightRail";
import styles from "./Shoutbox.module.css";

// ── Grip + chevron icons (rail-driven controls) ──────────────────────────
// Rendered only when Shoutbox is mounted inside <RightRail>. The grip is
// the SOLE drag activator — the composer input + send button + emoji /
// attach stubs remain fully interactive and never start a reorder.

function GripVerticalIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function ChevronToggleIcon({ collapsed }: { collapsed: boolean }): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        transition: "transform 0.15s ease-out",
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Avatar — initials chip, deterministic neutral tint ───────────────────
// A teacher's avatar carries identity, not status, so it stays neutral: a
// quiet grey chip with the teacher's initials. (The subject palette is
// reserved for curriculum color — see CLAUDE.md §4.)

function ShoutAvatar({ initials }: { initials: string }): ReactNode {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials}
    </span>
  );
}

// ── One posted message ───────────────────────────────────────────────────
// Image 13 layout: avatar | (author + time on one line, bubble below).

function ShoutMessage({ message }: { message: ShoutboxMessage }): ReactNode {
  // Resolve the author id against the team; fall back to a placeholder so a
  // stale id never crashes the row.
  const author = TEACHER_BY_ID[message.author];
  const name = author?.name ?? "Unknown";
  const initials = author?.initials ?? "?";
  // First name only — the thread is informal team chatter.
  const firstName = name.split(" ")[0];

  return (
    <li className={styles.item}>
      <ShoutAvatar initials={initials} />
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.author}>{firstName}</span>
          <span className={styles.time}>{message.time}</span>
        </div>
        <div className={styles.bubble}>{message.body}</div>
      </div>
    </li>
  );
}

// ── Composer icons ───────────────────────────────────────────────────────
// Quiet outline-style icons matching the rest of the Daily view's icon
// vocabulary.

function EmojiIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <line x1="9" y1="10" x2="9.01" y2="10" />
      <line x1="15" y1="10" x2="15.01" y2="10" />
      <path d="M8.5 14.5c1 1.2 2.3 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
    </svg>
  );
}

function AttachIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.4 11.05 12.5 19.94a5.6 5.6 0 1 1-7.94-7.94L13.5 3.06a3.7 3.7 0 1 1 5.24 5.24l-9 9a1.85 1.85 0 1 1-2.62-2.62l8.36-8.35" />
    </svg>
  );
}

function SendIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* A paper-plane silhouette — universal "send" affordance. */}
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ── Shoutbox ─────────────────────────────────────────────────────────────

interface ShoutboxProps {
  /** Active week — scopes which day's thread is shown. */
  week: number;
  /** Active day index, 0 = Sunday. */
  day: number;
  /**
   * Whether the panel BODY (message list + composer) is collapsed to its
   * header only. Optional — when omitted the panel renders fully expanded
   * with no chevron.
   */
  collapsed?: boolean;
  /** Flip the collapsed state. Rendered as a chevron button in the header. */
  onToggleCollapsed?: () => void;
  /**
   * dnd-kit wiring supplied by <RightRail>. When provided the panel
   * renders a grip button in its header that is the SOLE drag activator
   * for reorder. The composer's text input stays fully focusable so the
   * teacher can type without triggering a drag.
   */
  dragHandleProps?: PanelDragHandleProps;
}

export function Shoutbox({
  week,
  day,
  collapsed = false,
  onToggleCollapsed,
  dragHandleProps,
}: ShoutboxProps): ReactNode {
  // Local-only message list: seeded from the mock for this week+day, then
  // grown by the quick-add stub. Re-seeded whenever the day changes so each
  // day shows its own thread.
  const [messages, setMessages] = useState<ShoutboxMessage[]>(() =>
    shoutboxForDay(week, day),
  );
  const [draft, setDraft] = useState("");

  // Re-seed when the teacher switches day (or week). Posts made on a day
  // are intentionally not persisted — this is a prototype stub.
  useEffect(() => {
    setMessages(shoutboxForDay(week, day));
    setDraft("");
  }, [week, day]);

  // A monotonically-increasing suffix keeps locally-added ids unique within
  // the session without colliding with the mock's "sb…" ids.
  const localSeq = useRef(0);

  // ── Unread count (Phase 1A stub) ─────────────────────────────────────
  // The real model: messages the active teacher hasn't seen since the
  // thread was opened (planning doc §4 — Comment seen_by). Until that
  // backend lands, we surface a small stub count derived from the seed:
  // messages NOT authored by the active teacher are treated as "unread"
  // on first mount, then locked in (the badge doesn't tick down on its
  // own — opening the panel doesn't yet mark messages read). This keeps
  // the visual present without lying about state more than necessary.
  const unreadCount = useRef(0);
  useEffect(() => {
    unreadCount.current = messages.filter(
      (m) => m.author !== ME.id && !m.id.startsWith("sb-local-"),
    ).length;
  }, [messages]);

  const handleSubmit = useCallback(
    (e: FormEvent): void => {
      e.preventDefault();
      const body = draft.trim();
      if (body.length === 0) return;
      localSeq.current += 1;
      // A lightweight local "now" label — the real post timestamp comes
      // from the server when the backend lands.
      const time = new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `sb-local-${localSeq.current}`,
          week,
          day,
          author: ME.id,
          time,
          body,
        },
      ]);
      setDraft("");
    },
    [draft, week, day],
  );

  // Reduced-motion-safe collapse animation. Same idiom as the two panels
  // above; opacity-only under prefers-reduced-motion.
  const reducedMotion = useReducedMotion() ?? false;
  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  // The body — message list + composer — is what collapses. The head
  // ("Day Shoutbox" + Team-chat tag + unread red badge + chevron) stays
  // put even when collapsed so the unread count remains visible at all
  // times (key: the teacher should always know there's team chatter
  // waiting, even with the panel folded shut).
  const bodyContent = (
    <>
      {/* ── Flat thread — oldest first, no replies ─────────────────── */}
      {messages.length > 0 ? (
        <ul className={styles.list}>
          {messages.map((m) => (
            <ShoutMessage key={m.id} message={m} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Nothing from the team yet today.</p>
      )}

      {/* ── Chat-style composer ────────────────────────────────────── */}
      {/* A pill-shaped input with right-aligned icon buttons. Phase 1A:
          only the send button is wired; emoji + attach are visual stubs
          (no popover yet, but the affordances are present so the design
          reads as complete). */}
      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.composerInput}
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Write a shoutbox message"
        />
        <div className={styles.composerActions}>
          {/* Stub for Phase 1A — no emoji picker yet. */}
          <Button
            variant="icon"
            iconAriaLabel="Add emoji"
            className={styles.iconBtn}
            onClick={(e) => e.preventDefault()}
          >
            <EmojiIcon />
          </Button>
          {/* Stub for Phase 1A — file attach lands with Cloudflare R2 (1B+). */}
          <Button
            variant="icon"
            iconAriaLabel="Attach file"
            className={styles.iconBtn}
            onClick={(e) => e.preventDefault()}
          >
            <AttachIcon />
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            iconAriaLabel="Post message"
            className={`${styles.iconBtn} ${styles.sendBtn}`}
            disabled={draft.trim().length === 0}
          >
            <SendIcon />
          </Button>
        </div>
      </form>
    </>
  );

  return (
    <section className={styles.panel} aria-label="Day shoutbox">
      {/* ── Head: optional grip + title + Team-chat tag + unread + chevron ── */}
      <header className={styles.head}>
        {/* Drag grip — only rendered when the rail wires the bundle. */}
        {dragHandleProps && (
          <button
            type="button"
            ref={dragHandleProps.ref}
            {...(dragHandleProps.attributes ?? {})}
            {...(dragHandleProps.listeners ?? {})}
            className={styles.gripBtn}
            aria-label={dragHandleProps.label ?? "Drag to reorder Day Shoutbox"}
            title="Drag to reorder"
          >
            <GripVerticalIcon />
          </button>
        )}
        <h3 className={styles.title}>Day Shoutbox</h3>
        <span className={styles.tag}>Team chat</span>
        {unreadCount.current > 0 && (
          <span
            className={styles.unread}
            aria-label={`${unreadCount.current} unread`}
          >
            {unreadCount.current}
          </span>
        )}
        {/* Chevron collapse toggle — pushed to the far right. */}
        {onToggleCollapsed && (
          <Button
            variant="icon"
            iconAriaLabel={
              collapsed
                ? "Expand Day Shoutbox panel"
                : "Collapse Day Shoutbox panel"
            }
            className={styles.collapseBtn}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
          >
            <ChevronToggleIcon collapsed={collapsed} />
          </Button>
        )}
      </header>

      {/* ── Collapsible body ───────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="shoutbox-body"
            className={styles.body}
            initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={
              reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }
            }
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={collapseTransition}
            style={reducedMotion ? undefined : { overflow: "hidden" }}
          >
            {bodyContent}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
