// Settings → Lesson templates — thin route wrapper.
//
// The settings layout (app/settings/layout.tsx) provides the scrolling
// neutral surface. This page just mounts CustomTemplatesProvider so all
// descendants can read and write the teacher's custom lesson-flow templates,
// then renders the interactive manager component.

import type { ReactNode } from "react";
import { CustomTemplatesProvider } from "@/lib/custom-templates";
import { LessonTemplatesManager } from "@/components/lesson-templates";

export default function LessonTemplatesPage(): ReactNode {
  return (
    <CustomTemplatesProvider>
      <LessonTemplatesManager />
    </CustomTemplatesProvider>
  );
}
