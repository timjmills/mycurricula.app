"use client";

// SectionBlock.tsx — one W3.8 lesson-editor section: the washed banner
// (drag handle · ⋯ menu · inline-renameable label · ColorDot), the
// chromeless rich-text body field, the structured resource chips, and the
// focus-revealed footer ("+ Add standard" / "+ Add resource ▾").
//
// Visual recipe is the bundle's .pb-sec / .pb-sechead / .pb-field, driven
// by `--rc` — resolved here from the section's stored ramp TOKEN (D2;
// resolveSectionWash allowlists it, so an unexpected stored value can never
// reach the inline style) — never a hex.
//
// Drag-reorder is BY THE BANNER through dnd-kit (the host's DndContext +
// SortableContext + the lib/collapse-on-drag pattern), not the mock's raw
// pointer code. While a drag is active the host adds `.reordering` to the
// editor root, which hides this block's field/chips/footer (collapse to
// banners) via the module CSS.

import type { CSSProperties, ReactNode } from "react";
import { memo, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  LessonSectionContent,
  SectionTintScope,
} from "@/lib/lesson-flow";
import { DEFAULT_TINT_SCOPE, resolveSectionWash } from "@/lib/lesson-flow";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { stripHtml } from "@/lib/html-text";
import { RichTextEditor } from "@/components/rich-text";
import { Tooltip } from "@/components/ui";
import { SectionMenu, ColorDot } from "./SectionMenu";
import { AddResourceMenu, type AddResourceRequest } from "./AddResourceMenu";
import { AddStandardFooter } from "./AddStandardFooter";
import styles from "./lesson-editor.module.css";

// The bundle's body placeholder — VERBATIM, including the two spaces after
// the ellipsis.
const BODY_PLACEHOLDER =
  "Type here…  (select text for the formatting toolbar)";

/** Label predicates (mock rules, case-insensitive on the plain text). */
export function isResourcesLabel(heading: string): boolean {
  return stripHtml(heading).trim().toLowerCase().includes("resource");
}
export function isStandardsLabel(heading: string): boolean {
  return stripHtml(heading).trim().toLowerCase() === "standards";
}

export interface SectionBlockProps {
  section: LessonSectionContent;
  index: number;
  readOnly: boolean;
  /** This section's field is focused (or within the ~160ms blur grace) —
   *  reveals the per-section footer. */
  isActive: boolean;
  /** Post-drop settle animation target. */
  settling: boolean;
  /** The "+ Add resource ▾" menu open state is HOST-owned so the
   *  FloatingBar's resource button can open it for a section too. */
  resourceMenuOpen: boolean;
  onToggleResourceMenu: (sectionId: string) => void;
  onCloseResourceMenu: () => void;
  onOpenComposer: (request: AddResourceRequest) => void;
  onOpenStandards: (sectionId: string) => void;
  onFieldFocus: (sectionId: string) => void;
  onFieldBlur: (sectionId: string) => void;
  onBodyChange: (sectionId: string, html: string) => void;
  onRenameCommit: (sectionId: string, text: string) => void;
  onPatchAppearance: (
    sectionId: string,
    patch: { color?: string; tintScope?: SectionTintScope },
  ) => void;
  onDuplicate: (sectionId: string) => void;
  /** Absent → Delete hidden (resources permanence D7 / last section). */
  onDelete?: (sectionId: string) => void;
  onRemoveResource: (sectionId: string, resourceId: string) => void;
}

