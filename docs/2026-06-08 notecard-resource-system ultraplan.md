# Ultraplan — Resource & Notecard System (1A bring-forward)

> Status: PLAN. Build target: one full build → audit → PR on
> `claude/brave-johnson-9ZEG9`. Author decisions captured 2026-06-08.
>
> This brings forward, into the current resource-pane work, a set of
> rendering + interaction features the roadmap had deferred. The author
> (product owner) has explicitly directed this scope and made the
> architecture calls below; it intentionally goes beyond the historical
> Phase-1A line.

## 1. Author decisions (frozen)

1. **Notecard storage** — _extend the resource model_ (no new table for the
   common case). A notecard is a rich `LessonResource`; attached notecards
   persist through the existing section/lesson JSONB seam (+ R2 for media).
2. **Gallery media** — _any resource type_ (images, video, PDF, embeds) can
   sit in a notecard's flip-through gallery.
3. **Notes body** — rich text _with inline images/embeds_ (extends the
   existing rich-text editor + sanitizer).
4. **Annotation** — _live-only_ on the resource/notecard preview (wiped on
   close); _persists_ when a resource is loaded onto a **board** (existing
   board-annotation behavior — stays until erased/cleared).
5. **Delivery** — one full build, single audit + PR.
6. **"Padlet"** — removed from the codebase (neutral wording).

## 2. Data model (FROZEN CONTRACT — foundation, owned by orchestrator)

Extend `LessonResource` (`lib/types.ts`) — additive, JSONB-safe, optional:

```ts
type LessonResource.type =
  … | "notecard";                 // a card whose primary content is gallery+notes

interface LessonResource {
  … existing fields …
  /** Rich-text HTML notes attached to ANY resource (sanitized). The
   *  "add formatted text + links to any card" capability. */
  body?: string;
  /** Ordered flip-through media for a stack / notecard. Each item is itself a
   *  LessonResource (image / video / pdf / embed / link). gallery[0] is the
   *  poster. Flat — gallery items never carry their own gallery. */
  gallery?: LessonResource[];
}
```

- A **notecard** = `{ type:"notecard", label, gallery:[…media], body:"<html>" }`.
- A **photo stack** = any resource with `gallery:[…images]` (formalizes the
  panel's ad-hoc stack into the model).
- **Any** resource may carry `body` (notecard capability on a normal card).
- `lib/notecards.ts` (new): pure helpers — `isNotecard`, `notecardPoster`,
  `galleryItems`, `hasNotes`, `makeNotecard`, gallery normalization. This is
  the second frozen contract every agent imports.

Persistence: `gallery` + `body` ride the existing `addSectionResource` /
`editLesson` → planner-store JSONB → `supabase-source` read/write. Media
inside the gallery upload to R2 exactly like today's files (reusing
`lib/resource-upload.ts`). No new table.

## 3. Surfaces

| Surface                                                   | Behavior                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Resources pane (`ResourcesPanel`)                         | renders notecard tiles (gallery poster + notes affordance); every card has an **enlarge**; stacks flip                  |
| Lesson-flow editor (`section-resources`, `resource-tile`) | same tiles + enlarge; create/add notecard                                                                               |
| Composer (`ResourceComposer`)                             | create a notecard (multi-media gallery + rich notes + links); add notes to any resource                                 |
| Preview (`ResourcePreview`)                               | universal enlarge for every type; **notecard fullscreen = gallery carousel LEFT, notes RIGHT**; live annotation toolbar |
| Boards (`components/teach`)                               | notecard as a board widget; loaded resource keeps annotation                                                            |
| Daily/Weekly                                              | resources/notecards surface + enlarge where shown                                                                       |

## 4. Component inventory

- `components/notecards/NotecardCard.tsx` — card: gallery on top (flip +
  enlarge), expandable rich notes below (click-to-expand, weekly idiom).
- `components/notecards/NotecardFullscreen.tsx` — split view (media carousel
  left, notes right) + per-item enlarge + flip.
- `components/notecards/Gallery.tsx` — flip-through media strip/carousel
  (any resource type), keyboard + touch, enlarge hook.
- `components/resources/ResourcePreview.tsx` (extend) — host an annotation
  layer + standalone toolbar; route notecards to the split fullscreen.
- `components/resources/PreviewAnnotation.tsx` (new) — standalone adapter
  around `AnnotationLayer` + a toolbar driven by a local
  `useBoardAnnotations` (live-only, no teach dispatch).
- `components/rich-text/*` (extend) — inline image/embed insertion +
  sanitizer allowance for `<img>`/safe `<iframe>`.
- `lib/notecards.ts`, `lib/video-thumbnail.ts` (capture-time first frame),
  `lib/pdf-thumbnail.ts` (reuse), `app/api/resources/[id]/route.ts`
  (`?raw=1` same-origin stream for hosted-PDF render-on-view).

## 5. Agent-team decomposition (dynamic workflow)

**Wave 0 — Foundation (orchestrator, single-threaded; unblocks all):**
freeze `lib/types.ts` additions + `lib/notecards.ts` + planner-store/
supabase-source passthrough of `gallery`/`body`.

**Wave 1 — parallel agents, strict non-overlapping ownership:**

- **A · Notecards UI** — owns `components/notecards/**` (NotecardCard,
  Gallery, NotecardFullscreen). Pure render against frozen contracts + mock.
- **B · Preview annotation** — owns `components/resources/PreviewAnnotation*`
  - extends `ResourcePreview` (resources dir). Standalone live-only toolbar.
- **C · Rich text inline media** — owns `components/rich-text/**` +
  `lib/sanitize-html` allowance.
- **D · Rendering completeness** — owns `app/api/resources/[id]/route.ts`,
  `lib/video-thumbnail.ts`, and the PDF-proxy render-on-view in
  `resource-tile` PosterFace (coordinated: D owns PosterFace edits).

**Wave 2 — Integration (orchestrator):** composer (create notecard + add
notes), panel/tile wiring (enlarge everywhere + notecard tiles + stacks →
gallery), boards widget, **Padlet scrub** (touches shared files last),
persistence verification.

**Wave 3 — Verify + audit + PR:** `tsc` + `eslint` + `prettier` +
`next build` + `build:cf`; independent adversarial review (or documented
self-review if the agent gate is unavailable); open the PR.

Ownership rule: an agent edits ONLY its owned paths. Anything in the coupled
core (`ResourceComposer`, `ResourcesPanel`, `resource-tile` except PosterFace,
`planner-store`, `types`) is orchestrator-only to prevent collisions.

## 6. Cross-cutting rules (CLAUDE.md)

Tokens only (no hex); responsive at 360/768/1280; dismissible onboarding
tooltips on new controls (destructive/clear = `required`); reduced-motion;
≥44px touch targets; sanitize all rich-text/embeds; gate backend writes
behind the planner Supabase flag (mock mode unchanged); no new deps beyond
the already-added `pdfjs-dist` unless justified.

## 7. Risks

- **Untestable here** (no Supabase/R2/browser) — verified by build stack +
  audit; runtime verification happens on deploy.
- **Coupling** — mitigated by foundation-first + orchestrator-owned core.
- **Inline-media rich text + sanitizer** — XSS surface; sanitizer allowance
  is minimal + audited.
- **Scale** — large untestable diff; each module kept independently sound +
  gated so existing flows never regress.
