// photo-luminance.ts — sample the active photo's average luminance to drive the
// `data-dim="normal"` AUTO tone (see docs/v2-rebuild/WAVE-2-VALUE-MATRIX.md §4).
//
// The matrix's tone derivation, rule 3 (bg === "photo"), branches on data-dim;
// the `normal` arm is AUTO: sample the active photo's average luminance on a
// 32×32 canvas, then `lum > 0.6 → light` (a light photo wants dark text), else
// `→ dark`. Until a sample is available the caller keeps the safe default-dark
// tone — this module NEVER forces a tone on failure (it returns null and the
// caller falls back). It is the mechanism only; the active-photo URL source is
// wired by lib/theme.tsx (a seam the later photo-library wave fills).
//
// CLIENT-ONLY + FRAMEWORK-FREE: pure DOM (Image + canvas), no React, no deps.
// Every DOM touch is SSR-guarded (typeof document === "undefined" → null) and
// every read is try/catch wrapped, so a tainted canvas (cross-origin photo the
// browser refuses to read back), a load error, or a missing 2d context all
// resolve to null rather than throwing.
//
// CACHING: a module-level Map keyed by URL memoizes both the in-flight Promise
// (so concurrent callers de-dupe to a single sample) and its resolved value (so
// a given photo is sampled at most once per session). getCachedLuminance reads
// the resolved value synchronously (undefined = never sampled yet) so the caller
// can seed state without awaiting.

/** 32×32 = 1024 pixels — the matrix's sampling resolution. Small + cheap. */
const SAMPLE_SIZE = 32;

/**
 * The matrix §4 threshold: a photo brighter than 0.6 mean relative luminance is
 * "light" and wants dark text; anything darker stays dark tone (white text on a
 * scrim). The same 0.6 lives in the matrix's compact form (`lum > 0.6 → light`).
 */
const LIGHT_THRESHOLD = 0.6;

// Resolved-value cache (URL → mean luminance in [0,1], or null on any failure).
const resultCache = new Map<string, number | null>();
// In-flight cache (URL → the pending sample Promise) so concurrent calls share
// one decode/read instead of racing N copies of the same image.
const inflight = new Map<string, Promise<number | null>>();

/**
 * Map a mean relative luminance to a tone, per WAVE-2-VALUE-MATRIX.md §4:
 * `lum > 0.6 → light` (light photo → dark text), otherwise `→ dark`.
 */
export function luminanceToTone(lum: number): "light" | "dark" {
  return lum > LIGHT_THRESHOLD ? "light" : "dark";
}

/**
 * Read the cached mean luminance for a URL WITHOUT triggering a sample.
 *   • a number  → previously sampled successfully (mean in [0,1])
 *   • null      → previously sampled but failed (load error / taint / no canvas)
 *   • undefined → never sampled this session
 * Lets the caller seed `autoTone` synchronously on revisit and avoid a flash.
 */
export function getCachedLuminance(url: string): number | null | undefined {
  return resultCache.get(url);
}

/**
 * Load `url`, draw it into a 32×32 offscreen canvas, and return the mean
 * per-pixel relative luminance (0.2126·R + 0.7152·G + 0.0722·B over channels
 * normalized to 0..1), averaged across all 1024 pixels, in [0,1].
 *
 * Returns null (NEVER throws) on ANY failure: SSR (no document), no canvas/2d
 * context, image load error, or a CORS-tainted canvas whose getImageData throws
 * a SecurityError. The caller keeps the safe default-dark tone on null.
 *
 * Sampled at most once per URL per session; concurrent calls share one Promise.
 */
export async function samplePhotoLuminance(url: string): Promise<number | null> {
  // SSR / no DOM — nothing to sample.
  if (typeof document === "undefined") return null;
  if (!url) return null;

  // Already resolved this session — return the memoized value.
  const cached = resultCache.get(url);
  if (cached !== undefined) return cached;
  // Already in flight — share the pending Promise (concurrent de-dupe).
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = sample(url)
    .then((value) => {
      resultCache.set(url, value);
      return value;
    })
    .catch(() => {
      // Defensive: sample() already swallows its own failures, but never let a
      // stray rejection escape — cache + return the safe null.
      resultCache.set(url, null);
      return null;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
}

/** Do the actual decode → draw → read → average. Resolves to null on failure. */
function sample(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    let img: HTMLImageElement;
    try {
      img = new Image();
    } catch {
      resolve(null);
      return;
    }

    // crossOrigin MUST be set BEFORE src so R2's CORS-enabled responses come
    // back readable; without it (or for a non-CORS response) the canvas taints
    // and getImageData throws SecurityError below — caught and resolved null.
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        // Throws SecurityError on a tainted (cross-origin, non-CORS) canvas.
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        let sum = 0;
        const pixels = SAMPLE_SIZE * SAMPLE_SIZE;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          // Relative luminance (Rec. 709 coefficients), per the matrix §4.
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        resolve(sum / pixels);
      } catch {
        // Tainted canvas / read failure — never throw, fall back to null.
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);

    try {
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}
