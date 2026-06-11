// lib/notecards.ts — pure helpers for the notecard / gallery model.
//
// A NOTECARD is a LessonResource (`type:"notecard"`) whose primary content is
// a flip-through media gallery plus a rich-text notes body. The model is an
// additive extension of LessonResource (see lib/types.ts): any resource may
// carry `body` (rich notes) and `gallery` (ordered media). A photo "stack" is
// just a resource with a `gallery` of images.
//
// These helpers are the FROZEN CONTRACT the notecard UI, the composer, and the
// renderers all read through, so "what is this card's poster / gallery / notes"
// has one answer everywhere. Pure — no I/O, no React, no DOM.

import type { LessonResource } from "./types";

/** True when the resource is a dedicated notecard. */
export function isNotecard(resource: LessonResource): boolean {
  return resource.type === "notecard";
}

/** True when the resource carries any rich-text notes body. */
export function hasNotes(resource: LessonResource): boolean {
  return typeof resource.body === "string" && resource.body.trim().length > 0;
}

/**
 * The ordered media a card flips through. For a card with an explicit
 * `gallery` that wins; otherwise a single-media resource (one with a `url`)
 * is treated as a one-item gallery so the carousel + enlarge can render it
 * uniformly. A url-less notecard (notes only) yields an empty gallery.
 */
export function galleryItems(resource: LessonResource): LessonResource[] {
  if (resource.gallery && resource.gallery.length > 0) return resource.gallery;
  if (resource.url) return [resource];
  return [];
}

/** Count of flip-through media items. */
export function galleryCount(resource: LessonResource): number {
  return galleryItems(resource).length;
}

/** True when the card has more than one media item (a stack/gallery). */
export function isStack(resource: LessonResource): boolean {
  return galleryCount(resource) > 1;
}

/** The poster media (first gallery item), or undefined for a notes-only card. */
export function notecardPoster(
  resource: LessonResource,
): LessonResource | undefined {
  return galleryItems(resource)[0];
}

/** Construct a notecard LessonResource from media + notes. `label` falls back
 *  to a generic name; `gallery` is stored only when it carries items so a
 *  notes-only notecard stays compact. */
export function makeNotecard(input: {
  label?: string;
  gallery?: LessonResource[];
  body?: string;
}): LessonResource {
  const gallery = input.gallery ?? [];
  return {
    type: "notecard",
    label: input.label?.trim() || "Notecard",
    ...(gallery.length > 0 ? { gallery } : {}),
    ...(input.body && input.body.trim() ? { body: input.body } : {}),
  };
}
