// YouTubeWidget — a video placeholder card, display-only
// (docs/teach-view-plan.md §4.5). v1 renders a static frame (or a configured
// thumbnail), NOT a live embed — the live player is Agent D's center canvas.
// Reads `config.thumbnailUrl` / `config.url`.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { MediaCard } from "./MediaCard";

export function YouTubeWidget({ widget }: WidgetBodyProps): ReactNode {
  return (
    <MediaCard
      icon="youtube"
      label="Video clip"
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
