"use client";

// InstanceRename.tsx — the inline "rename this specific thing" affordance.
//
// Renders an entity's resolved name (personal → team → default, via
// lib/instance-labels.tsx) followed by a subtle pencil button. Clicking the
// pencil opens a small popover where a teacher types a new name and chooses
// the scope of the change:
//   • Just me    — only this teacher sees the new name (personal override).
//   • Whole team — every teacher on the team sees it (high-consequence).
//
// Used everywhere an instance name appears (Subject / Unit / Week / Lesson)
// so renaming is available "inline everywhere" per the product decision. The
// resolved name inherits the surrounding type via `font: inherit` so dropping
// this into a heading, a card title, or a list row looks native.
//
// Positioning: the popover is rendered in a portal and fixed-positioned from
// the trigger's bounding box, so it survives the horizontal/vertical scroll
// containers these labels live inside (the Subject workspace, week strips,
// etc.) without being clipped. It repositions on scroll/resize and dismisses
// on outside-click or Escape — the same idiom as the top-bar More menu.
//
// Accessibility: the pencil has an aria-label naming what it renames; the
// popover is a labelled dialog with a focus-trapped input; Escape restores
// focus to the pencil. Reduced-motion suppresses the open fade (module CSS).

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  useInstanceLabels,
  type InstanceLevel,
  type LabelScope,
} from "@/lib/instance-labels";
import styles from "./InstanceRename.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface InstanceRenameLabelProps {
  /** Which hierarchy level this instance belongs to. */
  level: InstanceLevel;
  /** The resolution key — entity id, or weekKey(unitId, week) for weeks. */
  entityKey: string;
  /** The entity's own default name (the fallback when no override exists). */
  defaultName: string;
  /**
   * The level's caption (e.g. labels.unit → "Unit" / "Module"), used in the
   * popover copy ("Rename Unit"). Defaults to a humanized level name.
   */
  term?: string;
  /** Extra className applied to the resolved-name text span. */
  className?: string;
  /**
   * Hide the pencil — render only the resolved name. For places that show the
   * name but shouldn't offer renaming (dense print views, etc.).
   */
  readOnly?: boolean;
}

const LEVEL_TERM: Record<InstanceLevel, string> = {
  subject: "Subject",
  unit: "Unit",
  week: "Week",
  lesson: "Lesson",
};

// ── Component ────────────────────────────────────────────────────────────────

export function InstanceRenameLabel({
  level,
  entityKey,
  defaultName,
  term,
  className,
  readOnly = false,
}: InstanceRenameLabelProps): ReactNode {
  const { resolve, hasOverride, overrideFor, rename, reset } =
    useInstanceLabels();

  const name = resolve(level, entityKey, defaultName);
  const overridden = hasOverride(level, entityKey);
  const caption = term ?? LEVEL_TERM[level];

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (readOnly) {
    return <span className={className}>{name}</span>;
  }

  return (
    <span className={`${styles.wrap} ${className ?? ""}`}>
      <span className={styles.name}>{name}</span>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.pencil} ${overridden ? styles.pencilOn : ""}`}
        aria-label={`Rename this ${caption.toLowerCase()} (currently "${name}")`}
        title={`Rename this ${caption.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          // Stop the click from selecting the card/row the label sits inside.
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <PencilIcon />
      </button>

      {open && (
        <RenamePopover
          anchorRef={triggerRef}
          caption={caption}
          defaultName={defaultName}
          currentName={name}
          hasOverride={overridden}
          initialScope={
            overrideFor(level, entityKey, "team") !== undefined
              ? "team"
              : "personal"
          }
          initialValue={
            overrideFor(level, entityKey, "personal") ??
            overrideFor(level, entityKey, "team") ??
            ""
          }
          onCancel={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          onReset={() => {
            reset(level, entityKey);
            setOpen(false);
            triggerRef.current?.focus();
          }}
          onSave={(value, scope) => {
            rename(level, entityKey, value, scope);
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </span>
  );
}

// ── Popover ──────────────────────────────────────────────────────────────────

interface RenamePopoverProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  caption: string;
  defaultName: string;
  currentName: string;
  hasOverride: boolean;
  initialScope: LabelScope;
  initialValue: string;
  onCancel: () => void;
  onReset: () => void;
  onSave: (value: string, scope: LabelScope) => void;
}

function RenamePopover({
  anchorRef,
  caption,
  defaultName,
  currentName,
  hasOverride,
  initialScope,
  initialValue,
  onCancel,
  onReset,
  onSave,
}: RenamePopoverProps): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const [value, setValue] = useState(initialValue);
  const [scope, setScope] = useState<LabelScope>(initialScope);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the panel from the anchor's box. useLayoutEffect so the first
  // paint is already in place (no flash at 0,0). A small viewport clamp keeps
  // it on-screen near the right/bottom edges.
  const reposition = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    if (!a) return;
    const PANEL_W = 280;
    const margin = 8;
    let left = a.left;
    if (left + PANEL_W > window.innerWidth - margin) {
      left = window.innerWidth - PANEL_W - margin;
    }
    if (left < margin) left = margin;
    const top = a.bottom + 6;
    setPos({ top, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  // Focus the input once mounted; select the text so retyping is quick.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reposition on scroll (capture catches nested scroll containers) + resize.
  useEffect(() => {
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [reposition]);

  // Outside-click + Escape dismissal. Pointerdown capture so a click anywhere
  // outside the panel (and outside the anchor) closes it; the anchor's own
  // toggle handler is suppressed because it stops propagation.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onCancel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchorRef, onCancel]);

  // SSR / pre-mount guard — portals need document.body.
  if (typeof document === "undefined") return null;

  const trimmed = value.trim();
  const isChanged = trimmed !== initialValue.trim();

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={styles.panel}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div id={titleId} className={styles.ptitle}>
        Rename {caption.toLowerCase()}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(trimmed, scope);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={value}
          placeholder={defaultName}
          aria-label={`New name for this ${caption.toLowerCase()}`}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className={styles.hint}>
          Default: <span className={styles.hintName}>{defaultName}</span>
        </div>

        {/* Scope picker — who the rename applies to. */}
        <div
          className={styles.scope}
          role="radiogroup"
          aria-label="Who sees this name"
        >
          <button
            type="button"
            role="radio"
            aria-checked={scope === "personal"}
            className={`${styles.scopeBtn} ${scope === "personal" ? styles.scopeOn : ""}`}
            onClick={() => setScope("personal")}
          >
            Just me
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === "team"}
            className={`${styles.scopeBtn} ${scope === "team" ? styles.scopeOn : ""}`}
            onClick={() => setScope("team")}
          >
            Whole team
          </button>
        </div>
        {scope === "team" ? (
          <p className={`${styles.note} ${styles.noteWarn}`}>
            Everyone on your team will see this name.
          </p>
        ) : (
          <p className={styles.note}>Only you will see this name.</p>
        )}

        <div className={styles.actions}>
          {hasOverride && (
            <button
              type="button"
              className={styles.reset}
              onClick={onReset}
              title={`Restore the default name "${defaultName}"`}
            >
              Reset to default
            </button>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.save}
            disabled={!isChanged && currentName === defaultName}
          >
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// ── Icon ─────────────────────────────────────────────────────────────────────

function PencilIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-4 1 1-4z" />
    </svg>
  );
}
