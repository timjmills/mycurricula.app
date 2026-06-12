# Worldwide K-12 Standards & Curriculum Frameworks — Research Report

> **Snapshot disclaimer (per CLAUDE.md §8):** this is a dated research snapshot
> (compiled **2026-06-12**). Standards bodies revise frameworks and licences
> continuously — several entries below are mid-reform. Verify against the cited
> primary source before acting on any single fact. Companion artifacts:
> `lib/standards/frameworks-catalog.json` (the machine-readable catalog — also
> the Supabase seed, and the data behind the in-app standards menu) and
> `docs/standards-catalog-schema-proposal.sql` (DB schema proposal).

**Goal.** Catalog and put in order, for the mycurricula.app database, every major
K-12 standards framework worldwide: CCSS and each US state's standards, IB, UK,
Australia, New Zealand, Canada, every European country, the Middle East
(Qatar first), Asia, Africa, Latin America, and the frameworks used by
international, Christian, and classical schools.

**Method.** Deep-research fan-out: 13 parallel web-research agents (US; UK/IE/AU/
NZ/CA; international programmes; 7 × Europe by sub-region + 1 full independent
Europe re-pass used for cross-verification; Asia/MEA/Africa/LatAm; faith-based/
classical/alternative), followed by a 3-voter adversarial verification pass on
the 14 highest-consequence claims (licensing + Qatar mandates + API existence).
**Verification outcome: no claim was killed (2/3-refute rule); 13/14 confirmed,
1 (the CCSS licence) corrected to "purpose-scoped" after a direct primary-source
check.** Both Europe passes agreed on every load-bearing fact. Verdicts are
flagged inline as ✅ (verified 3-voter), ◑ (confirmed with hedges), or ⚠
(unverified — treat as lead, not fact).

---

## 0. Executive summary — what matters for mycurricula

1. **"Standards" is the wrong word for most of the world.** Only a minority of
   frameworks are coded, taggable standards (US, Australia, Cambridge, BNCC,
   Korea, Lehrplan 21, CfE). Most national curricula express prose competence
   goals — taggable only at topic/objective-paragraph level with synthetic
   codes. The schema proposal handles both (`framework_kind`,
   `has_item_codes`).
2. **Licensing — not technology — is the gating constraint.** The catalog
   splits cleanly into tiers:
   - **Open / open-with-attribution (ingest freely):** CCSS (purpose-scoped
     public licence ◑), most US state standards, NGSS, Australia AC v9
     (CC-BY 4.0 ✅), England/Scotland/Wales (OGL ✅), France (Licence Ouverte ✅),
     Netherlands (CC-BY 4.0), Sweden (CC0 ✅), Norway (NLOD ✅), Slovakia
     (CC-BY 4.0), Spain (BOE open reuse), Poland (public-domain statutes).
   - **Non-commercial (permission needed for a commercial LMS):** New Zealand
     (CC-BY-NC ✅), Northern Ireland (CCEA), Portugal (CC BY-NC-ND), Core
     Knowledge (CC BY-NC-SA ✅).
   - **Permission-required / member-only:** **IB — explicitly prohibits app
     developers and curriculum-mapping platforms without a written licence ✅**,
     Cambridge ✅, Pearson Edexcel, OxfordAQA, IPC/IMYC (member-only), Ontario/
     BC/Alberta/Quebec (Crown ©), Singapore (MOE+Cambridge ©), College Board AP,
     Lehrplan 21 (API by agreement).
   - **Unverified (most of the rest of the world):** ingest only after a
     per-framework licence check.
3. **Machine-readable APIs exist in exactly six places** found in this sweep:
   Norway (Grep REST+SPARQL ✅), Sweden (CC0 JSON ✅), Netherlands (SLO JSON),
   Finland (ePerusteet JSON, licence unverified), Australia (MRAC RDF/JSON-LD/
   SPARQL ✅), Spain (BOE legal-text XML/JSON). The US has the third-party
   **Common Standards Project** API (alive, community-maintained ✅) plus the
   1EdTech CASE ecosystem and commercial vendors (Academic Benchmarks, EdGate).
   England has *announced* a machine-readable curriculum for 2027–28.
4. **Qatar (first deployment) has a hard compliance overlay ◑:** every private/
   international school must teach Arabic (all students), Islamic education
   (Muslim students), and Qatar history (all students), with MOEHE-approved
   assessments — so the catalog must support a school running e.g. American
   CCSS+NGSS *plus* MOEHE Arabic/Islamic/Qatar-history frameworks
   simultaneously. Multi-framework tagging (already in the schema:
   `standards uuid[]`) is the right call.
5. **Faith/classical networks mostly do NOT publish taggable standards.** The
   taggable exceptions: Adventist NAD standards, Cardinal Newman Society
   Catholic standards, Core Knowledge Sequence, Zekelman (Judaic), LCMS
   Lutheran standards (publishing ~mid-2026). Everything else is accreditation
   criteria (ACSI, ACCS, SCL, NCEA-NSBECS) or proprietary scope-&-sequence
   (Abeka, BJU, Memoria, IPC…), recorded as such in the catalog.
