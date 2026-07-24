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
// dormant (B4.0: nothing opens either) this component emits zero DOM and zero
// visible change. (Precisely: the provider/host DOES join the planner layout's
// client graph — what stays OUT of the initial chunk is both heavy surfaces,
// which load on first open via next/dynamic below. §4a round-1 made this claim
// honest.)
//
// WHY next/dynamic for ResourceComposer: mounting the host in the planner
// layout would otherwise pull ResourceComposer + its heavy deps (the rich-text
// editor, the PDF-thumbnail renderer, the all-tools capture wall) into EVERY
// planner route's initial bundle — including /year and /weekly, which don't
// load it today. Lazy-loading with { ssr: false } keeps the layout graph
// unchanged until a composer is first opened (B4.3+), honoring the repo's
// bundle discipline while still rendering the component VERBATIM (same
// component, same props) once it is. The dialog is client-only, so ssr:false
// costs nothing (it never rendered on the server anyway). Flip to a static
// import if a future pass wants it eagerly warmed.

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
