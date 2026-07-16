"use client";

// Section.tsx — one kanban column of the Resource Wall (Wave 9a): a header that
// collapses/reorders, a grid of Cards, and the per-section background popover.
//
// Subject color arrives as inline `--sc` from useSubjectColor and NOTHING here
// hard-codes a fill. That is the wave's "adopts the frame material" rule: a
// section with no background pinned paints nothing of its own, so the wall's
// frame shows through and the section re-tints with the theme. The bundle's
// white section card (resource-wall.jsx) is exactly what we must not ship — it
// punches a hole in Night.
//
// Drag model (unchanged from the bundle, hardened): sections carry "text/sec"
// and cards carry "text/card" on the dataTransfer, so a drop target can tell
// which is in flight without a shared mutable "what am I dragging" global.
// Every drag/edit affordance is gated on `readOnly` — phones are view-only
// (product decision 2026-07-10, lib/use-phone-viewport).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import { useSubjectColor } from "@/lib/palette";
import { Tooltip } from "@/components/ui";
import { fromInteractive } from "@/components/planner-v2/util";
import type { SubjectId } from "@/lib/types";
import type { WallItem, WallSection, WallView } from "@/lib/wall-scope";
import { Card } from "./Card";
import {
  OPACITY_MAX,
  OPACITY_MIN,
  PHOTO_PRESETS,
  SHADE_LABELS,
  SUBJECT_TINT_LABELS,
  WASH_LABELS,
  backgroundStyle,
  needsInverseInk,
  translucentValue,
  type Shade,
  type SubjectTint,
  type WallBackground,
  type Wash,
} from "./backgrounds";
import {
  loadSectionBackground,
  resetSectionBackground,
  resetSubjectBackground,
  saveSectionBackground,
  type BackgroundScope,
} from "./wall-state";
import styles from "./Section.module.css";

// ── The type filter ──────────────────────────────────────────────────────────

/**
 * The toolbar's six filter labels, VERBATIM from the bundle (resource-wall.jsx:96).
 * The labels ship as-is; the mapping behind them could not be ported. The
 * bundle filtered on `note` / `worksheet` — types that do not exist in this
 * app's model (lib/types.ts:53 → slides | pdf | doc | image | youtube | website
 * | link | notecard). So each label maps to the REAL types a teacher would
 * expect under that word, and "Documents" absorbs slides (a deck is a document
 * to a teacher looking for one) while "Links" absorbs youtube/website (all three
 * are "a thing on the web").
 *
 * Lives here rather than in the toolbar because Section is what applies it —
 * and importing it up into ResourceWall (which imports Section) is the
 * direction that doesn't cycle.
 */
export const WALL_FILTERS = [
  "All",
  "Notes",
  "PDFs",
  "Images",
  "Documents",
  "Links",
] as const;

export type WallFilter = (typeof WALL_FILTERS)[number];

/** The two card-layout modes (see Section.module.css `.natural` / `.uniform`). */
export type WallLayout = "natural" | "uniform";

const FILTER_TYPES: Record<Exclude<WallFilter, "All">, readonly WallItem["type"][]> =
  {
    Notes: ["notecard"],
    PDFs: ["pdf"],
    Images: ["image"],
    Documents: ["doc", "slides"],
    Links: ["link", "website", "youtube"],
  };

/** True when an item survives the active type filter + search query. */
export function matchesFilter(
  item: WallItem,
  filter: WallFilter,
  query: string,
): boolean {
  if (filter !== "All" && !FILTER_TYPES[filter].includes(item.type)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.label.toLowerCase().includes(q);
}

// ── Icons ────────────────────────────────────────────────────────────────────

const IconChevron = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const IconGrip = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);
const IconImage = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="9" cy="9" r="1.4" />
  </svg>
);
const IconPlay = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
const IconSolo = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6M21 3l-8 8M9 21H3v-6M3 21l8-8" />
  </svg>
);
const IconPlus = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// ── Size cycle ───────────────────────────────────────────────────────────────

type SectionSize = "min" | "small" | "full";

const SIZE_TOOLTIP: Record<SectionSize, string> = {
  min: "Minimized — click to show two rows of resources",
  small: "Two rows — click to expand the whole section",
  full: "Expanded — click to minimize this section",
};