6. **Timing matters — major rewrites land 2026–2028:** England (2028), France
   (rolling to 2028–29), Italy (2026–2031), Netherlands (2026–27), Poland
   (2026–2032), Czechia (2027), Denmark (replacement 2027–28), NZ Te Mātaiaho
   (2026–2030), Chile (awaiting decree), India NCF-SE textbook transition,
   Korea (full 2027), Philippines MATATAG (2027–28). The catalog stores
   `reform_status` so the import UI can warn.

### Recommended database ordering (the "put in order" deliverable)

Hierarchy used in the seed JSON and schema:

```
region → country (ISO-3166) → framework (kind, authority, licence)
  → optional parent framework (state/provincial variants, AEFE→France, VIC→AC9)
  → standards rows: framework → [grade or band] → hierarchy levels → coded item
```

Suggested ingestion phases for mycurricula:
- **Phase A (beta-ready, open-licence, coded):** CCSS ELA/Math ◑, NGSS, the
  non-CCSS state sets the first schools need (e.g. TEKS, VA SOL, FL B.E.S.T.),
  Australia AC v9, England NC; via Common Standards Project / CASE where
  possible.
- **Phase B (first-market compliance):** Qatar MOEHE Arabic/Islamic/Qatar-
  history (needs MOEHE contact — no open licence), AERO for American
  international schools.
- **Phase C (licensed):** Cambridge (written permission), IB (written licence —
  *plan for refusal*; fall back to school-authored "uploaded framework" rows,
  which the schema already supports via `provenance = school_uploaded`).
- **Phase D (rest of world):** open-API countries first (NO/SE/NL/FI/AU),
  then per-licence.

---

## 1. United States

### 1.1 Common Core State Standards (CCSS) ✅

- **Bodies:** NGA Center for Best Practices + CCSSO (2010). ELA/Literacy +
  Mathematics; states publish renamed/revised derivatives (§1.2).
- **Code anatomy:** ELA `CCSS.ELA-LITERACY.RL.5.3` = strand (RL = Reading:
  Literature; RI, RF, W, SL, L) + grade + standard (+ sub-letter); anchor
  standards `CCRA.R.1`. Math `CCSS.MATH.CONTENT.5.NBT.B.5` = grade + domain
  (NBT = Number & Operations in Base Ten…) + cluster letter + standard.
  **Standards for Mathematical Practice:** `CCSS.MATH.PRACTICE.MP1–MP8` —
  grade-independent, tag-friendly (bundled in the app's picker).
- **Licence (verified by direct primary check):** royalty-free public licence
  to copy/publish/distribute/display "for purposes that support the CCSS
  Initiative", with the mandatory verbatim notice "© Copyright 2010. National
  Governors Association Center for Best Practices and Council of Chief State
  School Officers. All rights reserved." Purpose-scoped, not a blanket CC
  grant — ubiquitous in commercial edtech, but have counsel confirm scope.

### 1.2 The 50-state landscape

Every state owns its standards; CCSS survives in most states under revised
names while a substantial bloc is independent. Science splits into NGSS
verbatim (20 states + DC: AR, CA, CT, DE, HI, IL, IA, KS, KY, ME, MD, MI, NV,
NH, NJ, NM, OR, RI, VT, WA), Framework-based own standards (24 states), and
fully independent (TX, FL, VA among them). Marquee independent ELA/math sets:
**Texas TEKS** (code anatomy `111.5.b.2.A` = chapter/subject + grade section +
subsection + standard + student expectation), **Virginia SOL**, **Florida
B.E.S.T.** (replaced the CCSS-derived MAFS/LAFS), plus never-adopters Texas,
Virginia, Alaska, Nebraska (and Minnesota for math only).

<!-- STATE-TABLE -->

### 1.3 National subject frameworks (catalog entries seeded)

| Framework | Body | Codes | Licence/use |
| --- | --- | --- | --- |
| **NGSS** (science) | NGSS Lead States / Achieve | `5-PS1-1` (grade + DCI + PE); 3D (SEP×DCI×CCC) | free w/ attribution; trademark rules ✅ |
| **C3 Framework** (social studies) | NCSS | `D2.His.1.3-5` | © NCSS, free PDF |
| **CASEL SEL** | CASEL | 5 competencies (no granular codes) | © CASEL — maps to the app's SEL subject |
| **WIDA ELD 2020** (English learners) | WIDA/UW–Madison | 5 standards × Key Language Uses | consortium terms — permission |
| **AP CEDs** | College Board | `BIO-1.A.1` | free PDFs; permission for redistribution; **no generative-AI training use** |
| National Core Arts / SHAPE PE / ACTFL / CSTA / ISTE | various | varies | per-body; catalog entries pending the state-pass follow-up |

### 1.4 Standards-data infrastructure (how the text actually gets ingested)

- **1EdTech CASE** — the interchange spec for machine-readable frameworks.
  The "CASE Network 2" registry is being phased out in favor of a **CASE
  Global Ecosystem**; **Satchel Rosetta Exchange** (Common Good Learning
  Tools, rosetta.commongoodlt.com) remains a live access point for US K-12
  standards; commercial CASE providers include **EdGate, LearningMate,
  Instructure (Academic Benchmarks)**.
- **Common Standards Project** (commonstandardsproject.com) — free community
  API of US standards, all 50 states; **verified alive ✅** (repo commits into
  2026; low-frequency maintenance — verify endpoint at ingestion time).
- **OpenSALT** — open-source CASE editor/host for building/serving frameworks
  (useful for the `school_uploaded` path).
- **Commercial licensing route:** Academic Benchmarks (Instructure) and EdGate
  license normalized, GUID-stable standards data (incl. frameworks that are
  otherwise permission-locked) — the realistic path if mycurricula later needs
  guaranteed-current 50-state + international coverage without per-body
  negotiations.

---

## 2. United Kingdom & Ireland

| Framework | Body | Stages | Codes | Licence → commercial use |
| --- | --- | --- | --- | --- |
| **National Curriculum in England** (2014) | DfE | KS1–KS4 | none (prose PoS) | **OGL v3 → open w/ attribution ✅** |
| **Curriculum for Excellence** (Scotland) | Education Scotland | Early→Fourth levels + Senior Phase | **Es&Os codes** e.g. `MNU 2-03a` | OGL default (Crown ©) ◑ |
| **Curriculum for Wales** (2022) | Welsh Government | Progression Steps 1–5, 6 AoLEs | none | OGL v3 policy ◑ |
| **NI Curriculum** (2007) | CCEA / DENI | Foundation→KS4 | none | **CCEA: commercial use prohibited** ⚠ |
| **Ireland: PCF 2023 + Junior/Senior Cycle** | NCCA | Primary; JC; SC (redev. 2025–27) | numbered outcomes in specs | personal-use copyright → **permission required** |

Notes: (a) England's KS4/KS5 reality is exam-board specifications (AQA, OCR,
Pearson Edexcel, WJEC/Eduqas) — separately copyrighted; treat each spec as an
`assessment_framework` if schools need it. (b) England's revised curriculum
(spring 2027 publication, Sept 2028 first teaching) is slated to ship with an
official machine-readable version — revisit before building England ingestion.
(c) Scotland's `MNU 2-03a` anatomy = subject-area abbreviation + level −
sequence + sub-letter (inferred from practice; official decode doc not found).

