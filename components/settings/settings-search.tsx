"use client";

// settings-search.tsx — the header search that jumps to any setting.
//
// A combobox over the static index in lib/settings-search-index.ts:
// typing filters section + card titles; picking a result navigates to the
// section page and, when the entry carries an anchor, scrolls to and
// briefly highlights that card.
//
// The highlight works because THIS component lives in the settings layout
// and therefore survives the sub-page navigation: after router.push we
// poll briefly for the anchor element (the destination page mounts within
// a few frames), then scrollIntoView + a transient `searchHighlight`
// class that components/appearance/settings-card.module.css animates
// (no animation under prefers-reduced-motion — the ring just shows).
//
// Escape inside the input clears/closes the dropdown WITHOUT leaving
// Settings — the header's exit handler ignores Escape from editable
// controls, so the two never fight.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  searchSettings,
  type SettingsSearchEntry,
} from "@/lib/settings-search-index";
import styles from "./settings-search.module.css";

/** How long we poll for the destination card after navigating (ms). */
const ANCHOR_POLL_TIMEOUT = 2000;
const ANCHOR_POLL_STEP = 80;
const HIGHLIGHT_MS = 1600;

/** Scroll to + flash the card once it exists in the DOM. */
function highlightAnchor(anchor: string): void {
  const startedAt = Date.now();
  const tryFind = (): void => {
    const el = document.getElementById(anchor);
    if (el) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      el.classList.add("searchHighlight");
      window.setTimeout(
        () => el.classList.remove("searchHighlight"),
        HIGHLIGHT_MS,
      );
      return;
    }
    if (Date.now() - startedAt < ANCHOR_POLL_TIMEOUT) {
      window.setTimeout(tryFind, ANCHOR_POLL_STEP);
    }
  };
  tryFind();
}

export function SettingsSearch(): ReactNode {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const results = searchSettings(query);

  // Close on outside click/tap.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pick = useCallback(
    (entry: SettingsSearchEntry): void => {
      setOpen(false);
      setQuery("");
      router.push(entry.route);
      if (entry.anchor) highlightAnchor(entry.anchor);
    },
    [router],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      // Owns Escape: clear/close instead of exiting Settings. preventDefault
      // marks the event consumed for any other listener that checks it.
      e.preventDefault();
      if (open) {
        setOpen(false);
      } else {
        setQuery("");
      }
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = results[activeIndex];
      if (entry) pick(entry);
    }
  };

  const listboxId = "settings-search-results";

  return (
    <div ref={rootRef} className={styles.root}>
      <svg
        className={styles.icon}
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
      >
        <circle
          cx="6"
          cy="6"
          r="4.4"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M9.4 9.4L12.6 12.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="search"
        className={styles.input}
        placeholder="Search settings…"
        value={query}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && results[activeIndex]
            ? `settings-search-option-${activeIndex}`
            : undefined
        }
        title="Jump to any setting — try “holidays” or “theme”"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul id={listboxId} role="listbox" className={styles.results}>
          {results.map((entry, i) => (
            <li
              key={`${entry.route}#${entry.anchor ?? ""}`}
              id={`settings-search-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={[
                styles.result,
                i === activeIndex ? styles.resultActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              // onMouseDown (not click) so the pick wins the race against
              // the input's blur / the outside-pointerdown closer.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(entry);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className={styles.resultTitle}>{entry.title}</span>
              <span className={styles.resultPath}>
                {entry.group} · {entry.section}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() !== "" && results.length === 0 && (
        <div className={styles.results} role="status">
          <span className={styles.empty}>No settings match “{query}”</span>
        </div>
      )}
    </div>
  );
}
