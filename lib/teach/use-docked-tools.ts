"use client";

// use-docked-tools.ts — the docked tool-widget stack for the Teach "Tools"
// panel module (5.31 "dock into panels / stack"). A teacher can run the same
// tool-widgets (timer, dice, poll, traffic, …) docked in a side panel as a
// vertical stack, in addition to placing them on the board canvas.
//
// STATE: local + user-scoped, persisted to localStorage. The dock is a personal
// teaching aid, not board content — it never touches a board/widget row and
// carries STRUCTURE only (a tool type + a local id), never student names
// (§11.4). SSR-safe: the first render is an empty stack (matches the server
// HTML); the persisted stack arrives in a post-mount effect.

import { useCallback, useEffect, useState } from "react";
import type { WidgetType } from "../types";

/** One docked tool: a stable local id + the widget type to render. */
export interface DockedTool {
  id: string;
  type: WidgetType;
}

const LS_KEY = "teach-docked-tools-v1";

function load(): DockedTool[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive: keep only well-formed entries.
    return parsed.filter(
      (t): t is DockedTool =>
        !!t &&
        typeof (t as DockedTool).id === "string" &&
        typeof (t as DockedTool).type === "string",
    );
  } catch {
    return [];
  }
}

function save(tools: DockedTool[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(tools));
  } catch {
    // Storage full / disabled — the in-memory stack still works this session.
  }
}

export interface UseDockedTools {
  tools: DockedTool[];
  add: (type: WidgetType) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** The docked tool stack + its mutators. State persists per browser. */
export function useDockedTools(): UseDockedTools {
  // SSR-safe: start empty so the server HTML and first client paint agree; the
  // persisted stack hydrates in the post-mount effect below.
  const [tools, setTools] = useState<DockedTool[]>([]);

  useEffect(() => {
    const stored = load();
    if (stored.length > 0) setTools(stored);
  }, []);

  const commit = useCallback((next: DockedTool[]): void => {
    setTools(next);
    save(next);
  }, []);

  const add = useCallback((type: WidgetType): void => {
    setTools((prev) => {
      const next = [
        ...prev,
        {
          id: `dt-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`,
          type,
        },
      ];
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string): void => {
    setTools((prev) => {
      const next = prev.filter((t) => t.id !== id);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback((): void => commit([]), [commit]);

  return { tools, add, remove, clear };
}
