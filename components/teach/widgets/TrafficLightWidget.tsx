// TrafficLightWidget — an INTERACTIVE classroom traffic light (Phase 3 widget
// library). Three stacked round lights (red / amber / green) in a housing;
// tapping a light makes it the single active signal, and tapping the already-
// active light turns every light off. The active colour persists via
// useWidgetState so the signal survives a reload; inactive lights dim to the
// "off" token. Reduced motion drops the active-light glow pulse.

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import styles from "./TrafficLightWidget.module.css";

/** The four signal states — three colours plus "all off". */
type TrafficColour = "red" | "amber" | "green" | "off";

/** Durable slice — the currently-lit colour (or "off"). */
interface TrafficPersisted extends Record<string, unknown> {
  active: TrafficColour;
}

/** The three lights, top-to-bottom, with their token + label. */
const LIGHTS: ReadonlyArray<{
  colour: Exclude<TrafficColour, "off">;
  token: string;
  label: string;
}> = [
  { colour: "red", token: "var(--traffic-red)", label: "Stop" },
  { colour: "amber", token: "var(--traffic-amber)", label: "Wait" },
  { colour: "green", token: "var(--traffic-green)", label: "Go" },
];

/** Read a previously-configured default signal defensively. */
function readConfigActive(config: Record<string, unknown>): TrafficColour {
  const raw = config.active;
  if (raw === "red" || raw === "amber" || raw === "green" || raw === "off") {
    return raw;
  }
  return "off";
}

export function TrafficLightWidget({ widget }: WidgetBodyProps): ReactNode {
  const initial = useMemo<TrafficPersisted>(
    () => ({ active: readConfigActive(widget.config) }),
    [widget.config],
  );
  const { state, setState } = useWidgetState<TrafficPersisted>(
    widget.id,
    initial,
  );
  const active = state.active;

  // Tap a light to make it the sole active signal; tap the active one to clear
  // every light (a deliberate "all off" so a teacher can blank the signal).
  const choose = useCallback(
    (colour: Exclude<TrafficColour, "off">): void => {
      setState((prev) => ({
        ...prev,
        active: prev.active === colour ? "off" : colour,
      }));
    },
    [setState],
  );

  return (
    <div className={styles.body}>
      <div
        className={styles.housing}
        role="radiogroup"
        aria-label="Traffic light signal"
      >
        {LIGHTS.map(({ colour, token, label }) => {
          const isOn = active === colour;
          return (
            <button
              key={colour}
              type="button"
              role="radio"
              aria-checked={isOn}
              className={`${styles.light} ${isOn ? styles.lightOn : ""}`}
              style={
                {
                  "--light-colour": token,
                } as React.CSSProperties
              }
              onClick={() => choose(colour)}
              title={
                isOn
                  ? `${label} signal is showing — tap to turn the light off`
                  : `Show the ${colour} "${label}" signal`
              }
              aria-label={`${label} (${colour})`}
            >
              <span className={styles.lens} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className={styles.caption}>
        {active === "off"
          ? "All clear"
          : LIGHTS.find((l) => l.colour === active)?.label}
      </div>
    </div>
  );
}
