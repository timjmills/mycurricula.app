# Curriculum Ingestion Engine — Plan

> **Status:** Proposal for review (v1). Standalone feature plan, separate from the v2 appearance
> rebuild. Authored from a direct-search research pass (the `/deep-research` harness errored mid-run;
> facts below were gathered + verified directly — pricing is **fast-moving**, re-verify at build time).
>
> **What this is:** the design for letting a teacher **upload their existing curriculum** in chaotic
> mixed formats (PDF / DOCX / XLSX / scans / zips) and have the app ingest it into an interactive plan
> **while preserving their own structure, formatting, and links as much as possible** — with a
> human-in-the-loop review so nothing wrong lands silently.
>
> **Umbrella + sequencing:** this is **Pillar ① of `docs/AI-PLATFORM-PLAN.md`** (tiers, pricing,
> shared AI core, the four pillars, retention). Per the owner, build is **gated**: (1) the new v2
> website ships → (2) the Supabase data streams work → (3) then build this. Researched now, implemented
> in step 3.

---

## 0. Locked decisions (from the product owner)

| # | Decision | Implication |
|---|---|---|
| D1 | **Adaptive canonical spine, renameable** (except Workspace) | A fixed *set of levels*, but every level's **label** is user-renameable and its membership is **open** (not a closed enum). |
| D2 | **Coded into our own backend** (not a no-code tool) | Pipeline lives in our Next.js/Workers + Supabase stack via APIs. Full control of schema, RLS, forking, idempotency, tests. |
| D3 | **Human-in-the-loop, sample-first** | Parse a small **sample** → ask **clarifying structure/naming questions** → user **reviews a couple of mapped lessons** → only then the **full run**. Gates both accuracy *and* cost. |
| D4 | **Preserve fidelity** — live links, formatting (bold/bullets/numbering/headings, and *semantically* highlight/size), structure | File-type **routing**: born-digital files extracted richly (links + styles survive); scans go through a vision parser. Store as rich-text. |
| D5 | **Auto-detect lesson parts/phases** — *as suggestions* | LLM classifies content into phases (warm-up / I-do / we-do / practice / assessment…), surfaced **with confidence** in the review step, never silently committed. |
| D6 | **Scheduling-mode toggle per curriculum: dated vs undated** | Day/Week/Year need dated placement; many uploads are undated scope-and-sequence. Make calendar placement **nullable** and ask at import. |
| D7 | **Page-count quota + overage pricing** | Meter total source pages per curriculum/subject/workbook per period; above the cap, charge a multiplier (e.g. 2×) or a higher tier. Cost is real and per-page. |

### Recommended hierarchy (the spine)

```
Workspace            (FIXED level — tenant/org; e.g. "Awsaj Elementary", "Tutoring Math")
└─ Workbook          (renameable; e.g. "Grade 9 Algebra", "Grade 5")        ── carries grade
   └─ Subject        (renameable + OPEN; e.g. "Math", "English")  a.k.a. Curriculum / Program
      └─ Unit        (renameable; e.g. "Adding")
         └─ Lesson   (renameable; e.g. "Adding to 10")
            └─ Phase  (renameable; parts of a lesson)
```

- **Workspace is the only fixed level** (it's the multi-tenant boundary that auth/RLS/forking hang off).
- Every level below it: the *concept* (its position in the spine) is fixed so the app's views, forking,
  scheduling, and templates can rely on it — but the **display label is user-renameable** and the
  **set of instances is open** (no closed `SubjectId` enum anymore).
- **Grade** rides as an attribute (Workbook + Subject level), feeding the existing grade-scoping.

---

## 1. Why this is a real schema evolution (current → target)

Today's model (`lib/types.ts`) is deliberately rigid where this feature needs flex:

| Today | Target |
|---|---|
| `SubjectId` is a **closed enum** (8 subjects) | **Open** Subject rows per Workspace; arbitrary names |
| Spine is fixed **2 levels** (Unit → Lesson) | Spine is **Workspace→Workbook→Subject→Unit→Lesson→Phase**, with Workbook + Subject + Phase **new** |
| `week`/day-index are **flat fields on `Lesson`** | Placement is **nullable** (`unscheduled`) + a per-curriculum **scheduling mode** |
| Lesson phases/sections are **store-owned, transient** | **Phase** is a first-class, persisted, ordered child of Lesson |
| Labels via `LabelsProvider`/`InstanceLabelsProvider` (already renameable!) | Extend the same rename mechanism to the new levels |
| Forking (`isPersonal`, `masterSnapshot`), grade-scoping, configurable school-week | **Preserved** — must ride on the new spine unchanged |

> The good news: the app **already** has renameable level captions (`LabelsProvider`) and a
> roadmap keystone for **"nullable unscheduled lesson date."** This plan extends those, it doesn't
> fight them.

### 1.1 Postgres modeling — recommended: **typed canonical levels** (not a generic tree)

The spine is **fixed-depth and typed**, so model it as **one table per level** (or one `nodes` table
with a `level` enum + FK to parent), NOT as a generic adjacency/closure tree and NOT as EAV.

- **Recommended:** typed tables/rows — `workspace`, `workbook`, `subject`, `unit`, `lesson`, `phase`,
  each with `parent_id`, an `order_index` (fractional or integer for reordering), a `title`
  (rich-text), a `label_override` (the renamed level caption), and JSONB for level-specific extras.
- **Why not closure-table / nested-set / `ltree`:** those shine for *arbitrary-depth* trees. Our depth
  is **fixed and small (6)**, and the app's queries are level-specific ("all lessons in this unit",
  "this week's lessons"). Typed levels give simpler queries, better FKs/constraints, and trivial
  RLS — without the write-amplification of closure tables or the rebalancing pain of nested sets.