## 3. Australia, New Zealand, Canada

**Australia — ACARA Australian Curriculum v9.0 (2022). The ingestion gold
standard ✅.** Eight learning areas, F–10; coded content descriptions
(`AC9M5N01` = AC9 + Mathematics + Year 5 + Number strand + seq 01) +
year-level achievement standards. **CC BY 4.0** (Literacy/Numeracy progressions
are CC BY-NC; media excluded). **MRAC** machine-readable release: RDF/XML,
JSON-LD, SPARQL endpoint (`rdf.australiancurriculum.edu.au/api/sparql`).
State variants (treat as child frameworks of AC9): NSW NESA syllabuses (own
outcome codes, AC9-aligned rollouts from 2024), Victoria VCAA Victorian
Curriculum 2.0 (June 2024; full English/Maths 2026), WA SCSA (2025–27), QLD
QCAA "ACiQ v9.0" (all areas by end 2027).

**New Zealand — NZC / Te Mātaiaho (+ Te Marautanga o Aotearoa for Māori-medium).**
Refresh rollout: English + Maths mandatory Term 1 2026 (in force); Science/
Social Sciences/HPE + all Y9–10 areas 2027; Arts/Tech/Languages 2028; Years
11–13 2028–2030; final gazetted version mid-2026. Prose poutama progressions;
senior = NCEA achievement standards (NZQA). **Licence: CC BY-NC 4.0 (NZ) —
non-commercial ✅ → a commercial LMS needs Ministry permission.**

**Canada — no national curriculum** (s.93 Constitution Act 1867; CMEC is
non-binding). Provincial highlights: **Ontario** (coded expectations `B1`/`B1.1`
+ course codes like `MTH1W`; Crown © permission-required), **BC**
(Know-Do-Understand, prose, Crown ©), **Alberta** (new K–6 2022–25, Gr 7–9
drafts), **Quebec** (PFEQ competency model). Western + Atlantic provinces share
math frameworks. All PDF/HTML, no APIs, Crown © → permission-required as a
class.

## 4. International school programmes

