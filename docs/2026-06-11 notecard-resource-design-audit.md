# Notecard & Resource-Display System — Design Doc + Audit

> **Snapshot disclaimer:** dated audit/design snapshot (2026-06-11, branch
> `claude/brave-johnson-9ZEG9`, PR #11). Findings and recommendations here may
> be fixed, deferred, or superseded by later work — verify against current
> code (`git log --oneline -- <path>`) before treating anything as open.
> The binding project docs remain `CLAUDE.md` + `BUILD_STANDARD.md`.

This document is the consolidated **design record** for the resource-display +
notecard system shipped on PR #11, plus a two-sided **design audit** (front-end
UI/UX; back-end data model + persistence) run against that implementation. The
original build plan is `docs/2026-06-08 notecard-resource-system ultraplan.md`;
this doc describes what was actually built and how well it holds up.

---

## 1. What the system is

A **notecard** is a composite resource: a flip-through media gallery on top
(any resource type — image, video, PDF, embed, link) and rich-text notes below
(formatting, links, inline images, safe embeds). Notecards attach anywhere a
resource attaches (lesson, lesson-flow section, board) and every _existing_
resource can carry a note (`body`) without becoming a notecard.

Companion capabilities shipped in the same wave:

- **Universal enlarge** — every resource, everywhere it renders, opens a
  fullscreen preview. A notecard's fullscreen is a split view: media carousel
  LEFT, notes RIGHT.
- **Live-only preview annotation** — the enlarge view hosts a pen/highlighter/
  eraser toolbar (reusing the boards annotation engine). Ink on a _preview_ is
  ephemeral by design: wiped on close, never persisted. Ink on a **board**
  persists (existing behavior, unchanged).
- **Rendering completeness** — PDFs render in-app via a same-origin stream
  (`/api/resources/[id]?raw=1`), video thumbnails capture a first frame,
  website cards use OG metadata, photo stacks flip.

## 2. Data model (the frozen contract)

`lib/types.ts` — `LessonResource` was extended additively (JSONB-safe, all
optional, so legacy mock fixtures stay valid):

```ts
interface LessonResource {
  type:
    | "slides"
    | "pdf"
    | "doc"
    | "image"
    | "youtube"
    | "website"
    | "link"
    | "notecard";
  label: string;
  url?: string; // embed source / link / R2 endpoint
  // …provider, sizeBytes, dimensions, thumbnailUrl, OG fields…
  resourceId?: string; // server row id, present once persisted
  body?: string; // rich-text HTML notes — on ANY resource
  gallery?: LessonResource[]; // ordered flip media; gallery[0] = poster;
  // FLAT by convention (items never nest)
}
```

Key design decisions (author-frozen 2026-06-08):

1. **Extend the resource model; no new table.** A notecard is
   `{ type:"notecard", label, gallery, body }`. Persistence rides the existing
   section/lesson JSONB seam; gallery media upload to R2 like any file.
2. **Gallery = any resource type.** A one-item media resource is treated as a
   one-item gallery so the carousel/enlarge path is uniform.
3. **Notes = rich HTML** through the existing editor + `lib/sanitize-html.ts`
   (strict allowlists; `SAFE_IMG_SRC`; `TRUSTED_IFRAME_HOSTS`; fail-closed).
4. **Flat galleries.** Nesting is prevented by convention + helpers + UI (a
   gallery item enlarged from inside a notecard is stripped of `body`/
   `gallery` first), not by the type system or a DB constraint — see the
   "JSONB nesting" row in §6.

`lib/notecards.ts` is the single read-path for "what is this card's poster /
gallery / notes": `isNotecard`, `hasNotes`, `galleryItems` (explicit gallery
wins; else a `url` resource is a one-item gallery; notes-only ⇒ empty),
`galleryCount`, `isStack`, `notecardPoster`, `makeNotecard`. Pure — no I/O,
no React.

## 3. Surfaces & component map

