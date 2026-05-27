"use client";

// components/resources/ImageLightbox.tsx — minimal click-to-zoom modal.
//
// Opened from <ResourceEmbed> when an image resource is clicked. Closes
// on Esc, on backdrop click, and restores focus to the trigger on close.

import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";

export interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({
  src,
  alt,
  onClose,
}: ImageLightboxProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [onClose]);

  const swallow = (e: MouseEvent<HTMLImageElement>) => e.stopPropagation();

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.85)",
        cursor: "zoom-out",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={swallow}
        style={{
          maxWidth: "92vw",
          maxHeight: "92vh",
          objectFit: "contain",
          cursor: "default",
        }}
      />
    </div>
  );
}