| Programme | Ages | Objectives layer | Codes | Access | Commercial ingestion |
| --- | --- | --- | --- | --- | --- |
| **IB PYP / MYP / DP / CP** | 3–19 | continuums/criteria/guides | none | MyIB / PRC / IB Store | **Written IBO licence required; app developers explicitly prohibited unlicensed ✅** |
| **Cambridge Primary + Lower Secondary** | 5–14 | coded learning objectives | **`3Nc.01`, `7Nf.05`** | public PDFs | written permission ✅ |
| **Cambridge IGCSE / AS-A** | 14–19 | AOs + numbered topics | syllabus codes only | public PDFs | written permission ✅ |
| **Pearson Edexcel intl** (iPrimary→IAL) | 3–19 | AOs/schemes of work | spec codes | IGCSE/IAL public; iPrimary via ActiveLearn | written permission |
| **OxfordAQA intl** | 14–19 | AOs + sections | spec codes | public PDFs | permission (© all rights reserved) |
| **IPC / IEYC / IMYC** (Fieldwork/ICA) | 2–14 | 3 goal types, prose | none | **member-only** | member-only |
| **AERO** (US overseas schools) | K–12 | CCSS-plus standards | CCSS-style | free PDFs | © AERO (US-gov status unverified) ⚠ |
| **French programmes via AEFE** | 3–18 | = France national | none | public | **Licence Ouverte ✅** |
| **German ZfA / DIA** | K–13 | Bundesland Lehrpläne + KMK | none | public PDFs | unverified |
| **College Board AP (incl. APID)** | 14–19 | CEDs: Big Ideas→EU→LO→EK | **coded e.g. `BIO-1.A.1`** | free PDFs | permission required; no AI-training use |
| Common Ground Collaborative | K–12 | design framework, no objectives catalog | — | members | CC BY-NC-ND |
| SABIS | K–12 | proprietary "points" | internal | none | fully proprietary |

IB detail that drives product strategy: the IB names "vendors operating
curriculum mapping services or teacher resource digital platforms and app
developers, whether fee-covered or not" as prohibited without a written licence
(fees apply; may be refused). The practical pattern for IB schools in
mycurricula: school-authored frameworks (`provenance = school_uploaded`) and/or
pursue an IBO licence like ManageBac/Toddle did. The current PYP revision
(new subject continuums April 2025, transition deadline Sept 2027) would
invalidate early scrapes anyway.

## 5. Europe — every country

Two independent research passes covered Europe; they agreed on all load-bearing
facts (disagreements were date-level and are hedged below). Eurydice
(`eurydice.eacea.ec.europa.eu`) is the meta-source for any country here.

### 5.1 The six systems that matter most for ingestion

- **Norway — LK20 (Udir).** The best curriculum API in Europe ✅: Grep database,
  REST (`data.udir.no/kl06/v201906/`) + SPARQL (`sparql-data.udir.no`),
  JSON/JSON-LD/XML/RDF/CSV, nightly updates, multilingual (Bokmål/Nynorsk/
  English/Sámi). Subject codes (`NOR01-07`) and per-aim Grep codes (`K1663`) in
  the data layer. **NLOD 2.0 — commercial reuse with attribution.** REST needs a
  free API key (teknisk.grep@udir.no). Next structural reform consults Spring
  2026; LK20 remains in force.
- **Sweden — Lgr22 (Skolverket).** Public Syllabus API (JSON), **data CC0 ✅** —
  the most permissive licence found anywhere in this research. Revised edition
  effective 1 Aug 2025 (knowledge requirements → "betygskriterier"). API v2
  alpha (Dec 2025) also covers the new Gy25 upper-secondary.
- **Netherlands — kerndoelen (SLO/OCW).** 58 numbered core objectives (2006) →
  full actualisatie: Dutch + Maths kerndoelen expected legally in force
  1 Aug 2026, the other seven learning areas Aug 2027. **CC BY 4.0** via the SLO
  Curriculum Database on data.overheid.nl + REST API
  (`opendata.slo.nl/curriculum/api/v1/`; new-set API timing unverified).
- **France — programmes + socle commun (MEN).** "Choc des savoirs" reform wave
  mid-flight: new C1–C2 programmes (arrêté 22 Oct 2024, force 2025), C3 (arrêté
  10 Apr 2025; CM2 2026–27), C4 français/maths (arrêté 18 Feb 2026; 5e 2026–27 →
  3e 2028–29), other C4 subjects consulted May–June 2026. **Licence Ouverte /
  Etalab 2.0 ✅ (commercial + attribution; excludes third-party media).** PDFs/
  decrees only — no objectives API. Used worldwide via AEFE.
- **Germany — KMK Bildungsstandards + 16 Länder Lehrpläne.** Standards only at
  exit checkpoints (Gr 4, MSA, Abitur; refreshed 2022–2024); operative curricula
  are per-Land (NRW Lehrplannavigator, Bavaria LehrplanPLUS, Berlin-Brandenburg
  RLP 1–10…). Prose throughout, PDF/HTML only, **no open licence found anywhere
  → highest ingestion friction in Western Europe.**
- **Switzerland — three regional curricula under HarmoS.** **Lehrplan 21**
  (21 German-speaking cantons): superbly coded competences (`MA.1.A.3.c`) but ©
  D-EDK with an access-controlled API (agreement via BKZ). **PER** (French-
  speaking cantons) and **Ticino Piano di studio** (rev. Jan 2024): prose,
  PDF/portal, licences unverified.

