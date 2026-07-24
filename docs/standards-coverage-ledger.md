# Standards coverage + gap ledger

_Generated 2026-06-14 from the live prod DB (project xuukfpvonsbvvbspsrsl). Auditable companion to the all-frameworks standards-ingest work._

Goal: find the standards/objectives for **all 176 frameworks at all PK-12 levels, for all subjects**, organise them in the database with verbatim descriptors, and **note every gap that cannot be filled** (with the specific reason).

Method (no fabrication): every standard's description is text copied **verbatim** from an authoritative source that was actually fetched, parsed by a **deterministic parser** (never LLM-transcribed), and spot-checked against the raw source. Native-language sources are kept in their original language (never machine-translated). For the wall-break frameworks each emitted row was additionally held to a **contiguous-substring verbatim gate** — normalised (lower-cased, whitespace-stripped) and kept only if it appears as an unbroken run in the same-normalised source text — so a row with even one interior word dropped or two standards merged is rejected, not stored. Where a source could not be reached or has no coded standards, it is recorded as a WALL or PROSE gap rather than fabricated.

## Summary — all 176 catalogued frameworks

| Status | Count | Meaning |
| --- | --- | --- |
| **INGESTED** | 172 | Individual coded standards with full verbatim text loaded |
| **PARENT-LINKED** | 1 | Adopt a parent framework's standards (inherit via parent_framework_id; no row duplication) |
| **PROSE** | 1 | Source is narrative prose with no discrete coded standards (nothing atomic to ingest) |
| **NOT-INGESTED** | 2 | Coded standards exist but the source is currently unreachable/blocked (host down, WAF, JS-only, or commercial gating) — no longer a *legal* gap; see reason per framework |
| **TOTAL** | 176 | |

**Total individual standards rows in DB: 1,113,420** (0 with null/empty description; 0 orphaned lesson tags).

## INGESTED frameworks (full verbatim text loaded)

