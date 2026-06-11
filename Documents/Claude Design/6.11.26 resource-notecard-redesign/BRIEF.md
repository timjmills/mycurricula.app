# Resource & Notecard System — Redesign Brief (for Claude Design)

> **Audience:** Claude Design (artifact/prototyping session with access to this
> GitHub repo, `timjmills/mycurricula.app`). **Date:** 2026-06-11.
> **Owner verdict driving this brief:** the shipped resource panel / notecard
> system "is very buggy and does not function right — adding and manipulating
> resources, the notecard design both for resources and on its own is not
> working well." This document is everything Claude Design needs to redesign
> it: (1) exactly what to build, (2) what every element does, (3) full UI/UX +
> backend specs, plus the verified bugs and the constraints that must not move.

---

## 0. How to use this brief

1. Read **§1 (why)** and **§2 (frozen constraints)** first — they bound the
   redesign.
2. **§3** is the surface-by-surface redesign scope: what each surface's job is,
   what is broken today, and what the redesign must deliver.
3. **§4** is the element-by-element functional spec — every control, its
   function, states, and interactions. This is the "exactly what to build."
4. **§5** is the backend/data contract the UI sits on (unchanged by this
   redesign — the UI must respect it).
5. **§6** design-system rules (binding), **§7** acceptance criteria, **§8**
   file map, **§9** screenshots.
6. The binding repo contracts are **`CLAUDE.md`** (policy — esp. §4 design
   rules) and **`BUILD_STANDARD.md`** (visual/structural/responsive contract;
   the Weekly view is the canonical reference). Design tokens:
   `app/tokens.css`. Read all three before producing artboards.

**Deliverable expected back from Claude Design:** per-surface artboards
(`.jsx`, matching the existing handoff convention under
`Documents/Claude Design/5.16.26 Build A Curriculum-handoff/project/`) +
interaction notes, covering every surface in §3 at the three responsive tiers
(phone 360–480, tablet 600–900, desktop 1024–1920).

---

## 1. Why a redesign — verified problems in the shipped build

These were verified against the live code and by driving the running app
(mock mode) on 2026-06-11. Screenshots in §9 show the states described.

### P1 — Every resource appears TWICE in the Resources panel (data identity bug)

`components/daily/ResourcesPanel.tsx` (~line 961, `combined` memo) merges two
sources: each section's resources (real ids like `s1-r2`) and the lesson-level
`lesson.resources` array (synthesized ids `lesson:<lessonId>:res:<i>`).
Deduplication is **by id**, but the same underlying item exists in BOTH sources
under DIFFERENT ids — so dedup never matches and the panel renders every
resource twice (verified: every "Open preview: X" button exists at two grid
positions). **Root cause: no stable cross-source resource identity.** The
redesign must pick ONE canonical source of truth for "the lesson's resources"
(recommendation: sections are canonical; lesson-level array is legacy input
that gets migrated/merged at read time by content identity `url+label+type`,
never double-rendered).

### P2 — The composer does three jobs in one dialog (interaction overload)

