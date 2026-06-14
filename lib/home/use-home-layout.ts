"use client";

// Home-screen layout preference (Quiet Dawn). Three modes — Calm (hero only),
// Full (hero + all day-rows, the default), Custom (hero + chosen rows) — plus a
// soft-photo toggle, the quote rotation interval, and which quote topic to show.
// Persisted to localStorage and synced across tabs.
//
// SSR-safe: the first paint uses defaults so the server-rendered HTML matches
// the first client paint; the real persisted values arrive in a post-mount
// effect. Gate mode-specific rendering on `hydrated` to avoid a flash (mirrors
// lib/tooltip-dismissal.ts + app/page.tsx).

import { useCallback, useEffect, useState } from "react";
import { INSIGHT_CATEGORIES, type InsightCategory } from "./insights";

export type HomeMode = "calm" | "full" | "custom";

/** Which quote category the hero rotates — or "all" (mixed, alternating). */
export type QuoteTopic = "all" | InsightCategory;

export type HomeRowId =
  | "schedule"
  | "todo"
  | "lessons"
  | "progress"
  | "shoutbox"
  | "links"
  | "tips";

export const HOME_ROW_IDS: readonly HomeRowId[] = [
  "schedule",
  "todo",
  "lessons",
  "progress",
  "shoutbox",
  "links",
  "tips",
];

export const HOME_ROW_LABELS: Record<HomeRowId, string> = {
  schedule: "Today's schedule",
  todo: "To-do",
  lessons: "Today's lessons",
  progress: "This week's progress",
  shoutbox: "Team shoutbox & notes",
  links: "Jump back in",
  tips: "Tips & help",
};

const MODE_KEY = "mycurricula:user:home-mode";
const ROWS_KEY = "mycurricula:user:home-rows";
const PHOTO_KEY = "mycurricula:user:home-photo";
const QUOTE_SECS_KEY = "mycurricula:user:home-quote-secs";
const QUOTE_TOPIC_KEY = "mycurricula:user:home-quote-topic";

const DEFAULT_MODE: HomeMode = "full";
const DEFAULT_PHOTO = true;
const DEFAULT_QUOTE_SECS = 12; // seconds between quote changes (user asked 10–15)
const DEFAULT_QUOTE_TOPIC: QuoteTopic = "all";
const QUOTE_SECS_MIN = 5;
const QUOTE_SECS_MAX = 40;

const defaultRows = (): Record<HomeRowId, boolean> =>
  Object.fromEntries(HOME_ROW_IDS.map((id) => [id, true])) as Record<HomeRowId, boolean>;

