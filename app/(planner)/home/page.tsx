"use client";

// Teacher home — "Quiet Dawn" (plan: .claude/plans/delightful-soaring-riddle.md).
// The serene hero (theme-wash + greeting + rolling attributed insight) is the
// minimalist "Calm" mode; understated day-rows reveal below the fold in Full /
// Custom. The page owns the single useHomeLayout() instance and passes it down
// so the hero, rows, and Customize popover share one source of truth.

import { useHomeLayout, HOME_ROW_IDS } from "@/lib/home/use-home-layout";
import { HomeHero, CustomizeHome, HOME_ROWS } from "@/components/home";
import home from "@/components/home/home.module.css";
import rowStyles from "@/components/home/rows.module.css";

export default function HomePage() {
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