`components/daily/ResourceComposer.tsx` is ~1,700 lines implementing three
modes in one surface: **resource add** (N items, each with optional per-item
note), **notecard CREATE** (gallery + one rich body), **notecard EDIT** (patch
notes/gallery on an existing resource) — plus capture methods (Upload / Photo /
Link / Search / All-tools wall), per-item titles vs dialog title "steering,"
routing (Subject → Unit → Lesson → Section), upload state, and a mock-mode
warning banner. Teachers experience this as "adding resources doesn't work
right": the same dialog changes meaning depending on invisible entry context.
**The redesign should split or visually stage these jobs** (e.g. a clear
two-step: capture → annotate/route; or separate "Add resources" and "New
notecard" entry points with shared capture internals) and make mode always
visible.

### P3 — Notecards break the visual rhythm of every host surface

Verified in screenshot `07`: a notecard rendered into the panel grid is a
different height/shape than the uniform tiles around it, and in the center
section column the notecard strip pushes the 2×2 grid into a cramped stack.
The NotecardCard was designed as a standalone card and then dropped into three
different hosts (panel grid, section strip, weekly list) without per-host
sizing rules. **The redesign must define how a notecard renders in each host**
(compact tile face in grids — poster + notes glyph + count; full card only in
dedicated strips/fullscreen).

### P4 — Touch targets below contract on the core notecard affordance

The "Add or edit notes for X" pencil buttons render at **22×22px** (verified
via DOM probe) — the CLAUDE.md §4 contract requires **≥44px** on primary
actions for phone/tablet. The single most important notecard affordance is the
hardest thing to hit.

### P5 — Link/website resources render blank when they refuse framing (CSP mismatch)

The app's CSP (`next.config.ts:51`) allows `frame-src` only for
`'self'`, Google GSI, `youtube-nocookie`, `youtube`, `player.vimeo`,
`docs.google`, `drive.google`. The preview renderer however will attempt to
frame other hosts; the browser blocks them (verified console error: framing
`w3.org` blocked by CSP), producing silent blank tiles — the owner-reported
"links/PDFs don't show" symptom class. The redesign must treat **`canEmbed`
(from `/api/og-preview`) + the CSP allowlist as the single authority**: a URL
that can't be framed NEVER gets an iframe — it gets the link-card treatment
(OG thumbnail + title + domain + "Open" action) with no broken/blank state.

### P6 — No notecard CREATE entry point in primary navigation

A teacher can add notes to an existing resource (pencil → notecard EDIT mode)
but there is no visible "New notecard" affordance in the panel or section
surfaces — notecard creation is only reachable through composer-internal mode
logic. The owner's product intent ("notecard… attachable to lessons / units /
sections / boards or standalone") requires a first-class create entry.

### P7 — Session-only warning copy creates mistrust

In mock/no-backend mode the composer shows: "Attached for this session only —
files aren't yet uploaded to the server, so they won't survive a reload…".
Necessary honesty, but presented as a red warning INSIDE the add flow — it
reads as "this feature is broken." Redesign the state messaging: quiet badge
on the affected tiles + one explanation surface, not a red banner in the
critical path.

---

## 2. Frozen constraints — do NOT redesign these

These are owner-frozen architecture decisions (2026-06-08 ultraplan,
re-affirmed in the 2026-06-11 design audit). The redesign works WITHIN them:

1. **Data model:** a notecard IS a `LessonResource` — `type:"notecard"` +
   optional `body` (sanitized rich-text HTML, allowed on ANY resource) +
   optional `gallery` (ordered `LessonResource[]`, any type, FLAT — items
   never nest). No new table. See §5.1.
2. **Persistence seam:** resources (incl. body/gallery) ride the
   `lesson_sections.resources` / `lessons.resources` JSONB; uploaded media go
   through the R2 presign→PUT→finalize flow into the normalized `resources`
   table. RLS + the Master/Personal forking model come from that seam.
3. **Annotation:** ink over an enlarged preview is LIVE-ONLY (wiped on close,
   never persisted); ink persists only on Teach boards. Non-negotiable.
4. **Sanitizer boundary:** every rich-text render path goes through
   `lib/sanitize-html.ts` (strict allowlists; trusted iframe hosts only).
5. **Subject colors/tokens:** the 8-subject palette is locked; all color/type/
   spacing via `app/tokens.css` custom properties (Tailwind = layout only).
6. **Forking model:** completion never forks; Personal edits never write to
   Master; Master editing stays behind the explicit toggle + banner.
7. **No new dependencies.** Bespoke components against the token system.

---

## 3. What to build — surface-by-surface redesign scope

### 3.1 Resources panel (Daily/Weekly right rail) — `components/daily/ResourcesPanel.tsx`

- **Job:** glance-and-open. "What materials does this lesson (or week) have,
  and open one fast." Aggregates lesson + section resources (day mode) or all
  lessons' (week mode).
- **Today:** header (count chip, + add, list/grid toggle, collapse), category
  tabs (All / Slides / Handouts / Tools), grid of uniform tiles (thumbnail +
  type tag + label) or list rows, notecards as full NotecardCards in the grid,
  "···" overflow stub per tile (no menu behind it yet), drag-to-reorder rail
  column handle.
- **Broken/weak:** P1 duplicates; P3 grid rhythm; the "···" dead button;
  category roll-ups unlabeled for notecards (a notecard lands in "All" only);
  week mode title/empty states inconsistent.
- **Redesign must deliver:** single-source aggregation (no duplicates);
  a compact **notecard tile face** consistent with plain tiles (poster +
  "notes" glyph + gallery count badge); a real overflow menu (Open / Enlarge /
  Edit note / Remove…) or removal of the stub; a visible **"New notecard"**
  entry (P6); notecard category placement (own "Notes" tab or All-only —
  decide and spec); unchanged: tabs, list/grid, collapse, count chip
  semantics (chip = full combined count, stable across tabs).

### 3.2 Section resources (lesson-flow center column) — `components/lesson-flow/section-resources.tsx`

- **Job:** the editing home of a section's materials inside the lesson plan.
- **Today:** expanded state = notecard strip on top + spec'd 2×2 pastel grid
  (slot-indexed fills, EXACT hex per spec §4.2) + "More resources" tail list +
  "+ Add resource"; minimized state = "Resource quick access" list rows +
  notecard strip + "+ Add quick resource"; per-(lesson,section) minimized
  persistence; per-resource pencil = add/edit notes (P4: 22×22px).
- **Redesign must deliver:** notecard placement that doesn't crush the 2×2
  grid (P3) — e.g. notecards as one row of compact cards with a count, full
  card on demand; ≥44px touch affordances for note-edit/open on phone/tablet
  (P4); keep the 2×2 slot-fill spec and the expanded/minimized toggle exactly
  as specced (they are liked); keep "section is canonical owner of its
  resources" (P1 fix direction).

### 3.3 Resource composer — `components/daily/ResourceComposer.tsx` (+ `AllToolsMenu.tsx`)

- **Job(s) today (overloaded, P2):** (a) add N resources to a routed
  destination; (b) create ONE notecard (gallery + rich notes); (c) edit
  notes/gallery on an existing resource.
- **Capture methods:** Upload (any file) / Photo (image files) / Link
  (URL → OG preview fetch → embed/link card decision) / Search (stub) /
  "All tools" expanding wall (Card wall NEW, Upload, Link, Web search SOON,
  Camera, Photo album, Image search SOON, GIF SOON, Recordings…).
- **Routing:** Subject → Unit → Lesson → Section selects, prefilled from
  context; locked when editing an existing resource.
- **States:** uploading (busy Add button "Adding…"), per-file upload error
  with retry (succeeded uploads cached — no double upload), mock-mode
  session-only banner (P7), per-item rich note (resource mode), title
  steering (single-item title overrides item label).
- **Redesign must deliver:** explicit, always-visible mode identity (P2) —
  recommended: two entries ("Add resources", "New notecard") sharing one
  capture engine, with edit-note opening directly into the notecard editor;
  staged flow (capture first, then annotate + route on a confirm step);
  calm persistence messaging (P7); keep: capture-method set, routing
  semantics, upload retry/caching behavior, per-item notes capability,
  drag-drop ingest (the panel's drop path feeds the same capture pipeline).

### 3.4 Notecard card + gallery + fullscreen — `components/notecards/*`

- **Job:** the notecard itself. Card = flip gallery on top, expandable notes
  below. Fullscreen = media carousel LEFT, notes RIGHT (stacks top/bottom on
  phone ≤640px). Gallery = one-large-item flip strip: chevrons, dots (→ "n /
  total" counter past 8), ←/→ keys, swipe with 40px tap-vs-flick threshold,
  wrap-around, per-item enlarge.
- **Today (works, keep):** modal a11y pattern (role=dialog, aria-modal, focus
  in/restore, Esc with nested-layer stopPropagation), sanitized notes render,
  reduced-motion fades, ≥44px chevrons/close, empty states ("This notecard has
  no media." / "No notes on this card yet.").
- **Redesign must deliver:** the **compact tile face** for grid hosts (P3);
  visual hierarchy in fullscreen notes pane (today it's a flat HTML dump —
  spec heading/list/link/image styles against tokens); an explicit "Edit"
  affordance inside fullscreen (today editing requires closing and finding
  the pencil); gallery item REMOVE/REORDER affordances in the editor (today
  gallery is append-only from the composer — manipulation gap the owner
  hit); decide poster behavior (today `gallery[0]` is poster, no override).

### 3.5 Universal preview + live annotation — `components/resources/ResourcePreview.tsx`, `PreviewAnnotation.tsx`

- **Job:** click anything → see it big. Hosts: image lightbox, PDF (via
  same-origin `?raw=1` stream + pdfjs), video, trusted-host iframes, link
  card fallback, notecard split view, nested single-item enlarge.
- **Annotation toolbar (live-only):** Annotate toggle → pen / highlighter /
  eraser, token color swatches (`--ink-900`, `--urgent`, `--done`, `--hl-*`),
  widths 2/4/8, undo/redo, Clear (destructive — `required` tooltip). Ink is
  ephemeral (in-memory hook mode), wiped on close. Keep all of this.
- **Redesign must deliver:** the **link-card fallback as a designed state**
  (P5) — OG thumb + title + description + domain + "Open in new tab", never a
  blank frame; loading/error states for PDF and iframe (spinner, "couldn't
  load — Open original"); annotation discoverability (first-run hint that ink
  is temporary — onboarding tooltip exists, make the wipe-on-close legible).

### 3.6 Rich-text notes editor — `components/rich-text/rich-text-editor.tsx`

- **Job:** the notecard body: formatting (bold/italic/lists/links), inline
  images, safe embeds. Sanitizes on load and emit.
- **Redesign must deliver:** a visible, finite toolbar spec (which formatting
  controls exist and their icons/order); insert-image and insert-link flows
  (today insertion exists but the affordance layout is ad hoc); link editing
  (click an existing link → edit/remove); placeholder copy ("Write the notes
  for this card — formatting, links, and images all work."— keep). Keep the
  sanitizer contract untouched (§5.4).

---

## 4. Element-by-element functional spec

Conventions for every interactive element (binding, from CLAUDE.md §4):
WCAG AA contrast; keyboard reachable; ≥44px touch target on phone/tablet;
non-obvious controls get a dismissible onboarding tooltip (`tooltipId`);
destructive or team-wide controls get `required: true` tooltips (never
dismissible); reduced-motion variants for all animation.

### 4.1 Resources panel

| Element | Function | States / rules |
| --- | --- | --- |
| Header count chip | Total combined resources for scope | Always FULL count (stable across tabs) |
| "+" add button | Opens composer routed to this lesson | Disabled w/ explanatory tooltip when no lesson selected |
| List/Grid toggle | Switches tile grid ↔ dense rows | Persisted per teacher; segmented control w/ tooltips |
| Collapse | Collapses panel to header | Reduced-motion-safe height fade |
| Tabs All/Slides/Handouts/Tools | Category filter (roll-ups: Slides=slides; Handouts=pdf/doc/image; Tools=website/link/youtube) | Decide notecard tab placement (P6/§3.1); empty-state copy per tab |
| Resource tile | Thumbnail + type tag + label; click = open preview | Hover affordance; image fallback glyph per type; uniform size INCLUDING notecard face (P3) |
| Notecard tile face (NEW) | Poster + notes glyph + gallery count; click = fullscreen split | Replaces full NotecardCard in grids |
| Tile "···" overflow | Open / Enlarge / Edit note / Remove | Today a dead stub — implement or drop |
| "New notecard" (NEW) | Opens notecard composer routed to scope | P6; ≥44px; onboarding tooltip |
| Drag handle (rail) | Reorders rail panels | Keep |
| Drop zone | Drag files anywhere on panel → capture pipeline | Visible drop-state overlay |

### 4.2 Section resources (lesson flow)

| Element | Function | States / rules |
| --- | --- | --- |
| Expanded/minimized toggle | 2×2 grid ↔ quick-access list | Persisted per (lesson, section); SSR-safe hydration |
| 2×2 primary grid | First 4 PLAIN resources, slot-indexed pastel fills (spec §4.2 exact hex — keep) | Unfilled slots don't render |
| "More resources" list | Overflow beyond 4 | Rows: icon square (per-type fill), label, open + note actions |
| Notecard strip | Section's notecards as cards/compact rows (redesign per P3) | Order preserved; full card on demand |
| Per-resource note pencil | Opens notecard EDIT for that resource | ≥44px target (P4 fix); tooltip "Add or edit notes…" |
| "+ Add resource" | Opens composer routed to this section | Disabled state w/ tooltip when no handler |
| Open affordances | Tile/row click = preview | Image rows show 54px thumb |

### 4.3 Composer (both entries share this engine)

| Element | Function | States / rules |
| --- | --- | --- |
| Mode identity (NEW) | Header names the job: "Add resources" / "New notecard" / "Edit note — <resource>" | Always visible; edit mode locks routing |
| Capture methods | Upload / Photo / Link / Search + All-tools wall | SOON items visibly disabled w/ tooltip; Card wall = NEW badge |
| Link capture | URL field → OG fetch → preview card w/ `canEmbed` verdict | Spinner; failure = plain link card (never blocks Add) |
| Captured strip | Thumbnails of items to commit; remove per item | In notecard mode = the gallery (ordered, reorderable — NEW) |
| Per-item note (resource mode) | Small rich note per item → item's `body` | Optional; collapsed by default |
| Notes editor (notecard mode) | The card's `body` (rich text) | One editor, prominent |
| Title field | Resource mode: steers single-item label; notecard mode: card label | Falls back to "Notecard" |
| Routing row | Subject → Unit → Lesson → Section | Prefilled from context; locked in edit mode |
| Add button | Commits per mode (N resources / 1 notecard / patch) | "Adding…" while uploading; disabled until valid |
| Upload error strip | Per-file failure + retry | Succeeded uploads cached (never re-upload); dialog stays open |
| Persistence badge (P7 redesign) | Mock mode: quiet "session only" badge | Not a red banner in the flow |
| Close (×/Esc) | Discards uncommitted capture | Blob URLs revoked except committed ones |

### 4.4 Notecard fullscreen + gallery

| Element | Function | States / rules |
| --- | --- | --- |
| Split layout | Media carousel LEFT / notes RIGHT; stacks ≤640px | Keep |
| Carousel stage | Current item via shared ResourceEmbed; click = nested enlarge | `key`-remount per slide (player reset) |
| Chevrons | Prev/next, wrap-around | ≥44px; tooltips; hidden when 1 item |
| Dots / counter | Position indicator; dots ≤8 else "n / total" | Dots clickable, aria-hidden (group label announces) |
| Keyboard / swipe | ←/→ when focused; 40px swipe threshold | Keep |
| Notes pane | Sanitized rich HTML w/ designed typography (NEW) | Empty state copy kept |
| Edit affordance (NEW) | Opens notecard EDIT from fullscreen | ≥44px |
| Close | Esc / backdrop / × (≥44px) | Focus restore to trigger |

### 4.5 Preview + annotation

| Element | Function | States / rules |
| --- | --- | --- |
| Preview body | Per-type render: image / pdf(raw stream) / video / trusted iframe / link card / notecard split | NEVER an unframeable iframe (P5); loading + error states (NEW) |
| Annotate toggle | Shows/hides toolbar + ink layer | Onboarding tooltip explains live-only ink |
| Pen/Highlighter/Eraser | Tool select (ToggleGroup) | Token swatches only; widths 2/4/8 |
| Undo/Redo | Stroke history | Disabled states w/ tooltips |
| Clear | Wipes ink | Destructive — `required` tooltip |
| Nested enlarge | Gallery item → single-item preview (body/gallery stripped — no recursion) | Esc closes inner layer only |

---

## 5. Backend & data contract (the UI's ground truth — unchanged)

### 5.1 Types — `lib/types.ts`

```ts
interface LessonResource {
  type: "slides" | "pdf" | "doc" | "image" | "youtube"
      | "website" | "link" | "notecard";
  label: string;
  url?: string;              // embed src / link / /api/resources/{id}
  provider?: ResourceProvider; // youtube|vimeo|gslides|gdocs|gsheets|gdrive|pdf|image|video|website…
  displayMode?: …; linkText?: …; sizeBytes?; width?; height?;
  thumbnailUrl?: string;     // OG image / poster / generated
  previewTitle?: string; previewDescription?: string;
  resourceId?: string;       // server row id once persisted
  body?: string;             // sanitized rich-text HTML — ANY resource
  gallery?: LessonResource[]; // ordered media; [0]=poster; FLAT
}
```

Helpers (`lib/notecards.ts`, pure): `isNotecard`, `hasNotes`,
`galleryItems` (explicit gallery wins; single `url` resource = 1-item
gallery; notes-only = empty), `galleryCount`, `isStack`, `notecardPoster`,
`makeNotecard`. The UI reads ONLY through these.

### 5.2 Persistence

- Mock mode (`isPlannerSupabaseConfigured()` false — requires BOTH env URL
  and `NEXT_PUBLIC_PLANNER_USE_SUPABASE=1` to be backend): all client-side;
  uploads = `blob:`/`data:` URLs; survives only the session (P7 messaging).
- Backend: `body`/`gallery` serialize into `lesson_sections.resources` /
  `lessons.resources` JSONB (RLS: read team/master + own personal; write own
  → forking model inherited). Uploaded files: presign → PUT R2 → finalize
  (server-side HEAD sets verified `mime_type`); served via
  `/api/resources/[id]` (302 signed URL, or `?raw=1` same-origin stream for
  pdf.js). DELETE drops the row; R2 object cleanup = nightly sweep
  (Phase 1B task, not yet implemented).
- OG metadata: `GET /api/og-preview?url=…` → `{ title?, description?,
  thumbnailUrl?, domain, canEmbed }` — SSRF-guarded (public-IP DNS checks on
  every redirect hop, 5s timeout, 512KB cap), `thumbnailUrl` validated
  absolute http(s). **`canEmbed:false` ⇒ link card, never iframe** (P5).
- Annotations: boards → per-user localStorage; previews → ephemeral hook
  mode (`useBoardAnnotations({ ephemeral: true })`) — in-memory only.

### 5.3 CSP frame allowlist (authoritative, `next.config.ts:51`)

`'self'`, `accounts.google.com/gsi/`, `www.youtube-nocookie.com`,
`www.youtube.com`, `player.vimeo.com`, `docs.google.com`,
`drive.google.com`. The renderer's "can I iframe this?" decision MUST agree
with this list (single shared predicate — P5 fix).

### 5.4 Sanitizer (`lib/sanitize-html.ts`)

DOMPurify (linkedom on server), strict tag/attr allowlists;
`SAFE_IMG_SRC` = http(s) / blob / data:image base64 / root-relative;
iframes only from trusted hosts (YouTube/Vimeo/Google); fail-closed. Every
`dangerouslySetInnerHTML` of resource HTML goes through it (load + emit in
the editor). The redesign adds NO new raw-HTML sinks.

## 6. Design-system rules (binding for all artboards)

Tokens only (no hex outside spec-cited exceptions; no px font sizes outside
house patterns) — `app/tokens.css`; subject colors via `.cp-subj.*` /
`useSubjectColor` only; Tailwind for layout/spacing only. Responsive tiers
360–480 / 600–900 / 1024–1920, no document-level horizontal scroll, sticky
chrome ≤~30% viewport height on phone. Onboarding tooltips per CLAUDE.md §4
(dismissible `tooltipId`; `required` for destructive/team-wide; none on
self-evident text buttons). `prefers-reduced-motion` variants. Motion:
~200ms expand / ~250ms slide; no bounce/parallax/confetti. Modals: dialog
semantics + focus restore (house pattern; app-wide focus-trap is a known
tracked gap — don't solve it per-surface).

## 7. Acceptance criteria for the redesign

1. No resource ever renders twice in any aggregation surface (P1).
2. A first-time teacher can, without instruction: add a file/link to a
   section; create a notecard with 2 media + notes; add a note to an existing
   resource; flip a gallery; enlarge anything; annotate an enlarged image and
   understand the ink is temporary (P2/P6).
3. Notecards sit in grids without breaking tile rhythm; full card appears
   only in dedicated strips/fullscreen (P3).
4. Every notecard affordance ≥44px on phone/tablet (P4).
5. A URL that refuses framing renders a designed link card — zero blank
   frames (P5).
6. Mock-mode persistence messaging is calm and out of the critical path (P7).
7. Gallery items can be removed/reordered when editing a notecard (§3.4).
8. All states specced: empty, loading, upload-error+retry, disabled (with
   why-tooltips), session-only.
9. Everything in §2 (frozen constraints) untouched; §5 contract respected;
   §6 rules pass at all three tiers.

## 8. File map (current implementation, for reference while designing)

| Path | What it is |
| --- | --- |
| `components/daily/ResourcesPanel.tsx` | Right-rail panel (aggregation, tabs, grid/list, drop ingest) |
| `components/daily/ResourceComposer.tsx` | The 3-mode add/edit dialog (P2) |
| `components/daily/AllToolsMenu.tsx` | Expanding capture-tool wall |
| `components/lesson-flow/section-resources.tsx` | Section 2×2 grid + lists + notecard strip |
| `components/lesson-flow/resource-tile.tsx` | Tile faces (incl. PDF render-on-view poster) |
| `components/notecards/NotecardCard.tsx` / `Gallery.tsx` / `NotecardFullscreen.tsx` | Notecard family |
| `components/resources/ResourcePreview.tsx` | Universal enlarge modal (routes notecards to split view) |
| `components/resources/PreviewAnnotation.tsx` | Live-only annotation toolbar/layer |
| `components/resources/ResourceEmbed.tsx` | Shared per-type media renderer |
| `components/rich-text/rich-text-editor.tsx` | Notes editor (sanitize on load+emit) |
| `lib/notecards.ts` / `lib/types.ts` | Frozen model + helpers |
| `lib/sanitize-html.ts` | Sanitizer boundary |
| `lib/use-board-annotations.ts` | Annotation state (board + ephemeral modes) |
| `app/api/resources/*`, `app/api/og-preview/route.ts` | Upload/serve/OG endpoints |
| `docs/2026-06-11 notecard-resource-design-audit.md` | Full design audit this brief builds on |
| `docs/2026-06-08 notecard-resource-system ultraplan.md` | Original frozen build plan |

## 9. Screenshots (current shipped state, mock mode, 1440×900)

In `docs/screenshots/resource-notecard-redesign/`:

| File | Shows |
| --- | --- |
| `01-daily-desktop.png` | Daily view: lesson list, section RESOURCES grid (center), Resources panel (right rail) |
| `03-composer-resource-mode.png` | Composer in resource mode (capture row, routing, session-only banner) |
| `04-composer-all-tools.png` | "All tools" capture wall (Card wall NEW, SOON stubs) |
| `05-composer-notecard-edit.png` | Notecard EDIT mode on an existing resource (notes editor + locked routing) |
| `06-composer-notes-typed.png` | Notes typed in the rich-text editor before commit |
| `07-after-commit-panel.png` | Committed notecard rendering in BOTH the center strip and the panel — the grid-rhythm break (P3) is visible |

(Captured by driving the real app; the duplicate-tiles bug (P1), the 22×22px
targets (P4), and the CSP frame block (P5) were verified via DOM probe and
console during the same session.)
