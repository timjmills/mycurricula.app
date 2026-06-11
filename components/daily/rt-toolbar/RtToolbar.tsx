"use client";

// RtToolbar.tsx — the /daily sticky rich-text formatting toolbar.
// 6.11.26 design handoff §6: `.rtToolbar` (CSS ~line 270, markup ~line 1041).
//
// ONE toolbar at the top of the /daily detail scroll body replaces the
// per-editor docked toolbar pattern (decision on record; /daily only — the
// Weekly view keeps the floating per-selection toolbar). The toolbar holds
// no editor state of its own: it drives whichever chromeless RichTextEditor
// currently has focus through the shared RichTextCommandBus
// (components/rich-text/command-bus.ts), and every command executes through
// that editor's own selection-preserving, sanitizing, undo-friendly pipeline.
//
// Selection preservation: mousedown on the toolbar (container AND every
// button) calls preventDefault, so pressing a button never steals focus and
// never collapses the editor's selection — the click handler then dispatches
// the command against the still-focused editor. Keyboard users who Tab onto
// the toolbar are covered separately: the editor's blur handler sees focus
// moving into `data-rich-text-toolbar` and keeps its bus registration alive,
// and the editor restores its last-tracked selection Range when the command
// arrives. When keyboard focus leaves the toolbar for anywhere else, the
// toolbar releases the held target so the buttons disable honestly.
//
// ── Mounting (for the orchestrator — integration happens after this wave) ──
//
//   1. No provider is required. The command bus is a module-level registry
//      shared by import — render <RtToolbar /> anywhere, no wrapping context.
//
//   2. Place it as the FIRST child of the detail pane's SCROLL BODY (the
//      element with overflow-y) so position:sticky pins it to that scroll
//      context's top edge, exactly like the prototype's `.detailBody`:
//
//        <div className={styles.detailBody}>   {/* overflow-y: auto */}
//          <RtToolbar />
//          …lesson title / planning tabs / phases / notes…
//        </div>
//
//   3. Switch every RichTextEditor inside that scroll body to chromeless and
//      REMOVE the dockTarget prop those callsites pass today:
//
//        <RichTextEditor chromeless value={…} onChange={…} />
//
//      `chromeless` suppresses the editor's own toolbar (floating and
//      docked) and registers the editor with the bus while focused. Keep
//      passing `onRequestImageUrl` where it exists — the toolbar's image
//      button routes through it.
//
//   4. Buttons are disabled (with an explanatory native title via the Button
//      primitive's tooltip mirror) until the teacher clicks into one of those
//      editors; the right-side hint doubles as the standing explanation.

import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import {
  RICH_TEXT_TOOLBAR_ATTR,
  useRichTextCommandBus,
} from "@/components/rich-text";
import styles from "./rt-toolbar.module.css";

// ── Icon glyphs (16px, currentColor — traced from the design handoff) ───────

function BulletListIcon(): ReactNode {
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
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NumberedListIcon(): ReactNode {
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
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <path d="M4 4.5h1.2V9M3.6 14h2v1l-2 2.5h2" strokeWidth="1.6" />
    </svg>
  );
}

function OutdentIcon(): ReactNode {
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
      <line x1="21" y1="6" x2="11" y2="6" />
      <line x1="21" y1="12" x2="13" y2="12" />
      <line x1="21" y1="18" x2="11" y2="18" />
      <polyline points="7 8 3 12 7 16" />
    </svg>
  );
}

function IndentIcon(): ReactNode {
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
      <line x1="3" y1="6" x2="13" y2="6" />
      <line x1="11" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="13" y2="18" />
      <polyline points="17 8 21 12 17 16" />
    </svg>
  );
}

function LinkIcon(): ReactNode {
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
      <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" />
    </svg>
  );
}

function ImageIcon(): ReactNode {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function ClearFormatIcon(): ReactNode {
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
      <path d="M7 5h11M11 5l-2.5 11" />
      <line x1="14" y1="15" x2="20" y2="21" />
      <line x1="20" y1="15" x2="14" y2="21" />
    </svg>
  );
}

// ── Toolbar button ───────────────────────────────────────────────────────────

// Tooltip shown on every button while no editor is focused — explains WHY the
// control is disabled (CLAUDE.md §4: disabled controls explain themselves).
// Mirrored to native title= by the Button primitive, so it surfaces on hover,
// keyboard focus, and touch long-press even in the disabled state.
const DISABLED_TOOLTIP =
  "Click into any text in the lesson first — these tools format the text you select there";

interface RtButtonProps {
  /** Accessible name (aria-label) — matches the prototype's title= text. */
  label: string;
  /** Onboarding tooltip in teaching voice (what the control accomplishes). */
  tooltip: string;
  /**
   * Toggle state. Pass a boolean for real toggles (bold, lists…) — renders
   * aria-pressed in BOTH states and lights the button when true. Leave
   * undefined for one-shot actions (link, image, clear) so they never carry
   * a misleading aria-pressed.
   */
  active?: boolean;
  disabled: boolean;
  onActivate: () => void;
  children: ReactNode;
}

function RtButton({
  label,
  tooltip,
  active,
  disabled,
  onActivate,
  children,
}: RtButtonProps): ReactNode {
  return (
    <Button
      variant="icon"
      size="sm"
      className={[styles.rtBtn, active ? styles.rtBtnActive : ""]
        .filter(Boolean)
        .join(" ")}
      iconAriaLabel={label}
      tooltip={disabled ? DISABLED_TOOLTIP : tooltip}
      disabled={disabled}
      aria-pressed={active}
      // Selection preservation: never let a button press move focus out of
      // the editor — the command dispatches on click against the live
      // selection. (The container repeats this for clicks landing on gaps.)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onActivate}
    >
      {children}
    </Button>
  );
}

