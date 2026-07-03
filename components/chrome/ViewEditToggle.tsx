"use client";

// ViewEditToggle.tsx — the View ↔ Edit icon toggle mount point (W3.6).
//
// The Day/Week-only right-cluster toggle from the 7.2.26 bundled mockup
// (mockup/New v2 Site Design.bundled.html — the handoff's look/behavior
// authority). It renders as the FIRST child of the top bar's `.tools`
// cluster, ahead of the Personal/Team ModeSwitch (bundle `.tools` order:
// [View/Edit] → [Personal/Team] → [ToolsBar] → [NotifBell]). Composed into
// `.tools` by ChromeShell's non-immersive branch on /daily + /weekly only —
// the immersive bar (Plan/Post/Teach) never hosts it (bundle-verified).
//
// State: a per-view UI edit-mode map persisted to the localStorage key
// `cc_editmode` — `Record<string, boolean>` keyed by view name (e.g.
// `{ Week: true }`), mirroring the bundle's `ljson('cc_editmode',{})` /
// `sjson`. `isEdit = !!map[view]`.
//
// ⚠ NAME COLLISION — this is NOT `useAppState().editMode`. That value is the
// forking `personal | master` axis (CLAUDE.md §2: the Personal/Team toggle).
// This is a completely separate, standalone local map: which *rendering* of a
// view (polished read vs. planning/edit) the teacher last chose. It never
// touches app-state's editMode; the two only share an unfortunate name.
//
// INERT this wave (plan C5 / WAVE-3-PLAN.md:152 — "Mode defaults to View until
// W3.8c"): clicking persists the local map, but has NO downstream effect in
// W3.6. This file IS the mount point; the actual View/Edit rendering split is
// wired in W3.8b/W3.8c. The persisted flag is written now so that wiring reads
// a live value the day it lands.
//
// Styling: reuses the EXISTING `.modesw modesw-icon glass` + `.modesw-ib`
// recipe (chrome.css) verbatim — this file writes NO styles and hard-codes NO
// colors. The buttons are bare <button>s, NOT the ui Button primitive, for the
// same reason ModeSwitch documents: `.modesw-ib` (border:0, background:none,
// grid-centered 42×34 segment) IS the complete recipe, and the primitive's
// `.btn` base fills/padding would fight it.
//
// Tooltips: dismissible (`tooltipId`, NOT `required`) — the View/Edit toggle is
// ordinary learn-once chrome, unlike the high-consequence Personal/Team toggle.
// Copy is the bundle's title text, verbatim.
//
// SSR safety: the initial render assumes View (map read happens post-mount in
// an effect, so the server HTML matches the first client paint), mirroring the
// tooltip-dismissal + ModeSwitch pattern. The persisted value applies only
// after hydration.
//
// Accessibility: each segment carries aria-label + aria-pressed (a two-button
// pressed pair); the pill is a labelled group. Icons are aria-hidden — the
// labels carry the names.

import { useEffect, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";

// ── Persisted per-view edit-mode map (bundle `cc_editmode`) ───────────────

const STORAGE_KEY = "cc_editmode";

type EditModeMap = Record<string, boolean>;

function readEditModeMap(): EditModeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as EditModeMap;
    }
  } catch {
    // Malformed JSON or storage unavailable — resting default is View.
  }
  return {};
}

function writeEditMode(view: string, on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const map = readEditModeMap();
    map[view] = on;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private-mode failure — in-memory state still reflects the flip.
  }
}

// ── Tooltip copy (bundle title text, verbatim) ────────────────────────────

const VIEW_TIP = "View — the polished read view";
const EDIT_TIP = "Edit — plan, rearrange, and write lessons";

// ── Icons — exact inline-SVG ports from the bundled mockup ────────────────
// Eye (View) and pencil (Edit), 24×24 coordinate space; chrome.css's
// `.modesw-ib svg` sizes them to 22.5px.

function EyeIcon(): ReactNode {
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export interface ViewEditToggleProps {
  /**
   * The host view name — the key into the `cc_editmode` map (e.g. "Day" |
   * "Week"). Supplied by ChromeShell from the active route.
   */
  view: string;
}

export function ViewEditToggle({ view }: ViewEditToggleProps): ReactNode {
  // SSR-safe: initial render assumes View (false). The persisted per-view
  // value hydrates in the post-mount effect below so the server HTML matches
  // the first client paint.
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    const map = readEditModeMap();
    setIsEdit(!!map[view]);
  }, [view]);

  // INERT (W3.6): persist the local flag; no downstream effect until W3.8c.
  const setEdit = (on: boolean): void => {
    setIsEdit(on);
    writeEditMode(view, on);
  };

  // Per-view tooltip ids so a teacher's "Turn off these tips" choice is scoped
  // to the surface they dismissed it on (e.g. "week-view-mode-view").
  const viewKey = view.toLowerCase();

  return (
    <div
      className="modesw modesw-icon glass"
      role="group"
      aria-label="View or edit this plan"
    >
      {/* Tooltips open downward: the pill sits at the very top of the
          viewport, so "top" would auto-flip anyway. */}
      <Tooltip
        content={VIEW_TIP}
        side="bottom"
        tooltipId={`${viewKey}-view-mode-view`}
      >
        <button
          type="button"
          className={"modesw-ib" + (!isEdit ? " active" : "")}
          aria-label="View"
          aria-pressed={!isEdit}
          onClick={() => setEdit(false)}
        >
          <EyeIcon />
        </button>
      </Tooltip>
      <Tooltip
        content={EDIT_TIP}
        side="bottom"
        tooltipId={`${viewKey}-view-mode-edit`}
      >
        <button
          type="button"
          className={"modesw-ib" + (isEdit ? " active" : "")}
          aria-label="Edit"
          aria-pressed={isEdit}
          onClick={() => setEdit(true)}
        >
          <PencilIcon />
        </button>
      </Tooltip>
    </div>
  );
}
