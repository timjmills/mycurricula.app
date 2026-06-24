// stage-photo.ts — the active background photo(s) for the v2 appearance engine.
//
// STAGE_PHOTOS is the bundled, SAME-ORIGIN photo SET painted behind the glass
// (the `.stage` host in app/layout.tsx + the photo duotone in app/themes.css
// `[data-bg="photo"] .stage::before`). These are the v2 design handoff's own
// stage photos (handoff `assets/photos/p1–p5.png`, the "rotating photo" set from
// source/app.jsx), converted to webp for the web. DEFAULT_STAGE_PHOTO is p1 —
// the handoff's default (its Settings → Appearance preview uses p1). The later
// photo-library wave makes the active photo user-selectable (per-team/per-photo
// selection + upload) feeding the same `data-stage-photo` seam; this wave ships
// the handoff set with a fixed default.
//
// SAME-ORIGIN MATTERS: lib/theme.tsx's `dim === "normal"` AUTO tone path samples
// the active photo's average luminance on a canvas (samplePhotoLuminance). A
// canvas drawn from a cross-origin image without CORS taints, and getImageData
// throws a SecurityError — the sampler would silently fall back to null and the
// AUTO tone would never resolve. Because these ship from the app's OWN origin
// (public/stage/), the luminance canvas is never tainted and the AUTO path
// resolves the photo's TRUE tone. Keep the stage photos same-origin.

/** The bundled v2 handoff stage-photo set (same-origin, webp). */
export const STAGE_PHOTOS = [
  "/stage/p1.webp",
  "/stage/p2.webp",
  "/stage/p3.webp",
  "/stage/p4.webp",
  "/stage/p5.webp",
] as const;

/** The default active stage photo — handoff default (p1). */
export const DEFAULT_STAGE_PHOTO = STAGE_PHOTOS[0];