### 5.2 Per-country table (remaining Europe)

| Country | Framework (body) | Current version → reform | Codes | Machine-readable | Commercial use |
| --- | --- | --- | --- | --- | --- |
| Spain | Currículo LOMLOE — RDs 95/157/217/243 of 2022 (MEFP + 17 CCAAs) | complete 2023–24 | 8 coded key competencies (CCL, STEM…) | BOE XML/JSON API (decree text) | BOE open reuse ✅-adjacent |
| Italy | Indicazioni nazionali (MIM) | **D.M. 221/2025 in force 11 Feb 2026; rollout 2026/27→2030/31; licei in consultation** | none | PDF only | unverified (open-by-law CAD) |
| Poland | Podstawa programowa (MEN) | 2017 → **new Dz.U. 2026 poz. 378, effective Sept 2026, phased to 2032** | Roman+Arabic numbered items | ZPE browse; ISAP legal API | public-domain statutes |
| Finland | POPS 2014 (OPH) | 2014; next revision post-2026 | T-numbered prose | **ePerusteet REST API (no auth)** | unverified — confirm w/ OPH |
| Denmark | Fælles Mål (UVM) | 866 mid-tier goals advisory since 1 Jan 2025 ✅ | none | retsinformation legal XML | unverified; **replaced by fagplaner 2027–28 ✅** |
| Austria | Lehrpläne NEU 2023 (BMB) | rolling from 2023/24; AHS-Oberstufe 2027–28 | none | RIS legal XML | unverified |
| Belgium (FL) | Onderwijsdoelen/minimumdoelen | post-2022 court annulment; primary approved 2025, phasing 2025–26 ⚠ | numbered on portal | onderwijsdoelen.be | unverified |
| Belgium (FWB) | Référentiels du Tronc Commun | rolling P1 2022/23 → S3 2028/29; CEB 2026 first new-format | none | PDF | unverified |
| Portugal | Aprendizagens Essenciais + PASEO (DGE) | 2018; maths sec. 2024–26 | none | PDF | **CC BY-NC-ND → non-commercial** |
| Greece | Νέα Προγράμματα Σπουδών (IEP) | universal 2023/24; completes 2025/26 | none | PDF | unverified |
| Czechia | RVP (MŠMT/NPI) | **revised 30 Dec 2024; PV mandatory 2026, ZV 2027→2031** | none | prohlednout.rvp.cz (datasets) | unverified |
| Slovakia | ŠVP (NIVAM) | 2023; **mandatory 2026/27** | none | PDF | **CC BY 4.0** |
| Hungary | NAT 2020 + kerettantervek | 2020; evaluation to early 2026 | none | PDF | unverified |
| Romania | Curriculum național (+RECRED 2024–28) | liceu overhaul MO 4350+6930/2025 → grade 9 in 2026/27 | numbered competențe specifice | PDF | unverified |
| Bulgaria | ДОС + учебни програми (МОН) | 2016; reform concept in consultation 2025 | none | edu.mon.bg | unverified |
| Croatia | Škola za život kurikulumi (MZOM) | 2019 (mandatory 2020/21); AI subject 2025/26 | none | PDF | unverified |
| Slovenia | Učni načrti — Kurikularna prenova | adopted 2025, in force 2025/26 | none | DUN platform | unverified |
| Serbia | Planovi i programi nastave i učenja (ZUOV) | rollout since 2018; standards bylaws Dec 2024 | none | PDF | open-in-practice ⚠ |
| Bosnia-Herzegovina | 12 authorities (RS + 10 cantons + Brčko; APOSO coordinates) | fragmented | none | PDF | unverified |
| N. Macedonia | Наставни програми (BDE) | grade-7 2025/26, grade-8 2026/27 | none | PDF | unverified |
| Albania | Korniza Kurrikulare 2014 (ASCAP) | subject revisions 2024–25 | none | PDF | unverified |
| Estonia | Riiklik õppekava (HARNO) | updated Mar 2023 (aligned Sept 2024) | none | oppekava.ee + Riigi Teataja | unverified (ask HARNO re API) |
| Latvia | Skola2030 standards (VISC) | complete (2019–24); LV-only instruction 2025/26 | none | mape.gov.lv | unverified |
| Lithuania | Bendrosios programos (NŠA) | V-1269 of 24 Aug 2022; all grades by 2024–25 | some coded refs | emokykla.lt | unverified |
| Iceland | Aðalnámskrá (2011/2013 + 2023 am.) | rolling chapter updates | none | adalnamskra.is | unverified |
| Luxembourg | Plan d'études (SCRIPT) | **new plan Feb 2026 → cycles 1–2 Sept 2026, 3–4 Sept 2027** | unverified | plandetudes.lu (launches Sept 2026) | unverified |
| Malta | NCF 2012 + Learning Outcomes Framework | LOF completed Year 11 2025/26 | none | curriculum.gov.mt | unverified |
| Cyprus | Αναλυτικά Προγράμματα (MOEC) | 2010/11 + updates 2024–25 | success indicators (semi-structured) | PDF | unverified |
| Ukraine | Державний стандарт / NUS (МОН) | primary 2018, basic 2020, profile 2024 → national 2027–28 | none | zakon.rada.gov.ua | unverified |
| Moldova | Curriculum Național (+ Cadrul de Referință 2025) | redesign pilots 2026/27 → 2027/28 | none | PDF | unverified |
| Türkiye* | Öğretim Programları — TYMM (MEB/TTKB) | approved May 2024; phased 2024→~2027 | unit-numbered kazanımlar | mufredat.meb.gov.tr | unverified |
| Russia* | ФГОС + ФОП (Min. of Enlightenment) | 3rd-gen 2021–23; ФОП centralization 2023; sec. update 2027 | none | edsoo.ru / docs.edu.gov.ru | unverified |
| Kosovo | Kosovo Curriculum Framework 2016 (MESTI) | ECE pilot 2024 | none | PDF | unverified |
| Montenegro | Nastavni planovi (Zavod za školstvo) | Strategy 2025–2035 | none | PDF | unverified |