function readMode(): HomeMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === "calm" || v === "full" || v === "custom" ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function readRows(): Record<HomeRowId, boolean> {
  const base = defaultRows();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(ROWS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<HomeRowId, boolean>>;
    for (const id of HOME_ROW_IDS) {
      if (typeof parsed[id] === "boolean") base[id] = parsed[id] as boolean;
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

function readPhoto(): boolean {
  if (typeof window === "undefined") return DEFAULT_PHOTO;
  try {
    const v = window.localStorage.getItem(PHOTO_KEY);
    return v === null ? DEFAULT_PHOTO : v === "1";
  } catch {
    return DEFAULT_PHOTO;
  }
}

function readQuoteSecs(): number {
  if (typeof window === "undefined") return DEFAULT_QUOTE_SECS;
  try {
    const v = Number(window.localStorage.getItem(QUOTE_SECS_KEY));
    return Number.isFinite(v) && v >= QUOTE_SECS_MIN && v <= QUOTE_SECS_MAX
      ? v
      : DEFAULT_QUOTE_SECS;
  } catch {
    return DEFAULT_QUOTE_SECS;
  }
}

function readQuoteTopic(): QuoteTopic {
  if (typeof window === "undefined") return DEFAULT_QUOTE_TOPIC;
  try {
    const v = window.localStorage.getItem(QUOTE_TOPIC_KEY);
    if (v === "all") return "all";
    if (v && (INSIGHT_CATEGORIES as readonly string[]).includes(v)) {
      return v as InsightCategory;
    }
    return DEFAULT_QUOTE_TOPIC;
  } catch {
    return DEFAULT_QUOTE_TOPIC;
  }
}

export interface HomeLayout {
  mode: HomeMode;
  rows: Record<HomeRowId, boolean>;
  showPhoto: boolean;
  quoteSeconds: number;
  quoteTopic: QuoteTopic;
  hydrated: boolean;
  setMode: (m: HomeMode) => void;
  toggleRow: (id: HomeRowId) => void;
  setShowPhoto: (v: boolean) => void;
  setQuoteSeconds: (n: number) => void;
  setQuoteTopic: (t: QuoteTopic) => void;
  reset: () => void;
}

export function useHomeLayout(): HomeLayout {
  const [mode, setModeState] = useState<HomeMode>(DEFAULT_MODE);
  const [rows, setRows] = useState<Record<HomeRowId, boolean>>(defaultRows);
  const [showPhoto, setShowPhotoState] = useState<boolean>(DEFAULT_PHOTO);
  const [quoteSeconds, setQuoteSecondsState] = useState<number>(DEFAULT_QUOTE_SECS);
  const [quoteTopic, setQuoteTopicState] = useState<QuoteTopic>(DEFAULT_QUOTE_TOPIC);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModeState(readMode());
    setRows(readRows());
    setShowPhotoState(readPhoto());
    setQuoteSecondsState(readQuoteSecs());
    setQuoteTopicState(readQuoteTopic());
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      // e.key === null fires when another tab calls localStorage.clear()
      // (e.g. a future sign-out) — re-read everything so this tab doesn't
      // keep showing stale layout.
      if (e.key === null) {
        setModeState(readMode());
        setRows(readRows());
        setShowPhotoState(readPhoto());
        setQuoteSecondsState(readQuoteSecs());
        setQuoteTopicState(readQuoteTopic());
      } else if (e.key === MODE_KEY) setModeState(readMode());
      else if (e.key === ROWS_KEY) setRows(readRows());
      else if (e.key === PHOTO_KEY) setShowPhotoState(readPhoto());
      else if (e.key === QUOTE_SECS_KEY) setQuoteSecondsState(readQuoteSecs());
      else if (e.key === QUOTE_TOPIC_KEY) setQuoteTopicState(readQuoteTopic());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback((m: HomeMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRow = useCallback((id: HomeRowId) => {
    setRows((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(ROWS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setShowPhoto = useCallback((v: boolean) => {
    setShowPhotoState(v);
    try {
      window.localStorage.setItem(PHOTO_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setQuoteSeconds = useCallback((n: number) => {
    const clamped = Math.min(QUOTE_SECS_MAX, Math.max(QUOTE_SECS_MIN, Math.round(n)));
    setQuoteSecondsState(clamped);
    try {
      window.localStorage.setItem(QUOTE_SECS_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const setQuoteTopic = useCallback((t: QuoteTopic) => {
    setQuoteTopicState(t);
    try {
      window.localStorage.setItem(QUOTE_TOPIC_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    setModeState(DEFAULT_MODE);
    setRows(defaultRows());
    setShowPhotoState(DEFAULT_PHOTO);
    setQuoteSecondsState(DEFAULT_QUOTE_SECS);
    setQuoteTopicState(DEFAULT_QUOTE_TOPIC);
    try {
      window.localStorage.removeItem(MODE_KEY);
      window.localStorage.removeItem(ROWS_KEY);
      window.localStorage.removeItem(PHOTO_KEY);
      window.localStorage.removeItem(QUOTE_SECS_KEY);
      window.localStorage.removeItem(QUOTE_TOPIC_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    mode,
    rows,
    showPhoto,
    quoteSeconds,
    quoteTopic,
    hydrated,
    setMode,
    toggleRow,
    setShowPhoto,
    setQuoteSeconds,
    setQuoteTopic,
    reset,
  };
}
