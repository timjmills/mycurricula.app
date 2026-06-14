"use client";

// Quiet Dawn hero montage — a slow crossfade of candid teaching moments,
// desaturated + feathered + held at low opacity so the themed wash bleeds its
// hue through them: light-filled memories behind the greeting, not a literal
// photo wall. Pure-CSS crossfade (no JS timer); a single still under reduced
// motion. Decorative only (aria-hidden), and gated by the hero's "Soft
// background photo" toggle. Planning-at-desk shots are reserved for /welcome;
// these are the warm connection moments.

import styles from "./hero-photos.module.css";

const SHOTS = [
  "/classroom/c00.webp", // teacher + small group, manipulatives
  "/classroom/c01.webp", // 1:1 math, morning light
  "/classroom/c06.webp", // teacher smiling with a young reader
  "/classroom/c09.webp", // teacher in discussion with two students
];

export function HeroPhotos() {
  return (
    <div className={styles.photos} aria-hidden="true">
      {SHOTS.map((src) => (
        <div
          key={src}
          className={styles.shot}
          style={{ backgroundImage: `url("${src}")` }}
        />
      ))}
      <div className={styles.scrim} />
    </div>
  );
}