\* Europe-adjacent. Not separately researched: micro-states (AD/MC/SM/LI) and
Belarus/Caucasus.

## 6. Middle East & North Africa — Qatar first

### 6.1 Qatar (first deployment market) ◑

- **Framework:** Qatar National Curriculum Framework / National Curriculum
  Standards — **MOEHE** (Ministry of Education and Higher Education; successor
  to the Supreme Education Council). Strategy: National Education Strategy
  2024–2030 ("Igniting the Spark of Learning", launched Sept 2024).
- **Structure:** KG1–KG2 → Primary 1–6 → Preparatory 7–9 → Secondary 10–12.
- **Three school types:** government independent (Arabic-medium, national
  standards), private national (same standards), private **international**
  (foreign curriculum — British/American/IB/CBSE/French…).
- **The compliance overlay (verified across sources; primary regulation text
  not publicly retrievable):** all private schools and kindergartens —
  regardless of curriculum — must teach **(1) Arabic** (all students),
  **(2) Islamic education** (Muslim students), **(3) Qatar history** (all
  students), per the Academic Follow-up Policy (updated 2021), with
  MOEHE-approved assessments; teacher competency in these subjects assessed
  from 2025–26. Weekly-hour minimums exist but per-grade values are ⚠
  unverified.
- **Standards documents:** English Language standards KG–12 (CEFR-aligned, B2
  exit) publicly findable (ABEGS/MARSAD-hosted PDF); Arabic/maths/science via
  the MOEHE Curriculum Section; Islamic studies/Qatar history behind the portal.
  Mostly Arabic-language. Coding scheme ⚠ unverified. No API; government ©;
  **MOEHE contact required before ingestion.**
- **Product implication:** a Qatari international school needs *two stacked
  framework sets* (its curriculum + the MOEHE trio). The `standards uuid[]`
  multi-framework tagging and `grade_framework_assignments` already support
  this.

### 6.2 Rest of MENA (compact)

| Country | Framework (body) | Notes |
| --- | --- | --- |
| UAE | MoE national curriculum + regulators KHDA/ADEK/SPEA | Private schools must teach Arabic (all), Islamic ed (Muslims), Social/UAE Studies (all); allocations strengthened 2025–26 |
| Saudi Arabia | MoE national curriculum | Vision 2030 reform; prose; PDF |
| Kuwait | MoE | private schools: Arabic, Islamic studies, Kuwait social studies |
| Bahrain | MoE | Basic 1–9 + credit-hour secondary; English from Grade 1 |
| Oman | MoE | 2024 grade-1–4 restructuring; Cambridge maths/science integration; Vision 2040 |
| Jordan | MoE National Curriculum Framework | 2024 English K-12 standards (CEFR, performance indicators); ESP 2026–2030 |
| Egypt | MoETE — Education 2.0 (2018→) | EKB digital platform; competency prose |
| Israel | MoE | Bagrut units; 2024 humanities emphasis |
| Lebanon | CRDP/MEHE | 2000 curriculum; 2022 reform framework, implementation crisis-disrupted |

## 7. Asia-Pacific