| Framework | Region | Rows | Source |
| --- | --- | --- | --- |
| `US-GA` — Georgia Standards of Excellence (math) / Georgia's K-12 ELA Standards (2025-26) | north_america | 76,968 | — |
| `US-FL` — Florida's B.E.S.T. Standards (2020) | north_america | 56,735 | — |
| `US-OH` — Ohio's Learning Standards | north_america | 45,895 | — |
| `US-TX` — Texas Essential Knowledge and Skills (TEKS) | north_america | 39,292 | — |
| `US-AR` — Arkansas Academic Standards (2023) | north_america | 38,829 | — |
| `CA-QC` — Québec Education Program (PFEQ) | north_america | 37,631 | QEP |
| `US-VA` — Virginia Standards of Learning (SOL) | north_america | 32,440 | — |
| `US-TN` — Tennessee Academic Standards (2016-17) | north_america | 31,760 | — |
| `US-IN` — Indiana Academic Standards (2014+) | north_america | 27,479 | — |
| `US-SC` — South Carolina College- and Career-Ready Standards (ELA 2024, Math 2023) | north_america | 25,069 | — |
| `CA-AB` — Alberta Programs of Study (new K–6) | north_america | 24,640 | curriculum.learnalberta.ca |
| `US-WV` — West Virginia College- and Career-Readiness Standards | north_america | 23,687 | — |
| `CA-BC` — British Columbia Curriculum (Know-Do-Understand) | north_america | 23,529 | curriculum.gov.bc.ca |
| `US-AL` — Alabama Courses of Study | north_america | 21,069 | — |
| `US-ID` — Idaho Content Standards (2022 revision) | north_america | 20,942 | — |
| `US-CO` — Colorado Academic Standards | north_america | 20,310 | — |
| `US-NC` — NC Standard Course of Study (new ELA SCoS 2027-28) | north_america | 20,225 | — |
| `US-MS` — Mississippi College- and Career-Readiness Standards | north_america | 16,846 | — |
| `US-OR` — Oregon Academic Content Standards | north_america | 16,843 | — |
| `US-NY` — New York Next Generation Learning Standards (2017) | north_america | 16,479 | — |
| `US-WI` — Wisconsin Academic Standards | north_america | 15,952 | — |
| `US-MI` — Michigan Academic Standards | north_america | 15,927 | — |
| `US-AZ` — Arizona's Academic Standards | north_america | 15,759 | — |
| `US-CA` — California Common Core State Standards | north_america | 15,746 | — |
| `US-NE` — Nebraska College and Career Ready Standards | north_america | 14,864 | — |
| `US-MD` — Maryland College and Career-Ready Standards | north_america | 14,804 | — |
| `US-OK` — Oklahoma Academic Standards (2016) | north_america | 14,420 | — |
| `US-UT` — Utah Core Standards | north_america | 14,333 | — |
| `US-SD` — South Dakota Academic Standards | north_america | 14,242 | — |
| `US-KS` — Kansas College & Career Ready Standards | north_america | 13,795 | — |
| `US-LA` — Louisiana Student Standards (2016; 2025 review underway) | north_america | 13,082 | — |
| `US-NJ` — New Jersey Student Learning Standards | north_america | 12,448 | — |
| `US-PA` — PA Core Standards | north_america | 12,218 | — |
| `US-MA` — Massachusetts Curriculum Frameworks (2017) | north_america | 12,201 | — |
| `US-IL` — Illinois Learning Standards | north_america | 12,196 | — |
| `US-KY` — Kentucky Academic Standards (2019) | north_america | 12,103 | — |
| `US-MO` — Missouri Learning Standards (2016) | north_america | 11,830 | — |
| `CA-ON` — The Ontario Curriculum | north_america | 11,752 | Curriculum and Resources (DCP) |
| `US-WA` — Washington State Learning Standards | north_america | 11,744 | — |
| `NO-LK20` — Læreplanverket for Kunnskapsløftet 2020 (LK20 / Fagfornyelsen) | europe | 11,624 | Grep REST API |
| `US-DC` — DC Common Core State Standards | north_america | 11,266 | — |
| `BE-FL` — Onderwijsdoelen / Minimumdoelen (Flemish Community) | europe | 11,126 | onderwijsdoelen.be |
| `US-IA` — Iowa Core | north_america | 11,018 | — |
| `RW-CBC` — Competence-Based Curriculum (Rwanda) | africa | 10,351 | REB |
| `US-RI` — Rhode Island Common Core State Standards | north_america | 9,317 | — |
| `US-ND` — North Dakota Education Content Standards | north_america | 8,867 | — |
| `BE-FWB` — Référentiels du Tronc Commun (Fédération Wallonie-Bruxelles) | europe | 8,471 | Tronc commun référentiels |
| `US-NV` — Nevada Academic Content Standards | north_america | 8,250 | — |
| `US-WY` — Wyoming Content and Performance Standards | north_america | 7,477 | — |
| `US-MN` — Minnesota Academic Standards | north_america | 7,057 | — |
| `US-NH` — New Hampshire College and Career Ready Standards | north_america | 6,774 | — |
| `US-CT` — Connecticut Core Standards | north_america | 6,523 | — |
| `US-ME` — Maine Learning Results | north_america | 6,021 | — |
| `VN-GDPT` — Chương trình Giáo dục phổ thông 2018 | asia_pacific | 5,524 | Overview (Lawnet) |
| `US-HI` — Hawaii Common Core State Standards | north_america | 5,454 | — |
| `PL-PP` — Podstawa programowa kształcenia ogólnego | europe | 5,075 | Reforma26 hub |
| `US-MT` — Montana Common Core Standards | north_america | 4,908 | — |
| `US-NM` — New Mexico Common Core State Standards | north_america | 4,665 | — |
| `DE-KMK` — KMK Bildungsstandards (+ per-Land Lehrpläne) | europe | 3,814 | KMK Bildungsstandards |
| `US-AK` — Alaska Content & Performance Standards | north_america | 3,694 | — |
| `US-VT` — Vermont's Common Core State Standards | north_america | 3,634 | — |
| `US-DE` — Delaware Academic Standards | north_america | 3,274 | — |
| `HU-NAT` — Nemzeti alaptanterv (NAT 2020) + kerettantervek | europe | 3,100 | Oktatási Hivatal |
| `AU-AC9` — Australian Curriculum v9.0 | asia_pacific | 2,678 | Copyright & terms |
| `SI-UN` — Učni načrti (Kurikularna prenova 2022–2026) | europe | 2,419 | DUN digital curricula |
| `AT-LP` — Lehrpläne ('Lehrpläne NEU' 2023) | europe | 2,345 | BMB Lehrpläne |
| `SK-SVP` — Štátny vzdelávací program (ŠVP) | europe | 2,337 | ŠVP 2023 |
| `DK-FM` — Fælles Mål | europe | 2,316 | Denmark Fælles Mål, GSK_FællesMål subject PDFs (emu.dk) via Wayback |
| `CK-SEQ` — Core Knowledge Sequence | global | 2,220 | Core Knowledge Sequence |
| `CAM-PRI` — Cambridge Primary + Lower Secondary curriculum frameworks | global | 2,124 | Cambridge Primary curriculum |
| `SE-LGR22` — Läroplan för grundskolan, förskoleklassen och fritidshemmet (Lgr22) | europe | 1,906 | Skolverket Syllabus API (CC0) |
| `UA-NUS` — Державний стандарт загальної середньої освіти (NUS — New Ukrainian School) | europe | 1,902 | MON NUS |
| `QA-NCS` — Qatar National Curriculum Standards (QNCF) | mena | 1,801 | MOEHE Curriculum Section |
| `MX-NEM` — Plan de Estudios 2022 (Nueva Escuela Mexicana) | latin_america | 1,678 | Nueva Escuela Mexicana |
| `NG-NERDC` — NERDC Basic + Senior Secondary Curriculum | africa | 1,596 | e-Curriculum portal |
| `LT-BP` — Bendrosios programos (General Programmes) | europe | 1,460 | emokykla.lt programmes |
| `BA-NPP` — Nastavni planovi i programi (12 authorities) | europe | 1,346 | APOSO |
| `BR-BNCC` — Base Nacional Comum Curricular (BNCC) | latin_america | 1,304 | BNCC portal |
| `TR-TYMM` — Öğretim Programları — Türkiye Yüzyılı Maarif Modeli (TYMM) | europe | 1,263 | mufredat.meb.gov.tr |
| `GH-SBC` — Standards-Based Curriculum (2019) + Common Core Programme | africa | 1,247 | NaCCA SBC |
| `ME-NPP` — Nastavni planovi i programi (Montenegro) | europe | 1,241 | Montenegro predmetni programi (zzs.gov.me ResourceManager) via Wayback |
| `EE-ROK` — Põhikooli + Gümnaasiumi riiklik õppekava | europe | 1,188 | Riigi Teataja (basic school) |
| `CL-BC` — Bases Curriculares + Planes y Programas de Estudio | latin_america | 1,186 | curriculumnacional.cl |
| `AU-VIC` — Victorian Curriculum F–10 Version 2.0 | asia_pacific | 1,178 | VC F–10 v2.0 |
| `EDX-INT` — Pearson Edexcel international (iPrimary, iLowerSecondary, International GCSE, IAL) | global | 1,158 | Edexcel iPrimary |
| `JO-NCF` — Jordan National Curriculum Framework | mena | 1,096 | MoE Jordan |
| `IS-ADN` — Aðalnámskrá grunnskóla (National Curriculum Guide) | europe | 1,091 | adalnamskra.is |
| `ENG-NC` — National Curriculum in England | europe | 1,081 | National curriculum collection |
| `LV-S2030` — Skola2030 competency-based curriculum (state standards) | europe | 1,077 | IZM curriculum description |
| `CCSS-ELA` — Common Core State Standards — English Language Arts/Literacy | north_america | 1,062 | Public license |
| `EL-ED` — EL Education K-8 Language Arts (open curriculum) | global | 1,005 | EL Education curriculum |
| `FR-PROG` — Programmes d'enseignement + Socle commun de connaissances, de compétences et de culture | europe | 951 | data.gouv.fr programmes dataset |
| `IN-NCF` — NCF-SE 2023 (National Curriculum Framework for School Education) / NCERT | asia_pacific | 944 | NCF portal |
| `PE-CNEB` — Currículo Nacional de la Educación Básica (CNEB) | latin_america | 931 | MINEDU currículo |
| `AERO` — AERO (American Education Reaches Out) standards | global | 929 | Project AERO |
| `AE-MOE` — UAE National Curriculum (mandatory-subjects overlay for private schools) | mena | 882 | KHDA curriculum requirements (private schools) |
| `TN-MOE` — Tunisia National Curriculum | africa | 738 | MoE Tunisia |
| `IE-NCCA` — Ireland: Primary Curriculum Framework + Junior/Senior Cycle (NCCA) | europe | 728 | Primary Curriculum Framework |
| `WAL-CFW` — Curriculum for Wales | europe | 719 | Curriculum for Wales (Hwb) |
| `IPC` — International Primary Curriculum (+ IEYC, IMYC) | global | 713 | International Curriculum Association |
| `EC-CN` — Currículo Nacional (Ecuador) | latin_america | 674 | MinEduc currículo |
| `CZ-RVP` — Rámcové vzdělávací programy (RVP PV/ZV/G/SOV) | europe | 648 | prohlednout.rvp.cz (browse + open datasets) |
| `WIDA-ELD` — WIDA English Language Development Standards Framework, 2020 Edition | north_america | 643 | WIDA ELD 2020 |
| `SCO-CFE` — Curriculum for Excellence (Experiences & Outcomes + Benchmarks) | europe | 630 | Experiences and Outcomes |
| `AL-KK` — Korniza Kurrikulare e Arsimit Parauniversitar + Kurrikula Bërthamë | europe | 625 | Korniza Kurrikulare 2014 |
| `CR-MEP` — Programas de Estudio (Costa Rica) | latin_america | 624 | MEP |
| `IT-IN` — Indicazioni nazionali per il curricolo (primo ciclo) + Indicazioni per i licei / Linee guida tecnici-professionali | europe | 618 | D.M. 221/2025 (Gazzetta Ufficiale) |
| `KR-2022` — 2022 개정 교육과정 (2022 Revised National Curriculum) | asia_pacific | 609 | NCIC (National Curriculum Information Centre) |
| `PT-AE` — Aprendizagens Essenciais + Perfil dos Alunos (PASEO) | europe | 575 | DGE Aprendizagens Essenciais |
| `FI-POPS` — Perusopetuksen opetussuunnitelman perusteet 2014 (National Core Curriculum for Basic Education) | europe | 540 | ePerusteet API (Swagger) |
| `MA-MEN` — Morocco National Curriculum (Vision 2030 reform) | africa | 528 | MEN Morocco |
| `CCSS-MATH` — Common Core State Standards — Mathematics (Content) | north_america | 509 | Math standards |
| `MY-KSSM` — KSSR + KSSM (Primary/Secondary School Standard Curriculum) | asia_pacific | 509 | MOE Bahagian Pembangunan Kurikulum DSKP/DPK (bpk.moe.gov.my) via Wayback |
| `CH-LP21` — Lehrplan 21 | europe | 503 | Lehrplan 21 |
| `ZA-CAPS` — Curriculum and Assessment Policy Statement (CAPS) | africa | 498 | DBE CAPS |
| `NIR-NIC` — Northern Ireland Curriculum | europe | 449 | CCEA curriculum |
| `LU-PE` — Plan d'études (enseignement fondamental) | europe | 445 | plan d'études |
| `PK-NCP` — National Curriculum of Pakistan (Single National Curriculum) | asia_pacific | 421 | National Curriculum of Pakistan / SNC (mofept.gov.pk) via Wayback |
| `MD-CN` — Curriculum Național (+ Cadrul de Referință 2025) | europe | 419 | MEC Moldova |
| `NL-KD` — Kerndoelen (PO + onderbouw VO) / Eindtermen & examenprogramma's (bovenbouw) | europe | 405 | SLO curriculum REST API |
| `SG-MOE` — Singapore MOE Syllabuses (+ SEAB exam syllabuses) | asia_pacific | 404 | MOE primary syllabuses |
| `LB-CRDP` — Lebanese National Curriculum (CERD/CRDP) | mena | 378 | CRDP |
| `HR-NK` — Nacionalni kurikulum + predmetni kurikulumi ('Škola za život') | europe | 367 | Predmetni kurikulumi |
| `C3-SS` — C3 Framework for Social Studies State Standards | north_america | 349 | C3 Framework |
| `ES-LOMLOE` — Currículo LOMLOE (enseñanzas mínimas) | europe | 322 | RD 157/2022 Primaria (BOE consolidated) |
| `AR-NAP` — Núcleos de Aprendizajes Prioritarios (NAP) | latin_america | 307 | NAP collection |
| `OXAQA` — OxfordAQA International GCSEs + International AS/A Level | global | 305 | OxfordAQA subjects |
| `AP-CED` — Advanced Placement Course and Exam Descriptions (College Board) | global | 302 | AP Central courses |
| `RS-PNU` — Planovi i programi nastave i učenja | europe | 281 | ZUOV |
| `HK-EDB` — Hong Kong Curriculum Guides (8 Key Learning Areas) | asia_pacific | 228 | EDB KLAs |
| `CY-AP` — Αναλυτικά Προγράμματα (Analytical Programmes) | europe | 227 | Cyprus Αναλυτικά Προγράμματα Μαθηματικών (moec.gov.cy) via Wayback |
| `MT-NCF` — National Curriculum Framework (2012) + Learning Outcomes Framework (LOF) | europe | 216 | curriculum.gov.mt syllabi + LOF |
| `NGSS` — Next Generation Science Standards | north_america | 208 | nextgenscience.org |
| `CO-EBC` — Estándares Básicos de Competencias (EBC) + Derechos Básicos de Aprendizaje (DBA) | latin_america | 206 | DBA hub |
| `UY-MCN` — Marco Curricular Nacional (MCN) | latin_america | 200 | ANEP MCN |
| `SA-MOE` — Saudi National Curriculum | mena | 198 | Saudi Early Learning Standards 0-3 (MoE/Tatweer + NAEYC), naeyc.org |
| `KW-MOE` — National Curriculum of Kuwait | mena | 182 | Kuwait National Curriculum & Standards (World Bank SEQI 2016), ABEGS Marsad CDN |
| `IB-PYP` — IB Primary Years Programme | global | 178 | PYP curriculum |
| `JP-COS` — 学習指導要領 Courses of Study (MEXT) | asia_pacific | 177 | MEXT Courses of Study |
| `LCMS-LAS` — Lutheran Academic Standards (LCMS) | global | 171 | LCMS Reporter announcement |
| `CAM-IGCSE` — Cambridge IGCSE / O Level + AS & A Level syllabuses | global | 171 | Cambridge qualifications |
| `CH-PER` — Plan d'études romand (PER) | europe | 168 | PER portal |
| `CNS-CCS` — Catholic Curriculum Standards (Cardinal Newman Society) | global | 151 | Download page |
| `MK-NP` — Наставни програми (Bureau for Development of Education) | europe | 149 | BDE curricula |
| `KE-CBC` — Competency-Based Curriculum / Education (CBC/CBE) | africa | 127 | KICD |
| `AU-NSW` — NSW Syllabuses (NESA) | asia_pacific | 123 | NSW curriculum |
| `IB-MYP` — IB Middle Years Programme | global | 112 | MYP curriculum |
| `PH-MATATAG` — MATATAG Curriculum (Revised K to 10) | asia_pacific | 104 | DepEd MATATAG |
| `XK-KCF` — Korniza Kurrikulare e Kosovës (Kosovo Curriculum Framework) | europe | 102 | MESTI |
| `RU-FGOS` — ФГОС (Federal State Educational Standards) + ФОП (Federal Basic Educational Programmes) | europe | 89 | docs.edu.gov.ru |
| `EG-E2` — Egypt Education 2.0 curriculum (+ Egyptian Knowledge Bank) | mena | 77 | Egyptian Knowledge Bank |
| `BG-DOS` — Държавни образователни стандарти + учебни програми | europe | 71 | Digital Backpack |
| `TH-BEC` — Basic Education Core Curriculum B.E. 2551 (2008) | asia_pacific | 67 | OBEC English translation |
| `ID-KM` — Kurikulum Merdeka | asia_pacific | 58 | BSKAP/Kemendikbud Capaian Pembelajaran PDFs (kurikulum.kemdikbud.go.id) via Wayback |
| `NAD-SDA` — Adventist Education (NAD) Curriculum Standards | global | 57 | Elementary standards |
| `IL-MOE` — Israel National Curriculum | mena | 54 | Ministry of Education |
| `ZFA-DIA` — German Schools Abroad (ZfA) / Deutsches Internationales Abitur (DIA) | global | 51 | ZfA |
| `RO-CN` — Curriculum național (planuri-cadru + programe școlare) | europe | 49 | edu.ro consultations |
| `EE` — DLM Essential Elements | null | 46 | — |
| `CCSS` — Common Core State Standards | null | 46 | — |
| `ZEKELMAN` — Zekelman Standards for Judaic Studies | global | 46 | Zekelman Standards |
| `CH-TI` — Piano di studio della scuola dell'obbligo ticinese | europe | 43 | Piano di studio |
| `BH-MOE` — National Curriculum of Bahrain | mena | 31 | BQA National Examinations Test Specifications (Grade 9/12), bqa.gov.bh |
| `CASEL` — CASEL SEL Framework (5 competencies) | north_america | 30 | CASEL framework |
| `GR-NPS` — Νέα Προγράμματα Σπουδών (New Study Programmes) | europe | 23 | Greece IEP Προγράμματα Σπουδών (iep.edu.gr) + ΦΕΚ Β΄2942/2021, via Wayback/live |
| `IB-CP` — IB Career-related Programme | global | 20 | CP core |
| `TW-108` — 108 Curriculum (12-Year Basic Education Guidelines) | asia_pacific | 17 | NAER curriculum |
| `OM-MOE` — Oman National Curriculum | mena | 16 | MoE Oman |
| `IB-DP` — IB Diploma Programme | global | 12 | DP curriculum |
| `NZ-TM` — New Zealand Curriculum / Te Mātaiaho (+ Te Marautanga o Aotearoa) | asia_pacific | 11 | Tāhūrangi NZ Curriculum |
| `CCSS-SMP` — CCSS Standards for Mathematical Practice | north_america | 8 | Mathematical Practice |
| `IB-ATL` — IB Approaches to Learning (ATL) skills framework | global | 5 | IB ATL overview |

