// The Teach view — the live, in-class delivery workspace
// (docs/teach-view-plan.md §1, §2.2). Thin server component: it awaits the
// `searchParams`, resolves the deep-link seeds, and renders the client
// <TeachWorkspace>. Mirrors the daily/page.tsx pattern.
//
// Deep links:
//   ?lesson=<id>     — open Teach on a specific lesson (from Weekly/Daily).
//   ?board=<id>      — pre-select a board within that lesson.
//   ?resource=<id>   — open straight into the full-bleed resource canvas.
//   ?sandbox=1       — enter lesson-less sandbox mode (plan §4a).
import { TeachWorkspace } from "@/components/teach";

export default async function TeachPage({
  searchParams,
}: {
  searchParams: Promise<{
    lesson?: string | string[];
    board?: string | string[];
    resource?: string | string[];
    sandbox?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined =>
    typeof v === "string" ? v : undefined;
  const sandboxRaw = one(params.sandbox);
  return (
    <TeachWorkspace
      initialLessonId={one(params.lesson)}
      initialBoardId={one(params.board)}
      initialResourceId={one(params.resource)}
      initialSandbox={sandboxRaw === "1" || sandboxRaw === "true"}
    />
  );
}
