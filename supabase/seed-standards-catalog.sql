-- supabase/seed-standards-catalog.sql — GENERATED, do not hand-edit.
-- Regenerate: npx tsx scripts/gen-standards-catalog-sql.mjs
-- Source: lib/standards/frameworks-catalog.json (174 frameworks)
--         + lib/standards/items.ts bundled taggable sets.
-- Idempotent: frameworks/standards upsert on their deterministic ids
-- (lib/planner/id-bridge.ts uuidv5); grade assignments insert-if-absent.
-- APPLY AFTER migrations/20260613120000_standards_catalog.sql and BEFORE
-- enabling NEXT_PUBLIC_PLANNER_USE_SUPABASE for standards tagging.

begin;

-- ── Frameworks (174) ─────────────────────────────
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('1d45a4d9-f9ac-5eb3-b194-13e3a3022e97', 'Programmes d''enseignement + Socle commun de connaissances, de compétences et de culture', 'FR-PROG', 'FR',
   'Same programmes used by the 580-school AEFE network worldwide. Verify whether 2025–26 reform texts have reached data.gouv.fr.', 'catalog', 3,
   'Ministère de l''Éducation nationale (DGESCO)', 'FR', null,
   'europe', 'national_curriculum'::framework_type,
   'Cycles 1–4 (ages 3–15) + lycée (15–18)', array['all_subjects']::text[], false,
   'Prose objectives per cycle per subject; socle commun = 5 domains. No alphanumeric IDs.', 'Choc des savoirs wave (C1–C2 arrêté 22 Oct 2024; C3 arrêté 10 Apr 2025; C4 français/maths arrêté 18 Feb 2026)', 2025,
   'Rolling implementation through 2028–29; socle commun revision in flight', 'Licence Ouverte / Etalab 2.0 (data.gouv.fr); arrêtés are public legal texts', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[{"label":"data.gouv.fr programmes dataset","url":"https://www.data.gouv.fr/datasets/programmes-denseignement-de-lecole-elementaire-et-du-college-cycles-2-3-et-4"},{"label":"Éduscol socle commun","url":"https://eduscol.education.gouv.fr/4761/le-socle-commun-de-connaissances-de-competences-et-de-culture"}]'::jsonb,
   'Same programmes used by the 580-school AEFE network worldwide. Verify whether 2025–26 reform texts have reached data.gouv.fr.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('6cf50fb9-ead0-587c-9048-316a42559f56', 'KMK Bildungsstandards (+ per-Land Lehrpläne)', 'DE-KMK', 'DE',
   'No single national curriculum — 16 Länder Lehrpläne (e.g. NRW Lehrplannavigator, Bavaria LehrplanPLUS, Berlin-Brandenburg RLP 1–10). Highest ingestion friction in Western Europe.', 'catalog', 3,
   'Kultusministerkonferenz (KMK); 16 Länder ministries for operative Lehrpläne', 'DE', null,
   'europe', 'standards'::framework_type,
   'Checkpoints: Grade 4, Grades 9/10 (HSA/MSA), Abitur', array['ela','math','languages','science']::text[], false,
   'Prose Kompetenzbereiche/Kompetenzen; no ID system. Länder Lehrpläne also prose (Kompetenzerwartungen).', 'German+Maths 2022; English/French 2023; Bio/Chem/Physics (MSA) 2024; Abitur 2012/2020', 2024,
   'Teacher-education standards review piloting; results expected 2026', 'No open licence confirmed at KMK or any sampled Land', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[{"label":"KMK Bildungsstandards","url":"https://www.kmk.org/themen/qualitaetssicherung-in-schulen/bildungsstandards.html"},{"label":"All 16 Länder portals (index)","url":"https://www.lehrer-online.de/fokusthemen/dossier/do/lehrplaene-der-bundeslaender/"}]'::jsonb,
   'No single national curriculum — 16 Länder Lehrpläne (e.g. NRW Lehrplannavigator, Bavaria LehrplanPLUS, Berlin-Brandenburg RLP 1–10). Highest ingestion friction in Western Europe.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('8b0032e4-73ca-5302-bb8a-babc59d67935', 'Currículo LOMLOE (enseñanzas mínimas)', 'ES-LOMLOE', 'ES',
   'BOE API serves full consolidated decree text (objectives embedded in annexes). Regional (CCAA) decrees need per-community licence checks.', 'catalog', 3,
   'Ministerio de Educación, FP y Deportes; 17 comunidades autónomas develop regional curricula', 'ES', null,
   'europe', 'national_curriculum'::framework_type,
   'Infantil (0–6), Primaria 1–6, ESO 7–10, Bachillerato 11–12', array['all_subjects']::text[], true,
   '8 coded key competencies (CCL, CP, STEM, CD, CPSAA, CC, CE, CCEC) with coded descriptors (CCL1…); subject objectives via decree article/annex numbering', 'RD 95/157/217/243 of 2022 (fully implemented 2023–24)', 2022,
   null, 'BOE open-data reuse conditions (commercial OK with attribution; RD 806/2018)', 'open_attribution'::framework_commercial_use,
   null, array['api','xml','json','pdf']::text[], '[{"label":"RD 157/2022 Primaria (BOE consolidated)","url":"https://www.boe.es/buscar/act.php?id=BOE-A-2022-3296"},{"label":"BOE open-data API","url":"https://www.boe.es/datosabiertos/api/api.php"}]'::jsonb,
   'BOE API serves full consolidated decree text (objectives embedded in annexes). Regional (CCAA) decrees need per-community licence checks.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b2c3cfa5-2e37-5133-8142-03527f188ae3', 'Indicazioni nazionali per il curricolo (primo ciclo) + Indicazioni per i licei / Linee guida tecnici-professionali', 'IT-IN', 'IT',
   'Traguardi per lo sviluppo delle competenze (end-of-stage) + obiettivi di apprendimento — prose, no codes', 'catalog', 3,
   'Ministero dell''Istruzione e del Merito (MIM)', 'IT', null,
   'europe', 'national_curriculum'::framework_type,
   'Infanzia (3–6), primaria 1–5, secondaria I grado 6–8, secondaria II grado 9–13', array['all_subjects']::text[], false,
   'Traguardi per lo sviluppo delle competenze (end-of-stage) + obiettivi di apprendimento — prose, no codes', 'Primo ciclo: D.M. 221 of 9 Dec 2025 (in force 11 Feb 2026; rollout 2026/27→2030/31). Licei: new Indicazioni in consultation Apr 2026', 2026,
   'Primo ciclo rollout from 2026/27; licei text not yet adopted', 'Gazzetta Ufficiale legal texts freely reproducible; CAD ''open by default'' principle; no explicit licence statement', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"D.M. 221/2025 (Gazzetta Ufficiale)","url":"https://www.gazzettaufficiale.it/eli/id/2026/01/27/26G00021/SG"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('49138bc1-3811-519b-954b-9c92a4b9f7f5', 'Kerndoelen (PO + onderbouw VO) / Eindtermen & examenprogramma''s (bovenbouw)', 'NL-KD', 'NL',
   'Most LMS-friendly in continental Europe: CC-BY + live JSON API (2006 set confirmed; new-set API status unverified).', 'catalog', 3,
   'SLO (develops) / Ministry OCW (legislates)', 'NL', null,
   'europe', 'national_curriculum'::framework_type,
   'PO grades 1–8 (ages 4–12); onderbouw VO 7–9; bovenbouw havo/vwo/vmbo', array['all_subjects']::text[], true,
   'Consecutively numbered kerndoelen (current set KD 1–58 in 7 areas; new set = 9 areas, doorgenummerd) — numbered prose, not hierarchical codes', '2006 set in force; actualisatie: Dutch+Maths expected legally in force 1 Aug 2026, remaining areas Aug 2027', 2006,
   'First full revision since 2006 landing 2026–27', 'CC BY 4.0 (SLO Curriculum Database on data.overheid.nl)', 'open_attribution'::framework_commercial_use,
   null, array['api','json','pdf','html']::text[], '[{"label":"SLO curriculum REST API","url":"https://opendata.slo.nl/curriculum/api/v1/"},{"label":"data.overheid.nl dataset (CC-BY 4.0)","url":"https://data.overheid.nl/en/dataset/slo-curriculumdatabase"}]'::jsonb,
   'Most LMS-friendly in continental Europe: CC-BY + live JSON API (2006 set confirmed; new-set API status unverified).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('51ef7e93-069f-5c51-bd86-302e717b0ad6', 'Podstawa programowa kształcenia ogólnego', 'PL-PP', 'PL',
   'Wymagania szczegółowe numbered Roman-domain + Arabic-item per subject (hybrid numbered prose, addressable within subject)', 'catalog', 3,
   'Ministerstwo Edukacji Narodowej (MEN)', 'PL', null,
   'europe', 'national_curriculum'::framework_type,
   'Preschool 3–6; grades 1–3; 4–8; liceum/technikum/branżowa', array['all_subjects']::text[], true,
   'Wymagania szczegółowe numbered Roman-domain + Arabic-item per subject (hybrid numbered prose, addressable within subject)', '2017 base; 2024 slimmed version; NEW podstawa for preschool+primary Dz.U. 2026 poz. 378 (signed 11 Mar 2026), effective 1 Sept 2026 grades 1+4, phased to 2032 (''Reforma26 — Kompas Jutra'')', 2026,
   'Reforma26 rollout from Sept 2026; new structure ≤8 objective elements per subject', 'Statutory texts public domain (Open Data Act 2021); ZPE platform content CC', 'open'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Reforma26 hub","url":"https://reforma26.men.gov.pl"},{"label":"ISAP record Dz.U. 2026 poz. 378","url":"https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20260000378"},{"label":"ZPE structured browse","url":"https://zpe.gov.pl/podstawa-programowa/szkola-podstawowa/jezyk-polski"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f2906043-750a-55f0-9bdc-a4028f0370bd', 'Lehrplan 21', 'CH-LP21', 'CH',
   'Per-canton adapted versions (zh.lehrplan.ch etc.). API exists but is access-controlled.', 'catalog', 3,
   'D-EDK (Deutschschweizer Erziehungsdirektoren-Konferenz)', 'CH', null,
   'europe', 'national_curriculum'::framework_type,
   '3 Zyklen, 11 years compulsory (ages ~4–15); 21 German-speaking/bilingual cantons', array['all_subjects']::text[], true,
   'Fully coded competences: Subject.Area.Aspect.Level.Sub — e.g. MA.1.A.3.c. One of Europe''s most granular systems', '2014 (cantonal rollouts 2018–2022)', 2014,
   null, '© D-EDK; API (api.lehrplan.ch) access by application/agreement (BKZ)', 'permission_required'::framework_commercial_use,
   null, array['api','html','pdf']::text[], '[{"label":"Lehrplan 21","url":"https://www.lehrplan21.ch"},{"label":"LP21 API info","url":"https://www.lehrplan21.ch/api-schnittstelle-zum-lehrplan-21"}]'::jsonb,
   'Per-canton adapted versions (zh.lehrplan.ch etc.). API exists but is access-controlled.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('512ba4fa-ae4d-573f-ad02-b84b04e0721f', 'Plan d''études romand (PER)', 'CH-PER', 'CH',
   'Domain numbering (e.g. L1 21–22) + attentes fondamentales at cycle ends; less granular than LP21', 'catalog', 3,
   'CIIP (Conférence intercantonale de l''instruction publique)', 'CH', null,
   'europe', 'national_curriculum'::framework_type,
   '3 cycles, grades 1–11; French-speaking cantons (incl. bilingual BE/FR/VS)', array['all_subjects']::text[], false,
   'Domain numbering (e.g. L1 21–22) + attentes fondamentales at cycle ends; less granular than LP21', '2010 (implemented by 2015)', 2010,
   null, 'No explicit licence found', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"PER portal","url":"https://portail.ciip.ch/per"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('93748638-f8cc-5453-8e24-5f585acb7c33', 'Piano di studio della scuola dell''obbligo ticinese', 'CH-TI', 'CH',
   'Competency prose, HarmoS-aligned', 'catalog', 3,
   'DECS, Canton Ticino', 'CH', null,
   'europe', 'national_curriculum'::framework_type,
   'K–9 (infanzia, elementare 1–5, media 6–9)', array['all_subjects']::text[], false,
   'Competency prose, HarmoS-aligned', '2015; ''perfezionato'' revision Jan 2024', 2024,
   null, 'No explicit licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Piano di studio","url":"https://pianodistudio.edu.ti.ch"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('a71c8b61-0ae6-566a-a055-05e9a2820c5e', 'Perusopetuksen opetussuunnitelman perusteet 2014 (National Core Curriculum for Basic Education)', 'FI-POPS', 'FI',
   'Open-source platform (github.com/Opetushallitus/eperusteet); practically open, formally unverified.', 'catalog', 3,
   'Opetushallitus (Finnish National Agency for Education, OPH/EDUFI)', 'FI', null,
   'europe', 'national_curriculum'::framework_type,
   'Grades 1–9 (ages 7–16); separate pre-primary + LOPS 2021 upper secondary', array['all_subjects','religious_values']::text[], false,
   'Prose objectives T1…Tn per subject per grade band + 7 transversal competences (L1–L7) — numbered in-document, not designed as tagging codes', 'POPS 2014 (phased 2016–2019); 2025 instructional-hour additions', 2014,
   'Next full POPS revision expected post-2026; English-language LOPS from Aug 2026 (upper secondary)', 'State publication; ePerusteet API public (no auth); formal content licence unverified — confirm with OPH', 'unverified'::framework_commercial_use,
   null, array['api','json','html','pdf']::text[], '[{"label":"ePerusteet API (Swagger)","url":"https://opetushallitus.github.io/eperusteet/api/eperusteet"},{"label":"ePerusteet platform","url":"https://eperusteet.opintopolku.fi"}]'::jsonb,
   'Open-source platform (github.com/Opetushallitus/eperusteet); practically open, formally unverified.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('08b795da-4710-56b9-ab78-b5c94916c77c', 'Läroplan för grundskolan, förskoleklassen och fritidshemmet (Lgr22)', 'SE-LGR22', 'SE',
   'Kursplaner: Syfte + Centralt innehåll per band (1–3, 4–6, 7–9) + betygskriterier at grades 3/6/9 — prose', 'catalog', 3,
   'Skolverket', 'SE', null,
   'europe', 'national_curriculum'::framework_type,
   'Preschool class (year 0) + grades 1–9', array['all_subjects']::text[], false,
   'Kursplaner: Syfte + Centralt innehåll per band (1–3, 4–6, 7–9) + betygskriterier at grades 3/6/9 — prose', 'Lgr22 (autumn 2022); revised edition 1 Aug 2025 (kunskapskrav→betygskriterier)', 2022,
   null, 'CC0 (Syllabus API data) — most permissive in Europe', 'open'::framework_commercial_use,
   null, array['api','json','pdf']::text[], '[{"label":"Skolverket Syllabus API (CC0)","url":"https://www.skolverket.se/om-skolverket/webbplatser-och-tjanster/oppna-data/api-for-laroplaner-kurs--och-amnesplaner-syllabus"},{"label":"Open data portal","url":"https://opendata.skolverket.se"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('92293030-31eb-524d-a395-8ba95ccd63ec', 'Læreplanverket for Kunnskapsløftet 2020 (LK20 / Fagfornyelsen)', 'NO-LK20', 'NO',
   'Best curriculum API in Europe (REST needs API key: teknisk.grep@udir.no; SPARQL endpoint; daily updates; multilingual incl. English/Sámi).', 'catalog', 3,
   'Utdanningsdirektoratet (Udir)', 'NO', null,
   'europe', 'national_curriculum'::framework_type,
   'Grades 1–10 + upper secondary (Vg1–Vg3); aims after years 2/4/7/10/Vg-levels', array['all_subjects']::text[], true,
   'Subject codes (NOR01-07, MAT01-05 = subject+seq-version) + per-aim Grep codes in the data layer (e.g. K1663); prose on site', 'LK20 (2020/2021); rolling subject revisions', 2020,
   'Next structural reform consultation from Spring 2026; LK20 stays in force', 'NLOD 2.0 (Norwegian Licence for Open Government Data) — commercial reuse with attribution', 'open_attribution'::framework_commercial_use,
   null, array['api','sparql','json','rdf','xml','csv','pdf']::text[], '[{"label":"Grep REST API","url":"https://data.udir.no/kl06/v201906/"},{"label":"data.norge.no dataset","url":"https://data.norge.no/en/datasets/fa902439-06bb-4036-8cb2-f81c7814e45c"}]'::jsonb,
   'Best curriculum API in Europe (REST needs API key: teknisk.grep@udir.no; SPARQL endpoint; daily updates; multilingual incl. English/Sámi).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('4b6d49a9-0303-5438-938f-060540c1a39c', 'Fælles Mål', 'DK-FM', 'DK',
   'Hierarchy: fagformål → 215 binding kompetencemål → 866 advisory areas → 3,170 advisory goals (prose, no public codes)', 'catalog', 3,
   'Børne- og Undervisningsministeriet (UVM); EMU.dk portal (STIL)', 'DK', null,
   'europe', 'national_curriculum'::framework_type,
   'Folkeskole grades 0–9', array['all_subjects']::text[], false,
   'Hierarchy: fagformål → 215 binding kompetencemål → 866 advisory areas → 3,170 advisory goals (prose, no public codes)', 'BEK 1715/2024; mid-tier goals advisory since 1 Jan 2025', 2015,
   'REPLACEMENT in flight: simplified ''fagplaner'' piloting 2025–26, in force 2027–28 — time any ingestion accordingly', 'Public legal text (retsinformation.dk); no explicit open licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"BEK 1715/2024","url":"https://www.retsinformation.dk/eli/lta/2024/1715"},{"label":"UVM Fælles Mål","url":"https://www.uvm.dk/folkeskolen/fag-timetal-og-overgange/fag-emner-og-tvaergaaende-temaer/faelles-maal"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b70f20bb-8c8e-5c92-8892-c24eaa534b79', 'Lehrpläne (''Lehrpläne NEU'' 2023)', 'AT-LP', 'AT',
   'Prose competency-oriented; digi.komp digital strand', 'catalog', 3,
   'Bundesministerium für Bildung (BMB)', 'AT', null,
   'europe', 'national_curriculum'::framework_type,
   'Volksschule 1–4, Mittelschule/AHS-Unterstufe 5–8, AHS-Oberstufe 9–12/13 (per school type)', array['all_subjects','religious_values']::text[], false,
   'Prose competency-oriented; digi.komp digital strand', 'BGBl. II Nr. 1/2023, rolling from Sept 2023', 2023,
   'AHS-Oberstufe reform planned 2027–28', 'Public-sector documents; no explicit open licence', 'unverified'::framework_commercial_use,
   null, array['html','xml','pdf']::text[], '[{"label":"BMB Lehrpläne","url":"https://www.bmb.gv.at/Themen/schule/schulpraxis/lp.html"},{"label":"RIS consolidated law","url":"https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10008568"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f2909e10-d8c8-5b3a-a153-6cec700d2293', 'Onderwijsdoelen / Minimumdoelen (Flemish Community)', 'BE-FL', 'BE-VLG',
   'Structured/numbered minimum goals on onderwijsdoelen.be; school networks write own leerplannen on top', 'catalog', 3,
   'Flemish Parliament / Departement Onderwijs en Vorming', 'BE', 'BE-VLG',
   'europe', 'national_curriculum'::framework_type,
   'Pre-primary through secondary', array['all_subjects']::text[], true,
   'Structured/numbered minimum goals on onderwijsdoelen.be; school networks write own leerplannen on top', 'Replacement of court-annulled eindtermen (2022); new primary+pre-primary minimum goals approved 2025, phasing 2025–2026', 2025,
   'Primary mandatory ~Sept 2026 (exact year unverified); secondary rolled from 2023–24', 'No explicit licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"onderwijsdoelen.be","url":"https://onderwijsdoelen.be/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b3d80594-bb06-5d5f-bed6-9cf6c5ab98e2', 'Référentiels du Tronc Commun (Fédération Wallonie-Bruxelles)', 'BE-FWB', 'BE-WAL',
   'Prose competency statements by domain (replaces Socles de compétences)', 'catalog', 3,
   'FWB Ministry / Pacte pour un Enseignement d''Excellence', 'BE', 'BE-WAL',
   'europe', 'national_curriculum'::framework_type,
   'Tronc commun ages ~2.5–15; 9 référentiels; rollout P1–P2 2022/23 → S3 2028/29', array['all_subjects']::text[], false,
   'Prose competency statements by domain (replaces Socles de compétences)', 'Référentiels approved 2022, rolling', 2022,
   'CEB 2026 first exam on new référentiels; secondary phasing to 2028/29', 'No explicit licence', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Tronc commun référentiels","url":"https://ifpc-fwb.be/v5/tc_referentiels.asp"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('a8ac51f5-31b2-5c68-9ce9-e850272a2641', 'Aprendizagens Essenciais + Perfil dos Alunos (PASEO)', 'PT-AE', 'PT',
   'NC clause blocks commercial ingestion without DGE permission.', 'catalog', 3,
   'Direção-Geral da Educação (DGE)', 'PT', null,
   'europe', 'national_curriculum'::framework_type,
   'Básico ciclos 1–3 (grades 1–9) + secundário (10–12)', array['all_subjects']::text[], false,
   '~70+ AE documents (subject × year): knowledge/capacities/attitudes prose structured around PASEO competency areas', 'PASEO 2017; AE 2018; maths secondary revised 2024/25–2025/26; citizenship AE Sept 2025', 2018,
   null, 'CC BY-NC-ND 2.5 PT — NON-COMMERCIAL + no-derivatives', 'non_commercial'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"DGE Aprendizagens Essenciais","url":"https://www.dge.mec.pt/aprendizagens-essenciais"}]'::jsonb,
   'NC clause blocks commercial ingestion without DGE permission.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('657c526b-e7c2-547c-9f0b-b180a80ca20d', 'Νέα Προγράμματα Σπουδών (New Study Programmes)', 'GR-NPS', 'GR',
   'Prose expected learning outcomes', 'catalog', 3,
   'Institute of Educational Policy (IEP) / Ministry of Education', 'GR', null,
   'europe', 'national_curriculum'::framework_type,
   'Dimotiko 1–6, Gymnasio 7–9, Lykeio 10–12', array['all_subjects','religious_values']::text[], false,
   'Prose expected learning outcomes', 'Universal from 2023/24 (primary+lower secondary); C'' Lykeio completes 2025/26', 2023,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[{"label":"IEP new curricula","url":"https://www.iep.edu.gr/nea-programmata-spoudon/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f821e071-8422-5069-956a-0436dbb9d41d', 'Rámcové vzdělávací programy (RVP PV/ZV/G/SOV)', 'CZ-RVP', 'CZ',
   '8 key competencies + očekávané výstupy (expected outcomes) at grades 3/5/9 — prose, portal-indexed', 'catalog', 3,
   'MŠMT + NPI ČR', 'CZ', null,
   'europe', 'national_curriculum'::framework_type,
   'Preschool; basic grades 1–9; gymnázium; vocational', array['all_subjects']::text[], false,
   '8 key competencies + očekávané výstupy (expected outcomes) at grades 3/5/9 — prose, portal-indexed', 'Revised RVP ZV + PV approved 30 Dec 2024 (largest reform in 20 years)', 2024,
   'PV mandatory Sept 2026; ZV mandatory grades 1+6 Sept 2027, all grades by 2031', 'Unverified (NPI ČR ©)', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"prohlednout.rvp.cz (browse + open datasets)","url":"https://prohlednout.rvp.cz/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('866d0a50-9aff-5035-a005-0d312bc1402b', 'Štátny vzdelávací program (ŠVP)', 'SK-SVP', 'SK',
   'Prose; schools write own ŠkVP on top', 'catalog', 3,
   'MŠVVaŠ SR + NIVAM', 'SK', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary 1–4, lower secondary 5–9, upper secondary', array['all_subjects']::text[], false,
   'Prose; schools write own ŠkVP on top', 'New ŠVP for basic education 2023; piloted 2023–25', 2023,
   'Mandatory from 2026/27 (grade 1)', 'CC BY 4.0 (stated on statpedu.sk)', 'open_attribution'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"ŠVP 2023","url":"https://www.minedu.sk/statny-vzdelavaci-program-pre-zakladne-vzdelavanie-2023/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('67739294-c71e-5aaa-ac33-05269b3adb96', 'Nemzeti alaptanterv (NAT 2020) + kerettantervek', 'HU-NAT', 'HU',
   'Prose; NAT (strategic) → kerettantervek (subject) → helyi tanterv (school)', 'catalog', 3,
   'Government of Hungary (decree 5/2020); Oktatási Hivatal', 'HU', null,
   'europe', 'national_curriculum'::framework_type,
   'Grades 1–12 (4+4+4)', array['all_subjects']::text[], false,
   'Prose; NAT (strategic) → kerettantervek (subject) → helyi tanterv (school)', 'NAT 2020 (phase-in from Sept 2020)', 2020,
   'NAT evaluation/consultations open to early 2026; no revision announced', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[{"label":"Oktatási Hivatal","url":"https://www.oktatas.hu"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c8760aff-6d61-5a9d-87ed-93372cd5d26c', 'Curriculum național (planuri-cadru + programe școlare)', 'RO-CN', 'RO',
   'Competențe specifice numbered per subject per year (e.g. 1.1, 2.3) + conținuturi', 'catalog', 3,
   'Ministerul Educației (+ ROCNEE); RECRED reform project 2024–2028', 'RO', null,
   'europe', 'national_curriculum'::framework_type,
   'Primar 1–4, gimnaziu 5–8, liceu 9–12', array['all_subjects']::text[], true,
   'Competențe specifice numbered per subject per year (e.g. 1.1, 2.3) + conținuturi', 'Primary/lower-secondary from 2012/13; liceu overhaul via MO 4350/2025 + MO 6930/2025 (330 new programmes)', 2025,
   'New liceu plans from grade 9 in 2026/27 — first upper-secondary overhaul in ~20 years', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"edu.ro consultations","url":"https://www.edu.ro/cons_pub_programe_scolare_liceu"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f19b1661-ccc9-5568-9956-9b4e5ca8d6fd', 'Държавни образователни стандарти + учебни програми', 'BG-DOS', 'BG',
   'Prose expected results per subject/grade', 'catalog', 3,
   'Ministry of Education and Science (МОН)', 'BG', null,
   'europe', 'national_curriculum'::framework_type,
   'Grades 1–12', array['all_subjects']::text[], false,
   'Prose expected results per subject/grade', '2015–16 DOS under 2016 Act; curriculum-reform concept + 16 subject concepts in consultation 2025', 2016,
   'Action Plan 2025–2027; integrated-task exams gr.7/10 from 2026; BG hours +12%, maths +25%', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Digital Backpack","url":"https://edu.mon.bg/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('209d3661-6fe9-5311-a220-45fcd1a3165d', 'Nacionalni kurikulum + predmetni kurikulumi (''Škola za život'')', 'HR-NK', 'HR',
   'Odgojno-obrazovni ishodi (outcomes) prose by grade', 'catalog', 3,
   'Ministry of Science, Education and Youth (MZOM); AZOO', 'HR', null,
   'europe', 'national_curriculum'::framework_type,
   'Basic grades 1–8 (3 cycles) + secondary 9–12/13', array['all_subjects','religious_values']::text[], false,
   'Odgojno-obrazovni ishodi (outcomes) prose by grade', '2019 reform, mandatory 2020/21', 2019,
   '147 new vocational curricula 2024–25; AI curriculum grades 5–6 from 2025/26', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Predmetni kurikulumi","url":"https://mzom.gov.hr/istaknute-teme/odgoj-i-obrazovanje/nacionalni-kurikulum/predmetni-kurikulumi/539"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('842389eb-08d1-5e47-8179-fbd1afab93ff', 'Učni načrti (Kurikularna prenova 2022–2026)', 'SI-UN', 'SI',
   'Prose cilji + outcomes; 5 cross-cutting areas added 2025', 'catalog', 3,
   'Ministry of Education (MVI) + ZRSŠ', 'SI', null,
   'europe', 'national_curriculum'::framework_type,
   'Osnovna šola 1–9 + gimnazija/vocational', array['all_subjects']::text[], false,
   'Prose cilji + outcomes; 5 cross-cutting areas added 2025', 'Updated učni načrti adopted May–Nov 2025 (41 basic + 88 + 52 + 19 subject curricula); in force 2025/26', 2025,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"DUN digital curricula","url":"https://dun.zrss.augmentech.si/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('141c5ba7-2585-5425-8b20-ae6ce7fb289e', 'Planovi i programi nastave i učenja', 'RS-PNU', 'RS',
   'Prose ishodi (outcomes) tabled by grade; Dec 2024 bylaws define 3-level achievement standards', 'catalog', 3,
   'Ministry of Education; ZUOV (development); ZVKOV (standards)', 'RS', null,
   'europe', 'national_curriculum'::framework_type,
   'Basic 1–8 (two cycles) + secondary', array['all_subjects']::text[], false,
   'Prose ishodi (outcomes) tabled by grade; Dec 2024 bylaws define 3-level achievement standards', 'Outcomes-based rollout since 2018/19; standards bylaws Dec 2024', 2024,
   null, 'Official Gazette texts; open in practice', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"ZUOV","url":"https://zuov.gov.rs/zakoni-i-pravilnici/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('62d7c1e2-e9f9-5099-b06a-1ea3d9ab8255', 'Nastavni planovi i programi (12 authorities)', 'BA-NPP', 'BA',
   'Most fragmented system in Europe — 12 curriculum authorities.', 'catalog', 3,
   'RS entity ministry + 10 FBiH cantonal ministries + Brčko District; APOSO coordinates state-level', 'BA', null,
   'europe', 'national_curriculum'::framework_type,
   '9-year basic + 4-year secondary', array['all_subjects']::text[], false,
   'Prose; varies per authority; APOSO Common Core Curriculum incomplete', 'Fragmented; no unified version', null,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"APOSO","url":"https://aposo.gov.ba"}]'::jsonb,
   'Most fragmented system in Europe — 12 curriculum authorities.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c1d80209-a4cf-5e54-8f08-6bff28808bb4', 'Наставни програми (Bureau for Development of Education)', 'MK-NP', 'MK',
   'Prose; published in 5 languages', 'catalog', 3,
   'Ministry of Education and Science; BDE (bro.gov.mk)', 'MK', null,
   'europe', 'national_curriculum'::framework_type,
   '9-year primary (3 periods) + secondary', array['all_subjects']::text[], false,
   'Prose; published in 5 languages', 'New Concept rollout: grade 7 curricula 2025/26, grade 8 2026/27; subjects re-separated 2024', 2025,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"BDE curricula","url":"https://bro.gov.mk/наставни-програми/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d82d63d8-aef5-539e-b660-6119527149a7', 'Korniza Kurrikulare e Arsimit Parauniversitar + Kurrikula Bërthamë', 'AL-KK', 'AL',
   '6–7 key competencies + subject competencies, prose', 'catalog', 3,
   'Ministry of Education; IZHA/ASCAP', 'AL', null,
   'europe', 'national_curriculum'::framework_type,
   'Preparatory + 1–5, 6–9, 10–12', array['all_subjects']::text[], false,
   '6–7 key competencies + subject competencies, prose', 'Framework 2014; subject revisions 2024–25 under Strategy 2021–2026', 2014,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Korniza Kurrikulare 2014","url":"https://ascap.edu.al/wp-content/uploads/2020/02/Korniza-Kurrikulare-31.07.2014.pdf"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('6dc826fa-e4bb-5658-8381-319ef8e5a254', 'Põhikooli + Gümnaasiumi riiklik õppekava', 'EE-ROK', 'EE',
   'Prose outcomes by subject + school stage; 8 general competencies', 'catalog', 3,
   'Ministry of Education and Research; HARNO (oppekava.ee)', 'EE', null,
   'europe', 'national_curriculum'::framework_type,
   'Basic 1–9 (bands 1–3/4–6/7–9) + upper secondary 10–12', array['all_subjects']::text[], false,
   'Prose outcomes by subject + school stage; 8 general competencies', 'Updated March 2023; school alignment by Sept 2024', 2023,
   'Estonian-medium transition through 2030; Strategy 2035 umbrella', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Riigi Teataja (basic school)","url":"https://www.riigiteataja.ee/akt/110082024002"},{"label":"oppekava.ee","url":"https://oppekava.ee/pohikool-2023/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('bb830a27-f6f5-555b-a52d-eb81dc78fbbe', 'Skola2030 competency-based curriculum (state standards)', 'LV-S2030', 'LV',
   'Sasniedzamie rezultāti (achievable results) per area/band, prose', 'catalog', 3,
   'IZM + VISC', 'LV', null,
   'europe', 'national_curriculum'::framework_type,
   'Pre-school through grade 12; 7 learning areas', array['all_subjects']::text[], false,
   'Sasniedzamie rezultāti (achievable results) per area/band, prose', 'Rolled out 2019/20–2023/24; implementation complete (EU Monitor 2025)', 2020,
   'Latvian-only instruction completes 2025/26; digitalization project to 2029', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"IZM curriculum description","url":"https://www.izm.gov.lv/en/article/description-educational-curriculum-and-learning-approach"},{"label":"mape.gov.lv planning environment","url":"https://mape.gov.lv"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('140361fa-2995-5bae-ae6c-2a0e569aad58', 'Bendrosios programos (General Programmes)', 'LT-BP', 'LT',
   'Pasiekimai (achievements) by subject/band; some coded outcome references', 'catalog', 3,
   'ŠMSM + NŠA (emokykla.lt)', 'LT', null,
   'europe', 'national_curriculum'::framework_type,
   'Pre-primary; primary 1–4; basic 5–10; secondary 11–12', array['all_subjects']::text[], false,
   'Pasiekimai (achievements) by subject/band; some coded outcome references', 'Order V-1269 of 24 Aug 2022 (~44–50 programmes); all grades by 2024–25', 2022,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"emokykla.lt programmes","url":"https://emokykla.lt/bendrosios-programos/visos-bendrosios-programos"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('713b1048-d0f6-545d-a9d3-c116562b851f', 'Aðalnámskrá grunnskóla (National Curriculum Guide)', 'IS-ADN', 'IS',
   'Prose competence criteria with A–D descriptors', 'catalog', 3,
   'Ministry of Education and Children''s Affairs', 'IS', null,
   'europe', 'national_curriculum'::framework_type,
   'Grades 1–10; competence checkpoints at grades 4/7/10', array['all_subjects']::text[], false,
   'Prose competence criteria with A–D descriptors', '2011 general + 2013 subjects; 2023 amendment; rolling subject updates (2024 chapters)', 2013,
   null, '© footer; no open licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"adalnamskra.is","url":"https://www.adalnamskra.is/en"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('36e00550-63da-5235-aebf-e42264d2760d', 'Plan d''études (enseignement fondamental)', 'LU-PE', 'LU',
   'plandetudes.lu public platform launches Sept 2026 (4 languages).', 'catalog', 3,
   'MENJE + SCRIPT', 'LU', null,
   'europe', 'national_curriculum'::framework_type,
   'Fondamental cycles 1–4 (ages 4–12); trilingual LB/FR/DE', array['all_subjects']::text[], false,
   'Competency-based by cycle; 5 key competencies in new plan', 'New plan unveiled 6 Feb 2026; cycles 1–2 from Sept 2026, cycles 3–4 Sept 2027 (replaces 2011 plan)', 2026,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"plan d''études","url":"https://curriculum.lu/fr/enseignement-fondamental/plandetudes"}]'::jsonb,
   'plandetudes.lu public platform launches Sept 2026 (4 languages).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('aee3afa3-1ce8-5c36-a3ad-b0df5867a029', 'National Curriculum Framework (2012) + Learning Outcomes Framework (LOF)', 'MT-NCF', 'MT',
   'Learning outcomes per area/year (LOF); prose', 'catalog', 3,
   'Ministry for Education (curriculum.gov.mt)', 'MT', null,
   'europe', 'national_curriculum'::framework_type,
   'KG + Years 1–11; 8 learning areas', array['all_subjects','religious_values']::text[], false,
   'Learning outcomes per area/year (LOF); prose', 'NCF 2012; LOF rollout completed Year 11 in 2025/26; NCF review board since 2022', 2012,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"curriculum.gov.mt syllabi + LOF","url":"https://curriculum.gov.mt/resources/syllabi-and-learning-outcomes/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('bb64fd55-c002-5c4a-964d-d8c43e2451f4', 'Αναλυτικά Προγράμματα (Analytical Programmes)', 'CY-AP', 'CY',
   'Prose + δείκτες επιτυχίας/επάρκειας (success/sufficiency indicators — semi-structured)', 'catalog', 3,
   'Ministry of Education, Sport and Youth (MOEC)', 'CY', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary 1–6, Gymnasio 7–9, Lykeio 10–12', array['all_subjects','religious_values']::text[], false,
   'Prose + δείκτες επιτυχίας/επάρκειας (success/sufficiency indicators — semi-structured)', '2010/11 base; Phase 1 update completed 2024; Phase 2 targeted Sept 2025 (completion unverified)', 2024,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MOEC analytika programmata","url":"https://www.moec.gov.cy/analytika_programmata/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('0dd537cc-af74-5d82-977b-fc5fca0f9a03', 'Державний стандарт загальної середньої освіти (NUS — New Ukrainian School)', 'UA-NUS', 'UA',
   'Competency-based; mandatory outcomes per educational area; 9 key competencies — prose', 'catalog', 3,
   'Cabinet of Ministers / Ministry of Education and Science (МОН)', 'UA', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary 1–4 (2018 std); basic 5–9 (2020); profile 10–12 (2024, nationwide 2027)', array['all_subjects']::text[], false,
   'Competency-based; mandatory outcomes per educational area; 9 key competencies — prose', 'Profile-secondary standard Resolution No. 851 (25 Jul 2024); ''Education for Life'' frameworks Sept 2025', 2024,
   'Academic-lyceum pilots 2025–26; national rollout 2027–28; reform continuing despite war', 'Cabinet resolutions on zakon.rada.gov.ua; no open licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"MON NUS","url":"https://mon.gov.ua/en/nova-ukrainska-shkola"},{"label":"Resolution 851/2024","url":"https://zakon.rada.gov.ua/laws/show/851-2024-п"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2dc8a214-2297-571e-89cf-686edf5030a6', 'Curriculum Național (+ Cadrul de Referință 2025)', 'MD-CN', 'MD',
   'Unități de competență (competency units) — tiered prose', 'catalog', 3,
   'Ministerul Educației și Cercetării; ANCE', 'MD', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary 1–4, gymnasium 5–9, liceu 10–12', array['all_subjects']::text[], false,
   'Unități de competență (competency units) — tiered prose', 'Current curriculum + Cadrul de Referință al Curriculumului Național 2025 adopted', 2025,
   'Full redesign: pilots 2026/27, nationwide 2027/28 (OECD/UNICEF-supported, EU-accession aligned)', 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MEC Moldova","url":"https://mecc.gov.md/ro/content/invatamint-general"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('23caae92-c354-56ad-891b-0fdebda3c984', 'Öğretim Programları — Türkiye Yüzyılı Maarif Modeli (TYMM)', 'TR-TYMM', 'TR',
   'Europe-adjacent; 35% content reduction; values framework.', 'catalog', 3,
   'Millî Eğitim Bakanlığı (MEB) / Talim ve Terbiye Kurulu', 'TR', null,
   'europe', 'national_curriculum'::framework_type,
   'İlkokul 1–4, Ortaokul 5–8, Lise 9–12', array['all_subjects','religious_values']::text[], true,
   'Kazanımlar (outcomes) numbered within units/themes; no global cross-subject codes confirmed', 'TYMM approved 27 May 2024; phased from Sept 2024 (grades 1/5/9), rollout through ~2027', 2024,
   null, 'Government publication; free PDFs; no open licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"mufredat.meb.gov.tr","url":"https://mufredat.meb.gov.tr/"},{"label":"TYMM portal","url":"https://tymm.meb.gov.tr/ogretim-programlari"}]'::jsonb,
   'Europe-adjacent; 35% content reduction; values framework.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fef22d13-9d8c-594a-877d-cb7b787d30f4', 'ФГОС (Federal State Educational Standards) + ФОП (Federal Basic Educational Programmes)', 'RU-FGOS', 'RU',
   'Europe-adjacent.', 'catalog', 3,
   'Ministry of Enlightenment of the Russian Federation', 'RU', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary 1–4, basic 5–9, secondary 10–11', array['all_subjects']::text[], false,
   'Prose planned results per subject; ФОП adds detailed content + hour allocations (centralized 2023)', '3rd-gen FGOS (Orders 286/287 of 2021, in force 2022–23); ФОП mandatory Sept 2023; updated secondary FGOS in force Sept 2027', 2023,
   null, 'Official orders; no open licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"docs.edu.gov.ru","url":"https://docs.edu.gov.ru"},{"label":"edsoo.ru (ФОП portal)","url":"https://edsoo.ru"}]'::jsonb,
   'Europe-adjacent.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('beb7afd0-3c02-5e80-bb4c-a8b714dc7395', 'Korniza Kurrikulare e Kosovës (Kosovo Curriculum Framework)', 'XK-KCF', 'XK',
   'Essential Learning Outcomes (ELOs) by key stage; 6 key competencies — prose', 'catalog', 3,
   'MESTI', 'XK', null,
   'europe', 'national_curriculum'::framework_type,
   'Preparatory + grades 1–12; 7 curriculum areas', array['all_subjects']::text[], false,
   'Essential Learning Outcomes (ELOs) by key stage; 6 key competencies — prose', 'KCF 2016 (rollout 2017–18); ECE curriculum piloted 2024', 2016,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MESTI","url":"https://masht.rks-gov.net"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('4bbee031-78fd-5440-aa84-96da3a61a261', 'Nastavni planovi i programi (Montenegro)', 'ME-NPP', 'ME',
   'Prose subject programmes; EU Key Competences alignment', 'catalog', 3,
   'Zavod za školstvo + Ministry of Education, Science and Innovation', 'ME', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary 1–9 + secondary 4yr', array['all_subjects']::text[], false,
   'Prose subject programmes; EU Key Competences alignment', 'Education Reform Strategy 2025–2035 adopted; semester system from 2024', 2025,
   null, 'Unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Zavod za školstvo","url":"https://zavodzaskolstvo.gov.me"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fa508d81-511e-5b3a-b4ae-a4e70eae0bd5', 'Qatar National Curriculum Standards (QNCF)', 'QA-NCS', 'QA',
   'FIRST-DEPLOYMENT MARKET. All private/international schools + KGs must teach: Arabic (all students), Islamic education (Muslim students), Qatar history (all students) — MOEHE-approved assessments required; teacher competency assessed from 2025–26. Documents primarily Arabic.', 'catalog', 3,
   'Ministry of Education and Higher Education (MOEHE)', 'QA', null,
   'mena', 'national_curriculum'::framework_type,
   'KG1–KG2, Primary 1–6, Preparatory 7–9, Secondary 10–12', array['ela','math','science','social_studies','languages','religious_values','pe_health']::text[], false,
   'Standards-table format (English standards CEFR-aligned, exit B2 at grade 12); coding structure unverified', 'National Education Strategy 2024–2030 (''Igniting the Spark of Learning''); English standards doc 2018', 2024,
   null, 'Qatar government ©; no open licence — MOEHE permission needed', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MOEHE Curriculum Section","url":"https://www.edu.gov.qa/en/Content/CurriculumSection"},{"label":"English standards KG–12 (ABEGS-hosted)","url":"https://cdn-files.abegs.org/abegs-marsad-prod/uploads/e6ad4393-a0fa-4b0c-8bfb-f7f530c76a4b.pdf"}]'::jsonb,
   'FIRST-DEPLOYMENT MARKET. All private/international schools + KGs must teach: Arabic (all students), Islamic education (Muslim students), Qatar history (all students) — MOEHE-approved assessments required; teacher competency assessed from 2025–26. Documents primarily Arabic.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('dc077911-60d7-5598-b57b-bff0bf21c3e7', 'UAE National Curriculum (mandatory-subjects overlay for private schools)', 'AE-MOE', 'AE',
   'All private schools regardless of curriculum must teach Arabic (all), Islamic education (Muslim students), Social/UAE Studies + Moral Education (all).', 'catalog', 3,
   'UAE Ministry of Education; regulators KHDA (Dubai), ADEK (Abu Dhabi), SPEA (Sharjah)', 'AE', null,
   'mena', 'national_curriculum'::framework_type,
   'KG + Cycles 1 (1–4), 2 (5–9), 3 (10–12)', array['ela','math','science','social_studies','religious_values','languages']::text[], false,
   'Standards tables; no confirmed code system', '2025–26: increased Islamic education/Arabic/Social Studies allocations in private schools', 2025,
   null, 'UAE government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"KHDA curriculum requirements (private schools)","url":"https://www.khda.gov.ae/CMS/WebParts/TextEditor/Documents/Curriculum_Requirements_for_Private_Schools_in_Dubai_Eng.pdf"}]'::jsonb,
   'All private schools regardless of curriculum must teach Arabic (all), Islamic education (Muslim students), Social/UAE Studies + Moral Education (all).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('23ac1a3a-79a5-5619-9436-e976688fe81a', 'Saudi National Curriculum', 'SA-MOE', 'SA',
   'Prose goals', 'catalog', 3,
   'Ministry of Education (Saudi Arabia)', 'SA', null,
   'mena', 'national_curriculum'::framework_type,
   'Primary 1–6, Intermediate 7–9, Secondary 10–12', array['all_subjects','religious_values']::text[], false,
   'Prose goals', 'Vision 2030 reform wave (21st-century skills, computational thinking)', 2024,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MoE KSA courses","url":"https://moe.gov.sa/en/knowledgecenter/eservices/Pages/courses.aspx"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('ed940a12-10c5-506c-b0cd-44cd2453e42c', 'National Curriculum of Kuwait', 'KW-MOE', 'KW',
   'Private schools must teach Arabic, Islamic studies, Kuwait social studies.', 'catalog', 3,
   'Ministry of Education (Kuwait)', 'KW', null,
   'mena', 'national_curriculum'::framework_type,
   'Primary 1–5, Intermediate 6–8, Secondary 9–12', array['all_subjects','religious_values']::text[], false,
   null, 'Competency-based reform ongoing', null,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MOE Kuwait","url":"https://www.moe.edu.kw/"}]'::jsonb,
   'Private schools must teach Arabic, Islamic studies, Kuwait social studies.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e2c74c13-7be8-57d1-97b4-3cc37818867d', 'National Curriculum of Bahrain', 'BH-MOE', 'BH',
   null, 'catalog', 3,
   'Ministry of Education (Bahrain)', 'BH', null,
   'mena', 'national_curriculum'::framework_type,
   'Basic 1–9 (3 cycles) + Secondary 10–12 (credit-hour system)', array['all_subjects','religious_values']::text[], false,
   null, null, null,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MoE Bahrain basic education","url":"https://moe.gov.bh/en/basic-education"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('bfd63702-fbc2-5d12-8c61-4b7444126837', 'Oman National Curriculum', 'OM-MOE', 'OM',
   null, 'catalog', 3,
   'Ministry of Education (Oman)', 'OM', null,
   'mena', 'national_curriculum'::framework_type,
   'Basic 1–10 + Post-Basic 11–12', array['all_subjects','religious_values']::text[], false,
   null, '2024 restructuring of grades 1–4; Cambridge maths/science integration; Vision 2040', 2024,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MoE Oman","url":"https://main.moe.gov.om/en/topics/0/show/2279"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('29c89a4a-9533-5b58-a5bc-c58f76773466', 'Jordan National Curriculum Framework', 'JO-NCF', 'JO',
   '2024 English K–12 standards framework uses performance indicators (CEFR-aligned)', 'catalog', 3,
   'Ministry of Education (Jordan)', 'JO', null,
   'mena', 'national_curriculum'::framework_type,
   'Basic 1–10 + Secondary 11–12', array['all_subjects','religious_values']::text[], true,
   '2024 English K–12 standards framework uses performance indicators (CEFR-aligned)', 'ESP 2026–2030 (UNESCO-supported)', 2024,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MoE Jordan","url":"https://moe.gov.jo/en/Education-System-in-Jordan"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('5389c776-c3fe-55a7-9886-c80f03d9197f', 'Egypt Education 2.0 curriculum (+ Egyptian Knowledge Bank)', 'EG-E2', 'EG',
   'Competency/skills prose; rolled out grade-by-grade since 2018', 'catalog', 3,
   'Ministry of Education and Technical Education (MoETE)', 'EG', null,
   'mena', 'national_curriculum'::framework_type,
   'KG1–2, Primary 1–6, Preparatory 7–9, Secondary 10–12', array['all_subjects','religious_values']::text[], false,
   'Competency/skills prose; rolled out grade-by-grade since 2018', 'Education 2.0 (2018–)', 2018,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Egyptian Knowledge Bank","url":"https://ekb.eg"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fd4f9f53-74f4-50bc-8580-80341de26d8e', 'Israel National Curriculum', 'IL-MOE', 'IL',
   null, 'catalog', 3,
   'Ministry of Education (Israel)', 'IL', null,
   'mena', 'national_curriculum'::framework_type,
   'Primary 1–6, Middle 7–9, High 10–12 (Bagrut at 3–5 units)', array['all_subjects','religious_values']::text[], false,
   null, '2024 humanities emphasis', 2024,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Ministry of Education","url":"https://www.gov.il/en/departments/ministry_of_education"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('592a214a-4ab6-5871-8a4c-c604ab46ef24', 'Lebanese National Curriculum (CERD/CRDP)', 'LB-CRDP', 'LB',
   null, 'catalog', 3,
   'Centre for Educational Research and Development (CRDP) under MEHE', 'LB', null,
   'mena', 'national_curriculum'::framework_type,
   'Elementary 1–6, Intermediate 7–9, Secondary 10–12 (tracks)', array['all_subjects']::text[], false,
   null, '2000 curriculum; 2022 reform framework adopted (implementation disrupted by crises)', 2000,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"CRDP","url":"https://www.crdp.org/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('99b262a8-f2a2-5ae2-8fb8-502d91874db8', 'Singapore MOE Syllabuses (+ SEAB exam syllabuses)', 'SG-MOE', 'SG',
   '4-digit SEAB syllabus codes (1184 English, 4052 Maths) identify subject-level combos, NOT individual standards; outcomes prose by topic/strand', 'catalog', 3,
   'Ministry of Education (Singapore); SEAB co-badged with Cambridge', 'SG', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Primary P1–P6; Secondary S1–S5 (Full Subject-Based Banding, Posting Groups 1–3, from 2024); JC/Pre-U', array['all_subjects']::text[], true,
   '4-digit SEAB syllabus codes (1184 English, 4052 Maths) identify subject-level combos, NOT individual standards; outcomes prose by topic/strand', 'Full SBB from 2024 S1 cohort', 2024,
   null, '© MOE & Cambridge University Press & Assessment', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MOE primary syllabuses","url":"https://www.moe.gov.sg/primary/curriculum/syllabus"},{"label":"SEAB","url":"https://www.seab.gov.sg/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('3e089949-c76e-5a3c-b0d0-596984eca8e8', 'NCF-SE 2023 (National Curriculum Framework for School Education) / NCERT', 'IN-NCF', 'IN',
   'Board landscape: CBSE (~25k+ schools, NCERT-aligned), CISCE (ICSE/ISC), state boards, IB/Cambridge internationals.', 'catalog', 3,
   'NCERT under Ministry of Education (NEP 2020); boards: CBSE, CISCE, 30+ state boards', 'IN', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   '5+3+3+4: Foundational (3–8), Preparatory 3–5, Middle 6–8, Secondary 9–12', array['all_subjects','vocational']::text[], false,
   'Prose learning outcomes; CBSE Competency-Based Education framework separate', 'NCF-SE Aug 2023; NCERT textbooks transitioning through 2026–27; CISCE NEP reforms from 2025–26', 2023,
   null, 'Government of India publication; no open licence confirmed', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"NCF portal","url":"https://www.ncf.ncert.gov.in/"},{"label":"CBSE CBE framework","url":"https://cbseacademic.nic.in/cbe/learning-framework.html"}]'::jsonb,
   'Board landscape: CBSE (~25k+ schools, NCERT-aligned), CISCE (ICSE/ISC), state boards, IB/Cambridge internationals.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('38c380cc-8b1a-5b0e-b80b-14c0d7ab718b', 'Compulsory Education Curriculum Program and Standards (2022 edition)', 'CN-CES', 'CN',
   '学业质量标准 (academic quality standards) per grade band by core concept/domain — no compact codes', 'catalog', 3,
   'Ministry of Education of the PRC', 'CN', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Grades 1–9 (senior secondary separate, 2017 rev.)', array['all_subjects']::text[], false,
   '学业质量标准 (academic quality standards) per grade band by core concept/domain — no compact codes', '2022 (16 subject standards revised)', 2022,
   null, 'PRC government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MOE PRC announcement","url":"http://en.moe.gov.cn/news/press_releases/202205/t20220507_625532.html"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('38728761-7dd3-5e51-9e20-1bc0b801575e', '学習指導要領 Courses of Study (MEXT)', 'JP-COS', 'JP',
   'Outline-numbered content items ((1)(ア)) — not searchable IDs', 'catalog', 3,
   'MEXT (Japan)', 'JP', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Elementary 1–6 (2017 rev., impl. 2020), Lower Sec 7–9 (2021), Upper Sec 10–12 (2022–24)', array['all_subjects']::text[], false,
   'Outline-numbered content items ((1)(ア)) — not searchable IDs', '2017/2018 revision; next revision deliberating (~2029–30 expected)', 2017,
   null, 'Government of Japan ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MEXT Courses of Study","url":"https://www.mext.go.jp/en/policy/education/elsec/title02/detail02/1373859.htm"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('94dff2bc-04a2-536d-9b6d-2ce0c53d6e06', '2022 개정 교육과정 (2022 Revised National Curriculum)', 'KR-2022', 'KR',
   '성취기준 achievement standards coded e.g. [4국01-01] = grade band + subject + domain + sequence (granular, BNCC-like)', 'catalog', 3,
   'Ministry of Education (Korea) + KICE; NCIC portal', 'KR', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Rollout 2024–2027 (full by Mar 2027); elementary/middle/high', array['all_subjects']::text[], true,
   '성취기준 achievement standards coded e.g. [4국01-01] = grade band + subject + domain + sequence (granular, BNCC-like)', '2022 revision; AI digital textbooks from 2025', 2022,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"NCIC (National Curriculum Information Centre)","url":"https://ncic.re.kr"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e63a6cff-a29d-5b81-b24b-19eb7db3a4e5', 'Hong Kong Curriculum Guides (8 Key Learning Areas)', 'HK-EDB', 'HK',
   null, 'catalog', 3,
   'Education Bureau (EDB) / Curriculum Development Council', 'HK', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'P1–P6, S1–S3, S4–S6', array['all_subjects']::text[], false,
   null, 'PECG 2024; Primary Science + Primary Humanities mandatory from 2025/26 (all levels by 2027/28)', 2024,
   null, '© HKSAR Government', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"EDB KLAs","url":"https://www.edb.gov.hk/en/curriculum-development/kla/overview.html"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('cf30b87a-0af2-55fe-a1f5-e719e80e47f7', '108 Curriculum (12-Year Basic Education Guidelines)', 'TW-108', 'TW',
   'Competency indicators coded by learning stage within subject guidelines (structure unverified)', 'catalog', 3,
   'Ministry of Education (Taiwan) / NAER', 'TW', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Grades 1–12 (3 stages); implemented 2019, full 2021', array['all_subjects']::text[], true,
   'Competency indicators coded by learning stage within subject guidelines (structure unverified)', null, 2019,
   null, 'NAER/MoE ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"NAER curriculum","url":"https://www.naer.edu.tw/eng/PageSyllabus?fid=148"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('338c084f-a2e8-5ced-90fd-a708191e2bbf', 'MATATAG Curriculum (Revised K to 10)', 'PH-MATATAG', 'PH',
   'Predecessor K-12 used coded MELCs; MATATAG coding scheme unverified', 'catalog', 3,
   'Department of Education (DepEd, Philippines)', 'PH', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'K–10 (rollout: K/1/4/7 2024–25 → grade 10 2027–28); SHS 11–12 separate', array['all_subjects']::text[], true,
   'Predecessor K-12 used coded MELCs; MATATAG coding scheme unverified', 'DepEd Order 010 s. 2024; competencies reduced >70%', 2024,
   null, 'DepEd ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"DepEd MATATAG","url":"https://www.deped.gov.ph/revised-k-to-10-curriculum/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('4d1b9dcd-b8ff-5e2c-a66c-a43b6cd719a7', 'Kurikulum Merdeka', 'ID-KM', 'ID',
   'Capaian Pembelajaran (learning achievements) by subject + PHASE (not year); Profil Pelajar Pancasila 6 dimensions', 'catalog', 3,
   'Kemendikbudristek (Indonesia); Permendikbudristek No. 12/2024', 'ID', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'PAUD, SD 1–6, SMP 7–9, SMA/SMK 10–12; full compliance 2026/27 (remote 2027/28)', array['all_subjects','religious_values']::text[], false,
   'Capaian Pembelajaran (learning achievements) by subject + PHASE (not year); Profil Pelajar Pancasila 6 dimensions', 'National curriculum since 26 Mar 2024', 2024,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Kurikulum portal","url":"https://kurikulum.kemendikdasmen.go.id/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c6ffc37f-801e-5464-8764-c666757db96c', 'KSSR + KSSM (Primary/Secondary School Standard Curriculum)', 'MY-KSSM', 'MY',
   'Standard Pembelajaran in decimal outline (1.1.1) — structured but not compact codes', 'catalog', 3,
   'Kementerian Pendidikan Malaysia (BPK)', 'MY', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Primary 1–6 (KSSR rev. 2017); Forms 1–5 (KSSM 2017)', array['all_subjects','religious_values']::text[], true,
   'Standard Pembelajaran in decimal outline (1.1.1) — structured but not compact codes', null, 2017,
   null, 'KPM ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"BPK","url":"https://bpk.moe.gov.my/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('88769aac-9532-579c-83c7-d7c8f271b966', 'Basic Education Core Curriculum B.E. 2551 (2008)', 'TH-BEC', 'TH',
   'ตัวชี้วัด indicators numbered per subject/strand/grade (decimal outline)', 'catalog', 3,
   'OBEC, Ministry of Education (Thailand)', 'TH', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Grades 1–12; 8 learning areas', array['all_subjects','religious_values']::text[], true,
   'ตัวชี้วัด indicators numbered per subject/strand/grade (decimal outline)', '2008 (major overhaul requested June 2024; status unverified)', 2008,
   'Competency-based replacement drafted 2022, not adopted; overhaul in motion', 'Thai government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"OBEC English translation","url":"https://academic.obec.go.th/images/document/1559878841_d_1.pdf"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('a7a526a0-3f61-5445-93a0-45e2c9f2b256', 'Chương trình Giáo dục phổ thông 2018', 'VN-GDPT', 'VN',
   'Yêu cầu cần đạt (required achievements) numbered in documents', 'catalog', 3,
   'MOET (Vietnam), Circular 32/2018 (am. 13/2022)', 'VN', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Grades 1–9 basic + 10–12 orientation; all grades implemented by 2024–25', array['all_subjects']::text[], false,
   'Yêu cầu cần đạt (required achievements) numbered in documents', null, 2018,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Overview (Lawnet)","url":"https://lawnet.vn/giao-duc/en/vietnam-what-is-the-general-education-program-2018-5973.html"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f90c9f2c-cef4-56fc-8e75-f678d03fe7ef', 'National Curriculum of Pakistan (Single National Curriculum)', 'PK-NCP', 'PK',
   'Sindh rejected the SNC (18th Amendment devolution); other provinces adopted.', 'catalog', 3,
   'Ministry of Federal Education / National Curriculum Council', 'PK', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Phases: 1–5 (2021–22), 6–8 (2022–23), 9–12 (2023–24)', array['all_subjects','religious_values']::text[], true,
   'Student Learning Outcomes (SLOs) numbered per subject/grade', null, 2023,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"National Curriculum Council","url":"https://ncpak.edu.pk/"}]'::jsonb,
   'Sindh rejected the SNC (18th Amendment devolution); other provinces adopted.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('5be90363-78fc-5a20-98b4-11ce3e04fd27', 'Curriculum and Assessment Policy Statement (CAPS)', 'ZA-CAPS', 'ZA',
   'Topics per term per grade with weighting tables — prose, no codes; ~70+ subject documents', 'catalog', 3,
   'Department of Basic Education (South Africa)', 'ZA', null,
   'africa', 'national_curriculum'::framework_type,
   'Grades R–12: Foundation R–3, Intermediate 4–6, Senior 7–9, FET 10–12', array['all_subjects']::text[], false,
   'Topics per term per grade with weighting tables — prose, no codes; ~70+ subject documents', '2012–14 rollout; ongoing per-subject amendments (CAT/IT 2024; SASL added)', 2012,
   null, '© DBE; educational reproduction permitted; commercial unverified', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"DBE CAPS","url":"https://www.education.gov.za/Curriculum/CurriculumAssessmentPolicyStatements(CAPS).aspx"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('5691fffc-7d35-5c57-8148-9cf7f8e2c2be', 'Competency-Based Curriculum / Education (CBC/CBE)', 'KE-CBC', 'KE',
   'Strand/sub-strand outcomes, prose', 'catalog', 3,
   'Kenya Institute of Curriculum Development (KICD)', 'KE', null,
   'africa', 'national_curriculum'::framework_type,
   'PP1–PP2, 1–6, Junior Sec 7–9, Senior Sec 10–12 (pioneer cohort grade 10 Jan 2026)', array['all_subjects','religious_values']::text[], false,
   'Strand/sub-strand outcomes, prose', 'From 2018; 2024 rationalization (PWPER); first KJSEA exam Oct 2025', 2024,
   null, 'KICD ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"KICD","url":"https://kicd.ac.ke/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('7e317a39-d863-5e25-beb8-fd5c251e5a42', 'NERDC Basic + Senior Secondary Curriculum', 'NG-NERDC', 'NG',
   'Minimum standard for ALL Nigerian schools incl. private.', 'catalog', 3,
   'Nigerian Educational Research and Development Council', 'NG', null,
   'africa', 'national_curriculum'::framework_type,
   'ECCE, Primary 1–6, JSS 1–3, SSS 1–3', array['all_subjects','religious_values']::text[], false,
   'Performance objectives per topic/term/grade', null, null,
   null, 'NERDC ©', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"e-Curriculum portal","url":"https://nerdc.org.ng/ecurriculum/"}]'::jsonb,
   'Minimum standard for ALL Nigerian schools incl. private.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('a00a9ae1-3d06-534d-8103-6bbf63f65fbb', 'Standards-Based Curriculum (2019) + Common Core Programme', 'GH-SBC', 'GH',
   'Strand → sub-strand → content standard → indicator with decimal numbering', 'catalog', 3,
   'NaCCA (Ghana)', 'GH', null,
   'africa', 'national_curriculum'::framework_type,
   'KG–B6 (2019); B7–9 CCP (2021+); SHS in development (English Nov 2024)', array['all_subjects','religious_values']::text[], true,
   'Strand → sub-strand → content standard → indicator with decimal numbering', null, 2019,
   null, 'NaCCA ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"NaCCA SBC","url":"https://nacca.gov.gh/learning-areas-subjects/new-standards-based-curriculum-2019/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fef92c27-4db8-54a9-bf2c-ad21baffc7ff', 'Competence-Based Curriculum (Rwanda)', 'RW-CBC', 'RW',
   null, 'catalog', 3,
   'Rwanda Education Board (REB)', 'RW', null,
   'africa', 'national_curriculum'::framework_type,
   'Pre-primary, Primary 6yr, Lower + Upper Secondary 3+3', array['all_subjects']::text[], false,
   null, null, 2016,
   null, 'REB ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"REB","url":"https://reb.rw/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('57e95e74-7250-537c-a843-600dafa6c3f8', 'Morocco National Curriculum (Vision 2030 reform)', 'MA-MEN', 'MA',
   null, 'catalog', 3,
   'Ministère de l''Éducation nationale (Morocco)', 'MA', null,
   'africa', 'national_curriculum'::framework_type,
   'Primary 1–6, Collège 7–9, Lycée 10–12', array['all_subjects','religious_values']::text[], false,
   null, null, null,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MEN Morocco","url":"https://men.gov.ma/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d1ca2cb8-804d-5f34-98ba-b8754e0f8ab1', 'Tunisia National Curriculum', 'TN-MOE', 'TN',
   null, 'catalog', 3,
   'Ministry of Education (Tunisia)', 'TN', null,
   'africa', 'national_curriculum'::framework_type,
   'Primary 1–6, collège, lycée 4yr (5 tracks)', array['all_subjects']::text[], false,
   null, null, null,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MoE Tunisia","url":"https://education.gov.tn/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('737f3100-dfc8-5537-816c-63c9430d2fcf', 'Base Nacional Comum Curricular (BNCC)', 'BR-BNCC', 'BR',
   'Download portal historically offered structured skill matrix (503 at fetch; verify).', 'catalog', 3,
   'Ministério da Educação (MEC, Brazil)', 'BR', null,
   'latin_america', 'standards'::framework_type,
   'EI (0–5), EF 1–9, EM 1–3', array['all_subjects','religious_values']::text[], true,
   'Coded habilidades: EF05MA01 = stage EF + year 05 + subject MA + seq 01 (multi-year EF69LP01; EM13CO01). Subject codes LP/MA/CI/GE/HI/AR/EF/ER. ~600 skills in EF', 'EI+EF Dec 2017; EM Nov 2018', 2018,
   null, 'Government publication (Lei 9.610/98 state-works doctrine suggests free use); explicit commercial licence unverified', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[{"label":"BNCC portal","url":"https://basenacionalcomum.mec.gov.br/"},{"label":"CIEB code lookup (3rd party)","url":"https://curriculo.cieb.net.br/buscar/EF05MA01"}]'::jsonb,
   'Download portal historically offered structured skill matrix (503 at fetch; verify).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e2b6017f-5f64-5c1e-ad66-654efc353e6d', 'Bases Curriculares + Planes y Programas de Estudio', 'CL-BC', 'CL',
   'Objetivos de Aprendizaje coded e.g. TE01 OA 05 (subject + grade + OA + number)', 'catalog', 3,
   'MINEDUC / Unidad de Currículum y Evaluación (Chile)', 'CL', null,
   'latin_america', 'national_curriculum'::framework_type,
   'Parvularia; Básica 1°–6°; 7°–2° Medio; 3°–4° Medio (diferenciada 2019)', array['all_subjects']::text[], true,
   'Objetivos de Aprendizaje coded e.g. TE01 OA 05 (subject + grade + OA + number)', 'Bases 2012/2013–15/2019; 1°–10° update consulted 2023–24, NOT yet decreed (CNED approval pending)', 2019,
   'New bases awaiting decree; PADIC implementation plan', 'Government ©; no explicit open licence', 'unverified'::framework_commercial_use,
   null, array['html','pdf','excel']::text[], '[{"label":"curriculumnacional.cl","url":"https://www.curriculumnacional.cl/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c5f6d133-9699-5742-ab16-cf7dd859c150', 'Plan de Estudios 2022 (Nueva Escuela Mexicana)', 'MX-NEM', 'MX',
   '4 formative fields replace subjects + 7 transversal axes; ''learning situations'' prose', 'catalog', 3,
   'Secretaría de Educación Pública (SEP)', 'MX', null,
   'latin_america', 'national_curriculum'::framework_type,
   '6 phases: ages 0–3, preschool, grades 1–2, 3–4, 5–6, secondary 7–9', array['all_subjects']::text[], false,
   '4 formative fields replace subjects + 7 transversal axes; ''learning situations'' prose', null, 2022,
   null, 'SEP ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Nueva Escuela Mexicana","url":"https://nuevaescuelamexicana.sep.gob.mx/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('40aabb4a-de38-5e34-9346-e8d758f525ca', 'Núcleos de Aprendizajes Prioritarios (NAP)', 'AR-NAP', 'AR',
   null, 'catalog', 3,
   'Ministerio de Educación + Consejo Federal de Educación (Argentina)', 'AR', null,
   'latin_america', 'national_curriculum'::framework_type,
   'Initial, Primary (2 cycles), Secondary — national floors; provinces extend', array['all_subjects','computing']::text[], false,
   null, null, null,
   null, 'Government publication; educ.ar educational use', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"NAP collection","url":"https://www.educ.ar/recursos/150199"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('bc42e7bf-6302-542a-96ac-2c2e3c25a9ac', 'Estándares Básicos de Competencias (EBC) + Derechos Básicos de Aprendizaje (DBA)', 'CO-EBC', 'CO',
   'DBA numbered per grade + subject (no alphanumeric codes)', 'catalog', 3,
   'Ministerio de Educación Nacional (Colombia)', 'CO', null,
   'latin_america', 'standards'::framework_type,
   'EBC by bands (1–3, 4–5, 6–7, 8–9, 10–11); DBA per grade 1–11', array['ela','math','science','social_studies']::text[], true,
   'DBA numbered per grade + subject (no alphanumeric codes)', null, 2016,
   null, 'MEN ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"DBA hub","url":"https://www.colombiaaprende.edu.co/contenidos/coleccion/derechos-basicos-de-aprendizaje"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c4f4920d-d605-55e0-bd79-ed68c976ccf3', 'Currículo Nacional de la Educación Básica (CNEB)', 'PE-CNEB', 'PE',
   'Exit profile → 31 competencies → capacidades → band standards → performance criteria (prose)', 'catalog', 3,
   'MINEDU (Peru)', 'PE', null,
   'latin_america', 'national_curriculum'::framework_type,
   'Initial 3–5, Primary 1–6, Secondary 1–5', array['all_subjects','religious_values']::text[], false,
   'Exit profile → 31 competencies → capacidades → band standards → performance criteria (prose)', null, 2016,
   null, 'MINEDU ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MINEDU currículo","url":"https://www.minedu.gob.pe/curriculo/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('bd51e0b1-3535-542b-a9b9-ec67eeb0a047', 'Currículo Nacional (Ecuador)', 'EC-CN', 'EC',
   'Destrezas con criterio de desempeño coded (e.g. CN.1.1.1 pattern; unverified)', 'catalog', 3,
   'Ministerio de Educación (Ecuador)', 'EC', null,
   'latin_america', 'national_curriculum'::framework_type,
   'EGB 1–10 + BGU 11–13', array['all_subjects']::text[], true,
   'Destrezas con criterio de desempeño coded (e.g. CN.1.1.1 pattern; unverified)', null, 2016,
   null, 'Government ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MinEduc currículo","url":"https://educacion.gob.ec/curriculo/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('aa022a48-48d5-53bb-a42d-86f502718241', 'Marco Curricular Nacional (MCN)', 'UY-MCN', 'UY',
   null, 'catalog', 3,
   'ANEP (Uruguay)', 'UY', null,
   'latin_america', 'national_curriculum'::framework_type,
   '6 curricular units, ages 0–19', array['all_subjects']::text[], false,
   null, null, 2022,
   null, 'ANEP ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"ANEP MCN","url":"https://www.anep.edu.uy/marco-curricular-nacional"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('65b7180a-83e1-5e50-8dc5-1b0df028f4cb', 'Programas de Estudio (Costa Rica)', 'CR-MEP', 'CR',
   null, 'catalog', 3,
   'Ministerio de Educación Pública (MEP)', 'CR', null,
   'latin_america', 'national_curriculum'::framework_type,
   'Preschool, Primary 1–6, Secondary 7–11 (Ciclo III + Diversificado)', array['all_subjects']::text[], false,
   null, null, null,
   null, 'MEP ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MEP","url":"https://www.mep.go.cr/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('cd404dac-e931-5287-9a50-44ebc4aa48fc', 'National Curriculum in England', 'ENG-NC', 'GB-ENG',
   'KS4/KS5 de-facto objectives = exam-board specifications (AQA, OCR, Pearson Edexcel, WJEC/Eduqas) — Ofqual-regulated, separately copyrighted.', 'catalog', 3,
   'Department for Education (DfE)', 'GB', 'GB-ENG',
   'europe', 'national_curriculum'::framework_type,
   'Key Stages 1–4 (Years 1–11, ages 5–16)', array['all_subjects']::text[], false,
   'Prose programmes of study per subject per key stage; no statement-level codes', '2014 framework (still statutory)', 2014,
   'Revised NC due spring 2027, first teaching Sept 2028 (Curriculum & Assessment Review, Nov 2025); a machine-readable version announced for the revised curriculum', 'Open Government Licence v3.0', 'open_attribution'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"National curriculum collection","url":"https://www.gov.uk/government/collections/national-curriculum"},{"label":"Review final report + response","url":"https://www.gov.uk/government/publications/curriculum-and-assessment-review-final-report"}]'::jsonb,
   'KS4/KS5 de-facto objectives = exam-board specifications (AQA, OCR, Pearson Edexcel, WJEC/Eduqas) — Ofqual-regulated, separately copyrighted.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('61e5faeb-482c-55c4-8041-a934fd3571b5', 'Curriculum for Excellence (Experiences & Outcomes + Benchmarks)', 'SCO-CFE', 'GB-SCT',
   'Es&Os coded: [area][level]-[seq][sub] — e.g. MNU 2-03a (areas: MNU, ENG, SCI, SOC, TCH, HWB, EXA, RME, MFL)', 'catalog', 3,
   'Education Scotland', 'GB', 'GB-SCT',
   'europe', 'national_curriculum'::framework_type,
   'Levels: Early/First/Second (primary), Third/Fourth (S1–S3), Senior Phase (S4–S6, National Qualifications)', array['all_subjects','religious_values']::text[], true,
   'Es&Os coded: [area][level]-[seq][sub] — e.g. MNU 2-03a (areas: MNU, ENG, SCI, SOC, TCH, HWB, EXA, RME, MFL)', '2010–12; Es&Os document set 2018; Benchmarks 2016–17', 2018,
   null, 'Education Scotland website default OGL (Crown ©); PDF-level OGL coverage unverified', 'open_attribution'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Experiences and Outcomes","url":"https://education.gov.scot/curriculum-for-excellence/experiences-and-outcomes/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2e24dd20-86a8-500a-90f5-fce9ada885ad', 'Curriculum for Wales', 'WAL-CFW', 'GB-WLS',
   '27 Statements of What Matters + Descriptions of Learning per progression step — prose', 'catalog', 3,
   'Welsh Government (Hwb)', 'GB', 'GB-WLS',
   'europe', 'national_curriculum'::framework_type,
   'Progression Steps 1–5 (ages ~5–16); 6 Areas of Learning and Experience', array['all_subjects']::text[], false,
   '27 Statements of What Matters + Descriptions of Learning per progression step — prose', '2022 (secondary phased through 2026)', 2022,
   null, 'GOV.WALES policy = OGL v3 (page-level declaration unverified)', 'open_attribution'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Curriculum for Wales (Hwb)","url":"https://hwb.gov.wales/curriculum-for-wales"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('1e194990-e600-5652-a852-38d73156dc22', 'Northern Ireland Curriculum', 'NIR-NIC', 'GB-NIR',
   'Prose statutory requirements per Area of Learning', 'catalog', 3,
   'CCEA / Department of Education NI', 'GB', 'GB-NIR',
   'europe', 'national_curriculum'::framework_type,
   'Foundation (P1–2), KS1 (P3–4), KS2 (P5–7), KS3 (Y8–10), KS4', array['all_subjects','religious_values']::text[], false,
   'Prose statutory requirements per Area of Learning', '2007 curriculum (rolling updates)', 2007,
   null, 'CCEA terms PROHIBIT commercial use of site content; DENI-document licence status unverified', 'non_commercial'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"CCEA curriculum","url":"https://ccea.org.uk/about/what-we-do/curriculum"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d5f7d3f5-4de0-55d1-9952-7ae79ac4442c', 'Ireland: Primary Curriculum Framework + Junior/Senior Cycle (NCCA)', 'IE-NCCA', 'IE',
   'Numbered learning outcomes within subject specifications; 24 Statements of Learning (JC); no cross-curriculum codes', 'catalog', 3,
   'National Council for Curriculum and Assessment (NCCA)', 'IE', null,
   'europe', 'national_curriculum'::framework_type,
   'Primary (Junior Infants–6th Class); Junior Cycle (3yr); Senior Cycle (Leaving Cert)', array['all_subjects','religious_values']::text[], false,
   'Numbered learning outcomes within subject specifications; 24 Statements of Learning (JC); no cross-curriculum codes', 'PCF 2023 (phased); Senior Cycle redevelopment tranches 2025/26–2027', 2023,
   null, 'NCCA copyright = personal use only; commercial redistribution requires permission', 'permission_required'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Primary Curriculum Framework","url":"https://ncca.ie/en/primary/primary-curriculum-framework-and-curriculum-areas/"},{"label":"curriculumonline.ie","url":"https://www.curriculumonline.ie/primary/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('10297998-50d1-51fb-92b9-5f17733fecc3', 'Australian Curriculum v9.0', 'AU-AC9', 'AU',
   'Gold standard for ingestion: coded + CC-BY + machine-readable (RDF/XML, JSON-LD, SPARQL). VERIFIED 3/3.', 'catalog', 3,
   'ACARA', 'AU', null,
   'asia_pacific', 'standards'::framework_type,
   'Foundation–Year 10 (+ separate senior secondary)', array['all_subjects']::text[], true,
   'Content descriptions coded AC9M5N01 = AC9 + learning area (M) + year (5) + strand (N) + seq (01); achievement standards per year level', 'v9.0 (2022; MRAC updated Jun 2024)', 2022,
   null, 'CC BY 4.0 (most content; Literacy/Numeracy Progressions CC BY-NC; media excluded)', 'open_attribution'::framework_commercial_use,
   null, array['api','sparql','rdf','json','pdf']::text[], '[{"label":"Copyright & terms","url":"https://www.australiancurriculum.edu.au/copyright-and-terms-of-use"},{"label":"MRAC (SPARQL: rdf.australiancurriculum.edu.au/api/sparql)","url":"https://www.australiancurriculum.edu.au/machine-readable-australian-curriculum"}]'::jsonb,
   'Gold standard for ingestion: coded + CC-BY + machine-readable (RDF/XML, JSON-LD, SPARQL). VERIFIED 3/3.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2d129c6d-ae94-56f2-b3c6-5da68993e827', 'NSW Syllabuses (NESA)', 'AU-NSW', 'AU-NSW',
   'NSW outcome codes (e.g. MA5-1WM pattern; post-2022 formats vary by syllabus)', 'catalog', 3,
   'NSW Education Standards Authority', 'AU', 'AU-NSW',
   'asia_pacific', 'standards'::framework_type,
   'K–12', array['all_subjects']::text[], true,
   'NSW outcome codes (e.g. MA5-1WM pattern; post-2022 formats vary by syllabus)', 'AC9-aligned syllabuses rolling from 2024 (curriculum.nsw.edu.au)', 2024,
   null, 'NESA ©', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"NSW curriculum","url":"https://curriculum.nsw.edu.au"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('3d5dd808-acbe-5023-8d36-1efaae968591', 'Victorian Curriculum F–10 Version 2.0', 'AU-VIC', 'AU-VIC',
   'Victorian content descriptions + achievement standards (AC9-derived)', 'catalog', 3,
   'VCAA', 'AU', 'AU-VIC',
   'asia_pacific', 'standards'::framework_type,
   'F–10', array['all_subjects']::text[], true,
   'Victorian content descriptions + achievement standards (AC9-derived)', 'v2.0 (Jun 2024); English/Maths full 2026, other areas through 2027', 2024,
   null, 'VCAA ©', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"VC F–10 v2.0","url":"https://www.vcaa.vic.edu.au/curriculum/foundation-10/victorian-curriculum-f-10-version-20"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('09bf7ab8-001d-58c8-a221-0c0aa115f1fc', 'New Zealand Curriculum / Te Mātaiaho (+ Te Marautanga o Aotearoa)', 'NZ-TM', 'NZ',
   'Commercial LMS needs Ministry permission. TMoA = parallel Māori-medium curriculum (not a translation).', 'catalog', 3,
   'NZ Ministry of Education (Tāhūrangi)', 'NZ', null,
   'asia_pacific', 'national_curriculum'::framework_type,
   'Years 0–13; bands 0–2/3–4/5–6/7–8/9–10; NCEA Levels 1–3 senior', array['all_subjects']::text[], false,
   'Poutama progressions, phases, prose objectives; NCEA achievement standards (NZQA) for senior', 'Te Mātaiaho refresh: English + Maths mandatory Term 1 2026; Science/Social Sciences/HPE + Y9–10 2027; Arts/Tech/Languages 2028; Y11–13 2028–2030; final gazetted version mid-2026', 2026,
   null, 'CC BY-NC 4.0 New Zealand (education.govt.nz) — NON-COMMERCIAL; gazetted-document licence unverified', 'non_commercial'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Tāhūrangi NZ Curriculum","url":"https://newzealandcurriculum.tahurangi.education.govt.nz/"},{"label":"MoE copyright","url":"https://www.education.govt.nz/copyright"}]'::jsonb,
   'Commercial LMS needs Ministry permission. TMoA = parallel Māori-medium curriculum (not a translation).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('339805ce-f70a-537a-8eb0-f99511e8ec49', 'The Ontario Curriculum', 'CA-ON', 'CA-ON',
   'Overall Expectations (B1) + Specific Expectations (B1.1); strand letters per subject; 5-char secondary course codes (MTH1W)', 'catalog', 3,
   'Ontario Ministry of Education', 'CA', 'CA-ON',
   'north_america', 'national_curriculum'::framework_type,
   'K–12', array['all_subjects']::text[], true,
   'Overall Expectations (B1) + Specific Expectations (B1.1); strand letters per subject; 5-char secondary course codes (MTH1W)', 'Per-subject (Math 2020, Language 2023)', 2023,
   null, 'Crown © (King''s Printer for Ontario); non-commercial with credit; commercial needs permission', 'permission_required'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Curriculum and Resources (DCP)","url":"https://www.dcp.edu.gov.on.ca/en/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e7e4aacc-97d4-59ae-99a6-ba76e101305b', 'British Columbia Curriculum (Know-Do-Understand)', 'CA-BC', 'CA-BC',
   'Big Ideas / Curricular Competencies / Content — prose, no codes', 'catalog', 3,
   'BC Ministry of Education and Child Care', 'CA', 'CA-BC',
   'north_america', 'national_curriculum'::framework_type,
   'K–12', array['all_subjects']::text[], false,
   'Big Ideas / Curricular Competencies / Content — prose, no codes', 'Redesigned curriculum (2015–16), per-subject revisions', 2016,
   null, 'Crown ©; permission required beyond personal/non-commercial (OGL-equivalent status unverified)', 'permission_required'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"curriculum.gov.bc.ca","url":"https://curriculum.gov.bc.ca/curriculum/overview"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c243fe2d-8827-5de2-b8b0-cd160e48a205', 'Alberta Programs of Study (new K–6)', 'CA-AB', 'CA-AB',
   'Outcomes-based: guiding questions → learner/specific outcomes — no cross-subject codes', 'catalog', 3,
   'Alberta Education', 'CA', 'CA-AB',
   'north_america', 'national_curriculum'::framework_type,
   'K–12 (new K–6 phased 2022–2025; Gr 7–9 drafts in field-testing)', array['all_subjects']::text[], false,
   'Outcomes-based: guiding questions → learner/specific outcomes — no cross-subject codes', null, 2025,
   null, 'Crown ©; commercial redistribution requires permission (exact terms unverified)', 'permission_required'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"curriculum.learnalberta.ca","url":"https://curriculum.learnalberta.ca/curriculum/en"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('9ab3e03c-86e0-542c-b129-bf03e1e7b76c', 'Québec Education Program (PFEQ)', 'CA-QC', 'CA-QC',
   'Other provinces (MB, SK, NS, NB, NL, PE, territories): own outcomes-based frameworks; Western + Atlantic shared math frameworks; all Crown ©, PDF-only.', 'catalog', 3,
   'Ministère de l''Éducation du Québec', 'CA', 'CA-QC',
   'north_america', 'national_curriculum'::framework_type,
   'Preschool; Elementary cycles 1–3; Secondary cycles 1–2', array['all_subjects']::text[], false,
   'Competency-based: broad areas of learning + 9 cross-curricular competencies + subject competencies', null, 2007,
   null, '© Gouvernement du Québec; commercial requires permission', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"QEP","url":"https://www.education.gouv.qc.ca/en/teachers/quebec-education-program"}]'::jsonb,
   'Other provinces (MB, SK, NS, NB, NL, PE, territories): own outcomes-based frameworks; Western + Atlantic shared math frameworks; all Crown ©, PDF-only.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c3977047-4637-5e3d-bd0b-0b275a97d9fa', 'IB Primary Years Programme', 'IB-PYP', 'global',
   'Documents via MyIB only. VERIFIED 3/3: do NOT ingest IB objective text without a written IBO licence.', 'catalog', 3,
   'International Baccalaureate Organization (IBO)', null, null,
   'global', 'international_programme'::framework_type,
   'Ages 3–12', array['ela','math','science','social_studies','arts','pe_health','sel']::text[], false,
   'Subject continuums by phase (~5) with overall expectations + conceptual understandings + learning outcomes; 6 transdisciplinary themes — no codes', 'New subject continuums Apr 2025 (replace Scope & Sequence); theme descriptors Dec 2024; schools transition by Sept 2027', 2025,
   null, '© IBO — licensing policy explicitly prohibits unlicensed use by app developers / curriculum-mapping platforms; written licence via copyright@ibo.org (may be refused; fees)', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"PYP curriculum","url":"https://ibo.org/programmes/primary-years-programme/curriculum/"},{"label":"IB licensing policies","url":"https://www.ibo.org/become-an-ib-school/ib-publishing/licensing/licensing-policies/"}]'::jsonb,
   'Documents via MyIB only. VERIFIED 3/3: do NOT ingest IB objective text without a written IBO licence.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('4bd05ef1-b239-5e44-9e6f-a22eda77d333', 'IB Middle Years Programme', 'IB-MYP', 'global',
   '8 subject groups × assessment criteria A–D; objectives prose in subject guides; ATL skills; 16 key concepts; 6 global contexts', 'catalog', 3,
   'IBO', null, null,
   'global', 'international_programme'::framework_type,
   'Ages 11–16 (MYP 1–5)', array['all_subjects']::text[], false,
   '8 subject groups × assessment criteria A–D; objectives prose in subject guides; ATL skills; 16 key concepts; 6 global contexts', '''Next Chapter'' framework (2019); stable', 2019,
   null, '© IBO (same licensing policy as PYP)', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"MYP curriculum","url":"https://ibo.org/programmes/middle-years-programme/curriculum/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f3b4a59b-8dba-5f54-bbda-321ab96683f8', 'IB Diploma Programme', 'IB-DP', 'global',
   'Subject guides: aims + assessment objectives (AO1–4) + numbered topics (guide-internal)', 'catalog', 3,
   'IBO', null, null,
   'global', 'international_programme'::framework_type,
   'Ages 16–19; 6 subject groups + TOK/EE/CAS core', array['all_subjects']::text[], false,
   'Subject guides: aims + assessment objectives (AO1–4) + numbered topics (guide-internal)', 'Sciences revised 2023 (first assessment 2025); ~7-year cycles', 2023,
   null, '© IBO', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"DP curriculum","url":"https://ibo.org/programmes/diploma-programme/curriculum/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('71a85672-0907-56fa-9f96-8749361a1ba6', 'IB Career-related Programme', 'IB-CP', 'global',
   null, 'catalog', 3,
   'IBO', null, null,
   'global', 'international_programme'::framework_type,
   'Ages 16–19; ≥2 DP courses + career-related study + CP core', array['vocational','all_subjects']::text[], false,
   null, 'Core revision effective 2024 (Reflective Project externally assessed)', 2024,
   null, '© IBO', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"CP core","url":"https://ibo.org/programmes/career-related-programme/curriculum/the-cp-core/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e414ae1e-502f-56c3-a6e0-94bc5e3c2917', 'Cambridge Primary + Lower Secondary curriculum frameworks', 'CAM-PRI', 'global',
   'Best-coded international programme; PDFs publicly downloadable. VERIFIED 3/3 on permission requirement.', 'catalog', 3,
   'Cambridge International (UCLES)', null, null,
   'global', 'international_programme'::framework_type,
   'Stages 1–6 (ages 5–11) + Stages 7–9 (11–14); 13 primary subjects', array['all_subjects']::text[], true,
   'Coded objectives: 3Nc.01 = Stage 3 + strand N (Number) + sub-strand c + seq .01 (e.g. 7Nf.05 lower secondary); ''*'' = multi-stage', '2020 series (Maths 0096, Science 0097, English 0058; Humanities 0065/0839 newer)', 2020,
   null, '© UCLES; centres may copy internally; commercial third-party reuse requires written permission', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Cambridge Primary curriculum","url":"https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/"},{"label":"Permission application","url":"https://help.cambridgeinternational.org/hc/en-gb/articles/115004418469-How-do-I-apply-for-permission-to-use-Cambridge-copyrighted-material"}]'::jsonb,
   'Best-coded international programme; PDFs publicly downloadable. VERIFIED 3/3 on permission requirement.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2d1675d9-162a-5d2d-b677-eb0dd6a9d8e9', 'Cambridge IGCSE / O Level + AS & A Level syllabuses', 'CAM-IGCSE', 'global',
   'Assessment objectives (AO1–AO4) + numbered topics; syllabus codes (0580 Maths, 9702 Physics)', 'catalog', 3,
   'Cambridge International (UCLES)', null, null,
   'global', 'assessment_framework'::framework_type,
   'Ages 14–16 (70+ IGCSE subjects, 4-digit codes) + 16–19 (~60 AS/A, 9xxx codes)', array['all_subjects']::text[], false,
   'Assessment objectives (AO1–AO4) + numbered topics; syllabus codes (0580 Maths, 9702 Physics)', null, 2023,
   null, '© UCLES; written permission for reuse', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Cambridge qualifications","url":"https://www.cambridgeinternational.org/programmes-and-qualifications/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('8a83b6c1-d59c-5573-9bad-b7930b04c57e', 'Pearson Edexcel international (iPrimary, iLowerSecondary, International GCSE, IAL)', 'EDX-INT', 'global',
   'Spec codes (4MA1, WMA11); AO1–3/4 + numbered units; iPrimary/iLowerSecondary objectives via ActiveLearn (coding unverified)', 'catalog', 3,
   'Pearson Education Ltd', null, null,
   'global', 'international_programme'::framework_type,
   'Ages 3–19', array['ela','math','science','computing','social_studies']::text[], false,
   'Spec codes (4MA1, WMA11); AO1–3/4 + numbered units; iPrimary/iLowerSecondary objectives via ActiveLearn (coding unverified)', null, 2021,
   null, '© Pearson; approved-centre internal use only; commercial use needs written permission (copyrightPQS@pearson.com)', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Edexcel iPrimary","url":"https://qualifications.pearson.com/en/qualifications/edexcel-international-primary-curriculum.html"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('4c010c57-87da-5c0c-9bb7-3a7b203c804e', 'OxfordAQA International GCSEs + International AS/A Level', 'OXAQA', 'global',
   'AO1–3 + numbered sections; spec codes (9630 Physics)', 'catalog', 3,
   'OxfordAQA (OUP + AQA joint venture)', null, null,
   'global', 'assessment_framework'::framework_type,
   'Ages 14–19; 40+ IGCSE subjects + full AS/A suite', array['all_subjects']::text[], false,
   'AO1–3 + numbered sections; spec codes (9630 Physics)', '7 new subjects Sept 2024, first exams 2026', 2024,
   null, '© OxfordAQA, all rights reserved', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"OxfordAQA subjects","url":"https://www.oxfordaqa.com/subjects/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('7480709e-93b6-5140-92bf-45487445e59b', 'International Primary Curriculum (+ IEYC, IMYC)', 'IPC', 'global',
   'Subject Learning Goals + International Learning Goals + 8 Personal Learning Goals — prose, no codes; ~80+ thematic units', 'catalog', 3,
   'Fieldwork Education / International Curriculum Association (Nord Anglia family)', null, null,
   'global', 'proprietary_curriculum'::framework_type,
   'IEYC 2–5; IPC 5–11 (3 stages); IMYC 11–14', array['all_subjects']::text[], false,
   'Subject Learning Goals + International Learning Goals + 8 Personal Learning Goals — prose, no codes; ~80+ thematic units', 'Continuously updated (edition year unverified); 1,000+ schools in 90+ countries', null,
   null, '© Fieldwork Education Ltd — member-school access only (Members'' Lounge)', 'member_only'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"International Curriculum Association","url":"https://internationalcurriculum.com/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('711afc75-d2f3-5539-952e-53d183b8dba5', 'AERO (American Education Reaches Out) standards', 'AERO', 'global',
   'Free public PDFs; used by American-curriculum international schools.', 'catalog', 3,
   'Project AERO / US State Dept Office of Overseas Schools', null, null,
   'global', 'standards'::framework_type,
   'K–12 grade bands', array['ela','math','science','social_studies','languages','arts']::text[], true,
   'CCSS-inherited codes for ELA/Math (''Common Core Plus''); science = 2011 framework + NGSS crosswalk', 'Active (20th Summer Institute Jun 2024); science framework 2011', 2011,
   null, '© AERO notices on PDFs (US-government public-domain status unverified)', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Project AERO","url":"http://www.projectaero.org/"}]'::jsonb,
   'Free public PDFs; used by American-curriculum international schools.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('0c128289-5a09-550d-a277-50b557b4ba56', 'French programmes abroad (AEFE network)', 'AEFE', 'FR',
   'Identical to France''s national programmes', 'catalog', 3,
   'AEFE (delivery) / Ministère de l''Éducation nationale (curriculum)', 'FR', null,
   'global', 'international_programme'::framework_type,
   'Ages 3–18 (cycles 1–4 + lycée); 580+ schools, 139 countries', array['all_subjects']::text[], false,
   'Identical to France''s national programmes', null, 2025,
   null, 'Licence Ouverte / Etalab 2.0 (per éduscol mentions légales; excludes third-party media)', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[{"label":"AEFE","url":"https://www.aefe.fr/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('9514108c-f6d2-5eeb-b5a0-cd8e302857d9', 'German Schools Abroad (ZfA) / Deutsches Internationales Abitur (DIA)', 'ZFA-DIA', 'DE',
   'Follows associated Bundesland Lehrplan + KMK Bildungsstandards; DIA = 5-exam bilingual Abitur', 'catalog', 3,
   'ZfA (Bundesverwaltungsamt) + KMK + associated Bundesland', 'DE', null,
   'global', 'international_programme'::framework_type,
   'K–13; ~140 Deutsche Auslandsschulen + ~1,100 DSD schools', array['all_subjects']::text[], false,
   'Follows associated Bundesland Lehrplan + KMK Bildungsstandards; DIA = 5-exam bilingual Abitur', null, null,
   null, 'Varies by Bundesland; KMK PDFs free; no open licence', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"ZfA","url":"https://www.auslandsschulwesen.de/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('66a5edf6-326b-578f-94e4-f9536fd14c9c', 'Advanced Placement Course and Exam Descriptions (College Board)', 'AP-CED', 'US',
   'Community CASE mappings exist (Common Standards Project covers AP).', 'catalog', 3,
   'College Board', 'US', null,
   'global', 'assessment_framework'::framework_type,
   'High school (ages ~14–19); AP International Diploma recognition', array['all_subjects']::text[], true,
   'Big Ideas → Enduring Understandings → Learning Objectives → Essential Knowledge, coded (e.g. BIO-1.A.1)', 'Per-course CED revisions; APID language-proficiency change deadline Sept 2025', 2024,
   null, '© College Board; free public PDFs; commercial redistribution requires permission; explicitly NO generative-AI training use', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"AP Central courses","url":"https://apcentral.collegeboard.org/courses"},{"label":"Copyright permissions","url":"https://privacy.collegeboard.org/copyright-trademark"}]'::jsonb,
   'Community CASE mappings exist (Common Standards Project covers AP).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fb0a6364-b0b3-5767-89bd-696e714dcb61', 'Adventist Education (NAD) Curriculum Standards', 'NAD-SDA', 'US',
   'Most complete faith-based standards set found.', 'catalog', 3,
   'North American Division Office of Education, Seventh-day Adventist Church', 'US', null,
   'global', 'standards'::framework_type,
   'PreK–12 (elementary by subject; secondary per course, 30+ courses)', array['ela','math','science','social_studies','arts','pe_health','computing','religious_values']::text[], false,
   'Standards by subject/grade with Adventist worldview lens, incorporating national/state standards content', 'Rolling (Technology standards rev. 2022)', 2022,
   null, 'Free PDFs but ''© — may not be used without permission'' — contact NAD before ingesting', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Elementary standards","url":"https://adventisteducation.org/elementary-standards"},{"label":"Secondary standards","url":"https://www.adventistedge.com/secondary/standards/"}]'::jsonb,
   'Most complete faith-based standards set found.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('8dfef04a-acfd-52c3-be9a-346cde3b9f92', 'Catholic Curriculum Standards (Cardinal Newman Society)', 'CNS-CCS', 'US',
   'US dioceses typically adopt state standards + diocesan religion standards (e.g. Archdioceses of Chicago, LA, Boston) — fragmented, no national Catholic academic standard.', 'catalog', 3,
   'Cardinal Newman Society', 'US', null,
   'global', 'standards'::framework_type,
   'Bands K–6 and 7–12 (not per-grade)', array['ela','math','social_studies','science']::text[], false,
   '3 standard types per discipline (general/intellectual/dispositional); designed to overlay state standards with a Catholic lens', '© 2023', 2023,
   null, 'Free download (PDF/Word/Excel); no licence terms published — contact before ingesting', 'unverified'::framework_commercial_use,
   null, array['pdf','excel']::text[], '[{"label":"Download page","url":"https://cardinalnewmansociety.org/educator-resources/resources/academics/catholic-curriculum-standards/downloading-the-standards/"}]'::jsonb,
   'US dioceses typically adopt state standards + diocesan religion standards (e.g. Archdioceses of Chicago, LA, Boston) — fragmented, no national Catholic academic standard.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('088b8279-9c9d-5e16-969e-2f646d399037', 'Lutheran Academic Standards (LCMS)', 'LCMS-LAS', 'US',
   null, 'catalog', 3,
   'The Lutheran Church—Missouri Synod / Concordia Publishing House', 'US', null,
   'global', 'standards'::framework_type,
   'K–12', array['ela','math','science','social_studies','arts','religious_values']::text[], false,
   null, 'Publication imminent (delivery to CPH May/June 2026 per LCMS Reporter — unverified)', 2026,
   null, 'TBD at publication (CPH)', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"LCMS Reporter announcement","url":"https://reporter.lcms.org/2026/lutheran-academic-standards-near-completion/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e6f76b4d-4068-5a16-8b0b-45a7b601a747', 'Core Knowledge Sequence', 'CK-SEQ', 'US',
   'Whether a school-paid SaaS counts as ''commercial'' under NC needs CKF confirmation (info@coreknowledge.org). VERIFIED licence 2/3+terms page.', 'catalog', 3,
   'Core Knowledge Foundation (E.D. Hirsch)', 'US', null,
   'global', 'standards'::framework_type,
   'PreK–8', array['ela','social_studies','math','science','arts']::text[], false,
   'Detailed per-grade content topics + skills (taggable granularity, no codes)', '2023 Edition', 2023,
   null, 'CC BY-NC-SA 4.0 (terms-of-use page) — NON-COMMERCIAL + ShareAlike', 'non_commercial'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Core Knowledge Sequence","url":"https://www.coreknowledge.org/core-knowledge-sequence/"},{"label":"Terms of use","url":"https://www.coreknowledge.org/terms-of-use/"}]'::jsonb,
   'Whether a school-paid SaaS counts as ''commercial'' under NC needs CKF confirmation (info@coreknowledge.org). VERIFIED licence 2/3+terms page.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('6c6bdcd9-0dd3-53e5-8531-f00b39354e46', 'Hillsdale K-12 Program Guides + 1776 Curriculum', 'HILLSDALE', 'US',
   'Program guides = scope & sequence (not coded standards); 1776 Curriculum = full history/civics lessons', 'catalog', 3,
   'Hillsdale College K-12 Education Office', 'US', null,
   'global', 'proprietary_curriculum'::framework_type,
   'K–12', array['ela','math','science','social_studies','arts','languages']::text[], false,
   'Program guides = scope & sequence (not coded standards); 1776 Curriculum = full history/civics lessons', '1776 Curriculum free with account (unverified); full curriculum = member-school licence', null,
   null, '© Hillsdale College', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Curriculum overview","url":"https://k12.hillsdale.edu/Curriculum/Overview/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('4b967a1e-0b87-5453-94d0-1344ac29c03c', 'Zekelman Standards for Judaic Studies', 'ZEKELMAN', 'US',
   'Grade-by-grade benchmarks for Judaic text skills', 'catalog', 3,
   'Menachem Education Foundation', 'US', null,
   'global', 'standards'::framework_type,
   'Chumash grades 1–8; Talmud (4 levels); Kriah', array['religious_values']::text[], false,
   'Grade-by-grade benchmarks for Judaic text skills', 'v2.0 (2017; overview 2024)', 2017,
   null, 'Free open-access (login removed — per secondary source; direct fetch failed)', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"Zekelman Standards","url":"https://mymef.org/zekelman-standards/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('cf2aee8b-df02-52f8-a9f4-46efd08c713d', 'EL Education K-8 Language Arts (open curriculum)', 'EL-ED', 'US',
   'Standards-based learning targets aligned explicitly to CCSS ELA', 'catalog', 3,
   'EL Education (+ Open Up Resources)', 'US', null,
   'global', 'proprietary_curriculum'::framework_type,
   'K–8 (ELA)', array['ela']::text[], false,
   'Standards-based learning targets aligned explicitly to CCSS ELA', '2025 Edition (K–5)', 2025,
   null, 'Open source / free for educational use', 'open_attribution'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"EL Education curriculum","url":"https://curriculum.eleducation.org/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b5f51f76-6bd4-539b-9e1d-5533bd499d32', 'ACSI Inspire Accreditation Standards (+ Purposeful Design curriculum)', 'ACSI', 'US',
   'Pattern for faith/classical networks: most publish accreditation criteria or proprietary scope-&-sequence, not taggable standards. Same classification: ACCS, SCL (classical accreditors), NCEA NSBECS (Catholic school-effectiveness), CISNA/Tarbiyah/ISLA (Islamic — no public standards; Gulf Islamic studies via ministries), Abeka/BJU/ACE/Memoria/Sonlight/Veritas/Classical Conversations (proprietary curricula w/ free scope-&-sequence), AmblesideOnline (free CM schedules), Montessori AMI/AMS (training-embedded albums; age bands), Waldorf AWSNA/SWSF (commercial ''Yellow Book'' outline), Reggio Emilia (no standards by design), CSI Bible standards K-8 (purchasable), JTS Tanakh/Rabbinics standards (PD-program-embedded), SABIS (fully proprietary points system).', 'catalog', 3,
   'Association of Christian Schools International', 'US', null,
   'global', 'accreditation'::framework_type,
   'School-level (6 domains, 20 standards); PDP curriculum K–8 commercial', array['cross_curricular']::text[], false,
   'School-quality standards — NOT lesson-taggable academic content standards', 'Inspire standards (current)', null,
   null, 'Inspire manual free PDF; PDP curriculum commercial', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"ACSI accreditation","url":"https://www.acsi.org/accreditation-certification"}]'::jsonb,
   'Pattern for faith/classical networks: most publish accreditation criteria or proprietary scope-&-sequence, not taggable standards. Same classification: ACCS, SCL (classical accreditors), NCEA NSBECS (Catholic school-effectiveness), CISNA/Tarbiyah/ISLA (Islamic — no public standards; Gulf Islamic studies via ministries), Abeka/BJU/ACE/Memoria/Sonlight/Veritas/Classical Conversations (proprietary curricula w/ free scope-&-sequence), AmblesideOnline (free CM schedules), Montessori AMI/AMS (training-embedded albums; age bands), Waldorf AWSNA/SWSF (commercial ''Yellow Book'' outline), Reggio Emilia (no standards by design), CSI Bible standards K-8 (purchasable), JTS Tanakh/Rabbinics standards (PD-program-embedded), SABIS (fully proprietary points system).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c33623ba-1b9a-5616-aba9-f738264ad88f', 'Common Core State Standards — English Language Arts/Literacy', 'CCSS-ELA', 'US',
   'Third-party machine-readable via Common Standards Project API + CASE providers.', 'catalog', 3,
   'NGA Center for Best Practices + CCSSO', 'US', null,
   'north_america', 'standards'::framework_type,
   'K–12', array['ela']::text[], true,
   'CCSS.ELA-LITERACY.[strand].[grade].[standard](.[sub]) — e.g. RL.5.3 = Reading: Literature, Grade 5, std 3; anchor standards CCRA.[strand].[n]', '2010 (unchanged); states publish renamed derivatives', 2010,
   null, 'CCSS Public License: royalty-free copy/publish/distribute/display ''for purposes that support the CCSS Initiative''; mandatory verbatim © notice; no altering', 'open_attribution'::framework_commercial_use,
   'Purpose-scoped grant (not blanket CC). Include: ''© Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.'' Counsel check recommended for commercial-product scope.', array['html','pdf']::text[], '[{"label":"Public license","url":"https://www.thecorestandards.org/public-license/"},{"label":"ELA standards","url":"https://www.thecorestandards.org/ELA-Literacy/"}]'::jsonb,
   'Third-party machine-readable via Common Standards Project API + CASE providers.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('5450d647-5d95-583e-a2ec-7a7df217791a', 'Common Core State Standards — Mathematics (Content)', 'CCSS-MATH', 'US',
   'CCSS.MATH.CONTENT.[grade].[domain].[cluster].[n] — e.g. 5.NBT.B.5 = Grade 5, Number & Operations in Base Ten, cluster B, std 5', 'catalog', 3,
   'NGA Center + CCSSO', 'US', null,
   'north_america', 'standards'::framework_type,
   'K–12 (K–8 by grade; HS by conceptual category)', array['math']::text[], true,
   'CCSS.MATH.CONTENT.[grade].[domain].[cluster].[n] — e.g. 5.NBT.B.5 = Grade 5, Number & Operations in Base Ten, cluster B, std 5', '2010', 2010,
   null, 'CCSS Public License (as CCSS-ELA)', 'open_attribution'::framework_commercial_use,
   'Same notice requirement as CCSS-ELA.', array['html','pdf']::text[], '[{"label":"Math standards","url":"https://www.thecorestandards.org/Math/"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c1ac4d77-2495-5412-8ac3-2ec8586e1392', 'CCSS Standards for Mathematical Practice', 'CCSS-SMP', 'US',
   'The 8 process practices (MP1 ''Make sense of problems and persevere…'' → MP8). Tag-friendly across every grade.', 'catalog', 3,
   'NGA Center + CCSSO', 'US', null,
   'north_america', 'standards'::framework_type,
   'K–12 (grade-independent practices)', array['math']::text[], true,
   'CCSS.MATH.PRACTICE.MP1–MP8 (8 practices)', '2010', 2010,
   null, 'CCSS Public License', 'open_attribution'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"Mathematical Practice","url":"https://www.thecorestandards.org/Math/Practice/"}]'::jsonb,
   'The 8 process practices (MP1 ''Make sense of problems and persevere…'' → MP8). Tag-friendly across every grade.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('a59a1a08-1024-5043-9705-c416abc36a0a', 'Next Generation Science Standards', 'NGSS', 'US',
   '~20 states adopted verbatim + ~24 adapted Framework-based standards (per-state stance in state entries).', 'catalog', 3,
   'NGSS Lead States (Achieve; WestEd/NSTA stewardship)', 'US', null,
   'north_america', 'subject_framework'::framework_type,
   'K–12 (grade levels K–5; grade-banded MS/HS)', array['science']::text[], true,
   'Performance expectations: [grade]-[discipline][core idea]-[n] — e.g. 5-PS1-1 (Grade 5, Physical Sciences DCI 1, PE 1); 3D structure: SEPs × DCIs × CCCs', '2013', 2013,
   null, '© Achieve/NGSS Lead States — free use with attribution per NGSS terms of use; trademark rules for ''aligned'' claims', 'open_attribution'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"nextgenscience.org","url":"https://www.nextgenscience.org/"}]'::jsonb,
   '~20 states adopted verbatim + ~24 adapted Framework-based standards (per-state stance in state entries).')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('82a94112-ea0a-51f3-9b2f-2377df368637', 'C3 Framework for Social Studies State Standards', 'C3-SS', 'US',
   'Dimension-coded indicators, e.g. D2.His.1.3-5', 'catalog', 3,
   'National Council for the Social Studies (NCSS)', 'US', null,
   'north_america', 'subject_framework'::framework_type,
   'K–12 (grade bands)', array['social_studies']::text[], true,
   'Dimension-coded indicators, e.g. D2.His.1.3-5', '2013', 2013,
   null, '© NCSS; free PDF', 'unverified'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"C3 Framework","url":"https://www.socialstudies.org/standards/c3"}]'::jsonb,
   null)
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('10d7f87e-f15e-5494-b92c-b7f87842cc9b', 'CASEL SEL Framework (5 competencies)', 'CASEL', 'US',
   'Maps to the app''s SEL subject; many states publish their own SEL competencies derived from it.', 'catalog', 3,
   'Collaborative for Academic, Social, and Emotional Learning', 'US', null,
   'north_america', 'subject_framework'::framework_type,
   'PreK–12 (not grade-differentiated)', array['sel']::text[], false,
   '5 competencies (Self-Awareness, Self-Management, Social Awareness, Relationship Skills, Responsible Decision-Making) — framework, not granular standards', '2020 update', 2020,
   null, '© CASEL', 'unverified'::framework_commercial_use,
   null, array['html','pdf']::text[], '[{"label":"CASEL framework","url":"https://casel.org/fundamentals-of-sel/"}]'::jsonb,
   'Maps to the app''s SEL subject; many states publish their own SEL competencies derived from it.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('617baacb-c0bf-5274-9a16-00319e9d9a14', 'WIDA English Language Development Standards Framework, 2020 Edition', 'WIDA-ELD', 'US',
   'De-facto EL framework in 40+ US states and many international schools.', 'catalog', 3,
   'WIDA Consortium (Univ. of Wisconsin–Madison)', 'US', null,
   'north_america', 'subject_framework'::framework_type,
   'K–12 (grade-level clusters)', array['ela','languages']::text[], true,
   '5 ELD standards × Key Language Uses × proficiency levels (e.g. ELD-SI, ELD-LA)', '2020 Edition', 2020,
   null, '© WIDA; use per WIDA terms (consortium membership for assessments)', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"WIDA ELD 2020","url":"https://wida.wisc.edu/teach/standards/eld"}]'::jsonb,
   'De-facto EL framework in 40+ US states and many international schools.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('272678c2-40a0-5e72-827b-f672a02a0fd8', 'IB Approaches to Learning (ATL) skills framework', 'IB-ATL', 'global',
   'App ships CATEGORY-LEVEL reference only (5 categories + cluster names, facts not expression); full descriptor text requires an IBO licence or school-uploaded provenance.', 'catalog', 3,
   'International Baccalaureate Organization', null, null,
   'global', 'subject_framework'::framework_type,
   'All IB programmes (PYP/MYP/DP/CP, ages 3–19)', array['cross_curricular','sel']::text[], false,
   '5 skill categories (Thinking, Communication, Self-management, Research, Social) with sub-skill clusters (e.g. MYP: 10 clusters) — prose, no codes', 'Embedded in current programme guides', null,
   null, '© IBO — same licensing policy as all IB content (written licence required for app use)', 'permission_required'::framework_commercial_use,
   null, array['pdf']::text[], '[{"label":"IB ATL overview","url":"https://www.ibo.org/benefits-of-the-ib/why-the-ib-is-different/approaches-to-teaching-and-learning/"}]'::jsonb,
   'App ships CATEGORY-LEVEL reference only (5 categories + cluster names, facts not expression); full descriptor text requires an IBO licence or school-uploaded provenance.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('70af4942-ae23-5cc5-901f-92bc9a1ce827', 'Alabama Courses of Study', 'US-AL', 'US-AL',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Alabama state education agency', 'US', 'US-AL',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f7760b8f-ba23-5d1b-92a6-58467f1155bb', 'Alaska Content & Performance Standards', 'US-AK', 'US-AK',
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Alaska state education agency', 'US', 'US-AK',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('81f6ae6f-a4d3-57f1-9483-d1e11b5a16e7', 'Arizona''s Academic Standards', 'US-AZ', 'US-AZ',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Arizona state education agency', 'US', 'US-AZ',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('ade47db8-8bfa-5d66-bd6c-aff34eeec983', 'Arkansas Academic Standards (2023)', 'US-AR', 'US-AR',
   'ELA/Math: independent. Science: NGSS verbatim. LOW CONFIDENCE: science stance per baseline, not re-verified. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Arkansas state education agency', 'US', 'US-AR',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: NGSS verbatim. LOW CONFIDENCE: science stance per baseline, not re-verified. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b221322e-7e1c-5958-8eb6-380396df0d58', 'California Common Core State Standards', 'US-CA', 'US-CA',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'California state education agency', 'US', 'US-CA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2fdf43b5-3037-51e5-a6bd-1b7623cf3725', 'Colorado Academic Standards', 'US-CO', 'US-CO',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Colorado state education agency', 'US', 'US-CO',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('ac115ddf-4add-545d-b03a-1ffeddf30f0b', 'Connecticut Core Standards', 'US-CT', 'US-CT',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Connecticut state education agency', 'US', 'US-CT',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('1e60f7ea-7435-59fb-944b-aa86ecd0d76e', 'Delaware Academic Standards', 'US-DE', 'US-DE',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Delaware state education agency', 'US', 'US-DE',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('9d49e221-24b5-5380-8651-e7b896cfc901', 'Florida''s B.E.S.T. Standards (2020)', 'US-FL', 'US-FL',
   'ELA/Math: independent. Science: Own (NGSSS, independent). As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Florida state education agency', 'US', 'US-FL',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Own (NGSSS, independent). As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('3ec8e6cf-8852-526d-b980-f757e79b73ff', 'Georgia Standards of Excellence (math) / Georgia''s K-12 ELA Standards (2025-26)', 'US-GA', 'US-GA',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. LOW CONFIDENCE: math-revision status unverified; ELA newly independent 2025-26. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Georgia state education agency', 'US', 'US-GA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. LOW CONFIDENCE: math-revision status unverified; ELA newly independent 2025-26. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('05804a5d-985c-5a4b-9c23-53175cf7807e', 'Hawaii Common Core State Standards', 'US-HI', 'US-HI',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Hawaii state education agency', 'US', 'US-HI',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('0da3d556-f580-565c-9484-f7f84c013f1e', 'Idaho Content Standards (2022 revision)', 'US-ID', 'US-ID',
   'ELA/Math: CCSS-derived revision (Idaho Content Standards, adopted Jan 2022) — legislatively de-adopted Common Core but content largely retained; mixed-depth revision, not a wholesale independent replacement. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Idaho state education agency', 'US', 'US-ID',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision (Idaho Content Standards, adopted Jan 2022) — legislatively de-adopted Common Core but content largely retained; mixed-depth revision, not a wholesale independent replacement. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('923e0ac1-8a79-513f-8885-d61340144d35', 'Illinois Learning Standards', 'US-IL', 'US-IL',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Illinois state education agency', 'US', 'US-IL',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('dce2a8a9-eae5-5b16-b20f-cb9c9d33113b', 'Indiana Academic Standards (2014+)', 'US-IN', 'US-IN',
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Indiana state education agency', 'US', 'US-IN',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('f043b8da-a6b1-549a-99ad-ae9878cb2673', 'Iowa Core', 'US-IA', 'US-IA',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Iowa state education agency', 'US', 'US-IA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('86b29a69-cb37-52d4-8936-8b0e3d274212', 'Kansas College & Career Ready Standards', 'US-KS', 'US-KS',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Kansas state education agency', 'US', 'US-KS',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('a7546c34-2eec-5577-b981-bddedca507ea', 'Kentucky Academic Standards (2019)', 'US-KY', 'US-KY',
   'ELA/Math: CCSS-derived revision. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Kentucky state education agency', 'US', 'US-KY',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('5f48d39e-543d-583e-ae2f-b82eafd7da04', 'Louisiana Student Standards (2016; 2025 review underway)', 'US-LA', 'US-LA',
   'ELA/Math: CCSS-derived revision (Louisiana Student Standards 2016; 2016 changes largely cosmetic). 2025 standards review underway — revised draft to BESE March 2026. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Louisiana state education agency', 'US', 'US-LA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision (Louisiana Student Standards 2016; 2016 changes largely cosmetic). 2025 standards review underway — revised draft to BESE March 2026. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('6b98425b-09db-58d0-8b7f-5cbe91e45343', 'Maine Learning Results', 'US-ME', 'US-ME',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Maine state education agency', 'US', 'US-ME',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d3fc99d2-cc29-53a4-9422-eead13645966', 'Maryland College and Career-Ready Standards', 'US-MD', 'US-MD',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Maryland state education agency', 'US', 'US-MD',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('c0e66909-cd11-5405-a3e6-033df97ce849', 'Massachusetts Curriculum Frameworks (2017)', 'US-MA', 'US-MA',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Massachusetts state education agency', 'US', 'US-MA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fac288cb-c3a6-5b7d-ade4-d1f920dd80c6', 'Michigan Academic Standards', 'US-MI', 'US-MI',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Michigan state education agency', 'US', 'US-MI',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('9af197d3-357d-5d7e-be3b-cf2a58333446', 'Minnesota Academic Standards', 'US-MN', 'US-MN',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. LOW CONFIDENCE: CCSS ELA only; math never adopted (independent). As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Minnesota state education agency', 'US', 'US-MN',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. LOW CONFIDENCE: CCSS ELA only; math never adopted (independent). As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d27d7318-5a43-569b-8e2c-13a30689d91a', 'Mississippi College- and Career-Readiness Standards', 'US-MS', 'US-MS',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Mississippi state education agency', 'US', 'US-MS',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('112f76e7-ac3d-543e-b3e2-f74977ea54a6', 'Missouri Learning Standards (2016)', 'US-MO', 'US-MO',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Missouri state education agency', 'US', 'US-MO',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('8ac7ca35-3465-57a6-bf6a-083de6e6fc97', 'Montana Common Core Standards', 'US-MT', 'US-MT',
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Montana state education agency', 'US', 'US-MT',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('966d80af-3eae-5a65-becb-772277bfc6c5', 'Nebraska College and Career Ready Standards', 'US-NE', 'US-NE',
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Nebraska state education agency', 'US', 'US-NE',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('0e464ca6-31f6-5846-a7dd-f394dfdc43d7', 'Nevada Academic Content Standards', 'US-NV', 'US-NV',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Nevada state education agency', 'US', 'US-NV',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('da6c5a2d-e0f7-55ef-b78c-106d50e6b0ca', 'New Hampshire College and Career Ready Standards', 'US-NH', 'US-NH',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'New Hampshire state education agency', 'US', 'US-NH',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('00c1bff6-5ae2-5bc6-b0b2-6d6abdd03b46', 'New Jersey Student Learning Standards', 'US-NJ', 'US-NJ',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'New Jersey state education agency', 'US', 'US-NJ',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2e9d0839-d454-59e3-a912-5166754ecce7', 'New Mexico Common Core State Standards', 'US-NM', 'US-NM',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'New Mexico state education agency', 'US', 'US-NM',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('73dd4759-783f-5603-9f24-844843107e20', 'New York Next Generation Learning Standards (2017)', 'US-NY', 'US-NY',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'New York state education agency', 'US', 'US-NY',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('afb3a5fb-ebc9-5d06-816a-356cb531d31e', 'NC Standard Course of Study (new ELA SCoS 2027-28)', 'US-NC', 'US-NC',
   'ELA/Math: CCSS-derived revision (new ELA SCoS 2027-28). Science: Own — NC 2023 K-12 Science Standards (NCSCOS), adopted 2023, implemented 2024-25; Framework-based, not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'North Carolina state education agency', 'US', 'US-NC',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision (new ELA SCoS 2027-28). Science: Own — NC 2023 K-12 Science Standards (NCSCOS), adopted 2023, implemented 2024-25; Framework-based, not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d52439c7-4941-5aef-a96e-17ec936e975c', 'North Dakota Education Content Standards', 'US-ND', 'US-ND',
   'ELA/Math: CCSS-derived revision (ND English Language Arts Content Standards 2023 / ND Mathematics Content Standards 2023; umbrella name ''North Dakota Education Content Standards'', confirmed from ND DPI). Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'North Dakota state education agency', 'US', 'US-ND',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision (ND English Language Arts Content Standards 2023 / ND Mathematics Content Standards 2023; umbrella name ''North Dakota Education Content Standards'', confirmed from ND DPI). Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('81399dbb-c3ac-53e7-b587-baede1b55421', 'Ohio''s Learning Standards', 'US-OH', 'US-OH',
   'ELA/Math: CCSS-derived revision. Science: Own — Ohio''s Learning Standards for Science (adopted 2018, published 2019); not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Ohio state education agency', 'US', 'US-OH',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Own — Ohio''s Learning Standards for Science (adopted 2018, published 2019); not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('d8d6065b-78dd-5919-98c0-be52e9051ab4', 'Oklahoma Academic Standards (2016)', 'US-OK', 'US-OK',
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Oklahoma state education agency', 'US', 'US-OK',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('e8628eae-0373-5048-9234-d8b75c609552', 'Oregon Academic Content Standards', 'US-OR', 'US-OR',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Oregon state education agency', 'US', 'US-OR',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('8ac6a623-71de-5e2e-baf5-7abd1690ec13', 'PA Core Standards', 'US-PA', 'US-PA',
   'ELA/Math: CCSS-derived revision (PA Core Standards). Science: Own — STEELS (adopted 2022, fully effective 2025-26; legacy standards sunset 2025-06-30); Framework-based, not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Pennsylvania state education agency', 'US', 'US-PA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision (PA Core Standards). Science: Own — STEELS (adopted 2022, fully effective 2025-26; legacy standards sunset 2025-06-30); Framework-based, not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b28036e7-5061-5fbe-91ef-077930107a62', 'Rhode Island Common Core State Standards', 'US-RI', 'US-RI',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Rhode Island state education agency', 'US', 'US-RI',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('2346688d-3505-5b55-b6c8-09722fc2f311', 'South Carolina College- and Career-Ready Standards (ELA 2024, Math 2023)', 'US-SC', 'US-SC',
   'ELA/Math: independent (SC College- and Career-Ready Standards; ELA 2024, Math 2023). Science: Own — SC College- and Career-Ready Science Standards 2021; Framework-based, closely NGSS-aligned K-8, not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'South Carolina state education agency', 'US', 'US-SC',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent (SC College- and Career-Ready Standards; ELA 2024, Math 2023). Science: Own — SC College- and Career-Ready Science Standards 2021; Framework-based, closely NGSS-aligned K-8, not NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('da325af6-f9eb-5fb1-8fd7-a4f506e07eea', 'South Dakota Academic Standards', 'US-SD', 'US-SD',
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'South Dakota state education agency', 'US', 'US-SD',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('b513f6c8-5bb8-5c28-b6ef-169fd6aafec1', 'Tennessee Academic Standards (2016-17)', 'US-TN', 'US-TN',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Tennessee state education agency', 'US', 'US-TN',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('69de9487-25dc-543b-a5d0-8dc73b43c059', 'Texas Essential Knowledge and Skills (TEKS)', 'US-TX', 'US-TX',
   'ELA/Math: independent. Science: Own (independent; science TEKS revised 2024-25). As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Texas state education agency', 'US', 'US-TX',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Own (independent; science TEKS revised 2024-25). As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('0d8cc9a2-bded-5e91-9798-81d9d39ba665', 'Utah Core Standards', 'US-UT', 'US-UT',
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Utah state education agency', 'US', 'US-UT',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('14e73cdb-700b-5aca-85a3-08d03e626fc4', 'Vermont''s Common Core State Standards', 'US-VT', 'US-VT',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Vermont state education agency', 'US', 'US-VT',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('fb6b49e5-cfc4-5c69-ada3-b9ed91da6a28', 'Virginia Standards of Learning (SOL)', 'US-VA', 'US-VA',
   'ELA/Math: independent. Science: Own (independent). As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Virginia state education agency', 'US', 'US-VA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: independent. Science: Own (independent). As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('32b523e7-5994-5ac0-9581-803f4f470c43', 'Washington State Learning Standards', 'US-WA', 'US-WA',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Washington state education agency', 'US', 'US-WA',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('79466cf0-adb6-5bb0-b16c-2239f0f16780', 'West Virginia College- and Career-Readiness Standards', 'US-WV', 'US-WV',
   'ELA/Math: CCSS-derived revision (WV College- and Career-Readiness Standards; Policy 2520.1A ELA / 2520.2B Math, Math effective 2024). Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'West Virginia state education agency', 'US', 'US-WV',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'State publication', 'unverified'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS-derived revision (WV College- and Career-Readiness Standards; Policy 2520.1A ELA / 2520.2B Math, Math effective 2024). Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('16c02c1e-2327-5c26-8aa4-a03a88d3e508', 'Wisconsin Academic Standards', 'US-WI', 'US-WI',
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. LOW CONFIDENCE: 2021 math revision scope not directly reviewed. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Wisconsin state education agency', 'US', 'US-WI',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. LOW CONFIDENCE: 2021 math revision scope not directly reviewed. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('199f01fe-71d5-56da-b7cd-e5499af505fe', 'Wyoming Content and Performance Standards', 'US-WY', 'US-WY',
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'Wyoming state education agency', 'US', 'US-WY',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: Framework-based own. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;
insert into standards_frameworks
  (id, name, short_code, jurisdiction, description, provenance, max_depth,
   authority, country_code, subdivision_code, region, framework_kind,
   grade_range, subject_scope, has_item_codes, coding_scheme, current_version,
   version_year, reform_status, licence, commercial_use, licence_notes,
   machine_readable, source_links, catalog_notes)
values
  ('18da8983-3020-5dfb-89d8-d32ec8a7d2a8', 'DC Common Core State Standards', 'US-DC', 'US-DC',
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.', 'catalog', 3,
   'District of Columbia state education agency', 'US', 'US-DC',
   'north_america', 'standards'::framework_type,
   'K–12', array['ela','math']::text[], true,
   null, null, null,
   null, 'CCSS Public License (state adoption) / state publication', 'open_attribution'::framework_commercial_use,
   null, array['pdf','html']::text[], '[]'::jsonb,
   'ELA/Math: CCSS verbatim/renamed. Science: NGSS verbatim. As of 2026-06; via Common Standards Project / CASE where available.')
on conflict (id) do update set
  name = excluded.name, short_code = excluded.short_code,
  jurisdiction = excluded.jurisdiction, description = excluded.description,
  authority = excluded.authority, country_code = excluded.country_code,
  subdivision_code = excluded.subdivision_code, region = excluded.region,
  framework_kind = excluded.framework_kind, grade_range = excluded.grade_range,
  subject_scope = excluded.subject_scope, has_item_codes = excluded.has_item_codes,
  coding_scheme = excluded.coding_scheme, current_version = excluded.current_version,
  version_year = excluded.version_year, reform_status = excluded.reform_status,
  licence = excluded.licence, commercial_use = excluded.commercial_use,
  licence_notes = excluded.licence_notes, machine_readable = excluded.machine_readable,
  source_links = excluded.source_links, catalog_notes = excluded.catalog_notes;

-- ── Framework lineage ───────────────────────────────────────────
update standards_frameworks set parent_framework_id = '10297998-50d1-51fb-92b9-5f17733fecc3' where id = '2d129c6d-ae94-56f2-b3c6-5da68993e827';
update standards_frameworks set parent_framework_id = '10297998-50d1-51fb-92b9-5f17733fecc3' where id = '3d5dd808-acbe-5023-8d36-1efaae968591';
update standards_frameworks set parent_framework_id = '1d45a4d9-f9ac-5eb3-b194-13e3a3022e97' where id = '0c128289-5a09-550d-a277-50b557b4ba56';
update standards_frameworks set parent_framework_id = '6cf50fb9-ead0-587c-9048-316a42559f56' where id = '9514108c-f6d2-5eeb-b5a0-cd8e302857d9';
update standards_frameworks set parent_framework_id = '5450d647-5d95-583e-a2ec-7a7df217791a' where id = 'c1ac4d77-2495-5412-8ac3-2ec8586e1392';
update standards_frameworks set parent_framework_id = '4bd05ef1-b239-5e44-9e6f-a22eda77d333' where id = '272678c2-40a0-5e72-827b-f672a02a0fd8';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '70af4942-ae23-5cc5-901f-92bc9a1ce827';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '81f6ae6f-a4d3-57f1-9483-d1e11b5a16e7';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'b221322e-7e1c-5958-8eb6-380396df0d58';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '2fdf43b5-3037-51e5-a6bd-1b7623cf3725';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'ac115ddf-4add-545d-b03a-1ffeddf30f0b';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '1e60f7ea-7435-59fb-944b-aa86ecd0d76e';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '3ec8e6cf-8852-526d-b980-f757e79b73ff';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '05804a5d-985c-5a4b-9c23-53175cf7807e';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '923e0ac1-8a79-513f-8885-d61340144d35';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'f043b8da-a6b1-549a-99ad-ae9878cb2673';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '86b29a69-cb37-52d4-8936-8b0e3d274212';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'a7546c34-2eec-5577-b981-bddedca507ea';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '5f48d39e-543d-583e-ae2f-b82eafd7da04';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '6b98425b-09db-58d0-8b7f-5cbe91e45343';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'd3fc99d2-cc29-53a4-9422-eead13645966';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'c0e66909-cd11-5405-a3e6-033df97ce849';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'fac288cb-c3a6-5b7d-ade4-d1f920dd80c6';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '9af197d3-357d-5d7e-be3b-cf2a58333446';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'd27d7318-5a43-569b-8e2c-13a30689d91a';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '112f76e7-ac3d-543e-b3e2-f74977ea54a6';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '8ac7ca35-3465-57a6-bf6a-083de6e6fc97';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '0e464ca6-31f6-5846-a7dd-f394dfdc43d7';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'da6c5a2d-e0f7-55ef-b78c-106d50e6b0ca';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '00c1bff6-5ae2-5bc6-b0b2-6d6abdd03b46';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '2e9d0839-d454-59e3-a912-5166754ecce7';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '73dd4759-783f-5603-9f24-844843107e20';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'afb3a5fb-ebc9-5d06-816a-356cb531d31e';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'd52439c7-4941-5aef-a96e-17ec936e975c';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '81399dbb-c3ac-53e7-b587-baede1b55421';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'e8628eae-0373-5048-9234-d8b75c609552';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '8ac6a623-71de-5e2e-baf5-7abd1690ec13';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'b28036e7-5061-5fbe-91ef-077930107a62';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'da325af6-f9eb-5fb1-8fd7-a4f506e07eea';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = 'b513f6c8-5bb8-5c28-b6ef-169fd6aafec1';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '0d8cc9a2-bded-5e91-9798-81d9d39ba665';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '14e73cdb-700b-5aca-85a3-08d03e626fc4';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '32b523e7-5994-5ac0-9581-803f4f470c43';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '79466cf0-adb6-5bb0-b16c-2239f0f16780';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '16c02c1e-2327-5c26-8aa4-a03a88d3e508';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '199f01fe-71d5-56da-b7cd-e5499af505fe';
update standards_frameworks set parent_framework_id = 'c33623ba-1b9a-5616-aba9-f738264ad88f' where id = '18da8983-3020-5dfb-89d8-d32ec8a7d2a8';

-- ── Taggable standards items ────────────────────────────────────

-- CCSS-ELA (10)
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('cea73b82-2cf7-5bf8-a512-db077149f870', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'RL.5.2', 'Determine a theme of a story from details in the text.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'RL.5.3', 'Compare and contrast two or more characters, settings, or events in a story.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('61b8841c-24fc-5b65-aeba-30a4921618e1', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'RL.5.6', 'Describe how a narrator''s or speaker''s point of view influences events.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('66abf161-c5f5-58dc-844d-d2dfec099458', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'RF.5.3', 'Know and apply grade-level phonics and word analysis skills.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('dd21d2f2-a702-50a3-a23b-9c671dbf4492', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'RF.5.4', 'Read with sufficient accuracy and fluency to support comprehension.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('88439755-d52b-54a9-aaf9-6ba633858f0f', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'W.5.3', 'Write narratives to develop real or imagined experiences using effective technique.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('38c24224-876b-53e8-a401-92c52500113c', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'W.5.3.B', 'Use narrative techniques, such as dialogue, description, and pacing.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('e5b4eb4b-be06-5e65-8181-c89da058e4e3', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'L.5.1.C', 'Use verb tense to convey various times, sequences, states, and conditions.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('395b5165-beaa-5bed-9d89-a2eb51d5945f', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'L.5.1.D', 'Recognize and correct inappropriate shifts in verb tense.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('e9645a88-4cd8-582d-8c6e-e282f069266d', 'c33623ba-1b9a-5616-aba9-f738264ad88f', null, 'L.5.2.E', 'Spell grade-appropriate words correctly, consulting references as needed.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;

-- CCSS-MATH (5)
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('8229994a-6b86-5239-95bb-729b2ab4e0b0', '5450d647-5d95-583e-a2ec-7a7df217791a', null, '5.NBT.B.5', 'Fluently multiply multi-digit whole numbers using the standard algorithm.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('1725655b-e780-5c08-b630-090183a626d9', '5450d647-5d95-583e-a2ec-7a7df217791a', null, '5.NF.A.1', 'Add and subtract fractions with unlike denominators.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('4e1ab698-bce2-5235-9313-6f64f51837cd', '5450d647-5d95-583e-a2ec-7a7df217791a', null, '5.NF.A.2', 'Solve word problems involving addition and subtraction of fractions.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('446a3c8d-d4f9-58e1-8edb-103b035fac2d', '5450d647-5d95-583e-a2ec-7a7df217791a', null, '5.NF.B.3', 'Interpret a fraction as division of the numerator by the denominator (a/b = a ÷ b).', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('50080ca7-a983-51ff-bada-6ca062019db2', '5450d647-5d95-583e-a2ec-7a7df217791a', null, '5.NF.B.4', 'Apply and extend previous understandings of multiplication to multiply a fraction by a fraction.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;

-- CCSS-SMP (8)
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('c8e14962-33d8-5cd4-ada8-3e9fa6627268', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP1', 'Make sense of problems and persevere in solving them.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('527d084f-430a-5f80-b0f2-8c20aba598d3', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP2', 'Reason abstractly and quantitatively.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('b9e68cc2-9238-52e7-a63f-33e79ff9cb35', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP3', 'Construct viable arguments and critique the reasoning of others.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('4ca0e7ec-ee3f-50a1-b174-462df0831881', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP4', 'Model with mathematics.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('c4d6c2aa-9734-5220-8484-cdc7ee10b17e', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP5', 'Use appropriate tools strategically.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('f8ca77d0-1392-5cb0-aaaf-936a2c0da288', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP6', 'Attend to precision.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('51a56a20-5a28-50d7-b14f-c6ce9c8f1498', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP7', 'Look for and make use of structure.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('016a21e9-4f5a-5b54-831c-96674e538ad1', 'c1ac4d77-2495-5412-8ac3-2ec8586e1392', null, 'MP8', 'Look for and express regularity in repeated reasoning.', null, 'practice')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;

-- NGSS (16)
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('e543c020-0855-590e-b03d-be6fb0814021', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-PS1-1', 'Develop a model to describe that matter is made of particles too small to be seen.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('7e8daf01-569e-5b73-bbb0-80f86d25fe9c', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-PS1-2', 'Measure and graph quantities to provide evidence that regardless of the type of change that occurs when heating, cooling, or mixing substances, the total weight of matter is conserved.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('d2fc616f-d305-552c-8950-6fa1b83565cb', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-PS1-3', 'Make observations and measurements to identify materials based on their properties.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('9318a91a-56ec-5c10-8ab5-a59cca9f033e', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-PS1-4', 'Conduct an investigation to determine whether the mixing of two or more substances results in new substances.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('355085cf-9923-594b-b83d-f763ddd2e2b5', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-PS2-1', 'Support an argument that the gravitational force exerted by Earth on objects is directed down.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('5345a6ff-b823-5a4b-90d2-f90b7aca9329', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-PS3-1', 'Use models to describe that energy in animals'' food (used for body repair, growth, motion, and to maintain body warmth) was once energy from the sun.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('33eeba7c-c331-502b-868a-e51c00c63f14', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-LS1-1', 'Support an argument that plants get the materials they need for growth chiefly from air and water.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('40e67941-a9d2-51af-8663-f8b408569e06', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-LS2-1', 'Develop a model to describe the movement of matter among plants, animals, decomposers, and the environment.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('d0aa800d-6f77-5817-9b4e-2ee7842acc3c', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-ESS1-1', 'Support an argument that differences in the apparent brightness of the sun compared to other stars is due to their relative distances from Earth.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('5abe799e-3ded-57d8-b1cc-f04b4da3852b', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-ESS1-2', 'Represent data in graphical displays to reveal patterns of daily changes in length and direction of shadows, day and night, and the seasonal appearance of some stars in the night sky.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('7f2137f9-9a48-5f20-ada8-9230a724c2c3', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-ESS2-1', 'Develop a model using an example to describe ways the geosphere, biosphere, hydrosphere, and/or atmosphere interact.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('dd11c337-6f6d-5fba-b29a-d5d0f012b422', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-ESS2-2', 'Describe and graph the amounts of salt water and fresh water in various reservoirs to provide evidence about the distribution of water on Earth.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('2f0a39d2-e4a5-5da3-8120-53c01633b4e2', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '5-ESS3-1', 'Obtain and combine information about ways individual communities use science ideas to protect the Earth''s resources and environment.', 'Grade 5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('339a0bf4-d8c1-5d0a-b7bf-3cd79bd1a6b4', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '3-5-ETS1-1', 'Define a simple design problem reflecting a need or a want that includes specified criteria for success and constraints on materials, time, or cost.', 'Grades 3–5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('14010f8d-8e64-5651-aa65-f9f98e7dfff3', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '3-5-ETS1-2', 'Generate and compare multiple possible solutions to a problem based on how well each is likely to meet the criteria and constraints of the problem.', 'Grades 3–5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('915bfbdf-a1e5-5159-810c-fc943e925be6', 'a59a1a08-1024-5043-9705-c416abc36a0a', null, '3-5-ETS1-3', 'Plan and carry out fair tests in which variables are controlled and failure points are considered to identify aspects of a model or prototype that can be improved.', 'Grades 3–5', 'standard')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;

-- IB-ATL (5)
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('b88b4348-9b4e-55b6-b5f5-fa023187fb53', '272678c2-40a0-5e72-827b-f672a02a0fd8', null, 'ATL.Thinking', 'Thinking skills — critical thinking, creative thinking, transfer (IB ATL category).', null, 'category')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('0e6da459-52e4-5566-8ca7-5d71e21ab8f9', '272678c2-40a0-5e72-827b-f672a02a0fd8', null, 'ATL.Communication', 'Communication skills — exchanging thoughts and information through interaction and language (IB ATL category).', null, 'category')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('c55e121f-1d31-5c23-a881-af5d2694a684', '272678c2-40a0-5e72-827b-f672a02a0fd8', null, 'ATL.Social', 'Social skills — collaboration and working effectively with others (IB ATL category).', null, 'category')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('32422cbb-4a55-5172-9dff-0250f6661d75', '272678c2-40a0-5e72-827b-f672a02a0fd8', null, 'ATL.Self-management', 'Self-management skills — organization, affective skills, reflection (IB ATL category).', null, 'category')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;
insert into standards (id, framework_id, grade_level_id, code, description, band_label, item_kind)
values ('8afc63c4-a243-5a0c-ae16-e3809b247f16', '272678c2-40a0-5e72-827b-f672a02a0fd8', null, 'ATL.Research', 'Research skills — information literacy and media literacy (IB ATL category).', null, 'category')
on conflict (id) do update set
  framework_id = excluded.framework_id,
  -- keep any existing grade scoping (legacy importer rows carry the grade)
  grade_level_id = coalesce(standards.grade_level_id, excluded.grade_level_id),
  description = excluded.description, band_label = excluded.band_label,
  item_kind = excluded.item_kind;

-- ── Legacy mock-importer CCSS framework: retire ONLY if fully re-homed ──────
-- Guarded with NOT EXISTS so a real DB with curriculum standards beyond the
-- bundled sample keeps the framework active + assigned (existing lesson tags
-- still resolve). Fresh/mock DBs (every code bundled) still deactivate.
delete from grade_framework_assignments
 where framework_id = '9bf19ac5-57a2-553e-a83c-9f35df33a996'
   and not exists (select 1 from standards where framework_id = '9bf19ac5-57a2-553e-a83c-9f35df33a996');
update standards_frameworks set is_active = false
 where id = '9bf19ac5-57a2-553e-a83c-9f35df33a996'
   and not exists (select 1 from standards where framework_id = '9bf19ac5-57a2-553e-a83c-9f35df33a996');

-- ── Default framework assignments for every existing grade ──────────────────
-- (matches the picker's default pins + IB-ATL; leads can unassign in Settings)
insert into grade_framework_assignments (id, grade_level_id, framework_id, display_order)
select gen_random_uuid(), gl.id, fw.fid, fw.ord
from grade_levels gl
cross join (values
  ('c33623ba-1b9a-5616-aba9-f738264ad88f'::uuid, 0),
  ('5450d647-5d95-583e-a2ec-7a7df217791a'::uuid, 1),
  ('c1ac4d77-2495-5412-8ac3-2ec8586e1392'::uuid, 2),
  ('a59a1a08-1024-5043-9705-c416abc36a0a'::uuid, 3),
  ('272678c2-40a0-5e72-827b-f672a02a0fd8'::uuid, 4)
) as fw(fid, ord)
on conflict (grade_level_id, framework_id) do nothing;

commit;

-- Done: 174 frameworks, 44 standards items,
-- 5 default assignments per grade.
