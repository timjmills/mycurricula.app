"use client";

// TodayJumpButton.tsx — the Daily view's persistent "Today" jump (UX
// roadmap item 03). Mirrors the affordance the WeekNavigator gives Weekly
// (jump to current week) and the YearView header gives Year (jump to the
// current month): one click returns the teacher to today after they have
// navigated away.
//
// "Today" = the current week (CURRENT_WEEK — the same current-week
// source WeeklyShell/WeekNavigator use) + the column of now's weekday in
// the CONFIGURED school week (lib/now-anchor's todayColumnIndex — correct
// for Sun–Thu, Mon–Fri, and custom weeks; CLAUDE.md §1). On a non-school
// day (e.g. Saturday) the jump still returns to the current week and
// leaves the selected day alone — there is no "today" column to land on.
//
// State-only navigation: writes useAppState week/selectedDay, exactly what
// the WeekStrip pills and WeekNavigator do — no scrollIntoView, no router
// push, so nothing outside the Daily pane moves.
//
// SSR-safety (review finding M4): the clock is never read during the
// initial render — a UTC server and a UTC+3 school browser could disagree
// about the disabled state and trip a React 19 hydration error. Instead
// the button renders disabled-neutral on the server AND the first client
// paint, and the real today resolution lands in a post-mount effect (the
// WeeklyGrid useTodayColumnIndex house pattern). A 60s re-check keeps the
// disabled state honest across midnight in a long-running tab.

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { useAppState } from "@/lib/app-state";
import { CURRENT_WEEK } from "@/lib/mock";
import { useSchoolWeek } from "@/lib/use-school-week";
import { todayColumnIndex } from "@/lib/now-anchor";

export interface TodayJumpButtonProps {
  /** Optional class hook so the host header can place/space the button. */
  className?: string;
}

export function TodayJumpButton({
  className,
}: TodayJumpButtonProps): ReactNode {
  const { week, selectedDay, setWeek, setSelectedDay } = useAppState();
  const { days: schoolWeekDays } = useSchoolWeek();

  // ── Today resolution — SSR-safe house pattern (finding M4) ──────────────
  // `mounted` distinguishes "clock not read yet" (render disabled-neutral)
  // from "mounted on a non-school day" (todayIdx null but the jump-to-week
  // affordance still applies). Day-level resolution only; the 60s re-check
  // exists solely so the state migrates at midnight.
  const [mounted, setMounted] = useState(false);
  const [todayIdx, setTodayIdx] = useState<number | null>(null);
  useEffect(() => {
    const sync = (): void => {
      setTodayIdx(todayColumnIndex(new Date(), schoolWeekDays));
    };
    setMounted(true);
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, [schoolWeekDays]);

  // Already there → disabled (persistent affordance, quiet when inert).
  // On a non-school day "there" means the current week, whatever day pane
  // the teacher is parked on. Pre-mount the button is also disabled — the
  // server HTML and first client paint match, and the real state arrives
  // one effect later.
  const atToday =
    week === CURRENT_WEEK && (todayIdx === null || selectedDay === todayIdx);

  function handleJump(): void {
    setWeek(CURRENT_WEEK);
    if (todayIdx !== null) setSelectedDay(todayIdx);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={handleJump}
      disabled={!mounted || atToday}
      tooltip="Jump the day pane back to today"
    >
      Today
    </Button>
  );
}