- **Ordering & reorder:** `order_index` as a fractional rank (or a gap-integer) so a drag-reorder is a
  single-row update. Materialized `path` column optional, only if a breadcrumb/whole-subtree read
  becomes hot.
- **Avoid EAV over-genericity** — the failure mode of "model anything" schemas: unqueryable, untyped,
  no constraints. We keep the spine typed; flexibility lives in **labels + optional levels + JSONB
  extras**, not in a generic key-value soup.
- **Standards alignment** (for interchange + future import/export): the spine mirrors
  **1EdTech Common Cartridge** (organizations → items) and **Ed-Fi / OneRoster** course/section
  structures; assessments map to **QTI**; resource metadata to **LRMI/Dublin Core**. We don't have to
  *implement* these, but shaping our JSON near them keeps a future export cheap.

### 1.2 Scheduling mode (D6) — dated vs undated

- Each **curriculum/workbook** carries `scheduling_mode ∈ {dated, undated}`.
- **`undated`** → lessons have `week = null`, `day = null`; they live as an ordered Subject→Unit→Lesson
  **outline** (scope & sequence). Day/Week/Year views simply don't show them; the **Subject/Unit
  outline** view does.
- **`dated`** → lessons get placement, either (a) **detected** from the source (if it had a
  week-by-week schedule) or (b) **auto-distributed** across the configured school-week/academic-year,
  or (c) hand-placed.
