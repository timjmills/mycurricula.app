"use client";

// WallLibrary.tsx — the wall-chooser modal (Wave 9a), built to the design
// bundle's source/wall-library.jsx: Presets | My Walls tabs, search, a
// Personal/Team scope filter, a six-way sort with pinned walls floated to the
// top, and 16:10 thumbnail cards with Present + pin + a ⋯ menu (rename inline /
// set background / duplicate / delete).
//
// SECURITY. The bundle's thumbnail background builder (wall-library.jsx:34) is
// the SAME CSS-injection sink as the section popover — a stored `{type,value}`
// interpolated raw into a style. This rebuild routes EVERY thumbnail and every
// set-background through backgrounds.ts (the allowlisted descriptor + the
// isSafeImgSrc/cssUrl photo gate). There is no raw-string path.
//
// DELIBERATELY OMITTED:
//   • Share (bundle :124) — Wave 9b is deferred; the token is forgeable.
//   • Photo UPLOAD in the set-background popover (bundle :134) — the upload
//     seam (lib/resource-upload) is lesson-owned and a wall background has no
//     lesson; a blob: URL is also dead on reload. The five bundled presets
//     cover the photo case and persist. (See the message to the lead.)
//
// prompt()/confirm() (bundle :69,:71) are replaced by inline rename + an inline
// delete confirm with a `required` Tooltip — the destructive-action contract.
//
// Portal + focus-trap + scroll-lock mirror components/catchup-v2/CatchUpModal.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Tooltip } from "@/components/ui";
import {
  WALL_PRESETS,
  WALL_PRESET_LABEL,
  type WallPreset,
} from "@/lib/wall-scope";
import {
  PHOTO_PRESETS,
  SUBJECT_TINT_LABELS,
  WASH_LABELS,
  backgroundStyle,
  type SubjectTint,
  type WallBackground,
  type Wash,
} from "./backgrounds";
import {
  loadLastUsed,
  loadPins,
  loadPresetBackgrounds,
  savePins,
  savePresetBackgrounds,
  touchLastUsed,
  type CustomWall,
} from "./wall-state";
import styles from "./WallLibrary.module.css";

/** What each preset is FOR, in a teacher's terms — the thumbnail subtitle. */
const PRESET_BLURB: Record<WallPreset, string> = {
  lesson: "Right now",
  today: "Today · mixed",
  "week-mixed": "This week · mixed",
  "week-subject": "This week · by subject",
  subject: "By subject",
  unit: "By unit",
};

/** Sort options — the useful subset of the bundle's list (wall-library.jsx:144).
 *  "Unit" is dropped: a wall is not unit-scoped in this model, so it would sort
 *  identically to Manual and mislead. */
const SORTS = [
  ["recent", "Last used"],
  ["alpha", "A–Z"],
  ["subject", "Subject"],
  ["created", "Date created"],
  ["manual", "Manual"],
] as const;
type SortKey = (typeof SORTS)[number][0];

const SUBJECT_TINTS: readonly SubjectTint[] = ["full", "soft", "faint"];
const WASHES: readonly Wash[] = ["dawn", "honey", "mint", "brand"];

// ── Icons ────────────────────────────────────────────────────────────────────

const IconX = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconSearch = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);
const IconDots = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
);
const IconPin = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.4 6.9 7.1.3-5.6 4.4 2 6.8L12 16.9 6.1 20.4l2-6.8L2.5 9.2l7.1-.3z" />
  </svg>
);

// ── Props ────────────────────────────────────────────────────────────────────

export interface WallLibraryProps {
  initialTab?: "presets" | "my";
  activePreset: WallPreset | null;
  activeCustomId: string | null;
  customWalls: CustomWall[];
  /** Phone — no edit affordances (view-only): Present + open still work. */
  readOnly: boolean;
  onOpenPreset: (preset: WallPreset) => void;
  onOpenCustom: (wall: CustomWall) => void;
  /** Replace the whole wall list (rename / duplicate / delete / set-bg). The
   *  parent owns the array + its persistence; the library computes the next
   *  array and hands it back. */
  onPersistCustomWalls: (next: CustomWall[]) => void;
  /** A preset's backdrop changed — the parent re-reads to repaint the live wall. */
  onPresetBackgroundsChange: (map: Partial<Record<WallPreset, WallBackground>>) => void;
  onClose: () => void;
}

