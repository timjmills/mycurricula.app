"use client";

// Quiet Dawn hero: a living theme-wash field, a quiet time-of-day greeting, and
// the rolling attributed insight. This hero alone IS the "Calm" minimal mode.

import { useAppState } from "@/lib/app-state";
import { heroInsights } from "@/lib/home/insights";
import { greetingWord, todayDate } from "@/lib/home/today";
import { ThemeWash } from "@/components/ui";
import type { QuoteTopic } from "@/lib/home/use-home-layout";
import { HeroPhotos } from "./HeroPhotos";
import { RollingInsight } from "./RollingInsight";
import styles from "./home.module.css";

// Balanced, display-friendly rotation pool — computed once.
const HERO_POOL = heroInsights();

function firstName(name?: string): string {
  if (!name) return "there";
  return name.trim().split(/\s+/)[0] || "there";
}

export function HomeHero({
  showPhoto = false,
  showScrollCue = false,
  quoteSeconds = 12,
  quoteTopic = "all",
}: {
  showPhoto?: boolean;
  showScrollCue?: boolean;
  quoteSeconds?: number;
  quoteTopic?: QuoteTopic;
}) {
  const { currentUser } = useAppState();
  const dateLabel = todayDate().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Filter the rotation pool to the chosen topic (or keep all four, mixed).
  const pool =
    quoteTopic === "all"
      ? HERO_POOL
      : HERO_POOL.filter((i) => i.category === quoteTopic);

  return (
    <section className={styles.hero}>
      <ThemeWash />
      {showPhoto && <HeroPhotos />}
      <div className={styles.heroInner}>
        <p className={styles.greetingDate}>{dateLabel}</p>
        <h1 className={styles.greeting}>
          {greetingWord()}, {firstName(currentUser?.name)}
        </h1>
        <RollingInsight insights={pool} intervalMs={quoteSeconds * 1000} />
      </div>
      {showScrollCue && (
        <div className={styles.scrollCue} aria-hidden>
          {"⌄"}
        </div>
      )}
    </section>
  );
}