// ── RtToolbar ────────────────────────────────────────────────────────────────

export interface RtToolbarProps {
  /** Extra class for the sticky bar (layout-only adjustments at the callsite). */
  className?: string;
}

/**
 * The /daily sticky formatting toolbar. Render once at the top of the detail
 * scroll body; it drives whichever chromeless RichTextEditor has focus via
 * the shared command bus. See the file header for mounting instructions.
 */
export function RtToolbar({ className }: RtToolbarProps): ReactNode {
  const bus = useRichTextCommandBus();
  // The bus hook re-renders this component whenever the focused editor or
  // its formatting state changes, so these per-render reads stay fresh.
  const ready = bus.canExecute();
  const disabled = !ready;
  const isOn = (command: string): boolean =>
    ready ? bus.queryState(command) : false;

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      // Marks this element for the editors' blur handlers: focus moving into
      // the toolbar keeps the focused editor registered on the command bus.
      {...{ [RICH_TEXT_TOOLBAR_ATTR]: "" }}
      className={[styles.rtToolbar, className ?? ""].filter(Boolean).join(" ")}
      // Touch users long-press the bar itself for an explanation (CLAUDE.md
      // §4 — named panels carry a title on their root).
      title="Formatting toolbar — click into any lesson text below, select, then format"
      onMouseDown={(e) => {
        // Clicks anywhere on the bar (buttons, separators, gaps) must not
        // steal focus from the editor — see selection-preservation note in
        // the file header.
        e.preventDefault();
      }}
      onBlur={(e) => {
        // Keyboard path: when focus leaves the toolbar for anywhere that is
        // neither the toolbar nor the held editor, release the target so the
        // buttons disable honestly instead of acting on a stale editor.
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        if (next && bus.targetContains(next)) return;
        bus.release();
      }}
    >
      {/* ── Inline formatting ── */}
      <RtButton
        label="Bold"
        tooltip="Make the selected text bold"
        active={isOn("bold")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("bold")}
      >
        <b>B</b>
      </RtButton>
      <RtButton
        label="Italic"
        tooltip="Italicize the selected text"
        active={isOn("italic")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("italic")}
      >
        <i>I</i>
      </RtButton>
      <RtButton
        label="Underline"
        tooltip="Underline the selected text"
        active={isOn("underline")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("underline")}
      >
        <u>U</u>
      </RtButton>
      <RtButton
        label="Strikethrough"
        tooltip="Strike through the selected text"
        active={isOn("strikeThrough")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("strikeThrough")}
      >
        <s>S</s>
      </RtButton>

      <span className={styles.rtSep} aria-hidden />

      {/* ── Block format ── */}
      <RtButton
        label="Heading"
        tooltip="Turn the current line into a section heading"
        disabled={disabled}
        onActivate={() => bus.executeCommand("formatBlock", "h4")}
      >
        H
      </RtButton>
      <RtButton
        label="Body text"
        tooltip="Turn the current line back into regular body text"
        disabled={disabled}
        onActivate={() => bus.executeCommand("formatBlock", "p")}
      >
        ¶
      </RtButton>

      <span className={styles.rtSep} aria-hidden />

      {/* ── Lists & indentation ── */}
      <RtButton
        label="Bulleted list"
        tooltip="Turn the selected lines into a bulleted list"
        active={isOn("insertUnorderedList")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("insertUnorderedList")}
      >
        <BulletListIcon />
      </RtButton>
      <RtButton
        label="Numbered list"
        tooltip="Turn the selected lines into a numbered list"
        active={isOn("insertOrderedList")}
        disabled={disabled}
        onActivate={() => bus.executeCommand("insertOrderedList")}
      >
        <NumberedListIcon />
      </RtButton>
      <RtButton
        label="Decrease indent"
        tooltip="Move the selected lines out one level"
        disabled={disabled}
        onActivate={() => bus.executeCommand("outdent")}
      >
        <OutdentIcon />
      </RtButton>
      <RtButton
        label="Increase indent"
        tooltip="Move the selected lines in one level"
        disabled={disabled}
        onActivate={() => bus.executeCommand("indent")}
      >
        <IndentIcon />
      </RtButton>

      <span className={styles.rtSep} aria-hidden />

      {/* ── Insert ── */}
      <RtButton
        label="Add link"
        tooltip="Link the selected text to a web address"
        disabled={disabled}
        onActivate={() => bus.requestLink()}
      >
        <LinkIcon />
      </RtButton>
      <RtButton
        label="Insert image"
        tooltip="Add a picture inline where your cursor is"
        disabled={disabled}
        onActivate={() => bus.requestImage()}
      >
        <ImageIcon />
      </RtButton>

      <span className={styles.rtSep} aria-hidden />

      {/* ── Clear ── */}
      <RtButton
        label="Clear formatting"
        tooltip="Strip all formatting from the selected text"
        disabled={disabled}
        onActivate={() => bus.executeCommand("removeFormat")}
      >
        <ClearFormatIcon />
      </RtButton>

      {/* Standing helper — doubles as the disabled-state explanation. Hidden
          under ~720px (CSS) where horizontal space goes to the buttons. */}
      <span className={styles.rtHint}>
        Select text, then format · everything here is editable
      </span>
    </div>
  );
}
