"use client";

// AllToolsMenu.tsx — the "All tools" expanded grid that ResourceComposer
// opens when the teacher hits the "All tools" button in its main view.
//
// Visual: a 3-column scrollable grid of soft pastel tool tiles, grouped
// into four named sections — mirrors Padlet's "All Tools" panel (Image
// 15 in the owner's reference) but stripped of the AI surfaces, which
// are out of phase per CLAUDE.md §6.
//
// ── How it composes with ResourceComposer ────────────────────────────
// The menu does NOT model its own modal. ResourceComposer hosts it
// INLINE as a "second step": when `open` is true the composer renders
// AllToolsMenu instead of its standard body. The menu's `onBack` callback
// returns the composer to its normal four-tile view. Working tiles call
// the composer's existing capture helpers via the props below, so the
// committed batch flows through the same Add → planner-store path that
// the standard tools use. There is no separate scrim or dialog frame.
//
// ── Tile categories ──────────────────────────────────────────────────
// Web & Files:    Lesson Padlet · Upload · Link · Web search (stub)
// Camera & Media: Camera · Photo album · Image search (stub) · GIF (stub)
// Recordings:     Video · Audio · Screen · Draw  (all stubs — Phase 1B+)
// Embeds & Lists: YouTube · Spotify (stub) · Location (stub) · Poll (stub)
//
// AI tiles are deliberately omitted. CLAUDE.md §6 marks AI features as
// Phase 3+. Google Drive / OneDrive tiles are also omitted — both require
// OAuth wiring that isn't in scope for the Phase-1A prototype.
//
// ── (works) vs (stub) tiles ──────────────────────────────────────────
// "Works" tiles produce a synthetic resource through the composer's
// existing capture flow:
//   • Lesson Padlet → addLink("New Lesson board") — uses our own brand
//     wording ("Lesson" instead of "Padlet") per the owner's note.
//   • Upload        → triggers the composer's file picker.
//   • Link          → opens the composer's inline URL row.
//   • Camera        → uses an inline <input capture="environment">; on
//                     desktop browsers without a camera this naturally
//                     degrades to the standard image picker.
//   • Photo album   → multi-select image picker.
//   • YouTube       → inline URL row in-place; appends a `youtube`-typed
//                     captured item.
//
// "Stub" tiles render a brief inline "Coming soon" line and do not
// produce a resource. They keep their pastel tint and a small "Soon"
// badge so the teacher can see they're recognised features.
//
// ── Accessibility ────────────────────────────────────────────────────
//   • The menu is rendered INSIDE the composer's existing role="dialog"
//     panel, so the dialog semantics already apply.
//   • The back button is the first focusable element when the menu
//     mounts.
//   • Each tile is a real <button> with a descriptive aria-label so
//     screen readers announce the action AND its (stub) state where
//     applicable.
//   • All tiles meet the ≥44px touch target rule (min-height: 84px on
//     the tile, with a hit-padded back button).
//
// All color / type / spacing is via var(--token). No hex, no px font
// sizes. prefers-reduced-motion drops all transitions.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { CapturedItem } from "./ResourceComposer";
import { fileToCapturedItem } from "./ResourceComposer";
import { Button } from "@/components/ui";
import styles from "./AllToolsMenu.module.css";

// ── Props ────────────────────────────────────────────────────────────────

export interface AllToolsMenuProps {
  /** Returns to the composer's normal four-tile body. */
  onBack: () => void;
  /** Append one captured item (single Lesson-Padlet / single YouTube). */
  onAddItem: (item: Omit<CapturedItem, "id">) => void;
  /** Append many captured items (Upload / Photo / Camera). */
  onAddItems: (items: CapturedItem[]) => void;
  /** Hop back to the composer's main view AND open its inline URL row.
   *  The Link tile in this menu defers to the composer's existing row
   *  rather than reimplementing it (the URL field, paste handling, and
   *  Add-link button all already live there). */
  onRequestLinkRow: () => void;
}

// A URL is "a string starting with http:// or https:// with no whitespace".
// Same rule the composer uses for paste-recognition.
const URL_REGEX = /^https?:\/\/\S+$/;

// A YouTube URL — covers youtu.be short links and the standard
// youtube.com/watch?v=… / /shorts/ / /embed/ forms. We only use this to
// decide whether the inline YouTube field has a "looks like YouTube" hint;
// the captured-item's actual `type` is set to "youtube" regardless once
// the teacher confirms.
const YT_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i;

