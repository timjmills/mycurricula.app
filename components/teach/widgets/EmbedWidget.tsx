// EmbedWidget — a generic embedded-resource placeholder card, restyled into the
// 5.31 system. Display-only: renders a framed placeholder; the live embed is the
// board's center canvas. Reads `config.thumbnailUrl` / `config.url`. Behaviour +
// export unchanged.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { MediaCard } from "./MediaCard";

export function EmbedWidget({ widget }: WidgetBodyProps): ReactNode {
  return (
    <MediaCard
      icon="puzzle"
      heading="Embed"
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
