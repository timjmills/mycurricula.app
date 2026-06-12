// html-text.ts — the plain-text ↔ rich-text-heading round-trip helpers.
//
// Lesson-flow phase headings are stored as rich-text HTML, but two surfaces
// edit them through PLAIN-TEXT inputs (the phase title in
// components/lesson-flow/lesson-flow.tsx and the agenda navigator's
// rename-in-place in components/daily/LessonAgendaNav.tsx). Both must agree
// on one escape/decode contract or a rename through one surface corrupts
// the other's display — so the pair lives here, in one place.
//
// Contract: `stripHtml(escapeHtml(text)) === text.trim()` for any plain
// text. `stripHtml` decodes `&amp;` LAST so a double-escaped sequence
// (e.g. "&amp;lt;" from escaping the literal text "&lt;") round-trips
// correctly instead of collapsing into a tag.

/** Strip tags and decode the basic entities for PLAIN-TEXT display of a
 *  rich-text heading/body. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Escape plain text for storage in a rich-text field. The rename inputs
 *  are plain-text by design (the 6.11.26 handoff's phase titles are plain
 *  18px/700 ink), so any markup the old heading carried is replaced by
 *  the typed text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
