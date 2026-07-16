"use client";

// AddStandardFooter.tsx — the W3.8 "+ Add standard" footer, shown under the
// section whose label is exactly "standards" (mock rule:
// label.trim().toLowerCase() === 'standards') while that section's field is
// focused. Pressing it opens the app's real StandardsTaggingPicker (the
// host LessonEditor owns the picker + the D5 dual-write on apply) — never
// the mock's 8-row SAMPLE_STD list.

import type { ReactNode } from "react";
import { Button, Tooltip } from "@/components/ui";
import styles from "./lesson-editor.module.css";

export interface AddStandardFooterProps {
  onOpenPicker: () => void;
}

export function AddStandardFooter({
  onOpenPicker,
}: AddStandardFooterProps): ReactNode {
  return (
    <div className={styles.secFoot}>
      <Tooltip
        content="Tag the standards this lesson covers — search your frameworks and each pick is added to this section and to the lesson's standards list"
        tooltipId="lesson-editor-add-standard"
      >
        <Button variant="secondary" size="sm" onClick={onOpenPicker}>
          + Add standard
        </Button>
      </Tooltip>
    </div>
  );
}
