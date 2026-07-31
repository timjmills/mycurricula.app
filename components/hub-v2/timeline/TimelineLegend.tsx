// TimelineLegend.tsx — names the timeline's dot encoding.
//
// The handoff's legend is five 9px swatches differing ONLY in `background`
// (`ph-units.css:14-15`) — colour-alone encoding, and it under-describes its
// own dots, which additionally carry filled-vs-hollow and a dashed border
// (`:60-61`). This version shows the real mark for each state, so the shape
// channels are discoverable, and every entry is a text label rather than a
// swatch with a caption.
//
// "Target" is absent on purpose: it needs `units.target_slot`, a column
// adjudicated out of migration 20260728120000 (`:333-335`). A legend key for a
// mark that can never render would be a promise the data cannot keep.

import type { ReactNode } from "react";
import { DOT_STATE_LABEL } from "@/lib/plan-timeline";
import type { DotState } from "@/lib/plan-timeline";
import styles from "./timeline.module.css";

const ORDER: readonly DotState[] = ["taught", "planned", "needs_work", "missed"];

export function TimelineLegend(): ReactNode {
  return (
    <ul className={styles.legend}>
      {ORDER.map((state) => (
        <li key={state} className={styles.legendItem}>
          <span
            className={`${styles.dot} ${styles.legendDot}`}
            data-state={state}
            aria-hidden="true"
          />
          {DOT_STATE_LABEL[state]}
        </li>
      ))}
      <li className={styles.legendItem}>
        <span
          className={`${styles.dot} ${styles.legendDot}`}
          data-state="planned"
          data-fork="modified"
          aria-hidden="true"
        />
        Your copy
      </li>
    </ul>
  );
}
