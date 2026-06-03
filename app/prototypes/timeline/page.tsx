// /prototypes/timeline — Year Overview "Timeline (Curriculy)" design direction.
//
// TEMPORARY preview route surfaced from the top-bar "Proto · Timeline" button
// so the team can compare the two Year Overview directions in-app. Not wired
// into primary navigation; remove app/prototypes/* once a direction is chosen.
//
// Renders full-bleed (its own sidebar + top bar) inside the root layout's
// ThemeProvider, so it inherits the v1.3 fonts, tokens, and warm canvas.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TimelineProto } from "./TimelineProto";

export const metadata: Metadata = {
  title: "Year overview · Timeline (prototype) — mycurricula.app",
};

export default function TimelinePrototypePage(): ReactNode {
  return <TimelineProto />;
}