// ── Tile descriptor ──────────────────────────────────────────────────────
// Each tile carries the pastel hue token names. The actual color comes
// from --hl-* (the highlighter "pen" color) for the icon pill and --hlp-*
// (the matching pastel tint) for the tile body. The mapping below keeps
// the four sections visually distinct without inventing new palette
// values — every color is already a token in tokens.css.

interface TileDescriptor {
  id: string;
  label: string;
  /** True when the tile is functional. False = "Coming soon" stub. */
  works: boolean;
  /** Surfaces a small "NEW" badge top-right (only on `works: true`). */
  isNew?: boolean;
  /** Pastel body color token (e.g. "--hlp-mint"). */
  bgVar: string;
  /** Stronger icon pill token (e.g. "--hl-mint"). */
  iconVar: string;
  /** Lucide-ish 22px stroked icon. */
  icon: ReactNode;
  /** What clicking does. For stubs, this is the message shown inline. */
  onClick: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function AllToolsMenu({
  onBack,
  onAddItem,
  onAddItems,
  onRequestLinkRow,
}: AllToolsMenuProps): ReactNode {
  const titleId = useId();
  const backRef = useRef<HTMLButtonElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const ytInputRef = useRef<HTMLInputElement>(null);

  // Which sub-row is currently open (YouTube, etc.). Null = none.
  const [openInline, setOpenInline] = useState<"youtube" | null>(null);
  const [ytValue, setYtValue] = useState<string>("");

  // Brief "Coming soon" line shown when the teacher taps a stub tile.
  // Carries the tile label so the message reads naturally.
  const [stubNotice, setStubNotice] = useState<string | null>(null);

  // ── Focus the back button on mount ───────────────────────────────────
  // The composer's focus trap will then cycle through tiles in DOM order.
  useEffect(() => {
    const frame = requestAnimationFrame(() => backRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  // ── Stub notice auto-clear (~2.4s) ───────────────────────────────────
  useEffect(() => {
    if (!stubNotice) return;
    const t = setTimeout(() => setStubNotice(null), 2400);
    return () => clearTimeout(t);
  }, [stubNotice]);

  // ── Handlers ─────────────────────────────────────────────────────────

  /** Generic "Coming soon" handler. */
  const showStub = useCallback((label: string) => {
    setStubNotice(`${label} — coming soon.`);
  }, []);

  /** Lesson Padlet — adds a single `link`-typed item with our brand
   *  wording. The teacher can rename it via the composer title field
   *  or by adding a per-item note. */
  const onLessonPadlet = useCallback(() => {
    onAddItem({ type: "link", label: "New Lesson board" });
  }, [onAddItem]);

  /** Triggers the hidden multi-file input. */
  const onUploadClick = useCallback(() => uploadRef.current?.click(), []);
  const onPhotoClick = useCallback(() => photoRef.current?.click(), []);
  const onCameraClick = useCallback(() => cameraRef.current?.click(), []);

  const onUploadChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const captured: CapturedItem[] = [];
      for (let i = 0; i < files.length; i += 1) {
        captured.push(fileToCapturedItem(files[i]));
      }
      onAddItems(captured);
      // Reset so picking the same file twice still fires.
      e.target.value = "";
    },
    [onAddItems],
  );

  const onPhotoChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const captured: CapturedItem[] = [];
      for (let i = 0; i < files.length; i += 1) {
        if (!files[i].type.startsWith("image/")) continue;
        captured.push({
          id: `cap-${Date.now().toString(36)}-${i}`,
          type: "image",
          label: files[i].name || "Photo",
        });
      }
      onAddItems(captured);
      e.target.value = "";
    },
    [onAddItems],
  );