| Surface            | Component(s)                                                                                           | Role                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Resources pane     | `components/daily/ResourcesPanel.tsx`                                                                  | Notecard tiles (poster + notes affordance), stacks flip, enlarge on every card                                                            |
| Composer           | `components/daily/ResourceComposer.tsx`                                                                | Three commit paths: plain resources (each may carry `body`), notecard CREATE (`makeNotecard`), notecard EDIT (patch body + merge gallery) |
| Lesson-flow editor | `components/lesson-flow/section-resources.tsx`, `resource-tile.tsx`                                    | Same tiles + enlarge; add/edit notes per resource                                                                                         |
| Notecard family    | `components/notecards/NotecardCard.tsx`, `Gallery.tsx`, `NotecardFullscreen.tsx`                       | Card (gallery top, expandable notes below); flip-through carousel; fullscreen split view                                                  |
| Universal preview  | `components/resources/ResourcePreview.tsx`                                                             | Enlarge modal for every type; routes notecards to the split fullscreen; nested per-item enlarge with Escape guard                         |
| Annotation         | `components/resources/PreviewAnnotation.tsx` + `lib/use-board-annotations.ts` (`ephemeral: true` mode) | Live-only toolbar/layer; ephemeral mode never touches localStorage                                                                        |
| Rich text          | `components/rich-text/rich-text-editor.tsx`                                                            | Inline images/embeds; sanitizes on load (`el.innerHTML = sanitizeHtml(value)`) and on emit                                                |

## 4. Back end & persistence (the audited map)

This is the precise "what is stored where" picture, confirmed against the
migrations and API routes:

- **Mock mode (`isPlannerSupabaseConfigured()` false):** everything stays
  client-side. Uploaded media become `blob:`/`data:` URLs; rich-text inline
  images become `data:` URLs; nothing touches the network. Every view reads
  `lib/mock/` fixtures.
- **Backend mode:** two persistence layers, by design:
  1. **The JSONB seam** — `lesson_sections.resources` and `lessons.resources`
     are `jsonb` arrays of inline resource objects (`{id, type, url, label,
…}`). **`body` and `gallery` ride here**, serialized straight into the
     JSONB. No new table, no migration — exactly what the ultraplan froze. RLS
     on `lesson_sections` (read team/master + own personal; write own) gates
     these automatically, so a notecard inherits the **forking model** for free:
     editing a personal lesson's notecard writes a personal section row; the
     master notecard is untouched.
  2. **The `resources` table** — the normalized hosted-file layer (R2 object
     keys, server-verified `mime_type`/`width`/`height`, `display_mode`,
     `provider`). Gallery media that get uploaded land here as rows; the gallery
     item's `url` then points at `/api/resources/{id}`.
