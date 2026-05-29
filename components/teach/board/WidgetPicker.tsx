// WidgetPicker — the T5 centered "Add a widget" popover
// (docs/teach-view-plan.md §4.4). 12 types, searchable, grouped by category
// (Display / Timing / Engagement / Content embed / Utilities). On pick it
// creates a widget at the target cell through the `teach` repository
// (`upsertWidget`) and notifies the integrator via `onCreated` so it can
// refresh the board. Esc / backdrop / × closes.
//
// PRIVACY (plan §11.4): the created widget's `config` carries STRUCTURE only —
// never student names. Groups/Names widgets read names from the local-only
// store, so the seeded config here is name-free by construction.

"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { teach } from "@/lib/teach/queries";
import type { Widget, WidgetType } from "@/lib/types";
import type { BoardCellTarget } from "@/lib/teach/types";
import {
  WIDGET_CATALOG,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  boardTintVar,
  TeachIcon,
} from "../widgets";
import type { WidgetMeta } from "../widgets";
import styles from "./board.module.css";

export interface WidgetPickerProps {
  /** The cell the new widget anchors to. */
  target: BoardCellTarget;
  /** Grade of the board the widget lands on (denormalized onto the widget). */
  gradeLevelId: string;
  /** Next display order for the new widget (integrator passes the board's). */
  nextDisplayOrder?: number;
  /** Close without creating. */
  onClose: () => void;
  /** Fired after a successful create so the integrator can refresh the board. */
  onCreated?: (widget: Widget) => void;
}

let pickerSeq = 0;
function newWidgetId(): string {
  pickerSeq += 1;
  return `w-new-${Date.now().toString(36)}-${pickerSeq}`;
}

export function WidgetPicker({
  target,
  gradeLevelId,
  nextDisplayOrder = 0,
  onClose,
  onCreated,
}: WidgetPickerProps): ReactNode {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const scrimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Filter + group the catalog by the active search term.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = WIDGET_CATALOG.filter(
      (m) => q === "" || m.label.toLowerCase().includes(q),
    );
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: matches.filter((m) => m.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  async function pick(meta: WidgetMeta): Promise<void> {
    if (busy) return;
    setBusy(true);
    const widget: Widget = {
      id: newWidgetId(),
      boardId: target.boardId,
      type: meta.type as WidgetType,
      title: meta.label,
      position: {
        col: target.col,
        row: target.row,
        colSpan: 1,
        rowSpan: 1,
      },
      displayOrder: nextDisplayOrder,
      pinned: false,
      config: {}, // structure-only; bodies render sensible defaults
      state: {},
      persistence: "inherit",
      gradeLevelId,
    };
    try {
      const created = await teach.upsertWidget(widget);
      onCreated?.(created);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={scrimRef}
      className={styles.pickerScrim}
      role="dialog"
      aria-modal="true"
      aria-label="Add a widget"
      onMouseDown={(e) => {
        if (e.target === scrimRef.current) onClose();
      }}
    >
      <div className={styles.picker}>
        <div className={styles.pickerHead}>
          <span className={styles.pickerTitle}>Add a widget</span>
          <span className={styles.headerSpacer} style={{ flex: 1 }} />
          <span className={styles.pickerCellBadge}>1×1 empty cell</span>
          <button
            type="button"
            className={styles.chromeBtn}
            aria-label="Close"
            onClick={onClose}
          >
            <TeachIcon name="x" size={15} />
          </button>
        </div>

        <div className={styles.pickerSearch}>
          <TeachIcon name="search" size={14} />
          <input
            ref={inputRef}
            type="text"
            className={styles.pickerSearchInput}
            placeholder="Search widgets…"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setQuery(e.target.value)
            }
          />
        </div>

        <div className={styles.pickerBody}>
          {grouped.length === 0 ? (
            <div className={styles.pickerEmpty}>
              No widgets match “{query}”.
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category}>
                <div className={styles.pickerCategory}>
                  {CATEGORY_LABEL[group.category]}
                </div>
                <div className={styles.pickerGrid}>
                  {group.items.map((meta) => {
                    const tint = boardTintVar(meta.tint);
                    return (
                      <button
                        key={meta.type}
                        type="button"
                        className={styles.pickerTile}
                        style={
                          tint
                            ? ({
                                ["--tile-bg" as string]: tint,
                              } as React.CSSProperties)
                            : undefined
                        }
                        disabled={busy}
                        onClick={() => void pick(meta)}
                      >
                        <TeachIcon name={meta.icon} size={20} />
                        <span className={styles.pickerTileLabel}>
                          {meta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