  /** Camera: the input has `capture="environment"` so mobile browsers
   *  open the rear camera; desktops fall through to the standard image
   *  picker. Either way the result is a single image item. */
  const onCameraChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const captured: CapturedItem[] = [];
      for (let i = 0; i < files.length; i += 1) {
        if (!files[i].type.startsWith("image/")) continue;
        captured.push({
          id: `cap-${Date.now().toString(36)}-${i}`,
          type: "image",
          label: files[i].name || "Camera photo",
        });
      }
      onAddItems(captured);
      e.target.value = "";
    },
    [onAddItems],
  );

  /** Link tile — hand control back to the composer's standard view AND
   *  ask it to open its inline URL row. We deliberately don't
   *  reimplement the URL input here so paste-handling, validation, and
   *  the "Add link" button stay in one place. */
  const onLinkTile = useCallback(() => {
    onRequestLinkRow();
  }, [onRequestLinkRow]);

  /** YouTube: open the inline URL row INSIDE the menu. Confirming the
   *  field appends a `youtube`-typed captured item. */
  const onYouTubeClick = useCallback(() => {
    setOpenInline((v) => (v === "youtube" ? null : "youtube"));
    requestAnimationFrame(() => ytInputRef.current?.focus());
  }, []);

  const onYouTubeConfirm = useCallback(() => {
    const raw = ytValue.trim();
    if (!raw) return;
    // Defensive: only accept http(s) URLs so we never produce a "youtube"
    // resource pointing at "watch?v=" text alone.
    if (!URL_REGEX.test(raw)) return;
    onAddItem({ type: "youtube", label: raw });
    setYtValue("");
    setOpenInline(null);
  }, [ytValue, onAddItem]);

  const onYouTubeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onYouTubeConfirm();
      }
    },
    [onYouTubeConfirm],
  );

  // ── Tile descriptors ──────────────────────────────────────────────────
  // Grouped by category. The order within each group matches the spec.

  const webFiles: TileDescriptor[] = [
    {
      id: "lesson-padlet",
      label: "Lesson Padlet",
      works: true,
      isNew: true,
      bgVar: "--hlp-aqua",
      iconVar: "--hl-aqua",
      icon: <BoardIcon />,
      onClick: onLessonPadlet,
    },
    {
      id: "upload",
      label: "Upload",
      works: true,
      bgVar: "--hlp-maya",
      iconVar: "--hl-maya",
      icon: <UploadIcon />,
      onClick: onUploadClick,
    },
    {
      id: "link",
      label: "Link",
      works: true,
      bgVar: "--hlp-slate",
      iconVar: "--hl-slate",
      icon: <LinkIcon />,
      onClick: onLinkTile,
    },
    {
      id: "web-search",
      label: "Web search",
      works: false,
      bgVar: "--hlp-lemon",
      iconVar: "--hl-lemon",
      icon: <SearchIcon />,
      onClick: () => showStub("Web search"),
    },
  ];

  const cameraMedia: TileDescriptor[] = [
    {
      id: "camera",
      label: "Camera",
      works: true,
      bgVar: "--hlp-cheese",
      iconVar: "--hl-cheese",
      icon: <CameraIcon />,
      onClick: onCameraClick,
    },
    {
      id: "photo-album",
      label: "Photo album",
      works: true,
      bgVar: "--hlp-violet",
      iconVar: "--hl-violet",
      icon: <PhotoStackIcon />,
      onClick: onPhotoClick,
    },
    {
      id: "image-search",
      label: "Image search",
      works: false,
      bgVar: "--hlp-mint",
      iconVar: "--hl-mint",
      icon: <ImageSearchIcon />,
      onClick: () => showStub("Image search"),
    },
    {
      id: "gif",
      label: "GIF",
      works: false,
      bgVar: "--hlp-heliotrope",
      iconVar: "--hl-heliotrope",
      icon: <GifIcon />,
      onClick: () => showStub("GIF"),
    },
  ];

  const recordings: TileDescriptor[] = [
    {
      id: "video",
      label: "Video recorder",
      works: false,
      bgVar: "--hlp-red",
      iconVar: "--hl-red",
      icon: <VideoIcon />,
      onClick: () => showStub("Video recorder"),
    },
    {
      id: "audio",
      label: "Audio recorder",
      works: false,
      bgVar: "--hlp-lime",
      iconVar: "--hl-lime",
      icon: <MicIcon />,
      onClick: () => showStub("Audio recorder"),
    },
    {
      id: "screen",
      label: "Screen recorder",
      works: false,
      bgVar: "--hlp-aqua",
      iconVar: "--hl-aqua",
      icon: <MonitorIcon />,
      onClick: () => showStub("Screen recorder"),
    },
    {
      id: "draw",
      label: "Draw",
      works: false,
      bgVar: "--hlp-cheese",
      iconVar: "--hl-cheese",
      icon: <DrawIcon />,
      onClick: () => showStub("Draw"),
    },
  ];

  const embedsLists: TileDescriptor[] = [
    {
      id: "youtube",
      label: "YouTube",
      works: true,
      isNew: true,
      bgVar: "--hlp-red",
      iconVar: "--hl-red",
      icon: <PlayIcon />,
      onClick: onYouTubeClick,
    },
    {
      id: "spotify",
      label: "Spotify",
      works: false,
      bgVar: "--hlp-mint",
      iconVar: "--hl-mint",
      icon: <SpotifyIcon />,
      onClick: () => showStub("Spotify"),
    },
    {
      id: "location",
      label: "Location",
      works: false,
      bgVar: "--hlp-maya",
      iconVar: "--hl-maya",
      icon: <PinIcon />,
      onClick: () => showStub("Location"),
    },
    {
      id: "poll",
      label: "Poll",
      works: false,
      bgVar: "--hlp-violet",
      iconVar: "--hl-violet",
      icon: <PollIcon />,
      onClick: () => showStub("Poll"),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div role="region" aria-labelledby={titleId}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className={styles.header}>
        {/* ref held for focus-management on mount — Button doesn't forward
            refs, so this stays as a raw button. All styling via .backBtn. */}
        <button
          ref={backRef}
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Back to add resource"
        >
          <BackIcon />
          <span>Back</span>
        </button>
        <h2 id={titleId} className={styles.title}>
          All tools
        </h2>
      </div>

      {/* Hidden file inputs — triggered by the Upload / Photo / Camera tiles. */}
      <input
        ref={uploadRef}
        type="file"
        multiple
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
        tabIndex={-1}
        onChange={onUploadChange}
      />
      <input
        ref={photoRef}
        type="file"
        multiple
        accept="image/*"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
        tabIndex={-1}
        onChange={onPhotoChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        // capture="environment" tells mobile browsers to open the rear
        // camera. Desktops ignore the attribute and fall back to the file
        // picker, which is the documented behaviour we want.
        capture="environment"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
        tabIndex={-1}
        onChange={onCameraChange}
      />

      {/* ── Scrollable body: four named sections ─────────────────────
          The stagger index runs CUMULATIVELY across the four sections so
          the whole grid cascades in one continuous wave (~16ms per tile)
          rather than four restarting waves. Capped at 16 tiles so a
          future addition still lands inside the entrance window. */}
      <div className={styles.scroll}>
        <ToolSection label="Web & Files" tiles={webFiles} staggerOffset={0} />
        <ToolSection
          label="Camera & Media"
          tiles={cameraMedia}
          staggerOffset={webFiles.length}
        />
        <ToolSection
          label="Recordings"
          tiles={recordings}
          staggerOffset={webFiles.length + cameraMedia.length}
        />
        <ToolSection
          label="Embeds & Lists"
          tiles={embedsLists}
          staggerOffset={
            webFiles.length + cameraMedia.length + recordings.length
          }
        />

        {/* Inline YouTube URL row — rendered below the grid so the
            tile that opened it stays visible. */}
        {openInline === "youtube" && (
          <div
            className={styles.inlineRow}
            role="group"
            aria-label="Add YouTube link"
          >
            <input
              ref={ytInputRef}
              type="url"
              className={styles.urlInput}
              placeholder={
                YT_REGEX.test(ytValue) || ytValue.length === 0
                  ? "https://youtube.com/…"
                  : "https://…"
              }
              value={ytValue}
              onChange={(e) => setYtValue(e.target.value)}
              onKeyDown={onYouTubeKeyDown}
              aria-label="YouTube URL"
            />
            <Button
              variant="secondary"
              size="sm"
              className={styles.inlineAddBtn}
              onClick={onYouTubeConfirm}
              disabled={!ytValue.trim() || !URL_REGEX.test(ytValue.trim())}
            >
              Add video
            </Button>
          </div>
        )}

        {/* Inline "Coming soon" notice shown after a stub-tile tap. */}
        {stubNotice && (
          <p className={styles.stubNotice} role="status" aria-live="polite">
            {stubNotice}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ToolSection ─────────────────────────────────────────────────────────
// A named category — small uppercase label + a 3-column grid of tiles.

function ToolSection({
  label,
  tiles,
  staggerOffset = 0,
}: {
  label: string;
  tiles: TileDescriptor[];
  /** Zero-based cumulative index for the first tile in this section.
   *  Each tile's stagger delay = (staggerOffset + i) × 16ms — keeps the
   *  cascade continuous across section boundaries. */
  staggerOffset?: number;
}): ReactNode {
  return (
    <section className={styles.section} aria-label={label}>
      <h3 className={styles.sectionLabel}>{label}</h3>
      <div className={styles.grid} role="group" aria-label={`${label} tools`}>
        {tiles.map((tile, i) => (
          <Tile key={tile.id} tile={tile} staggerIndex={staggerOffset + i} />
        ))}
      </div>
    </section>
  );
}

// ── Tile ────────────────────────────────────────────────────────────────
// One pastel pill. The hue tokens are wired via inline CSS custom
// properties (--tileBg / --tileIconBg) so the .tile / .tileIcon classes
// pull them at runtime. This avoids generating per-tile classes.

function Tile({
  tile,
  staggerIndex = 0,
}: {
  tile: TileDescriptor;
  staggerIndex?: number;
}): ReactNode {
  const ariaLabel = tile.works
    ? `${tile.label}`
    : `${tile.label} (coming soon)`;
  return (
    <button
      type="button"
      className={`${styles.tile} ${tile.works ? "" : styles.tileStub}`}
      onClick={tile.onClick}
      aria-label={ariaLabel}
      // The three custom props feed --tileBg / --tileIconBg / --stagger in
      // AllToolsMenu.module.css. Color tokens reference --hlp-* / --hl-*
      // from tokens.css so no hex sneaks in via the inline style. The
      // stagger custom property drives the staggered entrance animation
      // delay so the grid cascades in rather than landing as a block.
      style={
        {
          "--tileBg": `var(${tile.bgVar})`,
          "--tileIconBg": `var(${tile.iconVar})`,
          "--stagger": `${staggerIndex * 16}ms`,
        } as React.CSSProperties
      }
    >
      <span className={styles.tileIcon} aria-hidden="true">
        {tile.icon}
      </span>
      <span className={styles.tileLabel}>{tile.label}</span>
      {tile.works && tile.isNew && (
        <span className={styles.badge} aria-hidden="true">
          New
        </span>
      )}
      {!tile.works && (
        <span
          className={`${styles.badge} ${styles.badgeSoon}`}
          aria-hidden="true"
        >
          Soon
        </span>
      )}
    </button>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// Stroked 22px. Same Lucide-style vocabulary as ResourceComposer.

function BackIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function BoardIcon(): ReactNode {
  // A small grid of cards — reads as "board".
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function UploadIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function LinkIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function SearchIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CameraIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function PhotoStackIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="14" height="14" rx="2" />
      <path d="M3 17V5a2 2 0 0 1 2-2h12" />
      <circle cx="12" cy="13" r="1.6" />
      <polyline points="21 17 17 13 9 21" />
    </svg>
  );
}

function ImageSearchIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <circle cx="8" cy="8" r="1.4" />
      <polyline points="17 11 13 7 5 15" />
      <circle cx="17" cy="17" r="4" />
      <line x1="22" y1="22" x2="20" y2="20" />
    </svg>
  );
}

function GifIcon(): ReactNode {
  // Just letters — keeps the icon legible at 20px.
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <text
        x="12"
        y="15"
        fontSize="7"
        fontWeight="700"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
      >
        GIF
      </text>
    </svg>
  );
}

function VideoIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <polygon points="22 8 16 12 22 16 22 8" />
    </svg>
  );
}

function MicIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function MonitorIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DrawIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 21h4l11-11-4-4L3 17z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

function PlayIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <polygon
        points="10 9 16 12 10 15 10 9"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function SpotifyIcon(): ReactNode {
  // Generic "soundwave inside circle" — avoids brand-trademark issues.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M7 10c3-1 7-1 10 1" />
      <path d="M7.5 13c2.5-.8 5.5-.6 8 .7" />
      <path d="M8 16c2-.6 4.5-.4 6.5.6" />
    </svg>
  );
}

function PinIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PollIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="20" x2="6" y2="12" />
      <line x1="12" y1="20" x2="12" y2="6" />
      <line x1="18" y1="20" x2="18" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}
