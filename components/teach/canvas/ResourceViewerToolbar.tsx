"use client";

// components/teach/canvas/ResourceViewerToolbar.tsx — the T3/T4 chrome bar
// above the full-bleed resource (plan §5.1).
//
// v1 reality: when a resource is a PDF, the BROWSER owns real paging + zoom
// inside the iframe (no pdf.js in v1). So the page `1/1`, zoom `±/100%`, and
// fullscreen controls here are DISPLAY AFFORDANCES — they communicate the
// designed chrome and host the "close resource" action; functional page/zoom
// arrive with pdf.js in Phase 2. They're rendered as disabled FutureControls so
// they never read as broken live buttons.
//
// The only fully-wired action is "close" → dispatch openResource(null), which
// the central reducer flips back to centerMode:"board".

import type { ReactNode } from "react";
import { Button, FutureControl } from "@/components/ui";
import type { TeachWorkspaceAction } from "@/components/teach";
import type { TeachWorkspaceState } from "@/lib/teach/types";
import type { TeachResource } from "@/lib/types";
import styles from "./ResourceViewerToolbar.module.css";

// ── Props ────────────────────────────────────────────────────────────────────

export interface ResourceViewerToolbarProps {
  state: TeachWorkspaceState;
  dispatch: (action: TeachWorkspaceAction) => void;
  resource: TeachResource;
  /** Toggle whole-view fullscreen (wired by Agent A; optional here). */
  onToggleFullscreen?: () => void;
}

export function ResourceViewerToolbar({
  state,
  dispatch,
  resource,
  onToggleFullscreen,
}: ResourceViewerToolbarProps): ReactNode {
  const isPdf =
    resource.kind === "pdf" ||
    resource.provider === "pdf" ||
    resource.mimeType === "application/pdf";

  return (
    <div
      className={styles.bar}
      role="toolbar"
      aria-label="Resource viewer controls"
      title="Controls for the resource shown on the board"
    >
      {/* Filename / title bar */}
      <span className={styles.filename} title={resource.label}>
        {resource.label}
      </span>

      <div className={styles.spacer} />

      {/* PDF page + zoom — display affordances in v1 (browser owns the real
          paging/zoom inside the iframe; pdf.js lands these in Phase 2). */}
      {isPdf ? (
        <div className={styles.group}>
          <span className={styles.pageLabel} aria-hidden="true">
            1&nbsp;/&nbsp;1
          </span>
          <FutureControl
            variant="icon-only"
            leadingIcon={<span aria-hidden="true">−</span>}
            tooltip="Zoom out — page zoom arrives with the in-app PDF viewer (coming after beta). Use the PDF's own controls for now."
          />
          <span className={styles.zoomLabel} aria-hidden="true">
            100%
          </span>
          <FutureControl
            variant="icon-only"
            leadingIcon={<span aria-hidden="true">+</span>}
            tooltip="Zoom in — page zoom arrives with the in-app PDF viewer (coming after beta). Use the PDF's own controls for now."
          />
        </div>
      ) : null}

      {/* Fullscreen — wired only when the parent provides a handler. */}
      {onToggleFullscreen ? (
        <Button
          variant="icon"
          size="sm"
          iconAriaLabel={state.fullscreen ? "Exit full screen" : "Full screen"}
          tooltip={
            state.fullscreen
              ? "Leave full screen and return to the workspace"
              : "Fill the whole screen with the board — great for projecting"
          }
          onClick={onToggleFullscreen}
        >
          <span aria-hidden="true">{state.fullscreen ? "⤡" : "⤢"}</span>
        </Button>
      ) : (
        <FutureControl
          variant="icon-only"
          leadingIcon={<span aria-hidden="true">⤢</span>}
          tooltip="Full screen — projecting the board fills the screen (coming after beta)."
        />
      )}

      {/* Close — the one fully-wired control: returns to the board grid. */}
      <Button
        variant="icon"
        size="sm"
        iconAriaLabel="Close resource"
        tooltip="Close this resource and go back to the board grid"
        onClick={() => dispatch({ type: "openResource", resource: null })}
      >
        <span aria-hidden="true">✕</span>
      </Button>
    </div>
  );
}
