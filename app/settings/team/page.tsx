// app/settings/team/page.tsx — moved: Team now lives at /settings/workspace
// (Workspace & Team). The sibling actions.ts stays here as the server seam —
// the workspace page imports the data flow from "../team/actions".

import { redirect } from "next/navigation";

export default function TeamSettingsPage(): never {
  redirect("/settings/workspace");
}
