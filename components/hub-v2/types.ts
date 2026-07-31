// hub-v2/types.ts — the shared, framework-free contract between the hub shell
// (Builder A: PlannerHub + bars + doc host) and the four browse pickers
// (Builder B: components/hub-v2/browse/**).
//
// Types only — no "use client", no runtime. Safe for either side to import
// without pulling the other's component tree, and Fast-Refresh neutral.

/** A document the hub can host in a tab. */
export type HubDocKind = "lesson" | "unit";

/**
 * The payload a browse picker (or a search result) hands the shell to open a
 * document. The shell turns this into a tab + a recents entry.
 *   • `id`    — the lesson id, or the unit slug as it sits on `Lesson.unit`.
 *   • `title` — the tab label + recents headline.
 *   • `sid`   — the owning SubjectId (a string here so browse code needn't
 *               import the SubjectId union). Drives the tab's subject rail.
 */
export interface HubOpenDoc {
  kind: HubDocKind;
  id: string;
  title: string;
  sid: string;
}

/**
 * The single prop contract every browse picker implements. The shell renders
 * the active picker in the centered `.ph-page` and passes:
 *   • `query`     — the live global-search string (may be ""). The picker
 *                   filters its own list against it.
 *   • `onOpenDoc` — call to open a lesson/unit. The shell owns the tab +
 *                   recents side effects; the picker just reports the intent.
 */
export interface HubBrowseProps {
  query: string;
  onOpenDoc: (doc: HubOpenDoc) => void;
}

/** An open document in the hub's tab list — a `HubOpenDoc` plus its stable
 *  tab key (`${kind}:${id}`). The shell dedupes/activates by `key`. */
export interface HubDoc extends HubOpenDoc {
  key: string;
}

/** Which surface shows when no document is active (the "Home" surface).
 *
 *  `"timeline"` is the LANDING — the 7.21 handoff's Plan landing is
 *  `PHUnits.Timeline` (`ph-app.jsx:315`). The other four are the browse
 *  pickers that shipped as the landing by mistake (the retired `hub.jsx`
 *  surface; docs/audits/2026-07-31-plan-tab.md §0). They are KEPT and reachable
 *  because their Lesson / Unit / Resource / Catch-up data is exactly what the
 *  handoff's Unit Library and Lesson Library drawer needs (audit §E.8,
 *  "Harvest, don't delete") — the drawer is a later wave, and until it lands
 *  these tabs are how a teacher reaches that data. */
export type HubArea =
  | "timeline"
  | "lessons"
  | "units"
  | "resources"
  | "catchup";
