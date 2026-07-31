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
import {
  sectionTagLessons,
  type WallItem,
  type WallSection,
  type WallView,
} from "@/lib/wall-scope";
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
const IconLink = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

// ── Section lesson tags ──────────────────────────────────────────────────────
// The derivation itself lives in lib/wall-scope (`sectionTagLessons`), beside
// the `WallItem.lessons` contract it reads and where a node test can reach it.

/** How many chips render inline before the rest fold into the "+N" popover.
 *  The handoff's number (resource-wall.jsx:222) — and the header is a single
 *  nowrap row sharing space with the title, meta, count and action strip. */
const INLINE_TAGS = 3;

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
  /** Fork the wall if it is still a shared preset, and return the wall key this
   *  edit's wall-scoped storage belongs under — which is NOT the `wallKey` prop
   *  when the call itself forks. */
  onEdit: () => string;
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
          // WRITE UNDER THE POST-FORK KEY, never the `wallKey` prop. Pinning a
          // background on a shared preset IS an edit, so onEdit() auto-forks the
          // wall (CLAUDE.md §2) and the wall's identity changes in this very
          // action — while `wallKey` still holds the pre-fork value for the rest
          // of this render. Writing under it put the record on the wall the
          // teacher had just left: the section's load effect re-read under the
          // NEW key, found nothing, and reset the background to null. The first
          // pin on any preset wall therefore did nothing visible (every later
          // one worked, because by then the fork had happened), and left an
          // orphan record behind. onEdit() is a no-op on an already-custom wall,
          // where it just hands back the same key.
          const key = onEdit();
          setBg(next);
          saveSectionBackground(key, section.id, section.subjectId, next, scope);
          // Storage is written; tell the wall so EVERY mounted section re-reads
          // (a "Whole subject" apply must reach its siblings, not just this one).
          onBgChange();
          setBgOpen(false);
        }}
        onResetBg={(scope) => {
          // Same post-fork key as the apply above: a reset on a preset forks
          // too, and clearing the OLD wall's records would leave the new wall's
          // untouched — "Follow page style" that changes nothing.
          const key = onEdit();
          setBg(null);
          if (scope === "subject") {
            resetSubjectBackground(key, section.subjectId);
          } else {
            resetSectionBackground(key, section.id, section.subjectId);
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
            // COPY, corrected (B4.6): this button only ever made a note, but it
            // promised "a resource or a note". Resources are not authored here
            // BY DESIGN — the wall is a COLLECTION surface. The 7.21 handoff
            // states the direction twice (ph-more.jsx:136 "Collected
            // automatically from every {lesson} … attach more from any
            // {lesson}'s editor", and :169 "attach resources from any
            // {lesson}'s editor and they collect on this wall"). Authoring
            // flows lesson → wall, never wall → lesson, and the handoff lists
            // no composer callsite on this surface. So the honest fix is the
            // label, not a new capability.
            // The visibility half is QUALIFIED on purpose (§4a): "they collect
            // onto this wall automatically" would be false twice over — a saved
            // wall renders its own frozen `override` layout and never picks up
            // later lesson edits, and even a live preset only shows lessons
            // inside its own scope. Copy that sends a teacher looking for a card
            // that cannot appear is the same class of lie as the promise this
            // change is fixing.
            // THE SECOND SENTENCE EXISTS BECAUSE THE BUTTON CONTRADICTS THE
            // FIRST. `onAddCard` → `withFork` → `ensurePersonal()`: on a preset,
            // pressing this FORKS the wall into "My …" and sets `override` — the
            // frozen layout that never picks up later lesson edits. So a teacher
            // could read "they appear on the preset walls", add a note, attach a
            // resource in the lesson editor, and never see it on the wall in
            // front of them. The "Copied to My Walls" toast is the only signal
            // and doesn't connect the two. Saying so here is the whole point of
            // this change — the last clause that wasn't honest yet.
            <Tooltip
              content="Write a note on this wall. Resources aren't added here — attach them in a lesson's editor and they appear on the preset walls covering that lesson. Adding a note also saves this wall to My Walls, and a saved wall stops picking up later lesson changes."
              tooltipId="rw-add-card"
              side="top"
            >
              <button
                type="button"
                className={styles.addCard}
                onClick={() => onAddCard(section.id)}
              >
                <IconPlus />
                <span>Add note</span>
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
        // The lesson-tag strip needs its own exemption: its chips and its
        // popover rows are SPANS, so `fromInteractive` does not see them, and a
        // drag begun while reading the tag list would move the section. The
        // handoff exempts the same region (resource-wall.jsx:213).
        if (
          fromInteractive(e) ||
          (e.target as HTMLElement | null)?.closest?.("[data-sectags]")
        ) {
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
      <SectionTags items={section.items} />
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

// ── Section lesson-tag chips ─────────────────────────────────────────────────

/**
 * "Tagged to <lesson>" chips in the section header, plus a "+N" popover holding
 * the rest (handoff: 7.21 source-home/resource-wall.jsx:221-227).
 *
 * The chips are LABELS, not links — matching the handoff, whose `.rw-sectag` is
 * a span carrying a link GLYPH, not an anchor. A wall section can gather content
 * from several lessons at once, so there is no single destination to navigate
 * to; the chips answer "whose material is this", and the card itself already
 * owns the per-resource open action.
 *
 * Returns null below one tag, so a wall-local custom section — every card
 * authored straight onto the wall, `lessons: []` — gains no empty affordance.
 */
function SectionTags({ items }: { items: readonly WallItem[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tags = useMemo(() => sectionTagLessons(items), [items]);

  // Click-out + Escape close — the same contract BackgroundPopover states: a
  // popover with no way back except re-clicking the button it now covers is a
  // modal wearing a popover's clothes.
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
  }, [open]);

  // A section whose cards carry no lesson refs shows nothing at all.
  if (tags.length === 0) return null;

  const inline = tags.slice(0, INLINE_TAGS);
  const overflow = tags.length - inline.length;

  return (
    // `data-sectags` is read by the header's drag guard: `fromInteractive`
    // catches the "+N" <button> but NOT the chip spans or the popover's rows,
    // and a drag begun on either would tear the whole section out from under
    // the teacher. The handoff teaches its drag + collapse handlers the same
    // exemption (resource-wall.jsx:213, :215).
    <span
      className={styles.tags}
      data-sectags=""
      ref={wrapRef}
      // The strip names each lesson once; the group carries the relationship so
      // a screen reader hears it once rather than three times.
      role="list"
      aria-label="Lessons tagged to this section"
    >
      {inline.map((tag) => (
        <span
          key={tag.id}
          role="listitem"
          className={styles.tag}
          title={`Tagged to ${tag.title}`}
        >
          <IconLink />
          <span className={styles.tagLabel}>{tag.title}</span>
        </span>
      ))}
      {overflow > 0 && (
        <Tooltip
          content="See every lesson whose resources are collected in this section"
          tooltipId="rw-sec-tags"
          side="top"
        >
          <button
            type="button"
            className={styles.tagMore}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`Show all ${tags.length} tagged lessons`}
          >
            +{overflow}
          </button>
        </Tooltip>
      )}
      {open && (
        // Absolute, like the sibling BackgroundPopover (`.pop`) — same surface,
        // same vocabulary. `.hasBg` puts `overflow: hidden` on `.sec`, which
        // would clip a downward popover on a short section; the strip is hidden
        // outright at `data-size="min"` (see the CSS), so the only section this
        // opens over is a full-height one whose cards give it room.
        <div className={styles.tagPop} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.tagPopHead}>Tagged lessons</div>
          {tags.map((tag) => (
            <span key={tag.id} className={styles.tagRow}>
              <IconLink />
              {tag.title}
            </span>
          ))}
        </div>
      )}
    </span>
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
