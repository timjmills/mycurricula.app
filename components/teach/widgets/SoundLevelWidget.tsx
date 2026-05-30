// SoundLevelWidget — an INTERACTIVE microphone sound-level meter (Phase 3 widget
// library). A permission-gated live volume meter: a tap on "Turn on microphone"
// opens a getUserMedia stream, an AudioContext AnalyserNode reads the room, and
// a rAF loop drives a vertical bar against a persisted 0–100 threshold. Above the
// threshold the meter goes "Too loud" red (--teach-alarm); below it stays green
// (--teach-go). Every stream/node/context/rAF is torn down on stop + unmount.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import { TeachIcon } from "./icons";
import type { WidgetBodyProps } from "./types";
import styles from "./SoundLevelWidget.module.css";

/** Durable slice — only the threshold persists (live level is ephemeral). */
interface SoundPersisted extends Record<string, unknown> {
  /** Alarm trips when the smoothed level (0–100) crosses this. */
  threshold: number;
}

const INITIAL: SoundPersisted = { threshold: 60 };

/** The three lifecycle states of the mic. */
type MicStatus = "idle" | "running" | "denied";

/** Clamp a value into the 0–100 meter range. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Read a previously-configured default threshold defensively. */
function readConfigThreshold(config: Record<string, unknown>): number {
  const raw = config.threshold;
  if (typeof raw === "number" && Number.isFinite(raw)) return clamp01(raw);
  return INITIAL.threshold;
}

export function SoundLevelWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  const initial = useMemo<SoundPersisted>(
    () => ({ threshold: readConfigThreshold(widget.config) }),
    [widget.config],
  );
  const { state, setState } = useWidgetState<SoundPersisted>(
    widget.id,
    initial,
  );
  const threshold = state.threshold;

  const [status, setStatus] = useState<MicStatus>("idle");
  // Live smoothed level (0–100) — kept in React state for the meter render, and
  // mirrored in a ref so the rAF loop reads it without re-subscribing.
  const [level, setLevel] = useState(0);

  // Audio-graph handles held in refs so the cleanup effect can tear them down
  // regardless of when stop is called (button, unmount, or error path).
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef(0);

  // Tear down the entire audio graph + animation frame. Idempotent: safe to call
  // from the button handler, the error path, and the unmount cleanup.
  const teardown = useCallback((): void => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // node may already be detached
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (ctxRef.current) {
      // close() returns a promise; we don't await it (fire-and-forget cleanup).
      void ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    smoothedRef.current = 0;
  }, []);

  // Always tear down on unmount.
  useEffect(() => teardown, [teardown]);

  // The rAF sampling loop: compute RMS from the analyser's time-domain data,
  // map to 0–100, smooth it, and push to state. Meter is data (not decoration)
  // so it keeps updating under reduced motion — only the decorative pulse stops.
  const startLoop = useCallback((): void => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);

    const tick = (): void => {
      const node = analyserRef.current;
      if (!node) return;
      node.getByteTimeDomainData(buffer);
      // RMS of the centred waveform (128 == silence midpoint).
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buffer.length);
      // Scale RMS into a perceptually useful 0–100; cap at 100.
      const raw = clamp01(rms * 320);
      // Exponential smoothing so the bar doesn't jitter frame-to-frame.
      smoothedRef.current = smoothedRef.current * 0.8 + raw * 0.2;
      setLevel(Math.round(smoothedRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Open the mic on an explicit user gesture, build the graph, start sampling.
  const turnOn = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Some browsers still namespace AudioContext as webkitAudioContext.
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        teardown();
        setStatus("denied");
        return;
      }
      const ctx = new Ctor();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      source.connect(analyser);
      setStatus("running");
      startLoop();
    } catch {
      // Permission denied, no device, or graph failure — fall back cleanly.
      teardown();
      setStatus("denied");
    }
  }, [startLoop, teardown]);

  const turnOff = useCallback((): void => {
    teardown();
    setLevel(0);
    setStatus("idle");
  }, [teardown]);

  const tooLoud = status === "running" && level >= threshold;
  const meterColour = tooLoud ? "var(--teach-alarm)" : "var(--teach-go)";

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      <div
        className={styles.meterWrap}
        role="meter"
        aria-label="Classroom sound level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status === "running" ? level : 0}
      >
        {/* Threshold marker line so the class sees where "too loud" begins. */}
        <div
          className={styles.thresholdLine}
          style={{ bottom: `${threshold}%` }}
          aria-hidden="true"
        />
        <div
          className={`${styles.fill} ${tooLoud ? styles.fillAlarm : ""}`}
          style={{
            height: `${status === "running" ? level : 0}%`,
            background: meterColour,
          }}
          aria-hidden="true"
        />
        {status === "running" ? (
          <span
            className={styles.face}
            style={{ color: meterColour }}
            aria-hidden="true"
          >
            {tooLoud ? "Too loud" : "Good"}
          </span>
        ) : null}
      </div>

      {/* Controls + status footer ────────────────────────────────────────── */}
      {status === "idle" ? (
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void turnOn()}
          title="Turn on the microphone to show the room's live sound level"
        >
          <TeachIcon name="mic" size={16} />
          Turn on microphone
        </button>
      ) : null}

      {status === "denied" ? (
        <div className={styles.deniedRow}>
          <span className={styles.deniedMsg}>
            <TeachIcon name="micOff" size={14} /> Microphone unavailable. Check
            permissions and try again.
          </span>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              setStatus("idle");
              void turnOn();
            }}
            title="Ask for microphone access again"
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === "running" ? (
        <button
          type="button"
          className={styles.offBtn}
          onClick={turnOff}
          title="Turn off the microphone and stop listening"
        >
          <TeachIcon name="micOff" size={16} />
          Turn off
        </button>
      ) : null}

      {/* Threshold slider — persisted, always editable. */}
      <label className={styles.sliderRow}>
        <span className={styles.sliderLabel}>Loud at</span>
        <input
          type="range"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) =>
            setState({ threshold: clamp01(Number(e.target.value)) })
          }
          className={styles.slider}
          aria-label="Too-loud threshold"
          title="Set how loud the room can get before the meter turns red"
        />
        <span className={styles.sliderValue}>{threshold}</span>
      </label>
    </div>
  );
}
