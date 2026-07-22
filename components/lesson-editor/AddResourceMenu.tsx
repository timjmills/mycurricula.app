"use client";

// AddResourceMenu.tsx — the W3.8 section footer's "+ Add resource ▾" menu
// (visible on sections whose label includes "resource" while that section's
// field is focused).
//
// The menu mirrors the bundle's source vocabulary — From computer / Image /
// Link / Note / Google Drive / Resource library — but every item routes into
// the app's EXISTING ResourceComposer (components/daily/ResourceComposer),
// pre-scoped to the launching section, instead of the mock's prompt()-based
// flows. The composer commits STRUCTURED SectionResource[] through the
// planner store (addSectionResource under the hood) — resources are NEVER
// inlined into the body HTML as chips (D1: sanitizeHtml strips class
// attributes, so an HTML chip would unstyle on round-trip; the structured
// model is the store-level truth and SectionBlock renders the chips).
//
// "From computer" / "Image" open a real file picker here and hand the picked
// files to the composer as pre-captured items (its exported
// fileToCapturedItem helper — the same mapping its own pickers use). The
// composer VALIDATES seeded initialItems against its mime/size/count caps
// in its open effect (shared validateCapturedItems — W3.8 gate fix; the
// browser accept= below is advisory UX only, never the gate), and
// out-of-spec picks surface as its inline rejection message. The other
// sources open the composer on its capture step, where the link row /
// Drive tile / library live. "Note" opens the composer's notecard mode.
//
// Closes on outside click AND Escape (mock defect #8 — mouseLeave-only is
// forbidden) via the shared useDismissableMenu hook.

import type { ReactNode } from "react";
import { useRef } from "react";
import type {
  CapturedItem,
  ResourceComposerMode,
} from "@/components/daily/ResourceComposer";
import { fileToCapturedItem } from "@/components/daily/ResourceComposer";
import { Button, Tooltip } from "@/components/ui";
import { useDismissableMenu } from "./SectionMenu";
import styles from "./lesson-editor.module.css";

/** What the menu asks the host to open the ResourceComposer with. */
export interface AddResourceRequest {
  sectionId: string;
  mode: ResourceComposerMode;
  initialItems?: CapturedItem[];
}

export interface AddResourceMenuProps {
  sectionId: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Open the shared ResourceComposer, routed to this section. */
  onOpenComposer: (request: AddResourceRequest) => void;
}

export function AddResourceMenu({
  sectionId,
  open,
  onToggle,
  onClose,
  onOpenComposer,
}: AddResourceMenuProps): ReactNode {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  useDismissableMenu(open, onClose, wrapRef);

  const openWith = (
    mode: ResourceComposerMode,
    initialItems?: CapturedItem[],
  ): void => {
    onClose();
    onOpenComposer({ sectionId, mode, initialItems });
  };

  const onFilesPicked = (files: FileList | null): void => {
    const items = Array.from(files ?? []).map(fileToCapturedItem);
    if (items.length > 0) openWith("resource", items);
  };

  return (
    <div ref={wrapRef} className={styles.secFoot}>
      <Tooltip
        content="Attach materials to this section — files, images, links, notes, Drive items, or something from your resource library"
        tooltipId="lesson-editor-add-resource"
      >
        <Button
          variant="secondary"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        >
          + Add resource ▾
        </Button>
      </Tooltip>
      {open && (
        <div className={`${styles.menuPop} ${styles.menuInline}`} role="menu">
          <div className={styles.menuHd}>Add from</div>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => fileRef.current?.click()}
          >
            From computer
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => imageRef.current?.click()}
          >
            Image
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => openWith("resource")}
          >
            Link
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => openWith("notecard")}
          >
            Note
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => openWith("resource")}
          >
            Google Drive
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => openWith("resource")}
          >
            Resource library
          </button>
        </div>
      )}
      {/* Hidden pickers — mirror the composer's own accept lists. */}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.doc,.docx,.rtf,image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          onFilesPicked(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={imageRef}
        type="file"
        multiple
        hidden
        accept="image/*"
        onChange={(e) => {
          onFilesPicked(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
