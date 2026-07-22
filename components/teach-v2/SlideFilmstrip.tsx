"use client";

// components/teach-v2/SlideFilmstrip.tsx — the v2 board slide strip (artboard
// "slide-rail"). SLIDES ARE BOARD PAGES: every thumb maps to a real BoardPage
// and every action emits a typed editor intent (selectPage / addPage /
// deletePage / renamePage / reorderPages) — no parallel slide model; `pages` is
// the source of truth, fed back through the contract.
//
// Rename (double-click the title → inline input) and reorder (‹ › on hover)
// restore what embedded mode dropped from V1's PageFilmstrip (Codex R1).

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BoardPage } from "@/lib/types";
import { Tooltip } from "@/components/ui";
import { V2Icon } from "./icons";
import styles from "./SlideFilmstrip.module.css";

export interface SlideFilmstripProps {
  pages: BoardPage[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onDelete: (pageId: string) => void;
  onRename: (pageId: string, title: string) => void;
  onReorder: (orderedPageIds: string[]) => void;
}

export function SlideFilmstrip({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onReorder,
}: SlideFilmstripProps): ReactNode {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const startRename = (page: BoardPage, fallback: string): void => {
    setEditingId(page.id);
    setDraft(page.title?.trim() || fallback);
  };
  const commitRename = (): void => {
    if (!editingId) return;
    const title = draft.trim();
    if (title) onRename(editingId, title);
    setEditingId(null);
  };
  // Move a page one slot by swapping with its neighbour, then emit the new order.
  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= pages.length) return;
    const ids = pages.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  };

  return (
    <div className={styles.strip} role="tablist" aria-label="Board slides">
      {pages.map((page, i) => {
        const active = page.id === activePageId;
        const label = page.title?.trim() || `Slide ${i + 1}`;
        const editing = editingId === page.id;
        return (
          <div key={page.id} className={styles.thumbWrap}>
            {editing ? (
              // REPLACE the tab with the editor while renaming — never nest an
              // <input> inside the <button> (invalid interactive nesting, a11y).
              <div className={`${styles.thumb} ${styles.thumbOn}`}>
                <span className={styles.thumbNum}>{i + 1}</span>
                <input
                  ref={inputRef}
                  className={styles.thumbEdit}
                  value={draft}
                  aria-label={`Rename ${label}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingId(null);
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.thumb} ${active ? styles.thumbOn : ""}`}
                onClick={() => onSelect(page.id)}
                onDoubleClick={() => startRename(page, `Slide ${i + 1}`)}
                // Keyboard rename path (F2 is the platform convention) so it's
                // not double-click-only (a11y).
                onKeyDown={(e) => {
                  if (e.key === "F2") {
                    e.preventDefault();
                    startRename(page, `Slide ${i + 1}`);
                  }
                }}
                title={`${label} — double-click or press F2 to rename`}
              >
                <span className={styles.thumbNum}>{i + 1}</span>
                <span className={styles.thumbTitle}>{label}</span>
              </button>
            )}
            {!editing ? (
              <div className={styles.thumbActions}>
                {i > 0 ? (
                  <button
                    type="button"
                    className={styles.thumbMove}
                    aria-label={`Move ${label} left`}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(i, -1);
                    }}
                  >
                    ‹
                  </button>
                ) : null}
                {i < pages.length - 1 ? (
                  <button
                    type="button"
                    className={styles.thumbMove}
                    aria-label={`Move ${label} right`}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(i, 1);
                    }}
                  >
                    ›
                  </button>
                ) : null}
                {pages.length > 1 ? (
                  <Tooltip
                    content="Delete this slide and everything on it. This can't be undone."
                    side="bottom"
                    required
                  >
                    <button
                      type="button"
                      className={styles.thumbDelete}
                      aria-label={`Delete ${label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(page.id);
                      }}
                    >
                      <V2Icon name="x" size={12} />
                    </button>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <Tooltip content="Add a new slide" side="bottom" tooltipId="teach-v2-slide-add">
        <button
          type="button"
          className={styles.add}
          aria-label="Add a slide"
          onClick={onAdd}
        >
          <V2Icon name="plus" size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
