// MediaCard — the shared display-only frame for media-style widgets (Slides,
// YouTube, Embed). v1 is intentionally NOT a live iframe: live resource
// embedding is Agent D's center canvas. This renders a dark "deck/video" frame
// with an icon + label, or a supplied thumbnail image when one is configured.

/* eslint-disable @next/next/no-img-element -- a teacher-supplied thumbnail, not
   a Next-optimizable asset; rendered raw inside the board widget. */
import type { ReactNode } from "react";
import { TeachIcon, type TeachIconName } from "./icons";
import styles from "./widgets.module.css";

export interface MediaCardProps {
  icon: TeachIconName;
  label: string;
  url?: string;
  thumbnailUrl?: string;
  alt: string;
}

export function MediaCard({
  icon,
  label,
  url,
  thumbnailUrl,
  alt,
}: MediaCardProps): ReactNode {
  if (thumbnailUrl) {
    return (
      <div className={styles.body}>
        <img className={styles.mediaThumb} src={thumbnailUrl} alt={alt} />
      </div>
    );
  }
  return (
    <div className={styles.body}>
      <div className={styles.media}>
        <span className={styles.mediaIcon}>
          <TeachIcon name={icon} size={22} />
        </span>
        <span className={styles.mediaLabel}>{label}</span>
        {url ? <span className={styles.mediaMeta}>{url}</span> : null}
      </div>
    </div>
  );
}