export const SectionBlock = memo(function SectionBlock({
  section,
  index,
  readOnly,
  isActive,
  settling,
  resourceMenuOpen,
  onToggleResourceMenu,
  onCloseResourceMenu,
  onOpenComposer,
  onOpenStandards,
  onFieldFocus,
  onFieldBlur,
  onBodyChange,
  onRenameCommit,
  onPatchAppearance,
  onDuplicate,
  onDelete,
  onRemoveResource,
}: SectionBlockProps): ReactNode {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const menuWrapRef = useRef<HTMLSpanElement>(null);
  const dotWrapRef = useRef<HTMLSpanElement>(null);
  // W3.8 gate fix (rename-Esc gap): set when Escape cancels a rename so the
  // blur that follows the programmatic blur() must NOT commit the canceled
  // draft. A ref (not state) because that blur can fire while the event
  // handler closures still see the pre-update `renaming === true`.
  const renameCancelRef = useRef(false);

  const labelText = stripHtml(section.heading).trim() || "Section";
  const resourcesSection = isResourcesLabel(section.heading);
  const standardsSection = isStandardsLabel(section.heading);
  const tintScope = section.tintScope ?? DEFAULT_TINT_SCOPE;
  const washToken = resolveSectionWash(section.color, index);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: readOnly });

  // Read-only bodies render static sanitized HTML (the RichTextEditor has
  // no read-only mode; under the forking model a body may be another
  // teacher's content, so it is untrusted at this sink).
  const safeBody = useMemo(
    () => (readOnly ? sanitizeHtml(section.body ?? "") : ""),
    [readOnly, section.body],
  );

  const style: CSSProperties = {
    // D2 — the wash resolves as a token reference, themes re-tint it.
    ["--rc" as string]: `var(${washToken})`,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const commitRename = (el: HTMLElement): void => {
    const next = (el.textContent ?? "").trim() || "Section";
    setRenaming(false);
    onRenameCommit(section.id, next);
  };

  const classes = [
    styles.sec,
    tintScope === "field" ? styles.tinted : "",
    isDragging ? styles.dragging : "",
    settling ? styles.settling : "",
    readOnly ? styles.readOnly : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={classes}
      style={style}
      // Builder B's FloatingBar resolves the focused section for its
      // resource button via closest('[data-section-id]').
      data-section-id={section.id}
    >
      {/* ── Banner — the drag handle ─────────────────────────────────── */}
      <div
        ref={setActivatorNodeRef}
        className={styles.secHead}
        title={readOnly ? undefined : "Hold to drag · double-click to rename"}
        onDoubleClick={() => {
          if (!readOnly) setRenaming(true);
        }}
        {...(readOnly ? {} : attributes)}
        {...(readOnly ? {} : listeners)}
      >
        {!readOnly && (
          <span
            ref={menuWrapRef}
            style={{ position: "relative", display: "inline-flex" }}
          >
            <SectionMenu
              open={menuOpen}
              onToggle={() => setMenuOpen((o) => !o)}
              onClose={() => setMenuOpen(false)}
              wrapRef={menuWrapRef}
              sectionLabel={labelText}
              onRename={() => setRenaming(true)}
              onDuplicate={() => onDuplicate(section.id)}
              // D7 — Delete is HIDDEN for resources-labeled sections (the
              // permanent Lesson Resources guard); the host also withholds
              // it for the last remaining section.
              onDelete={
                resourcesSection || !onDelete
                  ? undefined
                  : () => onDelete(section.id)
              }
            />
          </span>
        )}
        <span
          className={styles.secLabel}
          contentEditable={!readOnly && renaming}
          suppressContentEditableWarning
          role={renaming ? "textbox" : undefined}
          aria-label={renaming ? "Section name" : undefined}
          ref={(el) => {
            // Entering rename: focus + select-all so typing replaces (mock).
            if (el && renaming && document.activeElement !== el) {
              el.focus();
              const range = document.createRange();
              range.selectNodeContents(el);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }}
          onPointerDown={(e) => {
            if (renaming) e.stopPropagation();
          }}
          onBlur={(e) => {
            if (!renaming) return;
            if (renameCancelRef.current) {
              // Escape canceled this rename — restore the original label
              // and never commit the draft.
              renameCancelRef.current = false;
              e.currentTarget.textContent = labelText;
              setRenaming(false);
              return;
            }
            commitRename(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (!renaming) return;
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              // W3.8 gate fix: cancel the rename and CONSUME the key —
              // preventDefault + stopPropagation per the modal's contract,
              // so Esc mid-rename can never bubble up and close the
              // hosting LessonModal (nor commit the draft via the blur —
              // the ref guards that path).
              e.preventDefault();
              e.stopPropagation();
              renameCancelRef.current = true;
              e.currentTarget.textContent = labelText;
              e.currentTarget.blur();
            }
          }}
        >
          {labelText}
        </span>
        {!readOnly && (
          <span ref={dotWrapRef} className={styles.dotWrap}>
            <ColorDot
              open={colorOpen}
              onToggle={() => setColorOpen((o) => !o)}
              onClose={() => setColorOpen(false)}
              wrapRef={dotWrapRef}
              activeToken={washToken}
              onPick={(token) => onPatchAppearance(section.id, { color: token })}
              tintScope={tintScope}
              onTintScope={(scope) =>
                onPatchAppearance(section.id, { tintScope: scope })
              }
            />
          </span>
        )}
      </div>

      {/* ── Body field ───────────────────────────────────────────────── */}
      {readOnly ? (
        <div
          className={styles.fieldStatic}
          // Sanitized above — defence at the dangerouslySetInnerHTML sink.
          dangerouslySetInnerHTML={{ __html: safeBody }}
        />
      ) : (
        <div
          className={styles.fieldWrap}
          onFocus={() => onFieldFocus(section.id)}
          onBlur={() => onFieldBlur(section.id)}
        >
          <RichTextEditor
            chromeless
            value={section.body}
            onChange={(html) => onBodyChange(section.id, html)}
            placeholder={section.prompt || BODY_PLACEHOLDER}
            ariaLabel={`${labelText} section`}
          />
        </div>
      )}

      {/* ── Structured resource chips (never inline HTML — D1) ──────── */}
      {section.resources.length > 0 && (
        <div className={styles.chips}>
          {section.resources.map((r) => (
            <span key={r.id} className={styles.chip} title={r.url ?? r.label}>
              <span className={styles.chipLabel}>{r.label}</span>
              {!readOnly && (
                <Tooltip content="Remove this resource from the section" required>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Remove resource ${r.label}`}
                    onClick={() => onRemoveResource(section.id, r.id)}
                  >
                    ✕
                  </button>
                </Tooltip>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ── Focus footer — mock parity: mousedown must not blur the field
             (preventDefault), so pressing the button keeps the grace alive.
             onFocus/onBlur (React = bubbling focusin/focusout) keep the
             active-section tracker armed while KEYBOARD focus is on the
             footer buttons — without them, Tab from the field into the
             footer let the 160ms grace unmount the footer beneath the
             user's focus (audit re-pass). */}
      {!readOnly && standardsSection && isActive && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          onFocus={() => onFieldFocus(section.id)}
          onBlur={() => onFieldBlur(section.id)}
        >
          <AddStandardFooter onOpenPicker={() => onOpenStandards(section.id)} />
        </div>
      )}
      {/* The menu renders whenever EXPLICITLY opened — the floating bar's 📎
          targets ANY section (resources are per-section structured data) —
          and additionally auto-appears on focus for resources sections
          (audit re-pass: the paperclip was a dead click elsewhere). */}
      {!readOnly && (resourceMenuOpen || (resourcesSection && isActive)) && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          onFocus={() => onFieldFocus(section.id)}
          onBlur={() => onFieldBlur(section.id)}
        >
          <AddResourceMenu
            sectionId={section.id}
            open={resourceMenuOpen}
            onToggle={() => onToggleResourceMenu(section.id)}
            onClose={onCloseResourceMenu}
            onOpenComposer={onOpenComposer}
          />
        </div>
      )}
    </div>
  );
});
