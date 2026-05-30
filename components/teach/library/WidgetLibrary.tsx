"use client";

// WidgetLibrary — the Widget Library browser (5.31 Boards & Widgets handoff,
// screenshot 2-widget-library.png). The teacher browses every widget, filters by
// category, manages a favorites band, and taps **Add** to drop a widget onto the
// open board.
//
// LAYOUT (matches the handoff):
//   • Left sidebar — Browse (All / Favorites / Recently Used / Suggested) +
//     Categories (Lesson / Management / Assessment / Language / Well-Being /
//     Utilities) + a "Customize your board" promo card.
//   • Main — search field + filter pills + a gold Favorites band (quick chips +
//     Manage Favorites) + a reflowing widget-card grid (4-col desktop → 2-col
//     tablet → 1-col phone/panel). Each card: tinted preview, favorite star,
//     title, description, and an Add / Added state.
//
// DATA SOURCE: the catalog (`@/components/teach/widgets`). The lead is rebinning
// `WIDGET_CATALOG` to the six handoff categories in parallel; this component
// consumes whatever `WidgetMeta.category` exports today and groups by it. The
// six sidebar labels below are the handoff's target taxonomy.
//   TODO(lead): once catalog.ts re-bins `category` to lesson/management/
//   assessment/language/wellbeing/utilities, the CATEGORY_NAV ids will line up
//   1:1 with WidgetMeta.category and the `matchesCategory` heuristic collapses
//   to an equality check.
//
// CONTRACT: pure UI. It emits the chosen widget type via `onAddWidget(type)`;
// the caller adds it to the live board. Favorites + "added" state are local to
// this browser (the persistence layer lands with the backend).
//
// Chrome rules (CLAUDE.md §4): tokens only via the .module.css; the favorite
// star + Add controls are real labelled buttons; reduced motion respected.

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { WidgetType } from "@/lib/types";
import {
  WIDGET_CATALOG,
  TeachIcon,
  type WidgetMeta,
  type BoardTint,
  type TeachIconName,
} from "@/components/teach/widgets";
import { SearchIcon } from "../right/icons";
import styles from "./WidgetLibrary.module.css";

// ── Tint → appearance-family bridge ──────────────────────────────────────────
// The catalog's `BoardTint` (yellow/mint/sky/pink/lavender/peach) maps to the
// `--wf-<fam>-*` token families the handoff's widget cards paint with (soft /
// chip / accent). Tokens only — no hex.

const TINT_FAMILY: Record<BoardTint, string> = {
  yellow: "yellow",
  mint: "green",
  sky: "blue",
  pink: "pink",
  lavender: "purple",
  peach: "orange",
  none: "slate",
};

function familyVar(tint: BoardTint, suffix: string): string {
  return `var(--wf-${TINT_FAMILY[tint]}-${suffix})`;
}

// ── Sidebar taxonomy (handoff target categories) ─────────────────────────────
// `id` is the handoff category id; `match` lists the catalog's CURRENT category
// values that fold into it (the heuristic in `matchesCategory`). Once the lead
// re-bins the catalog, `match` collapses to `[id]`.

type BrowseId = "all" | "favorites" | "recent" | "suggested";

interface CategoryNav {
  id: string;
  label: string;
  icon: TeachIconName;
  /** Current catalog category values that fold into this handoff category. */
  match: readonly string[];
}

const BROWSE_NAV: ReadonlyArray<{
  id: BrowseId;
  label: string;
  icon: TeachIconName;
}> = [
  { id: "all", label: "All Widgets", icon: "grid" },
  { id: "favorites", label: "Favorites", icon: "star" },
  { id: "recent", label: "Recently Used", icon: "timer" },
  { id: "suggested", label: "Suggested", icon: "model" },
];

const CATEGORY_NAV: readonly CategoryNav[] = [
  // TODO(lead): re-bin catalog `category` to these six ids; then `match` === [id].
  {
    id: "lesson",
    label: "Lesson",
    icon: "notes",
    match: ["display", "content"],
  },
  {
    id: "management",
    label: "Management",
    icon: "check",
    match: ["classroom"],
  },
  {
    id: "assessment",
    label: "Assessment",
    icon: "target",
    match: ["engagement"],
  },
  { id: "language", label: "Language", icon: "text", match: ["language"] },
  {
    id: "wellbeing",
    label: "Well-Being",
    icon: "star",
    match: ["wellbeing", "sel"],
  },
  {
    id: "utilities",
    label: "Utilities",
    icon: "timer",
    match: ["timing", "utility"],
  },
];

