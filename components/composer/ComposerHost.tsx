"use client";

// ComposerHost — the Shared Composer's singleton render surface (B4.0).
//
// Mounted exactly once by ComposerProvider (after `children`). It reads the
// live singleton state and renders:
//   • the EXISTING ResourceComposer (components/daily/ResourceComposer) —
//     unchanged, driven entirely by `composerPropsFrom(composer, close)`.
//   • the shared ResMenu (B4.1) — driven by the resMenu options.
//
// Both are rendered ONLY when their state is non-null, so while the engine is
// dormant this component emits zero DOM and zero visible change. (Precisely:
// the provider/host DOES join the planner layout's client graph — what stays
// OUT of the initial chunk is both heavy surfaces, which load on first open via
// next/dynamic below.)
//
// WHY next/dynamic for ResourceComposer: mounting the host in the planner
// layout would otherwise pull ResourceComposer + its heavy deps (the rich-text
// editor, the PDF-thumbnail renderer, the all-tools capture wall) into EVERY
// planner route's initial bundle — including /year and /weekly, which don't
// load it. Lazy-loading with { ssr: false } keeps the layout graph unchanged
// until a composer is first opened, while still rendering the component
// VERBATIM (same component, same props) once it is. The dialog is client-only,
// so ssr:false costs nothing (it never rendered on the server anyway).
//
// ── A next/dynamic call does NOT, on its own, keep a module out of the bundle.
//
// It only defers the module reached through THIS import. If ANY other module in
// the route's graph value-imports the same file, the module is statically
// reachable and ships eagerly anyway — the dynamic() call then buys nothing but
// a false sense of discipline. Both boundaries below were defeated exactly that
// way, and the comment that used to sit here asserted the opposite:
//   • ResourceComposer — three callsites value-imported `fileToCapturedItem`
//     from it (ResourcesPanel, the lesson editor's AddResourceMenu, and
//     AllToolsMenu). Fixed by moving the helper to components/daily/
//     captured-item.ts, a pure leaf with no React/CSS.
//   • ResMenu — this barrel (components/composer/index.ts) re-exported the
//     component itself, AND ResMenuTrigger value-imported `hasResMenuActions`
//     from it. Fixed by dropping the value re-export and moving the predicate
//     to ./composer-state.
//
// BEFORE ADDING A next/dynamic HERE OR ANYWHERE: grep for every other import of
// the target module and confirm none of them is a value import from something
// the route can reach. Neither module below re-exports its own helpers, so a
// regression now fails to COMPILE rather than silently doubling the bundle.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useComposer, useComposerState } from "./ComposerProvider";
import { composerPropsFrom } from "./composer-state";

const ResourceComposer = dynamic(
  () =>
    import("@/components/daily/ResourceComposer").then(
      (m) => m.ResourceComposer,
    ),
  { ssr: false },
);

// ResMenu is lazy for the same reason: while dormant, the menu machinery
// (portal, Tooltip, icons) must not ride the planner layout chunk. A context
// menu has no meaningful SSR and its open is user-gesture-driven, so the
// one-time chunk fetch on first open is imperceptible.
const ResMenu = dynamic(() => import("./ResMenu").then((m) => m.ResMenu), {
  ssr: false,
});

export function ComposerHost(): ReactNode {
  const { closeComposer, closeResMenu } = useComposer();
  const { composer, resMenu } = useComposerState();

  return (
    <>
      {composer && (
        <ResourceComposer {...composerPropsFrom(composer, closeComposer)} />
      )}
      {resMenu && <ResMenu {...resMenu} onClose={closeResMenu} />}
    </>
  );
}