const NEXT_SIZE: Record<SectionSize, SectionSize> = {
  min: "small",
  small: "full",
  full: "min",
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface SectionProps {
  section: WallSection;
  /** The wall this section lives on (custom wall id, or preset id) — scopes the
   *  "this section" background so it can't leak across walls sharing section ids. */
  wallKey: string;
  view: WallView;
  layout: WallLayout;
  query: string;
  filter: WallFilter;
  /** Phone — every edit/drag affordance is suppressed (view-only). */
  readOnly: boolean;
  /** A section drag is in flight anywhere on the wall: all sections collapse so
   *  the drop targets fit on one screen (the bundle's collapse-on-drag). */
  sectionDragging: boolean;
  cardDragging: boolean;
  onCardDragState: (active: boolean) => void;
  /** Any edit → the wall auto-forks a preset into "My Walls" before applying. */
  onEdit: () => void;
  onOpen: (item: WallItem, list: WallItem[]) => void;
  onEnlarge: (item: WallItem) => void;
  onBoard: (item: WallItem, fromLessonId?: string) => void;
  onModal: (item: WallItem) => void;
  onAddCard: (sectionId: string) => void;
  onAddSection: (after: WallSection) => void;
  onCommitCard: (item: WallItem) => void;
  onDropCard: (cardKey: string, sectionId: string, beforeKey?: string) => void;
  onDropSection: (fromId: string, toId: string) => void;
  onDragStartSection: (id: string) => void;
  onDragEndSection: () => void;
  onSolo: (section: WallSection) => void;
  /** Bumped by the wall on ANY section-background write. Folded into the
   *  bg-load effect deps so a whole-subject apply/reset re-reads every mounted
   *  section of that subject — not just the one whose popover made the change
   *  (Codex R3: storage updated but live siblings stayed stale). */
  bgRevision: number;
  /** Signal a section-background write so every mounted section re-reads. */
  onBgChange: () => void;
}

export function Section({
  section,
  wallKey,
  view,
  layout,
  query,
  filter,
  readOnly,
  sectionDragging,
  cardDragging,
  onCardDragState,
  onEdit,
  onOpen,
  onEnlarge,
  onBoard,
  onModal,
  onAddCard,
  onAddSection,
  onCommitCard,
  onDropCard,
  onDropSection,
  onDragStartSection,
  onDragEndSection,
  onSolo,
  bgRevision,
  onBgChange,
}: SectionProps): ReactNode {
  const [size, setSize] = useState<SectionSize>("full");
  const [bgOpen, setBgOpen] = useState(false);
  const [bg, setBg] = useState<WallBackground | null>(null);
  const subject = useSubjectColor(section.subjectId as SubjectId);

  // The stored background is a localStorage read — deferred to an effect so the
  // server render and the first client paint agree (the app's SSR contract:
  // hydrate with the default, then adopt the stored value). bgRevision re-runs
  // the read after ANY wall background write, so subject-scoped changes made in
  // a SIBLING section's popover propagate here live (Codex W9 R3).
  useEffect(() => {
    setBg(loadSectionBackground(wallKey, section.id, section.subjectId));
  }, [wallKey, section.id, section.subjectId, bgRevision]);

  const items = useMemo(
    () => section.items.filter((it) => matchesFilter(it, filter, query)),
    [section.items, filter, query],
  );

  const collapsed = sectionDragging || size === "min";
  const cycle = useCallback(() => setSize((s) => NEXT_SIZE[s]), []);

  const style = {
    // --sc is the section's subject color; every subject-relative background
    // recipe and the header dot resolve against it, so a palette change
    // re-tints without rewriting stored state.
    "--sc": subject.c,
    ...backgroundStyle(bg),
  } as React.CSSProperties;

  return (
    <section
      className={`${styles.sec} ${bg ? styles.hasBg : ""} ${
        bg?.kind === "photo" ? styles.hasPhoto : ""
      } ${needsInverseInk(bg) ? styles.inverse : ""}`}
      data-size={collapsed ? "min" : size}
      style={style}
      onDragOver={(e) => {
        if (readOnly) return;
        const t = e.dataTransfer.types;
        if (t.includes("text/card") || t.includes("text/sec")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (readOnly) return;
        const t = e.dataTransfer.types;
        if (t.includes("text/card")) {
          onDropCard(e.dataTransfer.getData("text/card"), section.id);
        } else if (t.includes("text/sec")) {
          onDropSection(e.dataTransfer.getData("text/sec"), section.id);
          onDragEndSection();
        }
      }}
    >
      <SectionHeader
        section={section}
        size={size}
        count={items.length}
        readOnly={readOnly}
        bg={bg}
        bgOpen={bgOpen}
        setBgOpen={setBgOpen}
        onApplyBg={(next, scope) => {
          onEdit();
          setBg(next);
          saveSectionBackground(wallKey, section.id, section.subjectId, next, scope);
          // Storage is written; tell the wall so EVERY mounted section re-reads
          // (a "Whole subject" apply must reach its siblings, not just this one).
          onBgChange();
          setBgOpen(false);
        }}
        onResetBg={(scope) => {
          onEdit();
          setBg(null);
          if (scope === "subject") {
            resetSubjectBackground(wallKey, section.subjectId);
          } else {
            resetSectionBackground(wallKey, section.id, section.subjectId);
          }
          onBgChange();
          setBgOpen(false);
        }}
        onCycle={cycle}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/sec", section.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStartSection(section.id);
        }}
        onDragEnd={onDragEndSection}
        onPlay={() => items[0] && onOpen(items[0], items)}
        onSolo={() => onSolo(section)}
        onAddSection={() => onAddSection(section)}
      />

      {!collapsed && (
        <div
          className={`${styles.grid} ${
            layout === "uniform" ? styles.uniform : styles.natural
          } ${styles[`v_${view}`] ?? ""} ${size === "small" ? styles.gridTwo : ""}`}
        >
          {items.map((item) => (
            <Card
              key={item.key}
              item={item}
              view={view}
              sectionId={section.id}
              readOnly={readOnly}
              dragging={cardDragging}
              onDragState={onCardDragState}
              onDropBefore={onDropCard}
              onOpen={(it) => onOpen(it, items)}
              onEnlarge={onEnlarge}
              onBoard={onBoard}
              onModal={onModal}
              onCommit={onCommitCard}
            />
          ))}
          {!readOnly && (
            <Tooltip
              content="Add a resource or a note to this section"
              tooltipId="rw-add-card"
              side="top"
            >
              <button
                type="button"
                className={styles.addCard}
                onClick={() => onAddCard(section.id)}
              >
                <IconPlus />
                <span>Add</span>
              </button>
            </Tooltip>
          )}
          {items.length === 0 && readOnly && (
            <p className={styles.empty}>Nothing here yet.</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  section: WallSection;
  size: SectionSize;
  count: number;
  readOnly: boolean;
  bg: WallBackground | null;
  bgOpen: boolean;
  setBgOpen: (open: boolean) => void;
  onApplyBg: (bg: WallBackground, scope: BackgroundScope) => void;
  onResetBg: (scope: BackgroundScope) => void;
  onCycle: () => void;
  onDragStart: (e: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onPlay: () => void;
  onSolo: () => void;
  onAddSection: () => void;
}

function SectionHeader({
  section,
  size,
  count,
  readOnly,
  bg,
  bgOpen,
  setBgOpen,
  onApplyBg,
  onResetBg,
  onCycle,
  onDragStart,
  onDragEnd,
  onPlay,
  onSolo,
  onAddSection,
}: SectionHeaderProps): ReactNode {
  return (
    <div
      className={styles.head}
      draggable={!readOnly}
      onDragStart={(e) => {
        // A drag that starts on an interactive child (the collapse chevron, a
        // background-popover control) would tear the whole section out from
        // under the teacher's click. `fromInteractive` is the shared guard
        // (planner-v2/util) — a button/input/select/textarea/anchor ancestor.
        if (fromInteractive(e)) {
          e.preventDefault();
          return;
        }
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
    >
      {!readOnly && (
        <span className={styles.grip} aria-hidden="true">
          <IconGrip />
        </span>
      )}

      <Tooltip content={SIZE_TOOLTIP[size]} tooltipId="rw-sec-size" side="top">
        <button
          type="button"
          className={styles.collapse}
          data-size={size}
          onClick={onCycle}
          aria-expanded={size !== "min"}
        >
          <IconChevron />
        </button>
      </Tooltip>

      <span className={styles.dot} aria-hidden="true" />
      {/* The title is the section's heading, not a control — the whole header is
          not clickable-to-collapse (the bundle made it so, which fights the
          drag handle and swallows stray clicks). The chevron owns collapsing. */}
      <h3 className={styles.title}>{section.title}</h3>
      {section.meta && <span className={styles.meta}>{section.meta}</span>}
      <span className={styles.count} aria-label={`${count} resources`}>
        {count}
      </span>

      <span className={styles.actions}>
        {!readOnly && (
          <BackgroundPopover
            bg={bg}
            open={bgOpen}
            setOpen={setBgOpen}
            onApply={onApplyBg}
            onReset={onResetBg}
          />
        )}
        {!readOnly && (
          <Tooltip
            content="Add another section below this one"
            tooltipId="rw-add-section"
            side="top"
          >
            <button type="button" className={styles.act} onClick={onAddSection} aria-label="Add a section below">
              <IconPlus />
            </button>
          </Tooltip>
        )}
        <Tooltip
          content="Play this section's resources full-screen, one after another"
          tooltipId="rw-sec-play"
          side="top"
        >
          <button type="button" className={styles.act} onClick={onPlay} disabled={count === 0} aria-label="Slideshow this section">
            <IconPlay />
          </button>
        </Tooltip>
        <Tooltip
          content="Open just this section on its own, with everything else hidden"
          tooltipId="rw-sec-solo"
          side="top"
        >
          <button type="button" className={styles.act} onClick={onSolo} aria-label="Open this section on its own">
            <IconSolo />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

// ── Background popover ───────────────────────────────────────────────────────

const SUBJECT_TINTS: readonly SubjectTint[] = [
  "full",
  "soft",
  "faint",
  "transStrong",
  "transSoft",
];
const SHADES: readonly Shade[] = ["subject", "surface", "ink", "honey", "brand"];
const WASHES: readonly Wash[] = ["dawn", "honey", "mint", "brand"];

/** The alpha checkerboard behind a see-through swatch, so "translucent" reads as
 *  translucent rather than as a muddy solid. Pure decoration on a preview chip —
 *  the only place a literal gray is defensible, and it is theme-independent by
 *  design (a checkerboard that re-tints stops reading as "transparent"). */
const CHECKER =
  "repeating-conic-gradient(rgba(0,0,0,.14) 0% 25%, rgba(255,255,255,.9) 0% 50%) 50% / 12px 12px";

interface BackgroundPopoverProps {
  bg: WallBackground | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  onApply: (bg: WallBackground, scope: BackgroundScope) => void;
  onReset: (scope: BackgroundScope) => void;
}

function BackgroundPopover({
  bg,
  open,
  setOpen,
  onApply,
  onReset,
}: BackgroundPopoverProps): ReactNode {
  const [scope, setScope] = useState<BackgroundScope>("section");
  const [shade, setShade] = useState<Shade>("subject");
  const [opacity, setOpacity] = useState(35);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Click-out + Escape close. Without these the popover is a modal with no way
  // back except re-clicking the icon it now covers.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const preview = translucentValue(shade, opacity);

  return (
    <span className={styles.bgWrap} ref={wrapRef}>
      <Tooltip
        content="Give this section its own background — a color, a wash, or a photo"
        tooltipId="rw-sec-bg"
        side="top"
      >
        <button
          type="button"
          className={styles.act}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Section background"
        >
          <IconImage />
        </button>
      </Tooltip>

      {open && (
        <div className={styles.pop} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.popTitle}>Section background</div>

          {/* Scope governs the WHOLE popover — both "Follow page style" and the
              swatches below apply to just this section or the whole subject. */}
          <div className={styles.scope} role="group" aria-label="Apply background to">
            <button
              type="button"
              className={`${styles.scopeBtn} ${scope === "section" ? styles.on : ""}`}
              onClick={() => setScope("section")}
              aria-pressed={scope === "section"}
            >
              This section
            </button>
            <button
              type="button"
              className={`${styles.scopeBtn} ${scope === "subject" ? styles.on : ""}`}
              onClick={() => setScope("subject")}
              aria-pressed={scope === "subject"}
            >
              Whole subject
            </button>
          </div>

          <button
            type="button"
            className={`${styles.follow} ${!bg ? styles.followOn : ""}`}
            onClick={() => onReset(scope)}
          >
            <span className={styles.followIc} aria-hidden="true">↺</span>
            <span className={styles.followTx}>
              <b>Follow page style</b>
              <small>
                {scope === "subject"
                  ? "Clear this subject's background everywhere on this wall"
                  : "Uses the wall's frame & background"}
              </small>
            </span>
            {!bg && <span className={styles.followCk} aria-hidden="true">✓</span>}
          </button>

          <div className={styles.or}>or set a custom background</div>

          <div className={styles.lbl}>Subject color</div>
          <div className={styles.swatches}>
            {SUBJECT_TINTS.map((tint) => {
              const value = backgroundStyle({ kind: "subject", tint }).background;
              const seeThrough = tint.startsWith("trans");
              return (
                <button
                  key={tint}
                  type="button"
                  className={styles.swatch}
                  title={SUBJECT_TINT_LABELS[tint]}
                  aria-label={SUBJECT_TINT_LABELS[tint]}
                  style={
                    seeThrough
                      ? { backgroundImage: `linear-gradient(${value},${value}), ${CHECKER}` }
                      : { background: value }
                  }
                  onClick={() => onApply({ kind: "subject", tint }, scope)}
                />
              );
            })}
          </div>

          <div className={styles.lbl}>Color</div>
          <div className={styles.swatches}>
            {(["surface", "ink", "honey", "brand"] as const).map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={styles.swatch}
                title={swatch}
                aria-label={swatch}
                style={backgroundStyle({ kind: "color", swatch })}
                onClick={() => onApply({ kind: "color", swatch }, scope)}
              />
            ))}
          </div>

          <div className={styles.lbl}>Translucent — pick a shade and how strong</div>
          <div className={styles.swatches}>
            {SHADES.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.swatch} ${shade === s ? styles.swatchOn : ""}`}
                title={SHADE_LABELS[s]}
                aria-label={SHADE_LABELS[s]}
                aria-pressed={shade === s}
                style={{ background: translucentValue(s, 100) }}
                onClick={() => setShade(s)}
              />
            ))}
          </div>
          <div className={styles.opRow}>
            <input
              type="range"
              className={styles.range}
              min={OPACITY_MIN}
              max={OPACITY_MAX}
              value={opacity}
              aria-label="Background strength"
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <span
              className={styles.preview}
              aria-hidden="true"
              style={{ backgroundImage: `linear-gradient(${preview},${preview}), ${CHECKER}` }}
            />
            <span className={styles.opVal}>{opacity}%</span>
          </div>
          <button
            type="button"
            className={styles.apply}
            onClick={() => onApply({ kind: "translucent", shade, opacity }, scope)}
          >
            Use this translucent
          </button>

          <div className={styles.lbl}>Wash</div>
          <div className={styles.swatches}>
            {WASHES.map((wash) => (
              <button
                key={wash}
                type="button"
                className={styles.swatch}
                title={WASH_LABELS[wash]}
                aria-label={WASH_LABELS[wash]}
                style={backgroundStyle({ kind: "wash", wash })}
                onClick={() => onApply({ kind: "wash", wash }, scope)}
              />
            ))}
          </div>

          <div className={styles.lbl}>Photo</div>
          <div className={styles.swatches}>
            {PHOTO_PRESETS.map((src) => (
              <button
                key={src}
                type="button"
                className={styles.swatch}
                title="Photo background"
                aria-label="Photo background"
                style={backgroundStyle({ kind: "photo", src })}
                onClick={() => onApply({ kind: "photo", src }, scope)}
              />
            ))}
          </div>
          {/* No custom-photo UPLOAD: a picked file's blob: URL is dead on the
              next reload (the object URL dies with its document) and, at subject
              scope, would leak onto every wall sharing the subject. Wall-scoped
              asset upload needs its own persistent store (a later slice); until
              then the bundled presets are the photo options. */}
        </div>
      )}
    </span>
  );
}