| Country | Framework (body) | Version/rollout | Codes | Ingestion notes |
| --- | --- | --- | --- | --- |
| Singapore | MOE syllabuses + SEAB exam syllabuses | Full Subject-Based Banding from 2024 | 4-digit syllabus codes (subject-level, not standards) | **© MOE & Cambridge → permission** |
| India | NCF-SE 2023 (NCERT, NEP 2020); boards CBSE/CISCE/state | textbooks transitioning to 2026–27; CISCE NEP from 2025–26 | none (CBSE CBE separate) | gov publication, licence unverified |
| China | Compulsory-education curriculum standards 2022 (MoE PRC) | grades 1–9; 16 subjects revised | none | PDF; unverified |
| Japan | MEXT Courses of Study | 2017/18 rev.; next ~2029–30 | outline numerals only | PDF; unverified |
| South Korea | 2022 Revised National Curriculum (MoE/KICE) | rollout 2024→full Mar 2027 | **coded 성취기준 e.g. `[4국01-01]`** ◑ | ncic.re.kr PDFs |
| Hong Kong | EDB 8 Key Learning Areas | PECG 2024; Primary Science+Humanities 2025/26→2027/28 | none | PDF; HKSAR © |
| Taiwan | 108 Curriculum (NAER) | 2019, full 2021 | stage-coded indicators ⚠ | PDF |
| Philippines | MATATAG K-10 (DepEd) | 2024–25 → grade 10 2027–28; competencies cut >70% | predecessor MELCs coded; MATATAG ⚠ | PDF |
| Indonesia | Kurikulum Merdeka (Permendikbudristek 12/2024) | national; compliance 2026/27 | phase-based CP, no codes ⚠ | platform + PDF |
| Malaysia | KSSR/KSSM (BPK) | 2017 | decimal outline | PDF |
| Thailand | Basic Education Core Curriculum B.E. 2551 (OBEC) | 2008; overhaul requested Jun 2024 ⚠ | decimal indicators | PDF (English transl. exists) |
| Vietnam | GDPT 2018 (MOET) | all grades by 2024–25 | numbered requirements | PDF |
| Pakistan | National Curriculum of Pakistan / SNC | phases 2021–24; **Sindh rejected** | numbered SLOs | PDF |

## 8. Africa

- **South Africa — CAPS (DBE):** the continent's most complete document set
  (~70+ subject policies, Grades R–12, four phases). Topics-per-term prose, no
  codes. Free PDFs; © DBE; commercial use unverified. SASL added as a Home
  Language; per-subject amendments ongoing.
- **Kenya — CBC/CBE (KICD):** pioneer cohort reached Grade 10 (senior school)
  Jan 2026; first KJSEA national assessment Oct 2025; 2024 content
  rationalization. Strand/sub-strand prose.
- **Nigeria — NERDC curricula:** the legal minimum for all schools incl.
  private; browsable e-Curriculum portal (nerdc.org.ng/ecurriculum).
- **Ghana — Standards-Based Curriculum 2019 (NaCCA):** strand → sub-strand →
  content standard → indicator with decimal numbering (semi-taggable); SHS
  curriculum rolling out (English Nov 2024).
- **Rwanda — CBC (REB, 2016):** English-medium; prose syllabuses.
- **Morocco / Tunisia:** ministry curricula, reform programmes (Vision 2030 /
  digitalization); PDF-only, licences unverified.

## 9. Latin America

- **Brazil — BNCC ✅:** the region's flagship: ~600 coded habilidades in EF
  (`EF05MA01` = stage + year + subject + seq; multi-year `EF69LP01`; EM pattern
  `EM13CO01`). Official portal basenacionalcomum.mec.gov.br; third-party CIEB
  code lookup. Government publication — Brazilian law treats state works
  permissively but no explicit licence ⚠; structured-download availability
  currently ⚠ (portal intermittent).
- **Chile — Bases Curriculares (MINEDUC/UCE):** coded Objetivos de Aprendizaje
  (`TE01 OA 05`); excellent portal (curriculumnacional.cl) with PDF + historical
  Excel matrices ⚠; **1°–10° update consulted 2023–24 but NOT yet decreed** —
  current = 2012–2019 bases.
- **Mexico — NEM Plan de Estudios 2022 (SEP):** 6 phases, 4 formative fields
  replacing subjects; prose "learning situations"; politically contested.
- **Colombia:** EBC band standards + **DBA per-grade numbered** learning rights
  (colombiaaprende.edu.co).
- **Argentina (NAP), Peru (CNEB: 31 competencies), Ecuador (coded destrezas
  `CN.1.1.1` ⚠), Uruguay (MCN 2022), Costa Rica (MEP programas):** prose
  competency frameworks, PDF-only, licences unverified.

## 10. Faith-based, classical & alternative pedagogy

Honest classification — (a) taggable published standards, (b) proprietary
curriculum/scope-&-sequence, (c) accreditation/philosophy body (no taggable
standards):

**Taggable (a):**
| Framework | Subjects/grades | Access & licence |
| --- | --- | --- |
| **Adventist NAD Curriculum Standards** | PreK-12, 9 elementary subjects + 30+ secondary courses | free PDFs; "© may not be used without permission" → contact NAD |
| **Cardinal Newman Society Catholic Curriculum Standards** | ELA/Math/History/Science, bands K-6 + 7-12 | free download (PDF/Word/Excel); no licence terms → contact |
| **Core Knowledge Sequence** (classical-adjacent) | PreK-8, 6 subjects | **CC BY-NC-SA 4.0 ✅** — NC clause needs CKF reading for school-paid SaaS |
| **Zekelman Standards** (Judaic) | Chumash 1-8, Talmud, Kriah | free open-access ⚠ |
| **LCMS Lutheran Academic Standards** | K-12, 5 subjects | publishing via CPH ~May/June 2026 ⚠ |
| EL Education K-8 ELA (not faith — open model) | K-8 ELA, CCSS-aligned | open/free |

