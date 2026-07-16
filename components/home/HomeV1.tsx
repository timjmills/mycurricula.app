"use client";

// HomeV1 — the pre-v2 "Quiet Dawn" teacher home, resurrected as the flag-OFF
// fallback for the /home route (NEXT_PUBLIC_V2 rollback half). This is a
// verbatim copy of master's `app/(planner)/home/page.tsx` body — the home that
// is live on prod today — extracted into a component so the route page can gate
// `V2 ? <HomeConsole/> : <HomeV1/>`. Imports use relative sibling paths (not the
// `@/components/home` barrel) because this file now lives INSIDE that barrel and
// the barrel re-exports it — a barrel import here would be circular.
//
// The serene hero (theme-wash + greeting + rolling attributed insight) is the
// minimalist "Calm" mode; understated day-rows reveal below the fold in Full /
// Custom. The component owns the single useHomeLayout() instance and passes it
// down so the hero, rows, and Customize popover share one source of truth.

import { useHomeLayout, HOME_ROW_IDS } from "@/lib/home/use-home-layout";
import { HomeHero } from "./HomeHero";
import { CustomizeHome } from "./CustomizeHome";
import { HOME_ROWS } from "./rows";
import home from "./home.module.css";
import rowStyles from "./rows.module.css";

export function HomeV1() {
  const layout = useHomeLayout();
  const { mode, rows, showPhoto, hydrated } = layout;

  const showRows = hydrated && mode !== "calm";
  const visibleRows = HOME_ROW_IDS.filter((id) => mode === "full" || rows[id]);

  return (
    <main className={home.home}>
      <CustomizeHome layout={layout} />
      <HomeHero
        showPhoto={showPhoto}
        showScrollCue={showRows}
        quoteSeconds={layout.quoteSeconds}
        quoteTopic={layout.quoteTopic}
      />
      {showRows && (
        <div className={rowStyles.rowsWrap}>
          {visibleRows.map((id) => {
            const RowComp = HOME_ROWS[id];
            return <RowComp key={id} />;
          })}
        </div>
      )}
    </main>
  );
}