// ── Card model ───────────────────────────────────────────────────────────────

/** A preset and a custom wall, unified for the card grid + the sort. */
interface CardEntry {
  cid: string; // sort/pin key: preset id or wall id
  name: string;
  sub: string;
  isPreset: boolean;
  preset?: WallPreset;
  wall?: CustomWall;
  subjectId?: string; // representative subject (first section) — for the gradient
  bg: WallBackground | null;
  team: boolean;
  created: number;
}

export function WallLibrary({
  initialTab = "presets",
  activePreset,
  activeCustomId,
  customWalls,
  readOnly,
  onOpenPreset,
  onOpenCustom,
  onPersistCustomWalls,
  onPresetBackgroundsChange,
  onClose,
}: WallLibraryProps): ReactNode {
  const [tab, setTab] = useState<"presets" | "my">(initialTab);
  const [scope, setScope] = useState<"all" | "personal" | "team">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [bgForId, setBgForId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [lastUsed, setLastUsed] = useState<Record<string, number>>({});
  const [pins, setPins] = useState<string[]>([]);
  const [presetBg, setPresetBg] = useState<Partial<Record<WallPreset, WallBackground>>>({});

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setLastUsed(loadLastUsed());
    setPins(loadPins());
    setPresetBg(loadPresetBackgrounds());
  }, []);

  // Scroll-lock + LAYERED Escape (bundle :60): a menu closes first, then the
  // background popover, then the delete confirm, then the modal — so Escape
  // unwinds one layer at a time instead of blowing the whole modal away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (menuId) return setMenuId(null);
      if (bgForId) return setBgForId(null);
      if (confirmId) return setConfirmId(null);
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuId, bgForId, confirmId, onClose]);

  // Click-outside closes an open ⋯ menu / bg popover (bundle :61).
  useEffect(() => {
    if (!menuId && !bgForId) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.menuWrap}`)) {
        setMenuId(null);
        setBgForId(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuId, bgForId]);

  useEffect(() => {
    if (mounted) cardRef.current?.focus();
  }, [mounted]);

  const trapFocus = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const focusable = cardRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const persist = useCallback(
    (next: CustomWall[]) => onPersistCustomWalls(next),
    [onPersistCustomWalls],
  );

  const openPreset = useCallback(
    (preset: WallPreset) => {
      setLastUsed(touchLastUsed(preset));
      onOpenPreset(preset);
    },
    [onOpenPreset],
  );
  const openCustom = useCallback(
    (wall: CustomWall) => {
      setLastUsed(touchLastUsed(wall.id));
      onOpenCustom(wall);
    },
    [onOpenCustom],
  );

  const togglePin = useCallback(
    (cid: string) => {
      // Compute → set → save (not a save inside the updater — that double-fires
      // under StrictMode). `pins` is current in this event handler.
      const next = pins.includes(cid) ? pins.filter((p) => p !== cid) : [...pins, cid];
      setPins(next);
      savePins(next);
    },
    [pins],
  );

  const commitRename = useCallback(
    (wall: CustomWall) => {
      const name = renameText.trim();
      setRenameId(null);
      if (!name || name === wall.name) return;
      persist(customWalls.map((w) => (w.id === wall.id ? { ...w, name } : w)));
    },
    [renameText, customWalls, persist],
  );

  const duplicate = useCallback(
    (wall: CustomWall) => {
      setMenuId(null);
      const copy: CustomWall = {
        ...wall,
        id: `cw-dup-${wall.id}-${Date.now().toString(36)}`,
        name: `Copy of ${wall.name}`,
        created: Date.now(),
      };
      persist([copy, ...customWalls]);
    },
    [customWalls, persist],
  );

  const remove = useCallback(
    (wall: CustomWall) => {
      setConfirmId(null);
      setMenuId(null);
      persist(customWalls.filter((w) => w.id !== wall.id));
    },
    [customWalls, persist],
  );

  /** Apply a background. Preset backdrops live in their own store (a preset has
   *  no CustomWall record); a custom wall carries `bg` on its record. */
  const setBackground = useCallback(
    (entry: CardEntry, bg: WallBackground | null) => {
      setBgForId(null);
      setMenuId(null);
      if (entry.isPreset && entry.preset) {
        const next = { ...presetBg };
        if (bg) next[entry.preset] = bg;
        else delete next[entry.preset];
        setPresetBg(next);
        savePresetBackgrounds(next);
        onPresetBackgroundsChange(next);
        return;
      }
      if (entry.wall) {
        const wallId = entry.wall.id;
        persist(
          customWalls.map((w) => {
            if (w.id !== wallId) return w;
            const copy = { ...w };
            if (bg) copy.bg = bg;
            else delete copy.bg;
            return copy;
          }),
        );
      }
    },
    [presetBg, customWalls, persist, onPresetBackgroundsChange],
  );

  // ── Sorted, filtered card lists ─────────────────────────────────────────────

  const compare = useCallback(
    (a: CardEntry, b: CardEntry): number => {
      const pinnedA = pins.includes(a.cid);
      const pinnedB = pins.includes(b.cid);
      if (pinnedA !== pinnedB) return pinnedA ? -1 : 1; // pins float to the top
      switch (sort) {
        case "alpha":
          return a.name.localeCompare(b.name);
        case "subject":
          return (a.subjectId ?? a.sub).localeCompare(b.subjectId ?? b.sub);
        case "created":
          return b.created - a.created;
        default: {
          // "recent" — last used, then created as the tiebreak.
          const la = lastUsed[a.cid] ?? a.created;
          const lb = lastUsed[b.cid] ?? b.created;
          return lb - la;
        }
      }
    },
    [pins, sort, lastUsed],
  );

  const presetCards = useMemo<CardEntry[]>(() => {
    const q = query.trim().toLowerCase();
    let arr: CardEntry[] = WALL_PRESETS.map((preset) => ({
      cid: preset,
      name: WALL_PRESET_LABEL[preset],
      sub: PRESET_BLURB[preset],
      isPreset: true,
      preset,
      bg: presetBg[preset] ?? null,
      team: false,
      created: 0,
    }));
    if (q) arr = arr.filter((c) => `${c.name} ${c.sub}`.toLowerCase().includes(q));
    return sort === "manual" ? arr : [...arr].sort(compare);
  }, [query, presetBg, sort, compare]);

  const myCards = useMemo<CardEntry[]>(() => {
    const q = query.trim().toLowerCase();
    let arr: CardEntry[] = customWalls.map((wall) => ({
      cid: wall.id,
      name: wall.name,
      sub: `${wall.layout.length} section${wall.layout.length === 1 ? "" : "s"}${
        wall.forkedFrom ? ` · from ${wall.forkedFrom}` : ""
      }`,
      isPreset: false,
      wall,
      subjectId: wall.layout[0]?.subjectId,
      bg: wall.bg ?? null,
      team: wall.team === true,
      created: wall.created,
    }));
    if (scope !== "all") arr = arr.filter((c) => (scope === "team" ? c.team : !c.team));
    if (q) arr = arr.filter((c) => c.name.toLowerCase().includes(q));
    return sort === "manual" ? arr : [...arr].sort(compare);
  }, [customWalls, scope, query, sort, compare]);

  if (!mounted) return null;

  const cards = tab === "presets" ? presetCards : myCards;

  return createPortal(
    <div className={styles.scrim} onClick={onClose} role="presentation">
      <div
        ref={cardRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rw-lib-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <div className={styles.head}>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "presets"}
              id="rw-lib-title"
              className={`${styles.tab} ${tab === "presets" ? styles.on : ""}`}
              onClick={() => setTab("presets")}
            >
              Presets
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "my"}
              className={`${styles.tab} ${tab === "my" ? styles.on : ""}`}
              onClick={() => setTab("my")}
            >
              My Walls
            </button>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className={styles.controls}>
          <div className={styles.search}>
            <IconSearch />
            <input
              className={styles.searchInput}
              value={query}
              placeholder="Search walls…"
              aria-label="Search walls"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {tab === "my" && (
            <div className={styles.scope} role="group" aria-label="Whose walls">
              {(
                [
                  ["all", "All"],
                  ["personal", "Personal"],
                  ["team", "Team"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.scopeBtn} ${scope === value ? styles.on : ""}`}
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <label className={styles.sortWrap}>
            <span className={styles.sortLbl}>Sort</span>
            <select
              className={styles.sort}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort walls"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.body}>
          {cards.length === 0 ? (
            <p className={styles.empty}>
              {tab === "my"
                ? scope === "team"
                  ? "Shared team walls aren’t available yet. Walls you save stay on this device for now."
                  : query
                    ? "No walls match your search."
                    : "No saved walls yet. Edit any preset and it’ll be copied here automatically as your own."
                : "No presets match your search."}
            </p>
          ) : (
            <div className={styles.grid}>
              {cards.map((entry) => {
                const active = entry.isPreset
                  ? activePreset === entry.preset
                  : activeCustomId === entry.wall?.id;
                const pinned = pins.includes(entry.cid);
                return (
                  <div key={entry.cid} className={`${styles.card} ${active ? styles.cardOn : ""}`}>
                    <button
                      type="button"
                      className={`cp-subj ${entry.subjectId ?? ""} ${styles.thumb}`}
                      style={
                        entry.bg
                          ? backgroundStyle(entry.bg)
                          : entry.subjectId
                            ? {
                                background:
                                  "linear-gradient(135deg, color-mix(in oklab, var(--c) 34%, var(--surface)), color-mix(in oklab, var(--c) 12%, var(--surface)))",
                              }
                            : { background: "var(--grad-dawn)" }
                      }
                      onClick={() =>
                        entry.isPreset && entry.preset
                          ? openPreset(entry.preset)
                          : entry.wall && openCustom(entry.wall)
                      }
                    >
                      {renameId === entry.cid && entry.wall ? (
                        <input
                          autoFocus
                          className={styles.renameInput}
                          value={renameText}
                          aria-label="Wall name"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameText(e.target.value)}
                          onBlur={() => commitRename(entry.wall!)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(entry.wall!);
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setRenameId(null);
                            }
                          }}
                        />
                      ) : (
                        <span className={styles.name}>
                          {entry.name}
                          {entry.sub && <span className={styles.sub}>{entry.sub}</span>}
                        </span>
                      )}
                      {pinned && (
                        <span className={styles.pinFlag} aria-label="Pinned">
                          <IconPin />
                        </span>
                      )}
                      {entry.team && <span className={styles.teamFlag}>Team</span>}
                    </button>

                    <div className={styles.cardBar}>
                      <button
                        type="button"
                        className={styles.present}
                        onClick={() =>
                          entry.isPreset && entry.preset
                            ? openPreset(entry.preset)
                            : entry.wall && openCustom(entry.wall)
                        }
                      >
                        Present
                      </button>

                      {!readOnly && (
                        <Tooltip
                          content={pinned ? "Unpin from the top" : "Pin to the top of the list"}
                          tooltipId="rw-lib-pin"
                          side="top"
                        >
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${pinned ? styles.pinOn : ""}`}
                            onClick={() => togglePin(entry.cid)}
                            aria-pressed={pinned}
                            aria-label={pinned ? "Unpin" : "Pin"}
                          >
                            <IconPin />
                          </button>
                        </Tooltip>
                      )}

                      {!readOnly && (
                        <div className={styles.menuWrap}>
                          <Tooltip content="Rename, set a background, duplicate, or delete this wall" tooltipId="rw-lib-more" side="top">
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => setMenuId(menuId === entry.cid ? null : entry.cid)}
                              aria-expanded={menuId === entry.cid}
                              aria-label="More"
                            >
                              <IconDots />
                            </button>
                          </Tooltip>

                          {menuId === entry.cid && (
                            <div className={styles.menu} role="menu">
                              {!entry.isPreset && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={styles.menuRow}
                                  onClick={() => {
                                    setMenuId(null);
                                    setRenameId(entry.cid);
                                    setRenameText(entry.name);
                                  }}
                                >
                                  Rename
                                </button>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                className={styles.menuRow}
                                onClick={() => {
                                  setMenuId(null);
                                  setBgForId(entry.cid);
                                }}
                              >
                                Set background
                              </button>
                              {entry.bg && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={styles.menuRow}
                                  onClick={() => setBackground(entry, null)}
                                >
                                  Reset background
                                </button>
                              )}
                              {!entry.isPreset && entry.wall && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={styles.menuRow}
                                  onClick={() => duplicate(entry.wall!)}
                                >
                                  Duplicate
                                </button>
                              )}
                              {!entry.isPreset && entry.wall && (
                                <Tooltip
                                  content="Permanently delete this wall. The resources on it stay in your lessons — only the wall goes."
                                  required
                                  side="left"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className={`${styles.menuRow} ${styles.del}`}
                                    onClick={() => setConfirmId(entry.cid)}
                                  >
                                    Delete
                                  </button>
                                </Tooltip>
                              )}
                            </div>
                          )}

                          {bgForId === entry.cid && (
                            <div className={styles.bgPop} role="menu">
                              <div className={styles.bgLbl}>Wash</div>
                              <div className={styles.bgSwatches}>
                                {WASHES.map((wash) => (
                                  <button
                                    key={wash}
                                    type="button"
                                    className={styles.bgSwatch}
                                    title={WASH_LABELS[wash]}
                                    aria-label={WASH_LABELS[wash]}
                                    style={backgroundStyle({ kind: "wash", wash })}
                                    onClick={() => setBackground(entry, { kind: "wash", wash })}
                                  />
                                ))}
                              </div>
                              {entry.subjectId && (
                                <>
                                  <div className={styles.bgLbl}>Subject color</div>
                                  <div className={`cp-subj ${entry.subjectId} ${styles.bgSwatches}`}>
                                    {SUBJECT_TINTS.map((tint) => (
                                      <button
                                        key={tint}
                                        type="button"
                                        className={styles.bgSwatch}
                                        title={SUBJECT_TINT_LABELS[tint]}
                                        aria-label={SUBJECT_TINT_LABELS[tint]}
                                        style={{
                                          // --sc resolves from the cp-subj wrapper's --c.
                                          ...backgroundStyle({ kind: "subject", tint }),
                                          ["--sc" as string]: "var(--c)",
                                        }}
                                        onClick={() => setBackground(entry, { kind: "subject", tint })}
                                      />
                                    ))}
                                  </div>
                                </>
                              )}
                              <div className={styles.bgLbl}>Photo</div>
                              <div className={styles.bgSwatches}>
                                {PHOTO_PRESETS.map((src) => (
                                  <button
                                    key={src}
                                    type="button"
                                    className={styles.bgSwatch}
                                    title="Photo background"
                                    aria-label="Photo background"
                                    style={backgroundStyle({ kind: "photo", src })}
                                    onClick={() => setBackground(entry, { kind: "photo", src })}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {confirmId === entry.cid && entry.wall && (
                      <div className={styles.confirm}>
                        <span className={styles.confirmTx}>Delete “{entry.name}”?</span>
                        <button
                          type="button"
                          className={styles.confirmYes}
                          onClick={() => remove(entry.wall!)}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className={styles.confirmNo}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
