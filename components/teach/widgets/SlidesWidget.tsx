// SlidesWidget — a slides-deck placeholder card, display-only
// (docs/teach-view-plan.md §4.5). v1 renders a static "deck" frame (icon +
// label + optional thumbnail) rather than embedding a live iframe — the live
// resource-in-canvas embedding is Agent D's center surface, not a board widget.
// Reads `config.thumbnailUrl` / `config.url`.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { MediaCard } from "./MediaCard";

export function SlidesWidget({ widget }: WidgetBodyProps): ReactNode {
  return (
    <MediaCard
      icon="slides"
      label="Slides"
      url={
        typeof widget.config.url === "string" ? widget.config.url : undefined
      }
      thumbnailUrl={
        typeof widget.config.thumbnailUrl === "string"
          ? widget.config.thumbnailUrl
          : undefined
      }
      alt={widget.title}
    />
  );
}