- **Upload flow:** presign → client PUT to R2 → finalize, with the row's
  `mime_type` set from a **server-side HEAD** (never the client's claim).
  Served back via `/api/resources/[id]` — a 302 to a short-lived signed URL for
  browser preview, or `?raw=1` for a **same-origin byte stream** so client-side
  PDF.js can read the bytes without a CORS hop (object key is server-controlled
  from the row, so no SSRF).
- **OG preview:** `/api/og-preview` fetches link metadata server-side behind a
  thorough SSRF guard (scheme allowlist; DNS resolution + private/loopback/
  link-local/metadata IP rejection re-checked on every redirect hop; 5s timeout;
  512 KB streamed body cap; HTML-only parsing).
- **Annotations:** board ink persists in per-user-namespaced localStorage;
  preview ink uses the `ephemeral` hook mode (in-memory only, wiped on close).

## 5. Front-end audit (UI/UX) — findings

Audited `components/notecards/*`, `components/resources/*`,
`components/rich-text/*`, the composer, and the lesson-flow tiles against
CLAUDE.md §4 and BUILD_STANDARD.md.

**No Critical or High issues.** The feature is well-built; details below.

| Sev | Area             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | Token discipline | The only hex/px in the new files are `#000` (a last-resort canvas fallback in `PreviewAnnotation.tsx` — the canvas API needs a concrete colour, not a `var()`, and the real colours resolve from tokens) and `color:#fff`/`font-size:14px` in the CSS modules, which match house style used across ~20 existing view modules. `PRIMARY_SLOT_FILLS` in `section-resources.tsx` is spec-cited (§4.2 "EXACT HEX VALUES") and pre-existing. No fresh violations. |
| Low | A11y consistency | `NotecardFullscreen` and `ResourcePreview` move focus into the dialog and restore it on close, but neither traps Tab inside the modal. This is the consistent house modal pattern; fixing one without the other would diverge. Track as an app-wide modal improvement, not a notecard-specific bug.                                                                                                                                                          |
| Low | Doc drift        | `lesson_sections.resources` JSONB comment (migration `20260601120000`, line ~53) still reads "array of {id, type, url, label}"; the array now also carries `body`/`gallery`. Comment-only; the JSONB shape is unconstrained so nothing breaks. Left as-is (applied migrations are immutable); recorded here instead.                                                                                                                                         |

**Design strengths (verified in code):**

- Modals use `role="dialog"` + `aria-modal`, Esc + backdrop close, focus move-in
  and restore-on-close — and stop-propagate Esc so a nested per-item enlarge
  closes only the inner layer.
- The `Gallery` carousel is genuinely accessible: focusable strip with ←/→ keys,
  pointer-swipe with a tap/flick threshold, wrap-around, dot indicators that
  degrade to an `n / total` counter past 8 items, `aria-roledescription="media
gallery"` + live position label, and `key={index}` remounts so a flipped
  iframe/video resets cleanly.
- Every notes body is `sanitizeHtml()`-ed before `dangerouslySetInnerHTML` at
  every sink; the rich-text editor sanitizes on load AND emit (defence in depth).
- Flip controls and other non-obvious controls carry onboarding tooltips;
  destructive annotation "Clear" passes `required`.
- Reduced motion is honoured in the CSS modules; phone stacks the
  media-left/notes-right split top-to-bottom (≤640px).

## 6. Back-end audit (data model + persistence) — findings

**No Critical or High issues.** Findings:

| Sev             | Area                | Finding & disposition                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low (fixed)     | og-preview output   | `thumbnailUrl` was returned straight from page metadata. Now validated to an absolute http(s) URL server-side (`safeHttpThumb`) before it can reach a client `<img src>` — defence in depth alongside the client `SAFE_IMG_SRC` gate. Fixed in this change.                                                                                                                       |
| Low (deferred)  | R2 orphan lifecycle | `DELETE /api/resources/[id]` drops the row but leaves the R2 object to a "nightly sweep" that is **described in a comment but not yet implemented**. Until that sweep ships (Phase 1B infra), deleted/abandoned gallery media accumulate as orphan R2 objects — a storage-cost issue, not a correctness or security one. Tracked as a Phase 1B task.                              |
| Low (by design) | JSONB nesting       | The JSONB seam accepts any shape, so a gallery item _could_ technically carry its own `gallery`/`body`. Flat-gallery is enforced at the type comment, the `lib/notecards.ts` helpers, and the UI (enlarging a gallery item strips `body`/`gallery`). No DB CHECK enforces it. Acceptable: the write path is wholly app-controlled and the read path tolerates nesting harmlessly. |

**Data-model verdict:** extending `LessonResource` with optional `body` +
`gallery` and riding the JSONB seam is the right call over a new table — it
keeps the forking model and RLS working with zero new policy surface, and
matches how inline resources already persist. Index-based section ids
(`lesson:<id>:res:<idx>`) are a render-time convenience derived from array
position each render (see `lesson-flow.tsx`), not a stored key, so reorder/delete
can't strand a stale id.

## 7. Phase 1B database readiness

**No migration is required to persist notecards** — `body`/`gallery` already
serialize into the existing `lesson_sections.resources` / `lessons.resources`
JSONB and inherit those tables' RLS. The two open Phase 1B items are infra, not
schema:

1. **R2 orphan sweep** — implement the nightly job the DELETE route assumes
   (delete R2 objects whose `resources` row no longer exists; also reap objects
   presigned-but-never-finalized past a TTL).
2. _(optional hardening)_ if notecard volume grows, consider promoting heavy
   gallery media fully into the normalized `resources` table and storing only a
   reference array in the JSONB, to keep section rows small. Not needed for beta.

If a future requirement demands queryable notes (full-text search across
notecard bodies), that is the point to add a generated column or a separate
`notecard_notes` table — out of scope today.

## 8. Verdict & follow-ups

The resource-display + notecard system is **soundly designed on both ends.**
Front end: accessible modals and carousel, sanitized rich text at every sink,
token-disciplined, responsive, reduced-motion-aware, and consistent with the
app's existing primitives. Back end: a clean two-layer persistence model that
preserves the forking model and RLS without new schema, a server-verified R2
upload flow, and a hardened SSRF-guarded OG fetcher.

**Changed in this pass:** og-preview `thumbnailUrl` is now validated to absolute
http(s) at the server boundary.

**Tracked Phase 1B follow-ups (no code change now):** implement the R2 orphan
sweep; refresh the stale JSONB-shape comment when that migration area is next
touched; consider an app-wide modal focus-trap as a single cross-cutting change.
