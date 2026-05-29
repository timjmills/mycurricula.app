// EmbedWidget — a generic embedded-resource placeholder card, display-only
// (docs/teach-view-plan.md §4.5). v1 renders a static frame; the live embed is
// Agent D's center canvas. Reads `config.thumbnailUrl` / `config.url`. (Not in
// the named §4.5 list but is the 12th picker type "Embed"; included so the
// WidgetBody switch has a real body for it rather than the fallback.)

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { MediaCard } from "./MediaCard";

export function EmbedWidget({ widget }: WidgetBodyProps): ReactNode {
  return (
    <MediaCard
      icon="embed"
      label="Embedded resource"
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
