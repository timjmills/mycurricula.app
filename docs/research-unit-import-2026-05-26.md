# Unit import — research + plan

2026-05-26 · Lane V (research only) · branch `schedule-and-auth-5.24`

User intent: "import units from these can be imported from excel, sheets, google
docs, word documents, or copy and pasted too." Clarified 2026-05-25: output is
**units AND lessons (with titles)** — a nested hierarchy, not a flat list.

---

## Executive summary

- **Recommended Phase 1A scope:** **paste (tab-separated / Markdown table) + XLSX
  upload**. Together these cover ~95% of teacher-friendly input and ship in roughly
  **6–9 hours total** with one third-party dep (`xlsx`/SheetJS, ~250 KB gzipped, dynamic-
  imported so it doesn't hit first paint).
- **Phase 1B deferral:** **.docx** via `mammoth` (~150 KB, table-only extraction).
  Pure paste/XLSX already covers Word users who can copy a Word table.
- **Phase 2 deferral:** **Google Sheets** + **Google Docs** native integrations.
  Both require a real Google Cloud project, OAuth consent screen, scope review, and
  client-side token plumbing the prototype doesn't have yet — multi-day effort and a
  hard dependency on real auth, which is itself unfinished (`@supabase/ssr` exists,
  no Google API client). Workaround for Phase 1A users: "File → Download → .xlsx"
  from Sheets, or copy/paste from a Doc table.
- **Total Phase 1A effort:** ~8 hours of focused work across 3 lanes (see breakdown
  at the bottom).

---

## Data shape (nested)

The import pipeline should normalize every source into one canonical structure
**before** handing rows to Lane AB's `useCustomUnits()`. This isolates the parser
work from persistence:

```ts
// lib/import-units-types.ts (new in the follow-up wave)

export interface ImportedLesson {
  /** Required. Lesson card title. */
  title: string;
  /** Optional. If absent, importer leaves empty — teacher fills in later. */
  objective?: string;
  /** Optional. Free-text standards (CCSS code or label); split by comma. */
  standards?: string[];
  /** Optional. "1", "2.3", etc. — used for source-order sorting only. */
  sourceOrder?: number;
}

export interface ImportedUnit {
  /** Required. Display name, e.g. "Unit 3 · Fractions on a Number Line". */
  name: string;
  /** Required. One of the 8 SubjectIds — matched case-insensitive, fuzzy. */
  subject: SubjectId;
  /** Optional. Free text — "Wk 9–14". If absent, derived from start/end. */
  weeks?: string;
  /** Optional. ISO date strings. */
  startDate?: string;
  endDate?: string;
  /** Optional. Free-text label — "Unit of Study", "Unit of Inquiry". */
  unitType?: string;
  /** Nested child lessons — empty array is valid (unit with no lessons yet). */
  lessons: ImportedLesson[];
}

export interface ImportResult {
  units: ImportedUnit[];
  /** Non-fatal warnings — unknown subject, blank title row skipped, etc. */
  warnings: Array<{ row: number; message: string }>;
  /** Fatal errors that aborted parse — missing required column, etc. */
  errors: Array<{ row: number; message: string }>;
}
```

Why nested rather than a flat-rows-with-unit-id approach: teachers think in units;
forcing them to repeat a unit name on every lesson row is the #1 source of import
errors in every product I've seen do this. Make the **format** flat-with-grouping
(see the paste sample below), but normalize **into** a nested shape immediately.

---

## Per-format analysis

### Excel (.xlsx)

- **Library:** [`xlsx`](https://www.npmjs.com/package/xlsx) (SheetJS Community
  Edition, MIT). ~250 KB gzipped. Browser-safe, zero deps, dynamic-importable so
  it never lands in the planner-route bundle.
- **Approach:** teacher uploads a `.xlsx` file via a hidden `<input type="file">`.
  We read it with `XLSX.read(arrayBuffer, { type: "array" })` and use
  `XLSX.utils.sheet_to_json(sheet, { header: 1 })` to get a 2D array. We expect
  a known column layout (or we sniff the header row) and group by unit-name
  changes (or by a "kind" column = "unit" | "lesson").
- **Recommended column layout (Phase 1A):**
  | Kind | Subject | Unit Name | Weeks | Lesson Title | Objective | Standards |
  |---|---|---|---|---|---|---|
  | unit | math | Fractions on a Number Line | Wk 9–14 | | | |
  | lesson | math | Fractions on a Number Line | | Equal parts intro | I can split a whole into equal parts | 5.NF.1 |
  | lesson | math | Fractions on a Number Line | | Number-line tenths | I can plot fractions on a number line | 5.NF.3 |
  | unit | reading | Realistic Fiction | Wk 7–12 | | | |
  | lesson | reading | Realistic Fiction | | Character motivations | I can infer why a character acts | RL.5.3 |

  This format works identically for paste (TSV) and for XLSX. One mental model for
  both = less docs, fewer support tickets.
- **Edge cases to handle:**
  - Multiple sheets — only parse the first sheet, surface a warning if there are
    others ("we only imported 'Sheet1' — re-upload with your data on the first
    tab to import the rest").
  - Merged cells — `xlsx` returns the value on the top-left of the merge, blanks
    on the others. We must forward-fill unit-name columns to recover the merge.
  - Number-formatted week cells — coerce to string before pattern-matching.
- **Effort:** **3 hours** (parser + 1 upload UI + 4 unit tests on fixture sheets).
- **Recommended:** **yes, Phase 1A.**

### Google Sheets

- **Library options:**
  1. Google Sheets API v4 via REST + Google Identity Services for OAuth.
  2. `googleapis` npm package (server-side; doesn't fit our client-only model
     unless we add a Next.js route handler).
- **Honest OAuth cost:**
  - New Google Cloud project (10 min).
  - Enable Sheets API + Drive API (5 min).
  - Configure OAuth consent screen, choose scopes (`drive.file` is the smallest
    that works — gives access only to files the user explicitly picks via
    the Google Picker UI). For external apps, scope review = **~3 business days**
    of Google review unless you stay in unverified test-user mode (≤100 testers).
  - Add client ID + secret to Cloudflare Workers env (the worker bundle can't
    use Google's official Node client cleanly — needs the REST flow).
  - Build the Picker integration (it's a separate JS SDK, not Sheets API).
  - Token refresh / consent revocation handling.
- **Approach:** if pursued, the cleanest UX is the Google Picker → user picks a
  sheet → we fetch the sheet via the Sheets API → run it through the same
  XLSX-row parser. ~80% of the code is auth scaffolding, not parsing.
- **Effort:** **2–3 days** of real work plus calendar time for Google's
  verification queue if we ever leave testing.
- **Recommended:** **defer to Phase 2.** Phase 1A workaround in the import-modal
  copy: _"Importing from Google Sheets? File → Download → Microsoft Excel
  (.xlsx), then upload here."_

### Google Docs

- **Same OAuth cost as Sheets** (Docs API + Drive API, same Picker).
- **Worse parse story:** Docs returns a structured-document JSON tree that mixes
  paragraphs, tables, lists, headings. Getting clean unit/lesson rows out of free
  prose is fuzzy — we'd basically demand the teacher format the doc as a single
  table, at which point Sheets / paste / XLSX are all better-fit tools.
- **If a teacher does have units in a Doc**, copy-pasting the table cells into
  our paste-mode importer works today (browsers serialize a Google Docs table to
  tab-separated text on copy — verified by manual test).
- **Effort:** **3+ days** for an integration that adds little over paste.
- **Recommended:** **defer to Phase 2 at the earliest. Likely never** — paste
  covers it.

### Word (.docx)

- **Library:** [`mammoth`](https://www.npmjs.com/package/mammoth) (~150 KB
  gzipped, MIT, pure JS, browser-safe). Extracts paragraphs, tables, headings as
  HTML or raw text. It does **not** preserve Word's hierarchical numbered-list
  semantics reliably.
- **Approach:** require teacher to format units + lessons as a **table** with our
  standard 7 columns (same layout as XLSX). `mammoth.convertToHtml()` → parse
  the resulting `<table>` → reuse the row-pipeline from XLSX.
- **Honest assessment:** parsing prose Word docs ("Unit 3: Fractions" headings +
  bullet lists of lessons underneath) is **fuzzy and error-prone** — we'd need
  heuristics for heading-level detection, list-vs-paragraph, and bullet
  nesting. Every fuzzy parser produces support tickets. **Table-only** is the
  honest constraint.
- **Effort:** **3 hours** for table-only `.docx` (mammoth + reuse the row
  pipeline). Add another **4–6 hours** if we want fuzzy prose parsing — not
  recommended.
- **Recommended:** **defer to Phase 1B.** Teacher workaround for Phase 1A:
  "Copy the table cells out of Word and paste into the Paste tab."

### Paste

- **Library:** none — `navigator.clipboard.readText()` or a `<textarea onPaste>`,
  then split on `\n` and `\t`.
- **Format support (in priority order):**
  1. **TSV (tab-separated)** — what every spreadsheet program puts on the
     clipboard when you copy a range. Zero teacher effort.
  2. **Markdown table** — `| col | col |` rows. Easy to parse, easy for users
     who don't use Excel/Sheets to write.
  3. **CSV** — comma-separated. Trickier because lesson titles and objectives
     have commas in them; require quoting. Possible but ~30% more parser code
     for a format teachers rarely produce by hand.
- **Recommended Phase 1A:** **TSV + Markdown table**, skip CSV. (XLSX upload
  covers anyone who would otherwise need CSV.)
- **Effort:** **2 hours** (textarea + parser + same row-pipeline).
- **Recommended:** **yes, Phase 1A** — this is the lowest-effort entry point and
  the primary path the user named.

---

## Sample import data (paste-format MVP)

This is the exact text a teacher should be able to paste into the importer and
get 1 unit + 4 lessons out:

```text
Kind	Subject	Unit Name	Weeks	Lesson Title	Objective	Standards
unit	math	Fractions on a Number Line	Wk 9–14
lesson	math	Fractions on a Number Line		Equal parts intro	I can split a whole into equal parts	5.NF.1
lesson	math	Fractions on a Number Line		Number-line tenths	I can plot tenths on a number line	5.NF.3
lesson	math	Fractions on a Number Line		Comparing fractions	I can compare two fractions with unlike denominators	5.NF.2
lesson	math	Fractions on a Number Line		Equivalent fractions	I can identify equivalent fractions	5.NF.1, 5.NF.3
```

(Tabs between columns. Empty cells are fine — only `Kind`, `Subject`, `Unit Name`,
and `Lesson Title` (on `lesson` rows) are required.)

Markdown-table equivalent the parser must also accept:

```markdown
| Kind   | Subject | Unit Name                  | Weeks   | Lesson Title         | Objective                              | Standards     |
| ------ | ------- | -------------------------- | ------- | -------------------- | -------------------------------------- | ------------- |
| unit   | math    | Fractions on a Number Line | Wk 9–14 |                      |                                        |               |
| lesson | math    | Fractions on a Number Line |         | Equal parts intro    | I can split a whole into equal parts   | 5.NF.1        |
| lesson | math    | Fractions on a Number Line |         | Number-line tenths   | I can plot tenths on a number line     | 5.NF.3        |
| lesson | math    | Fractions on a Number Line |         | Comparing fractions  | I can compare two fractions            | 5.NF.2        |
| lesson | math    | Fractions on a Number Line |         | Equivalent fractions | I can identify equivalent fractions    | 5.NF.1,5.NF.3 |
```

---

## Mapping to `CustomUnit` + lessons

Lane AB's queued spec (per `docs/queued-work-2026-05-25.md` line 76) defines
`useCustomUnits()` backed by `localStorage["mycurricula:custom-units"]`. The
import pipeline should funnel into that hook's `add()` method:

| `ImportedUnit` field     | `CustomUnit` field (Lane AB's hook)         | Notes                                                                                                  |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `name`                   | `name`                                      | Required.                                                                                              |
| `subject`                | `subject`                                   | Required — must match a `SubjectId`. Fuzzy match (case-insensitive, accept "Math" / "math" / "MATH").  |
| `weeks`                  | `weeks`                                     | Free text — pass through.                                                                              |
| `startDate` / `endDate`  | `startDate` / `endDate`                     | ISO strings.                                                                                           |
| `unitType`               | `unitType`                                  | New field — see coordination note.                                                                     |
| `lessons[]`              | `lessons[]` _(new)_                         | See coordination note below.                                                                           |
| `lessons[].title`        | `lessons[].title`                           | Required.                                                                                              |
| `lessons[].objective`    | `lessons[].objective`                       | Optional.                                                                                              |
| `lessons[].standards[]`  | `lessons[].standards[]`                     | Optional.                                                                                              |

The id-generation for both units and lessons happens inside `useCustomUnits.add()`
— the importer never sets ids.

---

## Coordination note for Lane U / Lane AB

Lane AB's current spec only persists **unit metadata** — it doesn't carry child
lessons. To make import work without a follow-up migration:

**Ask Lane AB to extend its `CustomUnit` shape with `lessons?: { title: string;
objective?: string; standards?: string[] }[]`.**

Concretely:

```ts
// lib/use-custom-units.ts (Lane AB's file — recommendation, not a request)

export interface CustomUnitLesson {
  id: string;
  title: string;
  objective?: string;
  standards?: string[];
}

export interface CustomUnit {
  id: string;
  name: string;
  subject: SubjectId;
  weeks?: string;
  startDate?: string;
  endDate?: string;
  unitType?: string;
  weekdays?: number[]; // already in Lane AB's spec
  lessons?: CustomUnitLesson[]; // ← add this
}
```

Year-view rendering (Lane AB's `UnitBar.tsx` work) can ignore `lessons` for now —
it only needs the unit bar. The import lane wires `lessons` through; later
follow-ups surface them in Subject / Weekly views.

This change is **strictly additive** — `lessons?` is optional so the existing
"+ Add Unit" modal continues to work unchanged.

---

## Implementation lane breakdown (follow-up wave)

Four file-disjoint lanes; can run in parallel after Lane AB lands (which the
import depends on for the persistence target).

### Lane V-1 — types + paste parser (paste-format MVP)

- **NEW:** `lib/import-units-types.ts` — the `ImportedUnit` / `ImportedLesson` /
  `ImportResult` interfaces above, plus the canonical row-pipeline function
  `rowsToImportResult(rows: string[][]): ImportResult`.
- **NEW:** `lib/import-units-paste.ts` — TSV + Markdown-table tokenizers that
  feed into `rowsToImportResult`.
- **NEW:** `lib/import-units-paste.test.ts` (if/when we add tests).
- **Effort:** 2 hours.
- **Dependencies:** none. Pure functions, no React.

### Lane V-2 — XLSX parser

- **NEW:** `lib/import-units-xlsx.ts` — uses `xlsx` via dynamic import so it
  never touches the planner bundle.
- **MODIFY:** `package.json` — add `"xlsx": "^0.18.5"`.
- **Effort:** 3 hours (parser + merged-cell forward-fill + the 4-sheet
  fixture set).
- **Dependencies:** Lane V-1 (consumes `rowsToImportResult`).

### Lane V-3 — import modal UI

- **NEW:** `components/year/ImportUnitsDialog.tsx` (+ `.module.css`).
- **NEW:** tab structure: `Paste | Upload .xlsx`. Both tabs feed into the
  shared parser and show the same preview + commit step.
- **NEW:** preview pane — list of parsed units with expandable lesson lists,
  warnings rendered inline, errors block the "Import" button.
- **MODIFY:** `components/year/YearView.tsx` — add "Import" button next to the
  "+ Add Unit" button from Lane AB (one new line; minimal merge risk).
- **MODIFY:** `lib/use-custom-units.ts` — add `addMany(units: CustomUnit[])`
  helper. (Lane AB's file — small additive change.)
- **Effort:** 3 hours.
- **Dependencies:** Lanes V-1, V-2, AB.

### Lane V-4 — Word (.docx) support — Phase 1B

- **NEW:** `lib/import-units-docx.ts` — `mammoth.convertToHtml` → DOM-parse the
  resulting `<table>` rows → feed `rowsToImportResult`.
- **MODIFY:** `package.json` — add `"mammoth": "^1.7.0"`.
- **MODIFY:** `components/year/ImportUnitsDialog.tsx` — add a third tab
  "Upload .docx".
- **Effort:** 3 hours.
- **Dependencies:** Lanes V-1, V-3. **Deferred — do not start until Phase 1B.**

**Total Phase 1A (V-1 + V-2 + V-3):** ~8 hours.

---

## Open questions for the user

1. **Subject matching strictness.** If a teacher writes "Social Studies" instead
   of the canonical `explorers`, do we (a) reject the row with a clear error, or
   (b) show a one-time subject-mapping dialog before committing the import?
   Recommend (b) — adds ~1 hour to Lane V-3 but dramatically lowers the "my
   import didn't work" failure mode.
2. **Duplicate detection.** If the import contains a unit named "Fractions on a
   Number Line" and a custom unit with that name already exists, do we (a)
   merge lessons, (b) create a second unit, or (c) prompt the teacher? Recommend
   (c) — simplest UX, adds ~30 min.
3. **Standards format.** Some teachers paste codes ("5.NF.1"), some paste full
   text ("Add and subtract fractions with unlike denominators"). Do we attempt
   to recognize the code-vs-prose distinction, or store both as opaque strings
   for now and let the teacher fix in the lesson editor? Recommend storing
   opaque for Phase 1A — code-matching belongs in a later "standards crosswalk"
   lane.
4. **Header row required, or sniff?** Spec above assumes a fixed header row.
   Sniffing ("look at row 1, see if values match known column names") adds ~45
   min but means a teacher can paste from a sheet that already has its own
   headers. Recommend: header sniff for Phase 1A — low cost, big UX win.
5. **Google Sheets / Docs verdict.** Confirm Phase 2 deferral is acceptable
   given the OAuth cost. If a school's IT department forbids file downloads,
   the workaround story breaks down — worth asking the beta school before
   committing to "defer until Phase 2."