const CATEGORY_BY_ID: Record<string, CategoryNav> = Object.fromEntries(
  CATEGORY_NAV.map((c) => [c.id, c]),
);

/** Whether a widget falls under a given handoff category id. When the catalog
 *  already exposes the handoff id directly we match on equality; otherwise we
 *  fold the legacy category through the `match` list. */
function matchesCategory(meta: WidgetMeta, categoryId: string): boolean {
  const nav = CATEGORY_BY_ID[categoryId];
  if (!nav) return false;
  if (meta.category === categoryId) return true;
  return nav.match.includes(meta.category);
}

// ── Filter pills (the handoff's All / Lesson / Management / … row) ────────────
const FILTER_PILLS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  ...CATEGORY_NAV.map((c) => ({ id: c.id, label: c.label })),
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface WidgetLibraryProps {
  /** Add the chosen widget to the open board. */
  onAddWidget: (type: WidgetType) => void;
  /** Widget types already on the board (renders the "Added ✓" state). */
  addedTypes?: readonly WidgetType[];
}

// ── WidgetLibrary ─────────────────────────────────────────────────────────────

export function WidgetLibrary({
  onAddWidget,
  addedTypes,
}: WidgetLibraryProps): ReactNode {
  const [browse, setBrowse] = useState<BrowseId>("all");
  // Active category id (sidebar Categories / filter pills share this). "all" =
  // no category constraint. Selecting a category clears the Browse focus to
  // "all" so the two navs never silently contradict.
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  // Favorites are local to the browser until the backend lands.
  const [favorites, setFavorites] = useState<Set<WidgetType>>(() => new Set());

  const added = useMemo(() => new Set(addedTypes ?? []), [addedTypes]);

  const toggleFavorite = useCallback((type: WidgetType): void => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // ── Derived: the favorites band contents ──────────────────────────────────
  const favoriteWidgets = useMemo<WidgetMeta[]>(
    () => WIDGET_CATALOG.filter((m) => favorites.has(m.type)),
    [favorites],
  );

  // ── Derived: the visible card grid ────────────────────────────────────────
  const visible = useMemo<WidgetMeta[]>(() => {
    const q = query.trim().toLowerCase();
    return WIDGET_CATALOG.filter((meta) => {
      if (browse === "favorites" && !favorites.has(meta.type)) return false;
      if (category !== "all" && !matchesCategory(meta, category)) return false;
      if (q) {
        const hay = `${meta.label} ${meta.kicker}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query, browse, category, favorites]);

  const selectBrowse = useCallback((id: BrowseId): void => {
    setBrowse(id);
    setCategory("all");
  }, []);

  const selectCategory = useCallback((id: string): void => {
    setCategory((prev) => (prev === id ? "all" : id));
    setBrowse("all");
  }, []);

  return (
    <div className={styles.root}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        className={styles.sidebar}
        aria-label="Widget library navigation"
        title="Browse widgets by group or category"
      >
        <nav className={styles.navGroup} aria-label="Browse">
          <p className={styles.navHeading}>Browse</p>
          {BROWSE_NAV.map((item) => {
            const active = browse === item.id && category === "all";
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                aria-pressed={active}
                onClick={() => selectBrowse(item.id)}
              >
                <span className={styles.navIcon} aria-hidden="true">
                  <TeachIcon name={item.icon} size={18} />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <nav className={styles.navGroup} aria-label="Categories">
          <p className={styles.navHeading}>Categories</p>
          {CATEGORY_NAV.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                aria-pressed={active}
                onClick={() => selectCategory(item.id)}
              >
                <span className={styles.navIcon} aria-hidden="true">
                  <TeachIcon name={item.icon} size={18} />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className={styles.promo}>
          <span className={styles.promoIcon} aria-hidden="true">
            <TeachIcon name="grid" size={28} />
          </span>
          <p className={styles.promoTitle}>Customize your board</p>
          <p className={styles.promoBody}>
            Add the widgets you use the most to build the perfect classroom
            flow.
          </p>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className={styles.main}>
        {/* Search + filter pills */}
        <div className={styles.controls}>
          <div className={styles.searchRow}>
            <span className={styles.searchIcon} aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search widgets…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search widgets by name"
            />
          </div>
          <div
            className={styles.filters}
            role="group"
            aria-label="Filter widgets by category"
          >
            {FILTER_PILLS.map((pill) => {
              const active =
                pill.id === "all" ? category === "all" : category === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  className={`${styles.filterPill} ${active ? styles.filterPillActive : ""}`}
                  aria-pressed={active}
                  onClick={() =>
                    pill.id === "all"
                      ? setCategory("all")
                      : selectCategory(pill.id)
                  }
                >
                  {pill.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`${styles.filterPill} ${styles.filterPillFav} ${browse === "favorites" ? styles.filterPillFavActive : ""}`}
              aria-pressed={browse === "favorites"}
              onClick={() =>
                selectBrowse(browse === "favorites" ? "all" : "favorites")
              }
            >
              <TeachIcon name="star" size={14} /> Favorites
            </button>
          </div>
        </div>

        {/* Gold favorites band */}
        <section className={styles.favBand} aria-label="Favorite widgets">
          <div className={styles.favBandHead}>
            <span className={styles.favBandTitle}>
              <span className={styles.favStarLit} aria-hidden="true">
                <TeachIcon name="star" size={18} />
              </span>
              Favorites
            </span>
            <button
              type="button"
              className={styles.manageFavs}
              onClick={() => selectBrowse("favorites")}
              title="Show only your favorite widgets"
            >
              <TeachIcon name="cog" size={15} /> Manage Favorites
            </button>
          </div>
          {favoriteWidgets.length > 0 ? (
            <div className={styles.favChips}>
              {favoriteWidgets.map((meta) => (
                <button
                  key={meta.type}
                  type="button"
                  className={styles.favChip}
                  onClick={() => onAddWidget(meta.type)}
                  title={`Add ${meta.label} to your board`}
                >
                  <span
                    className={styles.favChipIcon}
                    aria-hidden="true"
                    style={{
                      background: familyVar(meta.tint, "chip"),
                      color: familyVar(meta.tint, "accent"),
                    }}
                  >
                    <TeachIcon name={meta.icon} size={20} />
                  </span>
                  <span className={styles.favChipLabel}>{meta.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.favEmpty}>
              Tap the star on any widget to add it here for one-tap access.
            </p>
          )}
        </section>

        {/* Widget card grid */}
        {visible.length === 0 ? (
          <p className={styles.empty}>No widgets match your search.</p>
        ) : (
          <div className={styles.grid}>
            {visible.map((meta) => {
              const isAdded = added.has(meta.type);
              const isFav = favorites.has(meta.type);
              return (
                <article
                  key={meta.type}
                  className={`${styles.card} ${isAdded ? styles.cardAdded : ""}`}
                >
                  <button
                    type="button"
                    className={styles.favToggle}
                    aria-pressed={isFav}
                    aria-label={
                      isFav
                        ? `Remove ${meta.label} from favorites`
                        : `Add ${meta.label} to favorites`
                    }
                    onClick={() => toggleFavorite(meta.type)}
                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                  >
                    <span
                      className={`${styles.favToggleStar} ${isFav ? styles.favToggleStarOn : ""}`}
                    >
                      <TeachIcon name="star" size={18} />
                    </span>
                  </button>

                  <div
                    className={styles.preview}
                    aria-hidden="true"
                    style={{ background: familyVar(meta.tint, "soft") }}
                  >
                    <span
                      className={styles.previewIcon}
                      style={{
                        background: familyVar(meta.tint, "chip"),
                        color: familyVar(meta.tint, "accent"),
                      }}
                    >
                      <TeachIcon name={meta.icon} size={22} />
                    </span>
                    <span className={styles.previewLines}>
                      <span
                        className={styles.previewLine}
                        style={{ background: familyVar(meta.tint, "line") }}
                      />
                      <span
                        className={`${styles.previewLine} ${styles.previewLineShort}`}
                        style={{ background: familyVar(meta.tint, "line") }}
                      />
                    </span>
                  </div>

                  <h3 className={styles.cardTitle}>{meta.label}</h3>
                  <p className={styles.cardDesc}>{meta.kicker}</p>

                  <div className={styles.cardFoot}>
                    {isAdded ? (
                      <span className={styles.addedTag}>
                        <TeachIcon name="check" size={16} /> Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() => onAddWidget(meta.type)}
                        title={`Add ${meta.label} to your board`}
                      >
                        <TeachIcon name="plus" size={14} /> Add
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