- **Undated → dated is a later action** (drag onto the calendar, or "auto-schedule this unit across
  weeks N…M"). This is the same "unscheduled lesson" keystone the catch-up / library features use.
- **Ask at import** (part of the clarify step): *"Do you want this placed on a Day/Week/Year calendar,
  or kept as an undated outline you'll schedule later?"*

### 1.3 Fidelity model (D4) — links & formatting

- **Store lesson/phase bodies as rich-text** (the app already stores rich-text HTML in `Lesson.title`).
  Normalize to a **constrained, semantic** rich-text: headings, bold/italic, ordered/unordered lists,
  a **highlight** mark, links — rather than pixel-exact fonts/colors (those render inconsistently under
  the theme engine and don't survive scans). Text size → heading levels; highlight → a mark; color →
  dropped or mapped to a semantic emphasis.
- **Live links:** born-digital files embed hyperlinks in their file structure (PDF link annotations,
  DOCX relationship XML, XLSX hyperlinks). **Extract links directly from born-digital files** — a pure
  vision/OCR pass *sees rendered text and can drop the link target.* Bind each link to the text span it
  belongs to (the resource-link-to-lesson tie the product cares about). Detected links become
  `LessonResource` rows (the existing type) where appropriate.
- **Auto-detected phases (D5):** the LLM segments a lesson body into ordered phases with a
  `confidence` per phase; low-confidence segments are flagged in the review UI for the teacher to
  accept/merge/relabel. Never auto-commit a low-confidence structural guess.

---

## 2. The ingestion engine

A coded pipeline (D2) with **file-type routing** as the first decision, because fidelity (D4) depends
on it.

```
        upload (PDF / DOCX / XLSX / scan / zip)
                 │
        ┌────────┴─────────┐  file-type ROUTING + quota PRE-CHECK (§5)
        │                  │
  born-digital        scanned / image
  (DOCX/XLSX/          (or "extract returned
   digital PDF)         no text layer")
        │                  │
  DIRECT rich          LAYOUT-AWARE
  extraction           VISION PARSER
  (links+styles        (LlamaParse /
   survive)             Mistral OCR /
        │               Azure DI)
        └────────┬─────────┘
                 ▼
     normalized rich Markdown/HTML + per-span links + tables
                 │
                 ▼
   LLM SCHEMA MAPPING (Claude Structured Outputs, strict JSON Schema)
     → canonical spine JSON + per-field confidence + phase segmentation
                 │
                 ▼
   VALIDATE + REPAIR loop (JSON-Schema + DB-constraint checks → re-prompt on fail)
                 │
                 ▼
   STAGING rows (not yet in the live plan) + review payload
                 │
        sample-first HITL (§3): clarify → review sample → confirm
                 │
                 ▼
   COMMIT into the user's plan (respects forking + grade-scoping + scheduling mode)
```

### 2.1 Parse layer (Step 1 — layout extraction)

- **Born-digital route (preferred when possible — best fidelity, near-zero cost):**
  - **DOCX** → extract to HTML preserving headings/lists/bold/links (e.g. `mammoth`), keeping the
    relationship-XML hyperlinks.
  - **XLSX** → `SheetJS` (already in the stack per CLAUDE.md) for cells, hyperlinks, and (where needed)
    formulas; lesson schedules are very often spreadsheets.
  - **Digital PDF** → text + **link annotations** extraction; fall back to the vision parser if there's
    no real text layer.
- **Vision route (scans / image-only / complex layout):** a layout-aware parser. **Recommendation:**
  - **Primary: LlamaParse** — strong multi-page tables + Markdown, developer-friendly, credit-tiered
    (cost-effective ≈ a few credits/page; agentic tiers cost more — use **auto/cost-effective** by
    default, escalate only on hard pages). [1][2]
  - **Cheap fallback / high-volume: Mistral OCR** — ~**$1–2 per 1,000 pages**, by far the cheapest for
    clean OCR. [3]
  - **Enterprise/Azure-native option: Azure AI Document Intelligence** — ~**$10 per 1,000 pages** for
    forms/tables, gives style/span metadata useful for formatting. [3]
  - **Self-host option (no per-page cost): Marker / Docling** — for cost control at scale or
    privacy-sensitive uploads. [3]
  - *Avoid as a default:* **AWS Textract** forms/tables (~$65/1,000 pages) unless already AWS-native. [3]
- **Preprocessing:** unzip; route by detected type; split large PDFs into page ranges for parallel
  parse + progress; route tables/images to the parser that handles them; record **page count** for
  metering (§5) *before* the expensive full parse.

### 2.2 LLM mapping layer (Step 2 — structure into our schema)

- **Use Claude Structured Outputs** (GA 2026): pass our canonical-spine **JSON Schema**; constrained
  decoding **compiles the schema into a grammar and restricts token generation**, so the output is
  schema-valid by construction (not "please return JSON"). Use `strict` tool use / `output_config`
  format. [4][5]
- **Validate + repair loop:** after the (already schema-valid) output, run **app-level checks**
  (DB constraints, referential sanity, scheduling-mode rules) and **re-prompt with the specific error**
  on failure, bounded retries. Schema-valid ≠ semantically valid — keep this loop.
- **Chunking vs long-context:** prefer **chunk-with-stitch** for a full curriculum (parse → segment by
  detected top-level boundaries → map per Subject/Unit → stitch), over one giant long-context pass —
  cheaper, more reliable, and parallelizable on the queue. Long-context (Gemini-class) is a fallback
  for a single document whose structure can't be safely split.
- **Per-field confidence (drives HITL):** have the model emit a confidence per mapped field/phase
  (and "ambiguous" flags + the source span it used). These power the review UI's highlight-what-to-check.
- **Keep links tied to lessons:** carry the per-span links from the parse layer through mapping so a
  resource link lands on the *right* lesson/phase, not floating at the document level.

### 2.3 Async / queue architecture (CF Workers + Supabase)

Ingestion is long-running → never inline in a request.
- **Job queue:** a Supabase table (`ingestion_jobs`) as the source of truth + **Cloudflare Queues**
  (or Workflows / a Durable Object) for execution; stages = `uploaded → estimated → sampled →
  awaiting_clarify → mapping → staged → committed` (+ `failed`).
- **Progress:** persist stage + percent; the UI polls or subscribes via Supabase Realtime.
- **Idempotency:** content-hash each source file; a re-run with the same hash + same mapping config is a
  no-op / resumable, so retries and partial re-imports don't duplicate rows.
- **Retries:** per-stage bounded retries with backoff; a parser/LLM failure fails *that file*, not the
  whole job (mirror the workflow lesson we already learned: isolate unit failures).
- **Webhooks/polling:** LlamaParse etc. are async — store the external job id, reconcile via webhook or
  poll.

---

## 3. Product / website structure (the UX)

A dedicated **Import** flow, landing imports in **staging** before they touch the live plan.

1. **Upload** (`/import` or Settings → Import Curriculum): drag files / zip; pick the target
   **Workspace → Workbook → Subject** (or "create new"); see the **page-count estimate + quota**
   (§5) *before* spending.
2. **Sample parse** (cheap): the engine parses a representative slice and proposes a structure.
3. **Clarify** (the questions step, D3): the engine asks only what it's unsure about —
   *"Is 'Module' a Unit or a sub-unit? Is 'Week 1' a level or a placement? Is this a Subject or a
   Workbook? Dated or undated (D6)? Which level are these labels?"* — the teacher answers once. Answers
   become **mapping rules** applied to the full run.
4. **Review sample**: a couple of **fully-mapped lessons** shown as they'll appear in-app, with
   **confidence highlights** + inline correction (rename a level, re-nest, merge phases, fix a link,
   change placement). This is a **diff/preview**, not a commit.
5. **Full run**: only after confirmation — the expensive parse + map of everything, using the confirmed
   rules. Progress bar; user can leave and come back.
6. **Commit**: staged structure lands in the plan, respecting **forking** (imports default to the
   teacher's **Personal** space unless they're in Master/Team mode), **grade-scoping**, and the
   **scheduling mode**. Partial re-import + re-run-on-correction supported via idempotent staging.

> Trust pattern: **review-before-commit + confidence highlights + sample-first** is exactly how mature
> import flows earn trust on messy data — never silently mutate the user's real plan.

---

## 4. Testing & evaluation

Ingestion accuracy must be **measurable and regression-proof** — not vibes.

- **Golden corpus:** assemble a labeled set of **diverse real curricula** — multi-column PDFs,
  spreadsheet schedules, scans, handwritten notes, a zip dump, multiple subjects/grades/languages,
  and adversarial messes. Each with a hand-built **expected canonical JSON**.
- **Field-level metrics:** precision/recall/F1 **per field** (title, objective, standards, links,
  placement), **hierarchy/structure correctness** (did Units/Lessons/Phases nest right?), and
  **table-cell accuracy** for schedules. Track **link-preservation rate** and **phase-detection
  accuracy** explicitly (the two riskiest).
- **Schema-validation gate:** every output must pass the JSON Schema + DB constraints in CI; a schema
  failure is a hard fail.
- **LLM-as-judge + human eval:** an automated judge for fuzzy fields (did this objective capture the
  source?), backed by a periodic human-eval sample. The **HITL corrections from real users are the
  best ongoing labeled data** — pipe them back into the corpus.
- **Eval harness:** a promptfoo/braintrust-style harness running the corpus on every prompt/model
  change; block regressions before they ship.
- **Drift monitoring in prod:** track confidence distributions, repair-loop rate, correction rate per
  field, and parser fallback rate; alert on drift after a model/prompt/vendor change.
- **Adversarial coverage:** deliberately include the formats that break parsers (rotated scans,
  merged table cells, multi-language, footnotes, images-of-tables) so we know the failure surface.

---

## 5. Cost, metering & pricing (D7)

### 5.1 Real per-curriculum cost (order-of-magnitude; **re-verify — fast-moving**)
- **Parse:** $0.001–0.01/page typical (Mistral OCR cheapest ~$0.001–0.002; LlamaParse cost-effective
  low-single-digit cents; Azure ~$0.01; born-digital ≈ free). [1][3]
- **LLM map:** dominated by input tokens of the parsed text; a curriculum page → a few hundred to ~1–2k
  tokens. With chunk-and-stitch on a current Claude model, **a few cents per ~10 pages** is a reasonable
  planning figure. **A typical ~50–150 page curriculum ≈ tens of cents to low single dollars all-in.**
- → A **page-count quota** is the right meter: pages are the dominant, user-legible cost driver, and we
  can **estimate pages before spending** (§2.1).

### 5.2 Page-quota + overage model
- **Quota:** a cap on **total source pages per Workbook/Subject per billing period** (e.g. plan
  includes *N* pages/month).
- **Overage:** above the cap, either **2× per-page** (the owner's suggestion) or a **tiered top-up**
  (buy a page pack). Recommend tiered packs for predictability + a hard ceiling to prevent bill shock.
- **Fair page-counting across formats:** PDF = pages; **DOCX ≈ chars/blocks → page-equivalents**
  (e.g. ~3k chars or ~1 rendered page); **XLSX ≈ used-range rows/cols → page-equivalents** (a giant
  sheet isn't "1 page"). Define a published **page-equivalent** rule so it's transparent.
- **Enforce pre-parse:** estimate page-equivalents at upload (cheap: count PDF pages, DOCX size, XLSX
  used range) and **block/warn before spending** the parser/LLM budget. The **sample-first flow (D3)
  spends almost nothing** until the user confirms — so the big page charge only lands post-confirmation.
- **Abuse prevention:** max upload size + max page-equivalents per job; reject/queue oversized uploads;
  rate-limit; dedupe by content hash so re-uploads don't double-bill.
- **Comparable products** meter by per-page, per-doc, or **credits/tiers** — credits map cleanly to our
  page-equivalent quota.

### 5.3 Unit economics (set the cap from this)
If all-in cost ≈ **$0.01–0.03 per page-equivalent** (vision parse + LLM map; born-digital cheaper),
then a **300-page/month** included quota costs us ~**$3–9/curriculum/month** in COGS — set the plan
price + cap so the included quota stays a small fraction of subscription revenue, and the overage
multiplier (2×) comfortably covers marginal cost + margin. **Re-derive with live vendor pricing at
build time.**

---

## 6. How it preserves the product invariants

- **Forking:** imports default to the teacher's **Personal** space; committing to **Master/Team**
  requires the explicit Master toggle (no new confirm dialogs). An import is just a bulk create on the
  fork model.
- **Grade-scoping:** Workbook/Subject carry grade; imported rows are grade-scoped from the wizard — no
  Grade-5 assumptions.
- **Configurable school-week / rotating schedule:** `dated` distribution uses the existing
  school-week/academic-year config; never hard-code a 5-day week.
- **Color carries meaning:** imported subjects get a subject-color slug via the existing palette path;
  no invented decorative colors.

---

## 7. Build roadmap (phased)

1. **Schema foundation** — additive migration: open Subject + new Workbook/Phase levels; nullable
   placement (`unscheduled`) + `scheduling_mode`; rich-text + per-span links; extend the rename
   mechanism. Keep current views working.
2. **Engine core (no UI)** — file-type router; born-digital extractors; one vision parser; Claude
   structured-output mapping + validate/repair; staging tables; the golden corpus + eval harness (§4)
   **from day one**.
3. **Import UX** — upload → estimate/quota → sample → clarify → review → full run → commit; progress via
   the queue; idempotent staging.
4. **Metering + pricing** — page-equivalent counting, pre-parse estimate/enforcement, overage.
5. **Hardening** — adversarial corpus, drift monitoring, partial re-import, scale + abuse limits.

---

## 8. Open decisions / risks

- **Hierarchy parse confirmation** — confirm the exact 6-level spine + which attributes live at
  Workbook vs Subject (grade, language, term structure).
- **Phase taxonomy** — is there a canonical phase vocabulary (warm-up/I-do/we-do/practice/assessment),
  or fully user-defined? Affects auto-detection prompts.
- **Highlight/size/color fidelity** — confirm "semantic normalization" is acceptable vs. demand for
  pixel-exact (the latter is lossy on scans and fights the theme engine).
- **Vendor choice** — primary parser (LlamaParse) vs. cheap default (Mistral OCR) vs. self-host
  (Marker/Docling) is a cost/accuracy/privacy call; pricing is **fast-moving** — re-verify.
- **Where imports land by default** — Personal vs a dedicated "imported, unconfirmed" staging area in
  the app, before promotion.

---

### Sources (verified directly; pricing fast-moving — re-verify at build)
- [1] LlamaIndex / LlamaParse pricing + V2 — https://www.llamaindex.ai/pricing ·
  https://www.llamaindex.ai/blog/introducing-llamaparse-v2-simpler-better-cheaper
- [2] LlamaParse auto/cost modes — https://www.llamaindex.ai/blog/optimize-parsing-costs-with-llamaparse-auto-mode
- [3] Document-AI cost comparison 2026 (Mistral OCR / Azure DI / AWS Textract / Marker) —
  https://aiproductivity.ai/blog/document-ai-cost-comparison/ ·
  https://azure.microsoft.com/en-us/pricing/details/document-intelligence/
- [4] Anthropic Claude **Structured Outputs** (JSON Schema, constrained decoding, strict tool use) —
  https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- [5] Structured-output patterns — https://towardsdatascience.com/hands-on-with-anthropics-new-structured-output-capabilities/
- Standards referenced: 1EdTech Common Cartridge / OneRoster / LTI / QTI; Ed-Fi; Dublin Core / LRMI.
