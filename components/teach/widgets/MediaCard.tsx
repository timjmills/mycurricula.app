// MediaCard — the shared display-only frame for media-style widgets (Slides,
// YouTube, Embed), restyled into the 5.31 system. v1 is intentionally NOT a live
// iframe: live resource embedding is the board's center canvas / resource embed.
// Renders a soft framed placeholder (icon + label) or a supplied thumbnail.
// Behaviour + props unchanged.

/* eslint-disable @next/next/no-img-element -- a teacher-supplied thumbnail, not
   a Next-optimizable asset; rendered raw inside the board widget. */
import type { ReactNode } from "react";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./MediaCard.module.css";
import kit from "./widgets530.module.css";

export interface MediaCardProps {
  /** A KitIcon glyph name for the placeholder frame. */
  icon: KitIconName;
  label: string;
  /** The header label for the widget (e.g. "Slides"). */
  heading: string;
  url?: string;
  thumbnailUrl?: string;
  alt: string;
}

export function MediaCard({
  icon,
  label,
  heading,
  url,
  thumbnailUrl,
  alt,
}: MediaCardProps): ReactNode {
  return (
    <div className={kit.body}>
      <WHead label={heading} />
      {thumbnailUrl ? (
        <img className={styles.thumb} src={thumbnailUrl} alt={alt} />
      ) : (
        <div className={styles.frame}>
          <span className={styles.icon}>
            <KitIcon name={icon} size={1.8} />
          </span>
          <span className={styles.label}>{label}</span>
          {url ? <span className={styles.meta}>{url}</span> : null}
        </div>
      )}
    </div>
  );
}
