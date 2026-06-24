# AI Platform Plan — tiers, pricing & the four AI pillars

> **Status:** Proposal for review (v1). Umbrella plan for mycurricula.app's AI strategy.
> **Companion deep-dive:** `docs/CURRICULUM-INGESTION-PLAN.md` (Pillar ① mechanics — parsers, schema,
> queue, HITL). This doc owns the **tiers, pricing, shared AI core, and the four pillars**.
> **Pricing is fast-moving** — vendor rates verified June 2026; re-derive at build time.

---

## 0. The product shape (locked with the owner)

Three things to sell, on a shared AI core:

| Plan | Price | What it is |
|---|---|---|
| **Base (non-AI)** | **$4.99 / mo** | The full planner/LMS: Day/Week/Year, Subject outline, Resource Walls, forking, scheduling, manual entry. No in-app AI. |
| **AI-enabled** | **$8.99 / mo** | Everything in Base **+ in-lesson AI Assist** (ideas, differentiation, hooks, rewrites) + an included monthly AI-credit allowance. |
| **Curriculum upload pack** | **$7 / $10 / $15** per subject | One-time ingest of an existing curriculum: **up to 250 / 500 / 750 pages**, multi-file (PDF/DOCX/XLSX/assignments/zip). Available to **both** tiers (onboarding value, not gated behind AI). |

### The governing cost rule (owner decision)
> **Cheap models for the APP; strong models for the UPLOAD.**
> - **In-app AI Assist** (recurring, high-frequency, margin-sensitive) → **cheap models** (Claude
>   Haiku / Gemini Flash) by default; escalate to Sonnet only on an explicit "go deeper" action.
> - **Curriculum ingestion + authoring** (one-time, paid per subject, accuracy-critical) → **stronger
>   models** (Claude Sonnet, occasionally Opus) — the pack price covers it.
>
> This is what makes $8.99 safe **and** keeps ingestion accurate.

---

## 1. Pricing economics (does it cover?)

After ~3% payment fees: $4.99 → ~$4.55 net; $8.99 → ~$8.43 net. AI premium over base = **$4.00/mo**.

### Base $4.99 — ✅ high margin
COGS ≈ hosting/storage/bandwidth per user (cents). ~85–90% margin. The volume/funnel tier.

### AI $8.99 — ✅ **with two guardrails**
AI Assist cost per action (≈1–2k in + 1–3k out tokens): **~$0.005 Haiku · ~$0.0021 Gemini Flash ·
~$0.03 Sonnet · ~$0.06 Opus.** The $4 premium must absorb a month of usage:
- **Default to a cheap model** (Haiku/Flash): an included **~400–500 actions/mo ≈ $1–2.50 COGS** →
  fits inside the $4 premium with room. Most users use far less → strong margin.
- **Cap with credits:** include a monthly **AI-credit allowance**; overage = credit packs. Without a
  cap, one power user on Sonnet/Opus (~$12+/mo) erases the premium.
- **Result:** $8.99 is comfortably profitable **iff** cheap-model-default + credit allowance. (On
  Sonnet-by-default with no cap, it loses money — hence the governing rule above.)

### Upload packs $7 / $10 / $15 — ✅ covered (with routing)
Realistic COGS per subject (born-digital-free + batch + caching), using the **recommended ingestion
Workflow B** (LlamaParse cost-effective + Sonnet): **250pg ≈ $2.50 · 500pg ≈ $5 · 750pg ≈ $7.50** →
margins **~64% / ~50% / ~50%.** Worst case (all-paid-vision, no batch/cache) = roughly break-even at
500/750 (never a loss). The **lean Workflow A** (Mistral OCR + Haiku) is ~$0.88/$1.75/$2.63 → 80%+
margins. **Premium Workflow C** (agentic parse + Opus + verify) LOSES money at these prices → reserve
it for genuinely chaotic scans or a paid "high-fidelity" toggle, not the default.
*(Full workflow tables: `CURRICULUM-INGESTION-PLAN.md`.)*

### Watch-items
- Upload price is **sub-linear** ($0.028→$0.020→$0.020/pg) while cost is linear → the **750-pg tier has
  the least cushion**; nudge to ~$18 if big imports are common.
- **Resource files count toward the page quota** when parsed for auto-tagging (see Pillar ④); pure
  storage/attach is ~free.
- Re-imports **dedupe by content hash** so unchanged pages aren't re-billed.

---

## 2. Shared AI core (built once, used by every pillar)

- **LLM client + structured outputs** — Claude Structured Outputs (schema-guaranteed JSON via
  constrained decoding) for anything that writes to the DB; freeform for prose suggestions.
- **Model router** — picks the model by feature + difficulty per the governing rule (cheap for Assist,
  strong for ingestion/authoring; escalate on demand). One place to retune as prices move.
- **Suggest → accept → lazy-fork flow** — every AI output is a **draft the teacher accepts**; accept
  triggers the existing **Personal lazy-fork** (never auto-commit, never auto-enter Master).
- **Unified AI-credit meter** — one currency across Assist actions, authoring generations, and
  ingestion-overage. Cheap-model actions cost few credits; strong-model/long jobs cost more.
- **Batch + prompt-caching** — batch (−50%) for async ingestion/authoring; cache the schema/instructions
  (−~90% input) everywhere. These are the margin levers.
- **Safety + provenance** — content-safety gate (esp. anything student-facing in Pillars ③/④), and
  every AI artifact tagged with model + prompt version + source for audit.

---

## 3. The four pillars

