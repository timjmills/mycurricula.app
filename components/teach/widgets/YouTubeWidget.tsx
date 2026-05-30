// YouTubeWidget — a video placeholder card, restyled into the 5.31 system.
// Display-only: renders a framed placeholder (or a configured thumbnail), NOT a
// live player — the live player is the board's center canvas. Reads
// `config.thumbnailUrl` / `config.url`. Behaviour + export unchanged.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { MediaCard } from "./MediaCard";

export function YouTubeWidget({ widget }: WidgetBodyProps): ReactNode {
  return (
    <MediaCard
      icon="laptop"
      heading="Video"
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