**Proprietary curricula (b):** Abeka, BJU Press, ACE (PACEs), Sonlight, Veritas,
Memoria Press, Classical Conversations (all: free scope-&-sequence, paid
objectives), Hillsdale K-12 program guides + 1776 Curriculum (free w/ account
⚠), CSI Bible standards (purchasable), AmblesideOnline (free Charlotte Mason
schedules, no discrete objectives), NETA/Bishvil Ha-Ivrit (Hebrew), Montessori
AMI/AMS (training-embedded albums; age bands 3-6/6-9/9-12), Waldorf
(commercial "Yellow Book" outline).

**Accreditation/philosophy only (c):** ACSI (Inspire standards = school
quality; its PDP arm sells curriculum), ACCS + SCL (classical accreditors —
explicitly do not write curriculum), NCEA NSBECS (Catholic school
effectiveness), CISNA/Tarbiyah/ISLA (Islamic — **no public English Islamic-
studies standards framework found**; Gulf Islamic studies comes from national
ministries — relevant to Qatar), Prizmah (Jewish network), MACTE (Montessori
teacher training), Reggio Emilia (no standards by design), JTS Tanakh/Rabbinics
standards (real but embedded in a PD programme).

US diocesan pattern: most Catholic dioceses adopt their state's standards +
diocesan religion standards (Chicago, LA, Boston examples in the seed).

## 11. What landed in the codebase (2026-06-12)

- **Catalog:** `lib/standards/frameworks-catalog.json` — 123 frameworks with
  authority, region, kind, lineage, grade range, subject scope, coding scheme,
  version/reform status, licence + commercial-use gate, machine-readable
  sources, links, and notes. Doubles as the Supabase `standards_frameworks`
  seed (schema: `docs/standards-catalog-schema-proposal.sql`).
- **Query layer:** `lib/standards/catalog.ts` (search + subject/grade filters,
  pinned-first ordering), `lib/standards/items.ts` (bundled taggable sets:
  CCSS ELA/Math, CCSS Mathematical Practices MP1–8, NGSS grade-5 PEs + 3–5
  engineering band, IB ATL categories at licence-safe category level),
  `lib/standards/pinned.ts` (per-teacher pinned frameworks).
- **UI:** `components/standards/StandardsPicker` — the standards menu (search,
  subject + grade filters, pin-to-top, per-framework licence badges), wired
  into the lesson editor's Standards row; saves through `editLesson` so the
  lazy-fork model is preserved end-to-end (mock + Supabase sources both accept
  `standards` in `LessonPatch`).

## 12. Verification appendix (3-voter adversarial pass)

Method: three independent fact-check agents each voted CONFIRM/REFUTE/UNSURE
on the 14 highest-consequence claims; 2/3 refutes kills a claim. Europe was
additionally verified by running the entire regional sweep twice with
independent agents (all load-bearing facts agreed).

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | IB prohibits unlicensed app/platform use of its content | ✅ 3/3 |
| 2 | ACARA v9 CC-BY 4.0 + MRAC (RDF/JSON-LD/SPARQL) | ✅ |
| 3 | NZ curriculum CC-BY-NC (non-commercial) | ◑ NC confirmed; "4.0 NZ" per education.govt.nz |
| 4 | England OGL v3; revised NC 2027, first teaching 2028 | ✅ 3/3 |
| 5 | CCSS licence allows free commercial use w/ attribution | ✏️ corrected: purpose-scoped royalty-free + mandatory notice (primary text checked directly) |
| 6 | Cambridge: public PDFs; written permission for reuse | ✅ 3/3 |
| 7 | Qatar mandates Arabic / Islamic ed (Muslims) / Qatar history in private schools | ◑ consistent across sources; primary regulation gated |
| 8 | BNCC coded skills (EF05MA01) | ✅ 3/3 |
| 9 | Skolverket Syllabus API public, CC0 | ✅ 3/3 |
| 10 | Norway Grep REST+SPARQL under NLOD | ✅ 3/3 |
| 11 | Common Standards Project alive in 2026 | ✅ (community-maintained) |
| 12 | Core Knowledge Sequence CC BY-NC-SA 4.0 | ✅ |
| 13 | Denmark: 866 goals advisory since 1 Jan 2025; fagplaner replace 2027–28 | ✅ 3/3 |
| 14 | France programmes under Licence Ouverte/Etalab 2.0 | ✅ 3/3 |

Per-claim evidence URLs live in the voters' outputs; per-section source links
are inline throughout this report. Remaining UNVERIFIED items are marked ⚠ in
place and carried as `commercial_use: "unverified"` / `catalog_notes` in the
seed so the import UI inherits the caveats.