### ① Ingestion — *upload existing curriculum* (the $7/$10/$15 packs)
Parse (file-type routed: born-digital direct vs vision parser) → **strong-model** structured mapping →
validate/repair → **sample-first HITL** (clarify → review a couple of lessons → full run) → commit to
the spine (Workspace→Workbook→Subject→Unit→Lesson→Phase), respecting forking + grade-scoping +
dated/undated scheduling mode. **Full mechanics: `CURRICULUM-INGESTION-PLAN.md`.**

### ② AI Assist — *in-lesson copilot* (the $8.99 differentiator)
On-demand, in-context help on an **existing** lesson: a click/prompt → suggestion. Action library:
**ideas · differentiate · hook · assessment · simplify · extend · rewrite.**
- **Cheap models by default** (governing rule); "go deeper" escalates to Sonnet at higher credit cost.
- **Differentiation maps to the existing `LessonDifferentiation` type** — generated ELL/IEP/advanced/
  reading-level variants land in a real schema slot.
- Suggestions are drafts → **accept → lazy-fork to Personal**. Metered against the AI-credit allowance.
- **Lowest build risk of the AI pillars** (text-in/text-out, no parsing/no link-safety) → good first AI
  ship; gets dramatically better once Pillar ① supplies clean structured lessons.

### ③ Authoring — *AI writes new curriculum* (Phase 2)
Given a **book / topic / standards + grade**, generate a unit/lesson scope-and-sequence **and** source
real resources. Two input modes: **around a known book** (title/ISBN) or **from an uploaded book**
(Pillar ① parse → generate from it).
- **Non-negotiable resource rule:** *never let the LLM emit resource URLs as truth.* Pattern:
  **LLM writes a query → a real search/data API returns real results → verify (resolve, metadata,
  grade/safety) → rank.** Discovery options: **Perplexity Sonar** (grounded + citations), Gemini
  Google-grounding, Claude web-search, or Exa/Tavily; **YouTube Data API** for verifiable videos.
- **K-12 content-safety + standards-alignment** gates before anything is suggested.
- **Strong models** (paid generation); output-token-heavy → its own credit/cost model (cost a full pass
  separately at build — rough order: a few $ of LLM output + search per subject-year).
- **Sequence after ① and ②** (higher risk: hallucination/safety/pedagogy), but design the spine now to
  serve it (already done).

### ④ Resource auto-population — *upload → resources land on lesson walls* (folded into ①)
When the multi-file upload includes assignments/worksheets/links, extract + store + **tag to the right
lesson + auto-populate the Resource Walls**. Reuses existing infra: `LessonResource`, the Resource
Walls (kanban), R2 + `app/api/resources`, link-preview `app/api/og-preview`.
- **Three resource forms:** embedded **links** (→ `LessonResource` cards) · **separate files**
  (→ R2 + associate) · **in-text references** ("see Worksheet 3.2" → placeholder).
- **Lesson association (the hard part) via layered signals + safety net:** filename + folder structure
  → content/semantic match (cheap model) → explicit reference match → **confidence**. High-confidence
  auto-places on the wall; **low-confidence lands in an "Unsorted" inbox tray** the teacher drags from.
  Never silently mis-file.
- **Why it matters:** turns the upload from "import an outline" into "import the curriculum **and its
  whole resource library, pre-wired to lessons**" — a major wow/differentiator and a reason to buy a pack.
- **Metering:** parse-for-auto-tag counts toward the page quota; **attach-as-is** (no parse) is ~free;
  embedded links ~free. Offer both options at upload.

---

## 4. Sequencing

1. **Pillar ① Ingestion + ④ Resources** — onboarding value; builds the schema + staging + HITL the rest
   reuse. Strong-model, paid per pack.
2. **Pillar ② AI Assist** — the recurring $8.99 engine; cheap-model + credit cap; lowest risk.
3. **Pillar ③ Authoring** — Phase 2; cost + safety pass first; reuses the spine + the resource
   query→verify→rank pattern.

Shared AI core (model router + structured outputs + accept→fork + credit meter) is built in step 1 and
extended each step.

---

## 5. Open decisions
- **AI Assist:** confirm the included monthly **credit allowance** + overage pack price (set so a
  typical user sits well under the $4 premium; cap protects against power users).
- **Unified credit currency** across all three AI features — confirm (recommended) vs separate meters.
- **Cheap-model pick for the app** — Claude Haiku vs Gemini Flash (Flash is cheapest; Haiku pairs best
  with Claude Structured Outputs). Likely Haiku for structured actions, Flash for pure prose.
- **Premium ingestion (Workflow C):** offer as a paid "high-fidelity / hard-scan" toggle, or just
  auto-escalate hard pages within the pack price? (Affects the 750-pg margin.)
- **Authoring** — cost/price model (per-generation vs credit-funded) — pending its own research pass.

---

### Sources (verified June 2026; pricing fast-moving)
- Claude API pricing (Opus 4.8 $5/$25 · Sonnet 4.6 $3/$15 · Haiku 4.5 $1/$5; batch −50%, caching −90%) —
  https://platform.claude.com/docs/en/about-claude/pricing
- Claude Structured Outputs — https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Gemini pricing (2.5 Flash $0.30/$2.50 · 2.5 Pro $1.25/$10) — https://www.tldl.io/resources/google-gemini-api-pricing
- LlamaParse pricing (1k credits = $1.25; cost-effective 3cr/pg, agentic 10cr/pg) —
  https://www.llamaindex.ai/pricing · https://developers.llamaindex.ai/llamaparse/general/pricing/
- Document-AI cost comparison 2026 (Mistral OCR ~$1–2/1k, Azure DI ~$10/1k, Textract ~$65/1k) —
  https://aiproductivity.ai/blog/document-ai-cost-comparison/
