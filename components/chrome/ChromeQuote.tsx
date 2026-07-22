"use client";

// ChromeQuote — the bottom-center dismissible daily quote of the v2 corner
// grammar (W3.3), with its frosted context popup.
//
// Faithful port of the 7.2.26 bundled mockup's QuoteLine + QuotePopup pair
// (mockup/New v2 Site Design.bundled.html ~line 11707): an airy two-line
// quote + author button floating at the bottom center; clicking it opens
// the `.qpop` frosted card with the full quote, attribution, a context
// paragraph, and a source link. Escape AND a scrim click close the popup —
// the QUOTE popup deliberately closes on scrim click, unlike the W3.8
// lesson modal (whose scrim has no click-to-close). The CSS vocabulary is
// app/chrome.css's `.hero-quote` / `.qpop*` blocks (the W3.3a inert port);
// this file consumes it and writes NO CSS. `.qpop`/`.qpop-scrim` are
// already enrolled in themes.css's SURFACE THEMING CONTRACT rule, so the
// popup carries the active theme wash like every other overlay.
//
// ── Data seam ────────────────────────────────────────────────────────────
// Quotes come from the REAL insight bank — lib/home/insights.ts
// heroInsights() (the trimmed, attributed hero pool mined from the
// teacher's own library), NOT the mockup's inline TEACH_QUOTES sample
// array. Field mapping onto the bundle's shape:
//   quote.short → Insight.quote · author → Insight.author ·
//   context → the lazy expand prose (Insight.hasExpand gates it; the text
//   loads via loadInsightExpand when the popup opens) ·
//   source/url → Insight.source/url.
//
// ── The "daily" pick ─────────────────────────────────────────────────────
// One quote per calendar day, deterministic: the index is a hash of the
// LOCAL date key ("YYYY-MM-DD") mod the pool size — the same quote all day,
// a different one tomorrow, and NEVER Math.random-per-render (which would
// reshuffle on every re-render of the chrome). The bundle uses
// `getDate() % pool.length`, which repeats on the same days every month;
// hashing the full date key keeps the rotation from aliasing to the
// day-of-month while staying just as deterministic.
//
// ── Dismissal + SSR safety ───────────────────────────────────────────────
// The quote is dismissible FOR THE DAY: a "Hide for today" action writes
// `mycurricula:user:quote-dismissed-<date>` (user-scoped key per the
// lib/app-state storage convention) and the line stays gone until the
// date key rolls over. First paint is SSR-safe the house way (cf.
// lib/daily-schedule-state.ts): the server render and first client paint
// show NOTHING (the date itself is client state — a UTC server and a
// UTC+3 school must never disagree at hydration), then a post-mount
// effect resolves today's key + dismissal and the quote fades in via the
// existing `.hero-quote` quotefade animation (which reduced-motion
// already suppresses in chrome.css).
//
// The dismiss affordance lives INSIDE the popup ("Hide for today" next to
// the source link) — the mockup has no per-day dismiss (its quote is a
// permanent settings toggle, `t.showQuote`), so this is a documented W3.3
// addition with no bundle reference; it reuses the `.qpop-link` recipe
// rather than inventing styling. Flagged for design follow-up.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  heroInsights,
  loadInsightExpand,
  type Insight,
} from "@/lib/home/insights";
import { Tooltip } from "@/components/ui";

// The balanced hero pool — pure over static module data, so computing it
// once at module scope is safe (no per-render filtering of ~320 records).
const POOL: readonly Insight[] = heroInsights();

/** user-scoped localStorage prefix; the local date key is appended. Stale
 *  previous-day keys are cleaned up on mount (below) so the entry count
 *  never grows past one. */
const DISMISS_KEY_PREFIX = "mycurricula:user:quote-dismissed-";

/** Local (not UTC) "YYYY-MM-DD" — the quote day rolls at the TEACHER's
 *  midnight, matching how they experience "today". */
function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** djb2 string hash → non-negative int. Deterministic quote index per day. */
function hashKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (h * 33) ^ key.charCodeAt(i);
  }
  return h >>> 0;
}

function readDismissed(dateKey: string): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY_PREFIX + dateKey) != null;
  } catch {
    return false;
  }
}

function writeDismissed(dateKey: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY_PREFIX + dateKey, "1");
  } catch {
    // Storage disabled / quota — the dismissal still holds for the session
    // via state; it just won't survive a reload. Non-fatal by design.
  }
}

/** Drop any dismissal entries from PREVIOUS days so the prefix never
 *  accumulates one key per school day forever. */
function pruneStaleDismissals(todayKey: string): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k !== null &&
        k.startsWith(DISMISS_KEY_PREFIX) &&
        k !== DISMISS_KEY_PREFIX + todayKey
      ) {
        stale.push(k);
      }
    }
    stale.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Best-effort cleanup only.
  }
}

/** Bottom-center daily quote + context popup. Mount inside the chrome
 *  host's overlay (the `.hero-quote` recipe self-positions: absolute,
 *  bottom-centered, z-index 6 — below the corner controls' z-index 7). */
