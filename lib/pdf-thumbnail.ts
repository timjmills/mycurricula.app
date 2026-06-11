// lib/pdf-thumbnail.ts — render a PDF's first page to a small image, client-side.
//
// Phase 1A previously showed a generic PDF icon for PDF resources because
// rendering a page needs the PDF.js engine. This renders the FIRST PAGE to a
// canvas in the browser and returns a `data:` URL the tile can show as its
// poster — no server-side job, no storage round-trip.
//
// Reliability / CSP:
//   • The PDF is read as an ArrayBuffer (from the captured File), so PDF.js
//     never fetches a URL — no CORS, and nothing for connect-src to block.
//   • The worker is a SAME-ORIGIN module emitted by the bundler, allowed by
//     the app's `default-src 'self'` (there is no separate worker-src).
//   • The result is an `image/webp` (or png) `data:` URL, allowed by the
//     app's `img-src 'self' data: …`.
//   • Every failure path throws; callers fall back to the icon poster.
//
// Cost: the `data:` URL persists on the resource's `thumbnailUrl` (in the
// section JSONB when the backend is on). A page render at ~320px webp is a few
// tens of KB — fine for a handful of PDFs per lesson. A future optimization is
// to store the thumbnail in R2 instead of inlining it.

// PDF.js is heavy + browser-only, so it is dynamically imported on first use
// (keeps it out of SSR and the server/worker bundle) and memoized.
type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Same-origin module worker emitted by the bundler from node_modules.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export interface PdfThumbnailOptions {
  /** Target CSS width of the rendered poster in px (default 320). */
  maxWidth?: number;
}

/**
 * Render page 1 of `file` to a `data:` image URL. Throws on any failure
 * (corrupt/encrypted PDF, worker load failure, no canvas) — the caller keeps
 * the icon poster.
 */
export async function renderPdfThumbnail(
  file: Blob,
  options: PdfThumbnailOptions = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? 320;
  const data = await file.arrayBuffer();
  const pdfjs = await loadPdfjs();

  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Cap the scale so a large page doesn't produce a huge canvas / data URL.
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");

    // pdfjs-dist's RenderParameters requires `canvas` alongside `canvasContext`.
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // webp keeps the data URL small; fall back to png if the browser ignores
    // the requested type (toDataURL returns image/png in that case).
    const webp = canvas.toDataURL("image/webp", 0.62);
    return webp.startsWith("data:image/webp")
      ? webp
      : canvas.toDataURL("image/png");
  } finally {
    // Free the worker-side document promptly.
    void doc.destroy();
  }
}