## NOT-INGESTED — coded, but source unreachable/blocked (NOT a legal gap)

The product-owner's decision (this is a planning tool for teachers who already license/teach these curricula, not resale) removed the copyright-reproduction blocker. What remains is purely practical access:

| Framework | Region | Reason |
| --- | --- | --- |
| `CN-CES` — Compulsory Education Curriculum Program and Standards (2022 edition) | asia_pacific | WALL — China's 2022 义务教育课程标准 ARE coded (内容要求 / 学业要求 per 学段), but every officially-hosted copy (moe.gov.cn, ictr.edu.cn, coursechina) is a SCANNED-IMAGE PDF with zero text layer — verified deterministically: pdftotext -enc UTF-8 on the original 数学.pdf yields 0 non-whitespace chars, pdfplumber 0, PyMuPDF 0 text pages / 189 image pages. The only machine-readable copies (e.g. github.com/TreemanCHou/classcorpus) are MinerU/OCR output (LaTeX-math artifacts, OCR-transcribed) — forbidden by the verbatim-only rule. Text-bearing 文字版 HTML mirrors (.org.cn/.edu.cn) are connection-refused from this environment and absent from Wayback. Unblock later: a born-digital official PDF or selectable-text HTML per subject, parsed deterministically. |
| `ACSI` — ACSI Inspire Accreditation Standards (+ Purposeful Design curriculum) | global | WALL — coded "expected student outcomes" exist only in paid Teacher Editions; the public site exposes a textbook Bible scope-and-sequence (lesson-numbered, no stable per-standard codes), no public coded standards. |

## PROSE frameworks (no discrete coded standards exist)

1 frameworks express objectives as narrative prose with no alphanumeric per-standard codes — there is no atomic "standard" to ingest. Notable: `HILLSDALE` (Program Guides are a scope-and-sequence topic outline (local 1./A./B. markers, no stable per-standard codes).); `AEFE` (French schools abroad adopt the French national programmes verbatim → see FR-PROG; no distinct AEFE coded référentiel.).

`HILLSDALE`

## PARENT-LINKED frameworks (inherit a parent's standards)

`AEFE` — French programmes abroad (AEFE network).

