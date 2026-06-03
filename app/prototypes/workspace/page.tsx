// /prototypes/workspace — Year Overview "Workspace (EduPlan)" design direction.
//
// TEMPORARY preview route surfaced from the top-bar "Proto · Workspace" button
// so the team can compare the two Year Overview directions in-app. Not wired
// into primary navigation; remove app/prototypes/* once a direction is chosen.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkspaceProto } from "./WorkspaceProto";

export const metadata: Metadata = {
  title: "Year overview · Workspace (prototype) — mycurricula.app",
};

export default function WorkspacePrototypePage(): ReactNode {
  return <WorkspaceProto />;
}