export function ChromeQuote(): ReactNode {
  // Today's date key — null until mounted (SSR safety; header note). Also
  // re-checked on a slow tick so a tab left open overnight rolls to the
  // new day's quote (and un-dismisses) without a reload.
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = (): void => {
      const key = localDateKey(new Date());
      // Functional update + bail on same-key keeps the minute tick from
      // re-rendering the chrome when nothing changed.
      setDateKey((prev) => {
        if (prev === key) return prev;
        pruneStaleDismissals(key);
        setDismissed(readDismissed(key));
        return key;
      });
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // The deterministic daily insight (header note). Empty pool → no quote —
  // the chrome simply omits the line rather than rendering a husk.
  const insight = useMemo<Insight | null>(() => {
    if (dateKey === null || POOL.length === 0) return null;
    return POOL[hashKey(dateKey) % POOL.length];
  }, [dateKey]);

  // Return focus to the quote line when the popup closes (the popup steals
  // focus for Escape/screen-reader ergonomics).
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback((): void => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const hideForToday = useCallback((): void => {
    if (dateKey !== null) writeDismissed(dateKey);
    setDismissed(true);
    setOpen(false);
  }, [dateKey]);

  // Pre-mount, dismissed-today, or no pool → nothing at all.
  if (insight === null || dismissed) return null;

  return (
    <>
      <Tooltip
        content="A daily thought on teaching — click to read the story behind it"
        side="top"
        tooltipId="chrome-quote"
      >
        <button
          type="button"
          className="hero-quote"
          ref={triggerRef}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="hero-quote-rule" aria-hidden="true" />
          {/* The `.hero-quote-text` recipe line-clamps to two lines, so
              longer pool quotes truncate with an ellipsis; the popup
              carries the full text. */}
          <span className="hero-quote-text">{insight.quote}</span>
          {/* heroInsights() filters to attributed quotes, but the field is
              nullable on the Insight type — guard anyway. */}
          {insight.author !== null && (
            <span className="hero-quote-by">{insight.author}</span>
          )}
        </button>
      </Tooltip>

      {open && (
        <QuotePopup
          insight={insight}
          onClose={close}
          onHideForToday={hideForToday}
        />
      )}
    </>
  );
}

// ── The context popup ─────────────────────────────────────────────────────

interface QuotePopupProps {
  insight: Insight;
  onClose: () => void;
  /** Dismisses the quote line until tomorrow (header note). */
  onHideForToday: () => void;
}

function QuotePopup({
  insight,
  onClose,
  onHideForToday,
}: QuotePopupProps): ReactNode {
  // The context paragraph (the old inline `expand` field) is code-split into
  // an async chunk (lib/home/insights.expand.json) — it's ~2/3 of the insight
  // bank's bytes and renders only inside this popup. The popup mounts exactly
  // when it opens, so load on mount; the async-chunk import is cached, so
  // re-opens resolve from memory. The cancelled guard drops a stale resolve
  // if the popup closes mid-fetch.
  const [expandText, setExpandText] = useState<string | null>(null);
  useEffect(() => {
    if (insight.hasExpand !== true) return;
    let cancelled = false;
    void loadInsightExpand(insight.id).then((text) => {
      if (!cancelled) setExpandText(text);
    });
    return () => {
      cancelled = true;
    };
  }, [insight]);

  // Escape closes (bundle behavior). Scoped to the popup's lifetime.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus into the dialog on open so Escape works immediately and
  // screen readers announce it. The opener restores focus on close.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Portal to document.body (house overlay pattern — Tooltip,
  // SearchResults): `.qpop-scrim` is position:fixed, and a
  // backdrop-filtered/transformed chrome ancestor would otherwise become
  // its containing block and clip it.
  return createPortal(
    // Scrim click closes — deliberate for THIS popup (header note). The
    // card itself stops propagation so in-card clicks never dismiss.
    <div className="qpop-scrim" onClick={onClose}>
      {/* NOT aria-modal: there is no focus trap, and this is a light-dismiss
          popover (scrim click + Escape), not a modal — claiming aria-modal
          would tell AT users the background is inert when it isn't (§4a
          finding #15). Focus still moves in on open and restores on close. */}
      <div
        className="qpop"
        role="dialog"
        aria-label={
          insight.author !== null ? `Quote by ${insight.author}` : "Daily quote"
        }
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="qpop-mark" aria-hidden="true">
          &ldquo;
        </span>
        <p className="qpop-quote">{insight.quote}</p>
        {insight.author !== null && <p className="qpop-by">{insight.author}</p>}
        {/* Context paragraph — the Insight bank's optional expansion prose
            (the mockup's `context`), lazy-loaded from the code-split expand
            chunk when the popover opens. Simply absent while loading or when
            the record has none; never padded with generated filler. */}
        {expandText !== null && expandText !== "" && (
          <p className="qpop-context">{expandText}</p>
        )}

        {/* Footer row: source link (bundle) + the W3.3 "Hide for today"
            dismiss (header note — no bundle reference; reuses the
            `.qpop-link` recipe). The flex wrapper is layout-only inline
            style (no color/size values), splitting the two links apart. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1em",
          }}
        >
          {insight.url !== null ? (
            <a
              className="qpop-link"
              href={insight.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {insight.source ?? insight.work ?? "Source"} ↗
            </a>
          ) : (
            // Keep the row's two-slot geometry when there is no link so
            // "Hide for today" stays right-aligned.
            <span aria-hidden="true" />
          )}
          {/* Self-evident text button — no tooltip per CLAUDE.md §4 (the
              label IS the explanation). The inline border/background
              reset is UA-default removal, not theming: `.qpop-link` was
              authored for anchors and chrome.css owns no button variant
              yet — TODO(W3.3-followup): give the dismiss its own recipe
              in the chrome.css delta port. */}
          <button
            type="button"
            className="qpop-link"
            style={{ border: 0, background: "none", cursor: "pointer" }}
            onClick={onHideForToday}
          >
            Hide for today
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
