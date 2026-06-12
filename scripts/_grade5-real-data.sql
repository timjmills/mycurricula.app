-- =============================================================================
-- Grade 5 — REAL 2026-2027 curriculum seed (school year + calendar + units +
-- standards + weekly lessons). Generated from the Grade 5 Curriculum folder.
-- Idempotent: re-running inserts nothing new. Does NOT modify schema, seed.sql,
-- or lib/mock. Targets the seeded Grade 5 + 8 team subjects.
-- =============================================================================

-- 2026-2027 school year (real calendar: term dates, breaks, Ramadan).
insert into school_years
  (id, school_id, label, start_date, end_date, weeks, is_active,
   holidays, ramadan_start, ramadan_end, active_cycle_pattern)
values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', '2026–2027', '2026-08-30'::date, '2027-06-24'::date,
   40, true, array['2026-09-27'::date, '2026-10-06'::date, '2026-10-25'::date, '2026-10-26'::date, '2026-10-27'::date, '2026-10-28'::date, '2026-10-29'::date, '2026-11-29'::date, '2026-12-20'::date, '2026-12-21'::date, '2026-12-22'::date, '2026-12-23'::date, '2026-12-24'::date, '2026-12-27'::date, '2026-12-28'::date, '2026-12-29'::date, '2026-12-30'::date, '2026-12-31'::date, '2027-01-03'::date, '2027-02-09'::date, '2027-03-08'::date, '2027-03-09'::date, '2027-03-10'::date, '2027-03-11'::date, '2027-03-14'::date, '2027-03-31'::date, '2027-04-01'::date, '2027-04-18'::date, '2027-05-16'::date, '2027-05-17'::date, '2027-05-18'::date, '2027-05-19'::date, '2027-05-20'::date]::date[], '2027-02-08'::date, '2027-03-07'::date, 'one_week')
on conflict (id) do update set
  start_date=excluded.start_date, end_date=excluded.end_date, weeks=excluded.weeks,
  is_active=excluded.is_active, holidays=excluded.holidays,
  ramadan_start=excluded.ramadan_start, ramadan_end=excluded.ramadan_end, updated_at=now();
-- make 2026-2027 the only active year
update school_years set is_active=false, updated_at=now() where id='00000000-0000-0000-0000-0000000000c1';

-- Standards frameworks + grade assignment
insert into standards_frameworks (id, name, short_code, provenance)
  values ('9bf19ac5-57a2-553e-a83c-9f35df33a996', 'Common Core State Standards', 'CCSS', 'catalog')
  on conflict (id) do nothing;
insert into standards_frameworks (id, name, short_code, provenance)
  values ('d9e380ba-5ab9-57b0-8f8d-cb8d36d04791', 'DLM Essential Elements', 'EE', 'catalog')
  on conflict (id) do nothing;
insert into grade_framework_assignments (id, grade_level_id, framework_id)
  values ('7d49cd05-a625-5d16-8ffb-3f4e8ca2113c', '00000000-0000-0000-0000-0000000000b5', '9bf19ac5-57a2-553e-a83c-9f35df33a996')
  on conflict (grade_level_id, framework_id) do nothing;
insert into grade_framework_assignments (id, grade_level_id, framework_id)
  values ('39268874-40ef-5540-8416-6004f6d01a7d', '00000000-0000-0000-0000-0000000000b5', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791')
  on conflict (grade_level_id, framework_id) do nothing;

-- Standards (108)
insert into standards (id, framework_id, grade_level_id, code)
  values ('31abbf31-783f-53ed-96da-77a94dbc6132', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.5.1.4.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('926912f8-4698-585f-86cb-470b86ae03e3', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.5.1.4.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('19122b5c-41b6-5e0a-a237-bdf66e5750a3', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.5.RF.3a')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('bcc90260-eb54-5688-a0bb-571a97e9eaa6', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.5.RF.3b')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('b017a6a6-3d2e-5c16-9929-01aeb94c7d14', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('aaa1ebed-b3ec-5957-8a44-e7d2e356e0ad', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('cae6bb19-e895-5713-b6b4-a9c1fbc81800', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.C')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('3bb0e1b7-1698-5bd5-8b21-114ae53fdbae', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.E')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('7e6bf663-968c-5261-9ca2-4e8bd7cf96ed', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.F')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('0f42f422-69c2-5d7e-909e-c960b0b25347', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.G')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('cba06bb7-7005-55f2-8a97-6781689032d1', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.H')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('35af9a12-0950-5e68-9244-02e0b0c1ec56', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.I')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('dbb7031d-64a4-5d4b-b324-be448ccd4ead', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.J')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('da1c34c4-3823-51de-bd96-e885296f96e1', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.1.K')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('67ac5c6c-843d-528b-b428-fe97d9e57f42', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('f2dbee30-836f-5ea9-adcc-a99bd4e7fcdb', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('c7bfd2d5-aa9a-57e1-b0f3-ed56a43457df', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('48ad21f0-2d93-5d8b-ad6f-5ef647e21b10', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.C')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('07229a23-ad8b-5975-a231-326a3d8525df', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.D')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('14fe2ad5-da71-5e8e-aafe-20b2e2caeb6f', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.E')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('068f4ed6-b4db-5d70-b7f9-945e2ffe633f', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.F')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('e4c66a5f-c40d-5427-8056-50f3feeb8f02', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.G')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('68cdafb3-ada1-537b-96cc-1e06aa3c01b8', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.2.H')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('55c0c8a5-7940-5d59-9a06-ffd8051bc5e8', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.3.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('c2affd1c-493a-5a66-bcf0-64bec2b6d461', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.L.5.3.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('d15f1476-df96-52f3-a0e8-1c7a25615b48', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RF.5.3a')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('ce582f64-bd1b-5153-a401-23820224cb8d', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RF5.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4847c54c-ec1a-5407-abf4-6f41a9357254', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RF5.4')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('0e765305-d465-5a0c-8743-09a5958d0771', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RI5.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('90d17aac-8f99-53ea-abd7-2d9d4a05ad93', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RI5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('1c7446cc-dc3b-5d9c-87a3-ea53e11b16bc', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RI5.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('bfe8139d-a242-5755-8f8d-3f32ca6b306e', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RI5.7')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('7e16d66e-9f7b-5217-9f90-fa565c737515', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RI5.8')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('d876a792-7434-531b-80fd-f3f78ecd1216', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RL5.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('69747bc6-57d5-5ca2-b50f-5809a4af3b2c', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RL5.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('fac5abc0-2659-5957-b41c-f96afd78b264', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RL5.4')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('b499f03e-94d5-52f3-b9d7-b951ebfd6010', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RL5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('a2929a80-c5de-54d0-89a9-ec17634d86e0', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RL5.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4666f5d5-958f-5432-878a-c970b5647f04', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.RL53')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('c670e5d5-2610-5682-b902-d8e1ac60a285', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.W.5.4')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('f3effafd-9d36-5222-ac09-2b06617be189', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.W.5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('9178323a-ca29-5f8a-a892-8945d11b22ca', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.W5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('b4cdf870-f999-5406-a6b0-7340550f4519', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE.W5.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('fa347fa3-24ce-5254-8809-5dc012fd316d', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE5.1.1.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('d0da9756-2c02-5343-b3e6-e93c0e3c0590', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE5.1.2.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('9a8ef552-fa31-595a-8e76-bb41245c040d', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE5.1.3.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4c87d9fb-daa5-5907-b80d-d1ea36a8b6bb', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE5.1.3.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('68a685a9-0c42-5151-96da-c529ce5856a6', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE5.RF.3b')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('fa9f1add-a431-50c0-a6f2-fa2cb863aa5e', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EE5.RF.3c')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('659bb00f-26e7-5805-b550-fce44059e99f', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EERI5.7')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('8248cb80-5acc-5615-a4a5-6c45e219ec72', 'd9e380ba-5ab9-57b0-8f8d-cb8d36d04791', '00000000-0000-0000-0000-0000000000b5', 'EERL5.4')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('2bc1f10b-84f1-5e6e-a034-9e627ac70d86', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('15cbbb58-228b-5f5e-b69b-34bb333928d8', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('2ed31f67-a543-52cf-b437-f1a5e914a0a7', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('e5b4eb4b-be06-5e65-8181-c89da058e4e3', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.C')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('395b5165-beaa-5bed-9d89-a2eb51d5945f', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.D')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('97b7a538-6213-576e-be50-0ce6e824728e', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.E')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('90a64689-57b5-5104-bd10-b4d757a3f652', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.F')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('3e10a176-a7c6-521b-b933-7e5a5cc3d23e', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('fdc20ecf-f104-5a02-8595-3b83fa8c04ce', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('bee46f0b-4e19-54ad-a580-4f8e8351c945', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('6ff17d20-df05-5358-894d-53d3eb8a0354', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2.C')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('a650f6b9-a78b-5d46-8962-d8b83d1ac1f9', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2.D')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('e9645a88-4cd8-582d-8c6e-e282f069266d', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2.E')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('2c8add58-a66e-5725-82e1-48b76d1430c3', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.3.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4c631127-5b29-5b2e-a627-773743b6b56a', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.3.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('eb96c6cb-d8e3-5373-b49d-437faf0f1de6', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.G.A.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('be12283c-c97e-57b3-b3c1-1ecdc8d1cbbd', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.G.A.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('eaa3d867-b2d8-58b5-aa23-446f2197dc37', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.G.B.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('c1f9c8b8-d766-5994-91a4-17317cc9fbe2', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.MD.A.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('c4c2801e-95a4-5d57-8e87-c3af955f46f4', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.MD.B.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('15e286ce-b828-554d-9dac-40bdd496d9ed', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.MD.C.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4e760e40-4eca-5ca3-8992-88404d5d0b0c', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.MD.C.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('9fcf5b6b-9779-5fac-9980-677348c5038e', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NBT.A.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('8e54bbda-68a2-54cf-8445-e59c2b60645d', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NBT.A.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('045d2b2b-29ac-5e11-837f-529feb1e40d2', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NBT.A.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('189f19a5-2126-533a-a2f7-285404f25acd', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NBT.B.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4a32dc52-19a1-56cf-aaa7-ef89ec2c59e0', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NBT.B.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('e42dd54a-74cf-59dc-b58e-e541fc427b8a', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NF.A.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('380a0c7d-3ff5-59ab-93f5-0effd6b365b0', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NF.A.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('3e9aa654-1ef0-5286-bbfa-7969d0db37cf', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NF.B.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('43c92756-d1b0-53ce-8551-b5d9d9e57093', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.NF.B.7')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('b2f81c7d-3ec5-50cf-a59a-465f96176c23', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.OA.A.1')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('5cc287f1-1d91-55ef-af04-2adb8077f784', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.OA.A.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('ab6cc45f-d60e-5039-a6a5-a439ebd0bbc7', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'M.5.OA.A.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('1febf330-c636-5240-9e3f-c4402c96610d', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RF.5.3b')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4a784827-98d4-5251-8df9-d8039f230062', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RF.5.3c')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('1cbda34e-ef5d-5d17-80e0-04d7e4958639', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RF5.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('05309783-d889-5298-a939-603836c7827f', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RI5.2')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('4ff7158b-a6e8-55ff-9287-2079dc1a2675', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RI5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('494824a6-e8cc-5934-991b-e5fc54da9ec0', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RI5.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('a4583a57-d99a-5740-a6ae-91aa86a6905c', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RI5.8')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('0ea09b96-1bf6-5b3d-bd81-d5cb273a61e6', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL5.3')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('0fe164ef-3254-5636-8b62-fc61cba0b47b', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL5.4')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('52c395c5-c5e7-5c77-b8e9-38b364cc920f', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('d6052737-9e41-5fbf-ae1f-f400ce44a5aa', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL5.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('3965bee0-795b-59bd-a11a-2a8c93eb7646', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'SL.5.1.D')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('00a1f3e5-1fa5-5fb3-b6d9-317d9f6e5e82', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.1.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('979c8e51-2d2c-597b-a032-2d5482d47b27', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.1.B')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('d7cb00d1-fc2d-5450-8531-3c684ab5e46b', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.1.C')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('354f6c33-42d1-5fc9-a503-1c20b66e3d86', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.2.A')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('59b543c1-9f51-51d1-abf5-da21c95f3bf1', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.2.D')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('7e5609bc-8c68-5da0-9f94-503914356385', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.4')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('dce66c59-e5e8-5d0e-9bff-397ff95cf200', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.5')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('336ee7dc-7daa-5ce7-acfd-faae0c96d639', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.6')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('2a9ef057-085c-506b-8c22-200bec9e353a', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.7')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('9d3d3db6-388a-5bc4-adba-6b3509f0bff2', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.9')
  on conflict (framework_id, code) do nothing;
insert into standards (id, framework_id, grade_level_id, code)
  values ('dc8bda08-f548-5221-9323-08dcd62fadfe', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W5.5')
  on conflict (framework_id, code) do nothing;

-- Units (35 = 7 thematic bands x 5 subjects)
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('0c0e4216-77c4-59a1-a546-9f64a581bf24', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Place Value Architects', 1, 5)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Measurement and Data', 6, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Geometry', 13, 18)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('a4f3aaa4-3353-5395-b66e-571bd78d69fd', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Multiplication and Division', 19, 22)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('8f7c4845-b713-55e6-b2ab-e1c90709b7ee', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Plant Life / Living Things — Math', 23, 26)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Algebra, FDP, Fractions', 27, 34)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('46e7394d-7331-57a6-8946-5b93f72742eb', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c2', 'Natural Disasters and Spiral Review End of Year — Math', 35, 37)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('44b729ca-756f-56f4-b9b3-8d6624c3b280', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Decoding Diagnostic', 1, 5)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Analyzing Literature', 6, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('d4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Research and Inquiry', 13, 18)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('3170e847-5264-53cf-bbc6-034ff65e7f0c', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Comprehension Strategies', 19, 22)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('5acb9a7c-064f-5202-bb5d-cd2db57e15fe', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Plant Life / Living Things — Reading', 23, 26)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Creative Expression', 27, 34)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('ab4ceb52-b676-5398-a355-12897004262e', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c2', 'Natural Disasters and Spiral Review End of Year — Reading', 35, 37)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('79492811-0a25-56ee-a7d8-a2a56a6b7592', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Sharing Our Stories', 1, 5)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Procedural Writing', 6, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Research Writing', 13, 18)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('c57154ed-1d22-5a84-bc5d-36f02a59c118', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Opinion Writing', 19, 22)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('986d83be-52f5-503a-b987-b2a93cd23883', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Plant Life / Living Things — Writing', 23, 26)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Fiction Writing', 27, 34)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('8ef80640-a29f-57bf-b368-0330b6983ab8', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c2', 'Natural Disasters and Spiral Review End of Year — Writing', 35, 37)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('a6b504b1-dc3d-5b26-bf00-3c85939a19c3', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'Nouns', 1, 5)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'From Words to Sentences', 6, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'Making Writing Clear and Precise', 13, 18)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('165cfaae-ffa5-58e5-9d47-eed87e742ea5', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'Advanced Punctuation and Style', 19, 22)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('8d8d0b61-0d35-534b-b29f-71f48ea53807', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'Plant Life / Living Things — Grammar', 23, 26)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'Editing', 27, 34)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('305c0370-4aeb-5fd3-a5aa-62f3edee37a2', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c2', 'Natural Disasters and Spiral Review End of Year — Grammar', 35, 37)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('eee3bf51-e6ec-580c-9ede-7fb5556956fb', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'The Amazing Human Body', 1, 5)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'Changes in Matter (Science Fair)', 6, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'Our Past and Present', 13, 18)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('93d67480-4087-55ce-befd-2f8da844b357', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'Global Goods', 19, 22)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('9ff375f9-74ea-5870-a272-f4e92ccfef7a', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'Plant Life / Living Things', 23, 26)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('d35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'Earth, Space and More', 27, 34)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('3a135d4a-b415-5f25-842a-59a849662139', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c2', 'Natural Disasters and Spiral Review End of Year', 35, 37)
  on conflict (id) do nothing;

-- Lessons / master core lesson events (185)
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('fd6e56fd-dd52-5c65-9e05-5a727fb59bee', 'eee3bf51-e6ec-580c-9ede-7fb5556956fb', '00000000-0000-0000-0000-0000000005d7', 1, 'sun'::weekday, 'Welcome & Classroom Routines', 'Welcome & Classroom Routines
• Welcome / Getting-to-know-you games (Stand Up Sit Down, Simon Says)
• Intro to Seesaw tech tools
• Classification activity: sort 20 unrelated items into 4 categories
• Team-building (Mystery Game with whole G5; Statue Game)
• Establish classroom routines', '[]'::jsonb, 'Std: Science Standards: Human Body Systems & Health', '[{"type": "doc", "label": "Week 1 plan", "url": "https://docs.google.com/document/d/1l13WSXlKW1pt7pXAbzTw_UVJOv27A9xlSdKw9PDD4m4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0231b0c7-d51c-500e-9e73-7c72d6394a12', '0c0e4216-77c4-59a1-a546-9f64a581bf24', '00000000-0000-0000-0000-0000000005d1', 1, 'sun'::weekday, 'Place Value Architects', 'Week 1: Testing/Place Value Architects -  Constructing Understanding to 100,000  Explore the power of place value! Compare, order, and understand numbers up to 100,000 and introduce place value with decimals.', '[]'::jsonb, 'Std: M.5.NBT.A.1, M.5.NBT.A.2, M.5.NBT.B.5
M.EE.5.NBT.2, M.EE.5.NBT.4', '[]'::jsonb, array['9fcf5b6b-9779-5fac-9980-677348c5038e', '8e54bbda-68a2-54cf-8445-e59c2b60645d', '189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('cf88c1b5-2f6f-520f-b1f7-dd48e991eb0e', '44b729ca-756f-56f4-b9b3-8d6624c3b280', '00000000-0000-0000-0000-0000000005d2', 1, 'sun'::weekday, 'Decoding Diagnostic', 'Week 1: Decoding Diagnostic: Assess students'' decoding skills, specifically focusing on syllable types, short and long vowel patterns, and vowel teams to guide upcoming instruction.

Week 1: Decoding Diagnostic Assess Students'' De', '[]'::jsonb, 'Std: RF5.3
EE.RF5.3', '[]'::jsonb, array['1cbda34e-ef5d-5d17-80e0-04d7e4958639', 'ce582f64-bd1b-5153-a401-23820224cb8d']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('58ce5474-51f3-57a3-8dc0-636924585257', '79492811-0a25-56ee-a7d8-a2a56a6b7592', '00000000-0000-0000-0000-0000000005d3', 1, 'sun'::weekday, 'Sharing Our Stories', 'Week 1: Sharing Our Stories: Introduction to Personal Narratives: Students will discover the power of personal narratives and explore various types.', '[]'::jsonb, 'Std: RL5.3
EE.RL53', '[]'::jsonb, array['0ea09b96-1bf6-5b3d-bd81-d5cb273a61e6', '4666f5d5-958f-5432-878a-c970b5647f04']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('550bd8a9-3efa-5c36-88ed-5bfad49a982c', 'a6b504b1-dc3d-5b26-bf00-3c85939a19c3', '00000000-0000-0000-0000-0000000005d4', 1, 'sun'::weekday, 'Nouns', 'Week 1: Nouns - Naming Our World (People, places, things): Start with concrete nouns, emphasizing how they name what we see around us.', '[]'::jsonb, 'Std: CC: L.5.1.A
EE.L.5.1.B
EE.RF.5.3a
EE.5.RF.3a', '[]'::jsonb, array['15cbbb58-228b-5f5e-b69b-34bb333928d8', 'aaa1ebed-b3ec-5957-8a44-e7d2e356e0ad', 'd15f1476-df96-52f3-a0e8-1c7a25615b48', '19122b5c-41b6-5e0a-a237-bdf66e5750a3']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3b008f22-e3ad-57e7-bdc3-f704e726be52', 'eee3bf51-e6ec-580c-9ede-7fb5556956fb', '00000000-0000-0000-0000-0000000005d7', 2, 'sun'::weekday, 'How Our Brain Learns (Growth Mindset)', 'How Our Brain Learns (Growth Mindset)
• Intro to neuroeducation — how the brain learns
• Brain anatomy: hippocampus, neocortex, amygdala, prefrontal cortex
• Memory lab — different memory strategies and games
• Growth mindset vs fixed mindset discussion
• Making Connections word activity', '[]'::jsonb, 'Std: Science Standards: Human Body Systems & Health', '[{"type": "doc", "label": "Week 2 plan", "url": "https://docs.google.com/document/d/1Qk38EGmwMn1BIbswJl7P8R-0CjiumoUcLZOol8gz44c/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('091521c5-6894-5511-a6c7-dde721f18b77', '0c0e4216-77c4-59a1-a546-9f64a581bf24', '00000000-0000-0000-0000-0000000005d1', 2, 'sun'::weekday, 'Place Value Engineers', 'Week 2: Place Value Engineers -  Expanding to 1,000,000 Become a place value pro! Expand your understanding to 1,000,000 and learn the art of rounding whole numbers and introduce place value with decimals.', '[]'::jsonb, 'Std: M.5.NBT.A.1, M.5.NBT.A.2, M.5.NBT.B.5
M.EE.5.NBT.2, M.EE.5.NBT.4', '[]'::jsonb, array['9fcf5b6b-9779-5fac-9980-677348c5038e', '8e54bbda-68a2-54cf-8445-e59c2b60645d', '189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f8e4db29-132d-5953-8e22-223f38d0a894', '44b729ca-756f-56f4-b9b3-8d6624c3b280', '00000000-0000-0000-0000-0000000005d2', 2, 'sun'::weekday, 'Syllable Strategies', 'Week 2: Syllable Strategies: Students will practice blending syllables effectively, paying close attention to vowel sounds and vowel teams within syllables to decode multisyllabic words.
Week 2: Syllabication with Short/Long Vowel', '[]'::jsonb, 'Std: RF5.3
EE.RF5.3', '[]'::jsonb, array['1cbda34e-ef5d-5d17-80e0-04d7e4958639', 'ce582f64-bd1b-5153-a401-23820224cb8d']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ae920b37-f58b-580a-83fd-f183252f2d8f', '79492811-0a25-56ee-a7d8-a2a56a6b7592', '00000000-0000-0000-0000-0000000005d3', 2, 'sun'::weekday, 'Setting the Stage', 'Week 2: Setting the Stage: Introduction, Plot, and Setting - Hook your reader and paint a vivid picture of where your story takes place.', '[]'::jsonb, 'Std: W5.3a W5.4
EE.W 5.3a-b', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('37b40ebf-7549-5db8-ad98-7ef22f5df403', 'a6b504b1-dc3d-5b26-bf00-3c85939a19c3', '00000000-0000-0000-0000-0000000005d4', 2, 'sun'::weekday, 'Nouns', 'Week 2: Nouns - More Than Meets the Eye (Abstract nouns): Introduce the idea that nouns also name feelings, ideas, concepts we can''t touch.', '[]'::jsonb, 'Std: CC: L.5.1.A
EE.L.5.1.B
EE 5.RF.3d', '[]'::jsonb, array['15cbbb58-228b-5f5e-b69b-34bb333928d8', 'aaa1ebed-b3ec-5957-8a44-e7d2e356e0ad']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b08f3b0c-9746-5f23-ad85-ebfa5c8de5cc', 'eee3bf51-e6ec-580c-9ede-7fb5556956fb', '00000000-0000-0000-0000-0000000005d7', 3, 'sun'::weekday, 'Body Systems - Digestive, Respiratory & Circulatory', 'Body Systems — Digestive, Respiratory & Circulatory
• Place body organs on traced life-size body cutout
• Digestive system: healthy vs unhealthy food sort, label parts
• Stomach demo experiment (bread, water, plastic bag)
• Respiratory system: lung experiment, SeeSaw activity, label parts
• Circulatory system: feel your heartbeat, measure pulse', '[]'::jsonb, 'Std: Science Standards: Human Body Systems & Health', '[{"type": "doc", "label": "Week 3 plan", "url": "https://docs.google.com/document/d/1M9C027AF_V9NR4M-XRFtj75HuDVpAarJ9ack55hgz1A/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('8daf4b83-0af1-5b3c-b2c9-46d5932f90d0', '0c0e4216-77c4-59a1-a546-9f64a581bf24', '00000000-0000-0000-0000-0000000005d1', 3, 'sun'::weekday, 'Addition Aces', 'Week 3: Addition Aces - Mastering Regrouping Strategies Level up your addition skills! Review and practice multi-digit addition with regrouping and using whole numbers and decimals.', '[]'::jsonb, 'Std: M.5.NBT.B.5
M.EE.5.NBT.5', '[]'::jsonb, array['189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3a0ee77b-aebb-5cab-baab-4f4af4b1414f', '44b729ca-756f-56f4-b9b3-8d6624c3b280', '00000000-0000-0000-0000-0000000005d2', 3, 'sun'::weekday, 'Short & Long Vowel Applications', 'Week 3: Short & Long Vowel Applications: Students will review and apply their knowledge of short and long vowel patterns to decode words in isolation and in context.

Week 3: Long A Sound Students will explore the different ways l', '[]'::jsonb, 'Std: RF5.3
EE.RF5.3', '[]'::jsonb, array['1cbda34e-ef5d-5d17-80e0-04d7e4958639', 'ce582f64-bd1b-5153-a401-23820224cb8d']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('99322ef1-d5aa-5948-be70-b485661e024f', '79492811-0a25-56ee-a7d8-a2a56a6b7592', '00000000-0000-0000-0000-0000000005d3', 3, 'sun'::weekday, 'Building Suspense and Resolution', 'Week 3: Building Suspense and Resolution: Students will focus on building suspense, creating satisfying conclusions, and revising for emotional impact.', '[]'::jsonb, 'Std: W5.3a W5.3b W5.5
EE.W5.3a-b', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3e18f6fa-884d-5e74-9d69-2e03f60f62db', 'a6b504b1-dc3d-5b26-bf00-3c85939a19c3', '00000000-0000-0000-0000-0000000005d4', 3, 'sun'::weekday, 'Verbs', 'Week 3: Verbs - Action Heroes!: Focus on action verbs, making it active - students can act out verbs. This builds a strong verb sense from the start.', '[]'::jsonb, 'Std: CC: L.5.1.B
CC: RF.5.3b
EE.L.5.1.C
EE.5.RF.3b', '[]'::jsonb, array['2ed31f67-a543-52cf-b437-f1a5e914a0a7', '1febf330-c636-5240-9e3f-c4402c96610d', 'cae6bb19-e895-5713-b6b4-a9c1fbc81800', 'bcc90260-eb54-5688-a0bb-571a97e9eaa6']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('06b04980-66b7-5243-b0b8-01d03d52c583', 'eee3bf51-e6ec-580c-9ede-7fb5556956fb', '00000000-0000-0000-0000-0000000005d7', 4, 'sun'::weekday, 'Lungs, Heart Rate & Field Trip', 'Lungs, Heart Rate & Field Trip
• Catch up / finish off from prior week
• Respiratory system continuation (Travel Through Respiratory System video)
• Circulatory system continuation: heart-rate measurement, exercise predictions
• Heart diagram with word bank (paper-based)
• Field Trip', '[]'::jsonb, 'Std: Science Standards: Human Body Systems & Health', '[{"type": "doc", "label": "Week 4 plan", "url": "https://docs.google.com/document/d/198_CTfQjkp-D0EAh8RSK4c5nr0wTytiI0d13KvwygJs/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('00799045-37b8-5b1b-bccb-d95ba39427a1', '0c0e4216-77c4-59a1-a546-9f64a581bf24', '00000000-0000-0000-0000-0000000005d1', 4, 'sun'::weekday, 'Subtraction Specialists Regrouping and Problem-Solving', 'Week 4: Subtraction Specialists Regrouping and Problem-Solving - Conquer subtraction! Review multi-digit subtraction with regrouping and become a problem-solving master using whole numbers and decimals.', '[]'::jsonb, 'Std: M.5.NBT.B.5
M.EE.5.NBT.5', '[]'::jsonb, array['189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('154bf43f-d704-54e1-9eae-5a41a197b152', '44b729ca-756f-56f4-b9b3-8d6624c3b280', '00000000-0000-0000-0000-0000000005d2', 4, 'sun'::weekday, 'Mastering Vowel Teams', 'Week 4: Mastering Vowel Teams: Students will build mastery of common vowel teams (e.g., ai, ay, ee, ea, oa) and apply their knowledge to decode words in reading and spelling activities.
Week 4: Long E Sound Students will explore t', '[]'::jsonb, 'Std: RF5.3
EE.RF5.3', '[]'::jsonb, array['1cbda34e-ef5d-5d17-80e0-04d7e4958639', 'ce582f64-bd1b-5153-a401-23820224cb8d']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('bd963986-fe9e-5d77-bc38-5094eb6fdb4d', '79492811-0a25-56ee-a7d8-a2a56a6b7592', '00000000-0000-0000-0000-0000000005d3', 4, 'sun'::weekday, 'Bringing Stories to Life with Dialogue', 'Week 4: Bringing Stories to Life with Dialogue: Students will learn to use dialogue effectively to reveal character and advance the plot.', '[]'::jsonb, 'Std: RL5.3 W5.3b W5.3d
EE.RL5.3 EE.W5.2c', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e77904ed-8df5-5e28-be3a-7f38025eeeda', 'a6b504b1-dc3d-5b26-bf00-3c85939a19c3', '00000000-0000-0000-0000-0000000005d4', 4, 'sun'::weekday, 'Week 4', 'Week 4: Week 4: Adjectives - Describing Our World & Ourselves
Learn how to use words that describe nouns, making your writing more interesting.', '[]'::jsonb, 'Std: CC: RF.5.3b
CC:L.5.1.D EE.L.5.1.D
EE5.RF.3b', '[]'::jsonb, array['1febf330-c636-5240-9e3f-c4402c96610d', '68a685a9-0c42-5151-96da-c529ce5856a6']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('86028f63-236d-50fd-a524-c5b523c41c2c', 'eee3bf51-e6ec-580c-9ede-7fb5556956fb', '00000000-0000-0000-0000-0000000005d7', 5, 'sun'::weekday, 'Healthy Heart, Healthy Brain (Unit Assessment)', 'Healthy Heart, Healthy Brain (Unit Assessment)
• Review heart and circulatory system (Dr. Binocs video)
• Keeping the heart healthy — fair-testing connection (Science Fair prep)
• Keeping the brain healthy (water, balanced diet, sleep)
• Centre activity: balanced plate
• End-of-Unit summative assessment', '[]'::jsonb, 'Std: Science Standards: Human Body Systems & Health', '[{"type": "doc", "label": "Week 5 plan", "url": "https://docs.google.com/document/d/1uejYNZ10QJle1vr7OlOey4e-3XP34ukacdkFnY7Mjq4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('24b15722-3a59-5cb8-95a0-e04f7a309684', '0c0e4216-77c4-59a1-a546-9f64a581bf24', '00000000-0000-0000-0000-0000000005d1', 5, 'sun'::weekday, 'Real-World Math with Whole Numbers Combine addition and…', 'Week 5: Real-World Math with Whole Numbers Combine addition and subtraction skills to solve multi-step problems using whole numbers and decimals.', '[]'::jsonb, 'Std: M.5.NBT.B.5
M.EE.5.NBT.5', '[]'::jsonb, array['189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e1b73add-c04d-5ee9-a5a5-d0e3dc440f9f', '44b729ca-756f-56f4-b9b3-8d6624c3b280', '00000000-0000-0000-0000-0000000005d2', 5, 'sun'::weekday, 'Text Types & Book Handling', 'Week 5: Text Types & Book Handling - Introduce fiction and nonfiction, model responsible book care, and establish routines for handling texts with respect. Explain nonfiction and fiction text features.
Week 5: Long I Sound  & Text', '[]'::jsonb, 'Std: RI5.5
EE.RI5.5', '[]'::jsonb, array['4ff7158b-a6e8-55ff-9287-2079dc1a2675', '90d17aac-8f99-53ea-abd7-2d9d4a05ad93']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d7cc375e-19e3-5c76-98bd-fb6ace3fd2d0', '79492811-0a25-56ee-a7d8-a2a56a6b7592', '00000000-0000-0000-0000-0000000005d3', 5, 'sun'::weekday, 'Creating Flow and Giving Feedback', 'Week 5: Creating Flow and Giving Feedback: Students will practice using transitions to create a smooth flow of events and participate in peer review.', '[]'::jsonb, 'Std: W5.3b W5.5
EE.W5.5', '[]'::jsonb, array['9178323a-ca29-5f8a-a892-8945d11b22ca']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4e37b07e-a33d-56f4-bce0-8362f31e2fa6', 'a6b504b1-dc3d-5b26-bf00-3c85939a19c3', '00000000-0000-0000-0000-0000000005d4', 5, 'sun'::weekday, 'Week 5', 'Week 5: Week 5: Adverbs - How We Act and Feel Discover words that tell us more about verbs and adjectives, adding detail to writing.', '[]'::jsonb, 'Std: CC: L.5.1.E
CC: RF.5.3b
EE5.RF.3b
EE.L.5.1.E', '[]'::jsonb, array['97b7a538-6213-576e-be50-0ce6e824728e', '1febf330-c636-5240-9e3f-c4402c96610d', '68a685a9-0c42-5151-96da-c529ce5856a6', '3bb0e1b7-1698-5bd5-8b21-114ae53fdbae']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('8c14d5ca-0bd1-5411-8d87-af5651c75002', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 6, 'sun'::weekday, 'States of Matter', 'States of Matter
• Entry task: sort classroom items by property
• Define matter; solids, liquids, gases (Crash Course Kids)
• SeeSaw States of Matter sort
• Practical: Will It Freeze? hypothesis (water, hand sanitizer, 7up)
• Review and catch-up', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 1 plan", "url": "https://docs.google.com/document/d/1dJRLxZBe2Mj8YVzkT2UK4spuUnQI9zgI-7O8s2omg90/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('76aef112-3b89-5ab5-943e-0d6ceac2e265', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 6, 'sun'::weekday, 'Measurement Mavericks', 'Week 1: Measurement Mavericks: Mastering Length - Become a measurement maverick! Review customary and metric units of length, and practice measuring and estimating lengths accurately.', '[]'::jsonb, 'Std: M.5.MD.A.1
M.EE.5.MD.1', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['c1f9c8b8-d766-5994-91a4-17317cc9fbe2']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a29a387e-6ed9-5722-a957-4b51c4234fba', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 6, 'sun'::weekday, 'Narrative Structure', 'Week 1: Narrative Structure - Explore plot elements (beginning, middle, end), practice retelling narratives, and introduce basic revision strategies for improving clarity in writing.

Week 1: Long Vowel Sounds O & Narrative Struct', '[]'::jsonb, 'Std: RL5.5
EE.RL5.5', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['52c395c5-c5e7-5c77-b8e9-38b364cc920f', 'b499f03e-94d5-52f3-b9d7-b951ebfd6010']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('20532ad9-fab8-544a-89a6-3ceb16ee6dcd', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 6, 'sun'::weekday, 'Exploring Procedural Writing', 'Week 1: Exploring Procedural Writing: Students will explore the purpose and types of procedural writing.', '[]'::jsonb, 'Std: RI5.1 RI5.5
EE.RI5.5 EE.RF5.4', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6044b8b3-1828-5eab-ab8d-21b11d701205', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 6, 'sun'::weekday, 'What is a Sentence?', 'Week 1: What is a Sentence?: Use the concept of a "telling sentence," appropriate for young learners. Introduce subject & predicate simply.', '[]'::jsonb, 'Std: CC: L.5.1.F
CC: RF.5.3b
EE5.RF.3b
EE.L.5.1.F', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['90a64689-57b5-5104-bd10-b4d757a3f652', '1febf330-c636-5240-9e3f-c4402c96610d', '68a685a9-0c42-5151-96da-c529ce5856a6', '7e6bf663-968c-5261-9ca2-4e8bd7cf96ed']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('cdf0c27b-6896-5f79-86a5-a9b392716776', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 7, 'sun'::weekday, 'Physical Changes & Freezing Points', 'Physical Changes & Freezing Points
• Will It Freeze results; intro to freezing points
• Physical Changes lab: melt ice, chocolate, butter on skillet (timed, graphed)
• Reversible vs permanent change discussion
• Intro to Chemical Changes via cooking (Crash Course #19.2)
• Identify chemical changes from cooking observations', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 2 plan", "url": "https://docs.google.com/document/d/1PEO7uWSwsWHh0vb2-tLA5PpoDwj_wRMFUN_luiA0D10/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6a3a36ac-43d6-5826-b4d1-37dde8ec2c97', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 7, 'sun'::weekday, 'Measurement Masters', 'Week 2: Measurement Masters: Capacity & Weight/Mass - Expand your measurement mastery! Review customary and metric units for capacity and weight/mass, and learn to convert within systems.', '[]'::jsonb, 'Std: M.5.MD.A.1
M.EE.5.MD.1', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['c1f9c8b8-d766-5994-91a4-17317cc9fbe2']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3f2eb5d6-c71a-5a96-8bbf-f0ffd1d7cc44', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 7, 'sun'::weekday, 'Character Analysis', 'Week 2: Character Analysis - Examine character traits, motivations, relationships, and development, and connect character development to plot and theme.

Week 2: Long U Sound & Character Analysis Examine character traits, motivati', '[]'::jsonb, 'Std: RL5.3
EE.RL5.3', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['0ea09b96-1bf6-5b3d-bd81-d5cb273a61e6', '69747bc6-57d5-5ca2-b50f-5809a4af3b2c']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e0e92841-739f-52de-80f8-bff2489ddee9', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 7, 'sun'::weekday, 'Breaking Down Processes', 'Week 2: Breaking Down Processes: Students will learn to break down processes into clear, sequential steps.', '[]'::jsonb, 'Std: RI5.1 RI5.3
EE.RI5.1 EE.RL5.1', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a6f43dcb-b239-5770-929f-c3833a21ab9b', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 7, 'sun'::weekday, 'Sentence Variety', 'Week 2: Sentence Variety: Not Just Telling (Types): Cover declarative, interrogative, imperative, exclamatory. Have students WRITE examples.', '[]'::jsonb, 'Std: CC: L.5.1.F
CC: RF.5.3b
EE.5.RF.3b
EE.L.5.1.F', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['90a64689-57b5-5104-bd10-b4d757a3f652', '1febf330-c636-5240-9e3f-c4402c96610d', 'bcc90260-eb54-5688-a0bb-571a97e9eaa6', '7e6bf663-968c-5261-9ca2-4e8bd7cf96ed']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('62dd2b18-20f2-59cb-8158-6390e0045c0a', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 8, 'sun'::weekday, 'Chemical vs Physical Changes & Carbonation', 'Chemical vs Physical Changes & Carbonation
• Continue Physical Changes lab; temperature graphs
• Chemical vs Physical Changes sort (Brainpop, SeeSaw)
• Investigating carbonated liquids — still vs sparkling water
• Begin writing up experiments using Science Fair template (hypothesis)
• Intro to Thermal Conductors', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 3 plan", "url": "https://docs.google.com/document/d/1XTOdJ9mwVWWGXMW7OiYNzaiuAOOVGEusP3ztws5AQQI/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('9676ff52-ddd1-5abf-b194-455a7e9bc9c9', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 8, 'sun'::weekday, 'Time Trackers', 'Week 3: Time Trackers: Understanding and Using Clocks and Calendars - Focus on telling time to the nearest minute, understanding elapsed time, and using calendars to understand dates and durations.', '[]'::jsonb, 'Std: M.5.MD.A.1
M.EE.5.MD.1', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['c1f9c8b8-d766-5994-91a4-17317cc9fbe2']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e4ed1f11-a308-5a52-8504-e5b554bc607c', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 8, 'sun'::weekday, 'Conflict & Resolution', 'Week 3: Conflict & Resolution - Identify types of conflict, analyze how conflict shapes plot, and explore conflict resolution in literature and real-life situations.

Week 3: Vowel Teams and Diphthongs & Conflict & Resolution: Ide', '[]'::jsonb, 'Std: RL5.3
EE.RL5.3', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['0ea09b96-1bf6-5b3d-bd81-d5cb273a61e6', '69747bc6-57d5-5ca2-b50f-5809a4af3b2c']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('dd5219df-b585-545d-b64e-33ef8e0e6237', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 8, 'sun'::weekday, 'Writing Clear Instructions', 'Week 3: Writing Clear Instructions: Students will practice using precise language, specific details, and action verbs for clear instructions.', '[]'::jsonb, 'Std: W5.2b W5.3c W5.4
EE.RF5.3 EE.RI5.1', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0cb7c946-585c-5aac-98ef-6d4449d4027c', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 8, 'sun'::weekday, 'Capitalization', 'Week 3: Capitalization: Making Our Writing Clear: Learn the rules of capitalization to make your writing easy to read.', '[]'::jsonb, 'Std: CC: L.5.2.A
CCRF.5.3c
EE.L.5.2.A
EE5.RF.3c', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['fdc20ecf-f104-5a02-8595-3b83fa8c04ce', '4a784827-98d4-5251-8df9-d8039f230062', 'f2dbee30-836f-5ea9-adcc-a99bd4e7fcdb', 'fa9f1add-a431-50c0-a6f2-fa2cb863aa5e']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b4aeca07-29b5-5632-af8b-ea5a429958da', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 9, 'sun'::weekday, 'Electrical Conductors (Science Fair Prep)', 'Electrical Conductors (Science Fair Prep)
• Electrical Conductors investigation (build on Thermal Conductors)
• Torch / battery investigation; build electric circuits on rotation
• Tri-Board parent note + Science Fair Prep letter sent home
• Begin research and writing-template work for Science Fair
• Build mini science project', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 4 plan", "url": "https://docs.google.com/document/d/1TMosJdo_MjSTBp7ey-q2biRVuP3Gqo9WqGRUXkFLSIU/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('52efb4bb-5c19-5877-8543-15eeb4221d1b', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 9, 'sun'::weekday, 'Data Detectives Review', 'Week 4: Data Detectives Review: Collecting, Organizing, and Displaying Data Review Transform into a data detective! Review different types of graphs, collect and organize data using tally charts and frequency tables, and create an', '[]'::jsonb, 'Std: M.5.MD.B.2
M.EE.5.MD.2', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['c4c2801e-95a4-5d57-8e87-c3af955f46f4']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5545c29e-25f9-5cfb-85f1-8d59b34ba385', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 9, 'sun'::weekday, 'Point of View', 'Week 4: Point of View - Explore different points of view and how they influence the reader, and practice identifying and analyzing point of view in various texts.

Week 4: Ci, Cy, Ce', '[]'::jsonb, 'Std: RL5.6
EE.RL5.6', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['d6052737-9e41-5fbf-ae1f-f400ce44a5aa', 'a2929a80-c5de-54d0-89a9-ec17634d86e0']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('56847010-7908-5d6b-b2b0-c0242e487b49', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 9, 'sun'::weekday, 'Enhancing with Visuals', 'Week 4: Enhancing with Visuals: Students will explore incorporating visual aids to enhance procedural texts.', '[]'::jsonb, 'Std: W5.2b W5.7
EE.RI5.1 EE.RL5.1', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('fce8fd1e-f3c9-5bb6-93a8-3b072702e30e', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 9, 'sun'::weekday, 'Pronouns', 'Week 4: Pronouns: Shortcuts in Sentences:
Learn about words that replace nouns, making your writing less repetitive.', '[]'::jsonb, 'Std: CC: L.5.2.A
CC RF.5.3f
EE.L.5.2.B
EE 5.RF.3f', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['fdc20ecf-f104-5a02-8595-3b83fa8c04ce', 'c7bfd2d5-aa9a-57e1-b0f3-ed56a43457df']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('08de4416-dc45-5b82-9d42-120a58e2d69a', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 10, 'sun'::weekday, 'Science Fair Investigation', 'Science Fair Investigation
• Continue Electrical Conductors investigation
• Refine mini science project
• Continue research and writing-template work
• Procedure draft for Science Fair
• Catch-up if needed (in 25-26 this repeated W4 due to attendance/trip)', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 5 plan", "url": "https://docs.google.com/document/d/1Baf4rDrtwXEALG93LCzF8OMs1rBjzKaiRwNvtbuxQA4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4e2f1f72-17a4-546c-aa7d-68b093825904', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 10, 'sun'::weekday, 'Line Plots and Interpreting Graphs This week, you''ll focus…', 'Week 5: Line Plots and Interpreting Graphs  This week, you''ll focus on creating and analyzing line plots that include fractional measurements (e.g., 1/2, 1/4, 1/8). Learn how to use these plots to solve real-world problems, such a', '[]'::jsonb, 'Std: M.5.MD.B.2
M.EE.5.MD.2', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['c4c2801e-95a4-5d57-8e87-c3af955f46f4']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('422a247e-2bc6-51a6-8afc-388d3ff0e8fd', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 10, 'sun'::weekday, 'Figurative Language', 'Week 5: Figurative Language - Identify and analyze the impact of similes, metaphors, personification, etc., and experiment with using figurative language in writing.

Week 5: R-Controlled Vowels', '[]'::jsonb, 'Std: RL5.4
EERL5.4', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['0fe164ef-3254-5636-8b62-fc61cba0b47b', '8248cb80-5acc-5615-a4a5-6c45e219ec72']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('521280c4-1b03-51e1-bf15-6cf653388700', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 10, 'sun'::weekday, 'Applying Skills to Science Fair', 'Week 5: Applying Skills to Science Fair: Students will connect procedural writing to their science fair projects.', '[]'::jsonb, 'Std: W5.1 W5.7 W5.8
EERI5.7', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['659bb00f-26e7-5805-b550-fce44059e99f']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('9ed65619-3694-5d10-a5b1-17b6563b661f', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 10, 'sun'::weekday, 'Puncti', 'Week 5: Puncti: End Marks: Periods, Questions & More!: Practice using the right punctuation at the end of sentences.', '[]'::jsonb, 'Std: CC: L.5.1.C
EE.L.5.1.G', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e5b4eb4b-be06-5e65-8181-c89da058e4e3', '0f42f422-69c2-5d7e-909e-c960b0b25347']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3132db2e-bb65-530a-bf81-52e631467b3f', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 11, 'sun'::weekday, 'Science Fair Research & Writing', 'Science Fair Research & Writing
• Deepen research for Science Fair project
• Finish project procedure
• Continue writing process using template
• Padlet & English/Arabic parent docs sent home
• Catch-up sessions as needed', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 6 plan", "url": "https://docs.google.com/document/d/1R0MC_-VjCu3eFxf4HYvREdguev593RR0mRYnHzdJjIY/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ff5cd941-a6bd-5409-9df6-3bbb4a804905', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 11, 'sun'::weekday, 'Week 6', 'Week 6:
• Numerical Patterns & Input/Output Tables
• Coordinate Plane (Quadrant 1) & Plotting
• The Coordinate Plane (All 4 Quadrants)
• Distance in All 4 Quadrants
• Mixed Review and Assessment', '[]'::jsonb, 'Std: M.5.MD.C.3
M.EE.5.MD.3', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['15e286ce-b828-554d-9dac-40bdd496d9ed']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('006736b5-0395-5151-bbe4-8e272dd3f27f', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 11, 'sun'::weekday, 'Theme Across Texts', 'Week 6: Theme Across Texts - Compare and contrast themes across multiple texts with similar themes, and create presentations to share thematic connections.

Week 6: Multisyllabic Words and Compound Words & Point of View Explore di', '[]'::jsonb, 'Std: RL5.2 RL5.9
EE.RL5.2 EE.RL5.9', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('1e493c86-cf12-5ff8-8ebf-9a5af1aa204d', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 11, 'sun'::weekday, 'Revising for Clarity and Accuracy', 'Week 6: Revising for Clarity and Accuracy: Students will practice following their own procedures and get feedback from peers.', '[]'::jsonb, 'Std: W5.5
EE.RF5.4', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['dc8bda08-f548-5221-9323-08dcd62fadfe', '4847c54c-ec1a-5407-abf4-6f41a9357254']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d0b79300-88f6-543d-ba83-ef70d9805c97', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 11, 'sun'::weekday, 'Conjunctions (Part 1)', 'Week 6: Conjunctions (Part 1): Coordinating Conjunctions - Teaming Up Sentences!: Explain that coordinating conjunctions are like bridges connecting two equally important sentences. Introduce the most common ones: for, and, nor, b', '[]'::jsonb, 'Std: CC: L.5.1.F
EE.L.5.1.H', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['90a64689-57b5-5104-bd10-b4d757a3f652', 'cba06bb7-7005-55f2-8a97-6781689032d1']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('1e451413-dff7-5576-b3d3-4ded76e88339', 'a3af9977-9ab6-5857-9cb0-68a3faab31db', '00000000-0000-0000-0000-0000000005d7', 12, 'sun'::weekday, 'Science Fair Day & Unit Assessment', 'Science Fair Day & Unit Assessment
• Finish Science Fair project: write-up, photos, print for boards
• SCIENCE FAIR DAY
• End-of-Unit assessment paper (Physical Science)
• Wrap-up and reflections
• Prep for next unit', '[]'::jsonb, 'Std: Physical Science Standards & Engineering Design (Science Fair)', '[{"type": "doc", "label": "Week 7 plan", "url": "https://docs.google.com/document/d/1a_2PSwk6DVVJXnpt2-uXQn07D9-stmXdpVmf8miuGP4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a036f702-25d9-55a3-a4e1-c33015d876b1', 'c6063524-6b87-5315-8c24-a77c123ca5b3', '00000000-0000-0000-0000-0000000005d1', 12, 'sun'::weekday, 'Week 7', 'Week 7:
• Perimeter: Introduction & Calculation
• Perimeter: Real-World Problems
• Area: Introduction & Unit Squares
• Area: Formulas & Application
• Review and Assess', '[]'::jsonb, 'Std: M.5.MD.C.3
M.EE.5.MD.3', '[{"type": "link", "label": "Math: Measurement and Data", "url": "https://padlet.com/awsajprimary/unit-2-math-measurement-and-data-lhj0ozu0co1k3toa", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['15e286ce-b828-554d-9dac-40bdd496d9ed']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b976299b-3865-57d8-9d11-20f7cfb8b993', '2209bbbb-6204-5e62-bbe5-2ef3fa2f036b', '00000000-0000-0000-0000-0000000005d2', 12, 'sun'::weekday, 'Author''s Craft', 'Week 7: Author''s Craft - Analyze how authors use language (diction, imagery, tone) to create effects, and examine how authors craft contributes to meaning.', '[]'::jsonb, 'Std: RL5.4
EE.RL5.4', '[{"type": "link", "label": "Reading: Analyzing Literature", "url": "https://padlet.com/awsajprimary/unit-2-reading-analyzing-literature-kwp46csokaqa7ozk", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['0fe164ef-3254-5636-8b62-fc61cba0b47b', 'fac5abc0-2659-5957-b41c-f96afd78b264']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('48c1a75d-dad3-5483-b9ac-e1a8500f953e', '3f398de3-e6da-52c7-a9c4-44a8c1697a39', '00000000-0000-0000-0000-0000000005d3', 12, 'sun'::weekday, 'Putting It All Together', 'Week 7: Putting It All Together: Students will create final procedural texts, incorporating visuals and revisions.', '[]'::jsonb, 'Std: W5.2b W5.5 W5.6
EE.W5.6', '[{"type": "link", "label": "Writing: Procedural Writing", "url": "https://padlet.com/awsajprimary/unit-2-writing-procedural-writing-lkl8ewnr4nn3cgbz", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['b4cdf870-f999-5406-a6b0-7340550f4519']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('fc08c43d-34f9-519e-8c8d-651e7f000263', '26d7d07b-c350-518f-ab6d-c9775b3a00dd', '00000000-0000-0000-0000-0000000005d4', 12, 'sun'::weekday, 'Conjunctions (Part 2)', 'Week 7: Conjunctions (Part 2): Subordinating Conjunctions - One Idea Leads the Way: Explain that these conjunctions connect a main idea to a less important one that depends on it.', '[]'::jsonb, 'Std: CC: L.5.1.F
EE.L.5.1.I', '[{"type": "link", "label": "Grammar: From Words to Sentences", "url": "https://padlet.com/awsajprimary/unit-2-grammar-from-words-to-sentences-c0w2b8z3pm40s7xw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['90a64689-57b5-5104-bd10-b4d757a3f652', '35af9a12-0950-5e68-9244-02e0b0c1ec56']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('57030533-af56-5e0f-bd00-64aa3cc3fbdb', '9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000005d7', 13, 'sun'::weekday, 'Home Country & Host Country (Qatar & Palestine)', 'Home Country & Host Country (Qatar & Palestine)
• Define home country vs host country
• TLC presentation on Palestine (compared to Qatar)
• Collage activity: Qatar features (desert, Pearl-Qatar, capital, landmarks)
• Group presentations of collages
• Class discussion: similarities and differences between countries', '[]'::jsonb, 'Std: Social Studies Standards: Changes in Values and Beliefs / Then and Now', '[{"type": "doc", "label": "Week 1 plan", "url": "https://docs.google.com/document/d/1UXcEWG7b25guvONDeqj1SkO_U6SjwJ_-SBp692ndQu0/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c565121d-2ff2-5963-88bc-59d4c75367b2', '75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000005d1', 13, 'sun'::weekday, 'Area Aces, Rectangles & Squares Become an area ace! Define…', 'Week 1: Area Aces, Rectangles & Squares  Become an area ace! Define area and master the formulas for finding the area of rectangles and squares.', '[]'::jsonb, 'Std: M.5.G.A.1
M.EE.5.G.1', '[{"type": "link", "label": "Math: Geometry", "url": "https://padlet.com/awsajprimary/unit-3-math-geometry-v6jtj4ixbmq9uxya", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['eb96c6cb-d8e3-5373-b49d-437faf0f1de6']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a22ddf20-ffd4-5251-987d-271617856052', 'd4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000005d2', 13, 'sun'::weekday, 'Asking Questions & Defining Topics', 'Week 1: Asking Questions & Defining Topics: Introduce the research process, emphasizing the importance of asking good questions. Students brainstorm research topics, learn to narrow down broad topics, and formulate focused researc', '[]'::jsonb, 'Std: RI5.1 W5.7
EE.RI5.1 EE.RI5.2', '[{"type": "link", "label": "Reading: Research and Inquiry", "url": "https://padlet.com/awsajprimary/unit-3-reading-research-and-inquiry-b268xnhjp15r5pum", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('1990bc1b-7fa8-5da6-adf7-5f41d41bd564', '1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000005d3', 13, 'sun'::weekday, 'Asking Questions', 'Week 1: Asking Questions: Defining a Research Topic Students will be introduced to research writing and explore various research topics.', '[]'::jsonb, 'Std: RI5.1 RI5.9 W5.7
EE.RI5.1 EE.RI5.2', '[{"type": "link", "label": "Writing: Research Writing", "url": "https://padlet.com/awsajprimary/unit-3-writing-research-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('743fc0f4-207d-5064-80d6-d345367f93b8', '458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000005d4', 13, 'sun'::weekday, 'Verb Power-Up', 'Week 1: Verb Power-Up: More Tenses!: Introduce past perfect, present perfect, future perfect alongside irregular verbs, gradually increasing complexity.', '[]'::jsonb, 'Std: CC: L.5.1.B, L.5.1.E
EE.L.5.1.C', '[{"type": "link", "label": "Grammar: Making Writing Clear and Precise", "url": "https://padlet.com/awsajprimary/unit-3-grammar-making-writing-clear-and-precise-asbq0sshseajvyn6", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['2ed31f67-a543-52cf-b437-f1a5e914a0a7', '97b7a538-6213-576e-be50-0ce6e824728e', 'cae6bb19-e895-5713-b6b4-a9c1fbc81800']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3971c111-cb8a-56cb-b644-476b58a8bc86', '9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000005d7', 14, 'sun'::weekday, 'Research & Inquiry (through Literacy)', 'Research & Inquiry (through Literacy)
• IPC covered through Literacy (Research & Inquiry unit)
• TBD — confirm whether to add standalone Explore content for 26-27
• TBD
• TBD
• TBD', '[]'::jsonb, 'Std: Social Studies Standards: Changes in Values and Beliefs / Then and Now', '[{"type": "doc", "label": "Week 2 plan", "url": "https://docs.google.com/document/d/14OgFiHbHHEhAxaRnieqeDcIq3OzYPHmnssEwD98_XjA/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('7a050c4a-4641-5b10-a2dc-49bacc48e184', '75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000005d1', 14, 'sun'::weekday, 'Shape Sleuths', 'Week 2: Shape Sleuths: Investigating 2D Shapes Become a shape detective! Classify and describe polygons based on their sides and angles.', '[]'::jsonb, 'Std: M.5.G.A.1
M.EE.5.G.1', '[{"type": "link", "label": "Math: Geometry", "url": "https://padlet.com/awsajprimary/unit-3-math-geometry-v6jtj4ixbmq9uxya", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['eb96c6cb-d8e3-5373-b49d-437faf0f1de6']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('032569e4-6cae-5ff2-b493-4550e5f6161c', 'd4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000005d2', 14, 'sun'::weekday, 'Non-Fiction Text Features & Finding & Evaluating Sources', 'Week 2: Non-Fiction Text Features & Finding & Evaluating Sources: Introduce different types of sources (books, articles, websites, etc.). Students learn strategies for finding credible sources (using keywords, library databases, r', '[]'::jsonb, 'Std: RI5.7 RI5.8
EE.RI5.7', '[{"type": "link", "label": "Reading: Research and Inquiry", "url": "https://padlet.com/awsajprimary/unit-3-reading-research-and-inquiry-b268xnhjp15r5pum", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['bfe8139d-a242-5755-8f8d-3f32ca6b306e']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('49c449b7-b3e6-534f-87d5-d3ec69a3eebe', '1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000005d3', 14, 'sun'::weekday, 'Hunting for Information', 'Week 2: Hunting for Information: Students will learn to gather information from reliable sources, take notes, and organize the important information from their sources.', '[]'::jsonb, 'Std: RI5.7 RI5.8 W5.8
EE.RI5.1 EE.RI5.2', '[{"type": "link", "label": "Writing: Research Writing", "url": "https://padlet.com/awsajprimary/unit-3-writing-research-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5c2bcba0-bec3-56eb-b706-bd5361a2b725', '458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000005d4', 14, 'sun'::weekday, 'Subject-Verb Agreement', 'Week 2: Subject-Verb Agreement: Matching Up: Start simple (singular/plural), then gradually introduce irregular verbs.', '[]'::jsonb, 'Std: CC: L.5.1.A
 EE.L.5.1.J', '[{"type": "link", "label": "Grammar: Making Writing Clear and Precise", "url": "https://padlet.com/awsajprimary/unit-3-grammar-making-writing-clear-and-precise-asbq0sshseajvyn6", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['15cbbb58-228b-5f5e-b69b-34bb333928d8', 'dbb7031d-64a4-5d4b-b324-be448ccd4ead']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('95d47bea-f786-57ef-b9dd-aaf71fa5d33f', '9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000005d7', 15, 'sun'::weekday, 'Research & Inquiry Catch-Up Week', 'Research & Inquiry Catch-Up Week
• IPC covered through Literacy (Research & Inquiry unit)
• Catch-up week (in 25-26 due to low attendance)
• TBD
• TBD
• TBD', '[]'::jsonb, 'Std: Social Studies Standards: Changes in Values and Beliefs / Then and Now', '[{"type": "doc", "label": "Week 3 plan", "url": "https://docs.google.com/document/d/1NCfojhcnGxy0oB9MTIPl3e1jLBce1K1SU6IYWXLOYsE/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b2784b52-6f67-5d2a-ad6f-474c6e9e8364', '75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000005d1', 15, 'sun'::weekday, '3D Architects', 'Week 3: 3D Architects: Building Understanding of Solid Shapes - Put on your architect''s hat! Identify and describe 3D shapes like prisms, pyramids, cones, cylinders, and spheres.', '[]'::jsonb, 'Std: M.5.G.A.1
M.EE.5.G.1', '[{"type": "link", "label": "Math: Geometry", "url": "https://padlet.com/awsajprimary/unit-3-math-geometry-v6jtj4ixbmq9uxya", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['eb96c6cb-d8e3-5373-b49d-437faf0f1de6']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4ceb70cb-7bd5-58ff-b539-b25da766991e', 'd4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000005d2', 15, 'sun'::weekday, 'Note-Taking & Organizing Information', 'Week 3: Note-Taking & Organizing Information: Teach effective note-taking strategies (paraphrasing, summarizing, quoting). Students practice extracting key information from sources and organizing it logically using graphic organiz', '[]'::jsonb, 'Std: RI5.2 W5.8
EE.RI5.2 EE.RI5.8', '[{"type": "link", "label": "Reading: Research and Inquiry", "url": "https://padlet.com/awsajprimary/unit-3-reading-research-and-inquiry-b268xnhjp15r5pum", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('98d4f7b1-54a2-55c5-bfef-a7a722f7631f', '1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000005d3', 15, 'sun'::weekday, 'Planning Outline and Introducing Research', 'Week 3: Planning Outline and Introducing Research: Students will learn to organize their research paper in an outline and craft engaging introductions.', '[]'::jsonb, 'Std: RI5.2 RI5.5 W5.3a
EE.RI5.3 EE.RL5.1', '[{"type": "link", "label": "Writing: Research Writing", "url": "https://padlet.com/awsajprimary/unit-3-writing-research-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('62c2192b-20ea-51e2-b146-f4a9b1f1707c', '458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000005d4', 15, 'sun'::weekday, 'Commas', 'Week 3: Commas: Lists, Dates, and Taking a Breath: Practical uses are key. Plenty of examples and writing sentences with lists/dates.', '[]'::jsonb, 'Std: CC: L.5.2.A
 EE.L.5.2.C', '[{"type": "link", "label": "Grammar: Making Writing Clear and Precise", "url": "https://padlet.com/awsajprimary/unit-3-grammar-making-writing-clear-and-precise-asbq0sshseajvyn6", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['fdc20ecf-f104-5a02-8595-3b83fa8c04ce', '48ad21f0-2d93-5d8b-ad6f-5ef647e21b10']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e818d158-7a0e-5a45-a0c6-76588aa43ebc', '9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000005d7', 16, 'sun'::weekday, 'Then & Now in Qatar - The Oil Discovery', 'Then & Now in Qatar — The Oil Discovery
• Key vocab: then, now, past, present, change
• Amazing Places in Qatar PPT — old vs new
• History of Qatar video; 50–60 years ago vs today
• Oil discovery and its cause/effect on Qatar
• Assessment-style practice question', '[]'::jsonb, 'Std: Social Studies Standards: Changes in Values and Beliefs / Then and Now', '[{"type": "doc", "label": "Week 4 plan", "url": "https://docs.google.com/document/d/19fHAXMCyfPXVyZQmt_4PzZ3g9WvNg99hHzvaHz9qxT0/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c893fbbf-5045-5c8d-bbc4-04686d2a4b5e', '75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000005d1', 16, 'sun'::weekday, 'Week 4', 'Week 4:
• Lines & Angles: parallel, perpendicular, intersecting
• Classify and measure angles
• 3D Shapes: Prisms, Pyramids, Cylinders, Cones, Spheres
• Nets of 3D Shapes
• Review and Assess', '[]'::jsonb, 'Std: M.5.G.B.3
M.EE.5.G.3', '[{"type": "link", "label": "Math: Geometry", "url": "https://padlet.com/awsajprimary/unit-3-math-geometry-v6jtj4ixbmq9uxya", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['eaa3d867-b2d8-58b5-aa23-446f2197dc37']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('72844aba-a9d6-522d-9b53-bc8ee1b54fc1', 'd4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000005d2', 16, 'sun'::weekday, 'Synthesizing Information', 'Week 4: Synthesizing Information: Students analyze and compare information from multiple sources, identifying common themes, different perspectives, and potential biases. They practice synthesizing information by combining and con', '[]'::jsonb, 'Std: RI5.3 RI5.6 RI5.9
EE.RI5.3 EE.RI5.6 EE.RI5.9', '[{"type": "link", "label": "Reading: Research and Inquiry", "url": "https://padlet.com/awsajprimary/unit-3-reading-research-and-inquiry-b268xnhjp15r5pum", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5b4a6867-3bff-5ada-8256-03635b44ef0f', '1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000005d3', 16, 'sun'::weekday, 'Developing Supporting Paragraphs', 'Week 4: Developing Supporting Paragraphs: Students will focus on writing clear and informative body paragraphs using their research.', '[]'::jsonb, 'Std: RI5.1 W5.2b W5.9
EE.RI5.1 EE.RI5.2', '[{"type": "link", "label": "Writing: Research Writing", "url": "https://padlet.com/awsajprimary/unit-3-writing-research-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('20205072-2afb-50b6-adf8-a0da5881e696', '458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000005d4', 16, 'sun'::weekday, 'Apostrophes', 'Week 4: Apostrophes: Two Jobs!: Clearly distinguish possession (cat''s toy) from contractions (can''t). This prevents common errors.', '[]'::jsonb, 'Std: CC: L.5.2.D
EE.L.5.2.D', '[{"type": "link", "label": "Grammar: Making Writing Clear and Precise", "url": "https://padlet.com/awsajprimary/unit-3-grammar-making-writing-clear-and-precise-asbq0sshseajvyn6", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['a650f6b9-a78b-5d46-8962-d8b83d1ac1f9', '07229a23-ad8b-5975-a231-326a3d8525df']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('42b72b21-12ef-5f63-89b2-23e3542dc242', '9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000005d7', 17, 'sun'::weekday, 'Modern Qatar & Primary vs Secondary Sources', 'Modern Qatar & Primary vs Secondary Sources
• Before/After Qatar comparison (schools, houses, cars, jobs)
• Reading pictures as evidence — picture analysis
• Primary vs secondary sources (old photo / newspaper vs book / video)
• Anchor chart on sources
• Sentence frames: ''After oil, families could ___.''', '[]'::jsonb, 'Std: Social Studies Standards: Changes in Values and Beliefs / Then and Now', '[{"type": "doc", "label": "Week 5 plan", "url": "https://docs.google.com/document/d/1zEQlw8yT2cFKHrJFSexRq5xxYjeqlEZXr6y1OBH0Vz0/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('dee01e6a-a227-5be8-951f-bb73c99f6e49', '75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000005d1', 17, 'sun'::weekday, 'Volume Voyagers', 'Week 5: Volume Voyagers: Exploring 3D Space - Become a volume voyager! Define volume, explore it hands-on with unit cubes, and learn the formula for calculating the volume of rectangular prisms (and other prisms for Grade 5).', '[]'::jsonb, 'Std: M.5.MD.C.5
M.EE.5.MD.4', '[{"type": "link", "label": "Math: Geometry", "url": "https://padlet.com/awsajprimary/unit-3-math-geometry-v6jtj4ixbmq9uxya", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['4e760e40-4eca-5ca3-8992-88404d5d0b0c']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c514060e-b295-528a-bead-0c3e5efb4480', 'd4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000005d2', 17, 'sun'::weekday, 'Drawing Conclusions & Forming Opinions', 'Week 5: Drawing Conclusions & Forming Opinions: Students learn to draw inferences and conclusions based on the evidence gathered. They practice forming and supporting their own opinions on the research topic using evidence from th', '[]'::jsonb, 'Std: RI5.8 W5.9
EE.RI5.8 EE.W5.9', '[{"type": "link", "label": "Reading: Research and Inquiry", "url": "https://padlet.com/awsajprimary/unit-3-reading-research-and-inquiry-b268xnhjp15r5pum", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('dabf667c-f74e-54bc-84d5-724196e6a867', '1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000005d3', 17, 'sun'::weekday, 'Drawing Conclusions and Citing Sources', 'Week 5: Drawing Conclusions and Citing Sources: Students will learn to write effective conclusions and understand the importance of citing sources.', '[]'::jsonb, 'Std: RI5.8 W5.3a W5.8
EE.RI5.3 EE.RL5.1', '[{"type": "link", "label": "Writing: Research Writing", "url": "https://padlet.com/awsajprimary/unit-3-writing-research-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('16b0bbdc-f0a8-5aa8-b986-571cf2d02463', '458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000005d4', 17, 'sun'::weekday, 'Colons & Semicolons', 'Week 5: Colons & Semicolons: Punctuation Pros!: Advanced, so clear, focused practice is key. Connect to combining sentences.', '[]'::jsonb, 'Std: CC: L.5.2.C
EE.L.5.2.E', '[{"type": "link", "label": "Grammar: Making Writing Clear and Precise", "url": "https://padlet.com/awsajprimary/unit-3-grammar-making-writing-clear-and-precise-asbq0sshseajvyn6", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['6ff17d20-df05-5358-894d-53d3eb8a0354', '14fe2ad5-da71-5e8e-aafe-20b2e2caeb6f']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d8e17027-d53d-5b36-bfcd-a0067fdd7763', '9b1e6479-fc29-52b2-b3ba-be1522f28f4c', '00000000-0000-0000-0000-0000000005d7', 18, 'sun'::weekday, 'Reading Pictures as Evidence (Unit Assessment)', 'Reading Pictures as Evidence (Unit Assessment)
• Picture analysis: what makes an image ''old''
• How oil changed family life (jobs, school, home)
• Compare grandparents'' lives to students'' lives today
• Review and reflection (''I learned that ___.'')
• Grade 5 Unit 3 assessment', '[]'::jsonb, 'Std: Social Studies Standards: Changes in Values and Beliefs / Then and Now', '[{"type": "doc", "label": "Week 6 plan", "url": "https://docs.google.com/document/d/1MEhvTTUzj_Nkrx_1I0qp2cDN--2DJ1FcGPqP2B_DW9g/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d241db74-69ad-59ed-a866-57493192d7ba', '75b855d8-0195-5036-89e0-2431feb4e28a', '00000000-0000-0000-0000-0000000005d1', 18, 'sun'::weekday, 'Week 6', 'Week 6:
• Volume review: concepts, rectangular prisms, formula
• Design a City project: Volume + Area + Perimeter
• Apply standards 5.MD.C.3, 5.MD.C.5, 4.MD.A.3
• Project work, revision and refinement
• Project presentation and fi', '[]'::jsonb, 'Std: M.5.G.A.1, M.5.G.A.2, M.5.G.B.3
M.EE.5.G.1, M.EE.5.G.2, M.EE.5.G.3', '[{"type": "link", "label": "Math: Geometry", "url": "https://padlet.com/awsajprimary/unit-3-math-geometry-v6jtj4ixbmq9uxya", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['eb96c6cb-d8e3-5373-b49d-437faf0f1de6', 'be12283c-c97e-57b3-b3c1-1ecdc8d1cbbd', 'eaa3d867-b2d8-58b5-aa23-446f2197dc37']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('25c6279f-57df-562c-bce1-07cbf45a0551', 'd4c515d9-c59b-542f-9ca7-d4616717b774', '00000000-0000-0000-0000-0000000005d2', 18, 'sun'::weekday, 'Presenting Research Findings', 'Week 6: Presenting Research Findings: Students learn different ways to present their research findings (oral reports, presentations with visuals, multimedia projects). They practice communicating their research clearly and engagin', '[]'::jsonb, 'Std: SL5.4 SL5.5 W5.6
EE.SL5.4 EE.SL5.5 EE.W5.6', '[{"type": "link", "label": "Reading: Research and Inquiry", "url": "https://padlet.com/awsajprimary/unit-3-reading-research-and-inquiry-b268xnhjp15r5pum", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6305d639-044e-52c2-bc5b-44e9c933a890', '1cd9e6a6-8b6a-5422-b61b-841df5c01e35', '00000000-0000-0000-0000-0000000005d3', 18, 'sun'::weekday, 'Revising and Sharing Research', 'Week 6: Revising and Sharing Research: Students will revise their research reports for clarity and accuracy, then share their findings.', '[]'::jsonb, 'Std: W5.4 W5.5
EE.RF5.4 EE.RI5.9', '[{"type": "link", "label": "Writing: Research Writing", "url": "https://padlet.com/awsajprimary/unit-3-writing-research-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('376ad641-507d-5f1a-ba33-4b2365078591', '458063eb-2708-5c22-b1ee-6b7ff73dadf1', '00000000-0000-0000-0000-0000000005d4', 18, 'sun'::weekday, 'Hyphens & Dashes', 'Week 6: Hyphens & Dashes: Little Lines, Big Impact: Visual aids are helpful here. Focus on compound adjectives, parentheticals.', '[]'::jsonb, 'Std: CC: L.5.2.D
EE.L.5.2.F', '[{"type": "link", "label": "Grammar: Making Writing Clear and Precise", "url": "https://padlet.com/awsajprimary/unit-3-grammar-making-writing-clear-and-precise-asbq0sshseajvyn6", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['a650f6b9-a78b-5d46-8962-d8b83d1ac1f9', '068f4ed6-b4db-5d70-b7f9-945e2ffe633f']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('980bf82c-c6a3-526f-8c86-c94dfd46f6a3', '93d67480-4087-55ce-befd-2f8da844b357', '00000000-0000-0000-0000-0000000005d7', 19, 'sun'::weekday, 'Global Citizenship & Qatar Blockade (Trade Game)', 'Global Citizenship & Qatar Blockade (Trade Game)
• Knowledge Harvest: what is a responsible global citizen?
• Mind map and short group brainstorm
• Going Global PPT (Tuesday lesson)
• Qatar Blockade — news report from June 2020
• Trading Game (whole Grade 5)', '[]'::jsonb, 'Std: Social Studies Standards: Causes of World Trade / Global Citizenship', '[{"type": "doc", "label": "Week 1 plan", "url": "https://docs.google.com/document/d/1YcUQkQ34rfsDuGb1LA0d6MyNCVxj16DVVODDf1Krdaw/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('93053647-b9b3-50b7-af07-fbcaf77e8f0c', 'a4f3aaa4-3353-5395-b66e-571bd78d69fd', '00000000-0000-0000-0000-0000000005d1', 19, 'sun'::weekday, 'Multiplication Magicians, Strategies for 2-Digit…', 'Week 1: Multiplication Magicians, Strategies for 2-Digit Multiplication Unlock multiplication mastery! Understand factors and multiples. Review various ways to work towards  2-digit by 2-digit multiplication (with decimals).', '[]'::jsonb, 'Std: M.5.NBT.B.5
M.EE.5.NBT.5', '[{"type": "link", "label": "Math: Multiplication and Division", "url": "https://padlet.com/awsajprimary/unit-4-math-multiplication-and-division-cmkq3xxofcvge3p0", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a23b34ce-8f9b-53bf-bb04-33e840c44f67', '3170e847-5264-53cf-bbc6-034ff65e7f0c', '00000000-0000-0000-0000-0000000005d2', 19, 'sun'::weekday, 'Author''s Purpose Determine purpose (persuade, inform,…', 'Week 1: Author''s Purpose Determine purpose (persuade, inform, entertain), analyze author''s choices, connect author''s purpose to the real world.', '[]'::jsonb, 'Std: RI5.6
EE.RI5.6', '[{"type": "link", "label": "Reading: Comprehension Strategies", "url": "https://padlet.com/awsajprimary/unit-4-reading-comprehension-strategies-2cl10a7uq08vbsw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['494824a6-e8cc-5934-991b-e5fc54da9ec0', '1c7446cc-dc3b-5d9c-87a3-ea53e11b16bc']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('414d8f52-68db-5383-8a3e-90171f0b63e8', 'c57154ed-1d22-5a84-bc5d-36f02a59c118', '00000000-0000-0000-0000-0000000005d3', 19, 'sun'::weekday, 'What''s Your Opinion?', 'Week 1: What''s Your Opinion?: Students will be introduced to opinion writing and explore different formats.', '[]'::jsonb, 'Std: RI5.6 RI5.8 W5.1
EE.RI5.1 EE.RI5.3', '[{"type": "link", "label": "Writing: Opinion Writing", "url": "https://padlet.com/awsajprimary/unit-4-writing-opinion-writing-4gd5bwj3thrzifyb", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5a73bb38-f8f9-5360-bca8-8287370237fd', '165cfaae-ffa5-58e5-9d47-eed87e742ea5', '00000000-0000-0000-0000-0000000005d4', 19, 'sun'::weekday, 'Quotation Marks, Speaking on Paper', 'Week 1: Quotation Marks, Speaking on Paper: Introduce dialogue and its punctuation. Short, engaging practice dialogues work well.', '[]'::jsonb, 'Std: CC: L.5.2.B
EE.L.5.2.G', '[{"type": "link", "label": "Grammar: Advanced Punctuation and Style", "url": "https://padlet.com/awsajprimary/unit-4-grammar-advanced-punctuation-and-style-d25ix61199ob9f2v", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['bee46f0b-4e19-54ad-a580-4f8e8351c945', 'e4c66a5f-c40d-5427-8056-50f3feeb8f02']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0e1f9b9e-fb25-55d7-b7bc-b4085ff6f5a9', '93d67480-4087-55ce-befd-2f8da844b357', '00000000-0000-0000-0000-0000000005d7', 20, 'sun'::weekday, 'Import / Export & Mapping Qatar', 'Import / Export & Mapping Qatar
• Trading Game debrief — consolidate trade concept
• What does ''global'' mean? Import vs export
• Locate Qatar (land, sea, coast)
• Sort goods: Qatari (Fish, Dates, Oil) vs Other (clothes, toys, Takis)
• Coast / desert intro vocabulary', '[]'::jsonb, 'Std: Social Studies Standards: Causes of World Trade / Global Citizenship', '[{"type": "doc", "label": "Week 2 plan", "url": "https://docs.google.com/document/d/15it1KzMxKf5jO9EJssPvnqC8NFEEixL1yKdPPkfA8_4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3ac22a9f-c682-517f-8f1f-376c47fa2937', 'a4f3aaa4-3353-5395-b66e-571bd78d69fd', '00000000-0000-0000-0000-0000000005d1', 20, 'sun'::weekday, 'Multiplication Masters', 'Week 2: Multiplication Masters: Conquering Larger Numbers - Take on bigger challenges! Practice the standard algorithm with larger numbers and sharpen your problem-solving skills.', '[]'::jsonb, 'Std: M.5.NBT.B.5
M.EE.5.NBT.5', '[{"type": "link", "label": "Math: Multiplication and Division", "url": "https://padlet.com/awsajprimary/unit-4-math-multiplication-and-division-cmkq3xxofcvge3p0", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['189f19a5-2126-533a-a2f7-285404f25acd']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f46235b3-288e-5393-a514-d4f5961de309', '3170e847-5264-53cf-bbc6-034ff65e7f0c', '00000000-0000-0000-0000-0000000005d2', 20, 'sun'::weekday, 'Making Inferences & Predictions Use text clues and…', 'Week 2: Making Inferences & Predictions Use text clues and background knowledge to make logical inferences and predictions, apply these skills during read-alouds and independent reading.', '[]'::jsonb, 'Std: RL5.1 RI5.1
EE..RL5.1 EE.RI5.1', '[{"type": "link", "label": "Reading: Comprehension Strategies", "url": "https://padlet.com/awsajprimary/unit-4-reading-comprehension-strategies-2cl10a7uq08vbsw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b0a41d64-541b-5dad-b605-9d0ea2566888', 'c57154ed-1d22-5a84-bc5d-36f02a59c118', '00000000-0000-0000-0000-0000000005d3', 20, 'sun'::weekday, 'Strong Opinions Need Strong Reasons!', 'Week 2: Strong Opinions Need Strong Reasons!: Students will learn to support their opinions with clear and logical reasons.', '[]'::jsonb, 'Std: RI5.8 W5.1 W5.2a
EE.RI5.1 EE.RI5.2', '[{"type": "link", "label": "Writing: Opinion Writing", "url": "https://padlet.com/awsajprimary/unit-4-writing-opinion-writing-4gd5bwj3thrzifyb", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3649e060-37ca-5e18-a31c-90d6595b899e', '165cfaae-ffa5-58e5-9d47-eed87e742ea5', '00000000-0000-0000-0000-0000000005d4', 20, 'sun'::weekday, 'Pronouns', 'Week 2: Pronouns: Agreement Challenge!: Now that they know types, ensure pronouns MATCH the noun they replace (number and gender).', '[]'::jsonb, 'Std: CC: L.5.1.C
EE.L.5.1.K', '[{"type": "link", "label": "Grammar: Advanced Punctuation and Style", "url": "https://padlet.com/awsajprimary/unit-4-grammar-advanced-punctuation-and-style-d25ix61199ob9f2v", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e5b4eb4b-be06-5e65-8181-c89da058e4e3', 'da1c34c4-3823-51de-bd96-e885296f96e1']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5cb749de-3d46-560e-a942-dfacce65023c', '93d67480-4087-55ce-befd-2f8da844b357', '00000000-0000-0000-0000-0000000005d7', 21, 'sun'::weekday, 'Desert vs Coastal Life', 'Desert vs Coastal Life
• Real-world connection: match game ''countries'' to real regions
• Reflection: was trade fair in the game?
• Desert life (tents, camels) vs Coastal life (boats, fishing) image sort
• T-chart / hoop sort activity
• Discuss why people move (desert vs city scenario)', '[]'::jsonb, 'Std: Social Studies Standards: Causes of World Trade / Global Citizenship', '[{"type": "doc", "label": "Week 3 plan", "url": "https://docs.google.com/document/d/1072vZo-K8DTjE8ZuGMqy6bHmyowHUP18qhhZpe3gQn4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('3efd29a2-edf2-5eca-ac64-cde483e3601e', 'a4f3aaa4-3353-5395-b66e-571bd78d69fd', '00000000-0000-0000-0000-0000000005d1', 21, 'sun'::weekday, 'Division Detectives', 'Week 3: Division Detectives: Cracking the Code of Long Division - Become a division detective! Dive into the world of long division, using models and strategies to solve division problems. (With decimals)', '[]'::jsonb, 'Std: M.5.NBT.B.6
M.EE.5.NBT.6', '[{"type": "link", "label": "Math: Multiplication and Division", "url": "https://padlet.com/awsajprimary/unit-4-math-multiplication-and-division-cmkq3xxofcvge3p0", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['4a32dc52-19a1-56cf-aaa7-ef89ec2c59e0']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('872257f2-b84b-5e57-83dc-fd3aaa55da55', '3170e847-5264-53cf-bbc6-034ff65e7f0c', '00000000-0000-0000-0000-0000000005d2', 21, 'sun'::weekday, 'Fact & Opinion Distinguish between fact/opinion, evaluate…', 'Week 3: Fact & Opinion Distinguish between fact/opinion, evaluate evidence and reasoning, practice identifying fact and opinion in persuasive writing.', '[]'::jsonb, 'Std: RI5.8
EE.RI5.8', '[{"type": "link", "label": "Reading: Comprehension Strategies", "url": "https://padlet.com/awsajprimary/unit-4-reading-comprehension-strategies-2cl10a7uq08vbsw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['a4583a57-d99a-5740-a6ae-91aa86a6905c', '7e16d66e-9f7b-5217-9f90-fa565c737515']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e18502f1-d185-5449-a031-d495e1ee3b67', 'c57154ed-1d22-5a84-bc5d-36f02a59c118', '00000000-0000-0000-0000-0000000005d3', 21, 'sun'::weekday, 'Back it Up! Evidence in Opinion Writing', 'Week 3: Back it Up! Evidence in Opinion Writing: Students will learn to gather and present evidence to strengthen their arguments.', '[]'::jsonb, 'Std: RI5.8 RI5.9 W5.2a W5.8
EE.RI5.2 EE.RI5.3', '[{"type": "link", "label": "Writing: Opinion Writing", "url": "https://padlet.com/awsajprimary/unit-4-writing-opinion-writing-4gd5bwj3thrzifyb", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('7cceded2-41ca-529f-8f3c-5428db47f95d', '165cfaae-ffa5-58e5-9d47-eed87e742ea5', '00000000-0000-0000-0000-0000000005d4', 21, 'sun'::weekday, 'Active vs. Passive', 'Week 3: Active vs. Passive: Who''s Doing What?: This impacts style significantly. Supplement with examples showing the difference in effect.', '[]'::jsonb, 'Std: CC: L.5.3.A
EE.L.5.3.A', '[{"type": "link", "label": "Grammar: Advanced Punctuation and Style", "url": "https://padlet.com/awsajprimary/unit-4-grammar-advanced-punctuation-and-style-d25ix61199ob9f2v", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['2c8add58-a66e-5725-82e1-48b76d1430c3', '55c0c8a5-7940-5d59-9a06-ffd8051bc5e8']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('122c4798-a1f0-55e8-926e-7c50b5a7e975', '93d67480-4087-55ce-befd-2f8da844b357', '00000000-0000-0000-0000-0000000005d7', 22, 'sun'::weekday, 'Natural Resources & Lulu Field Trip (Unit Assessment)', 'Natural Resources & Lulu Field Trip (Unit Assessment)
• What is a Natural Resource? (oil, water, fish, gas, sand)
• Map activity: locate resources of Qatar
• Compare Doha and Dukhan land use
• Field trip to Lulu''s Express (cost / origin / production)
• Unit 4 Global Goods assessment (Padlet questions; rubric)', '[]'::jsonb, 'Std: Social Studies Standards: Causes of World Trade / Global Citizenship', '[{"type": "doc", "label": "Week 4 plan", "url": "https://docs.google.com/document/d/1ZXXf5e0WQeX9K-PWEEqJhxiuBhG0fD8osuXa_KqVEq8/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b018cae2-b77d-53a5-ac59-dfa9a2e83fa6', 'a4f3aaa4-3353-5395-b66e-571bd78d69fd', '00000000-0000-0000-0000-0000000005d1', 22, 'sun'::weekday, 'Multiplication & Division Dynamic Duo', 'Week 4: Multiplication & Division Dynamic Duo: Unlocking the Connection - Discover the dynamic duo of multiplication and division! Explore the relationship between these operations and practice division with larger numbers.', '[]'::jsonb, 'Std: M.5.NBT.B.5, M.5.NBT.B.6
M.EE.5.NBT.5, M.EE.5.NBT.6', '[{"type": "link", "label": "Math: Multiplication and Division", "url": "https://padlet.com/awsajprimary/unit-4-math-multiplication-and-division-cmkq3xxofcvge3p0", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['189f19a5-2126-533a-a2f7-285404f25acd', '4a32dc52-19a1-56cf-aaa7-ef89ec2c59e0']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('8e08a4f9-ce02-5a26-a6b3-ca8f4e50bc36', '3170e847-5264-53cf-bbc6-034ff65e7f0c', '00000000-0000-0000-0000-0000000005d2', 22, 'sun'::weekday, 'Unlocking Information', 'Week 4: Unlocking Information: Summarizing & Paraphrasing: This week focuses on building essential skills for comprehending informational texts. Students learn strategies for identifying main ideas and supporting details, then pra', '[]'::jsonb, 'Std: RI5.2
EE.RI5.2', '[{"type": "link", "label": "Reading: Comprehension Strategies", "url": "https://padlet.com/awsajprimary/unit-4-reading-comprehension-strategies-2cl10a7uq08vbsw", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['05309783-d889-5298-a939-603836c7827f', '0e765305-d465-5a0c-8743-09a5958d0771']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0bc326af-4a9d-58a4-a3ad-4ae75f5771ed', 'c57154ed-1d22-5a84-bc5d-36f02a59c118', '00000000-0000-0000-0000-0000000005d3', 22, 'sun'::weekday, 'Crafting Persuasive Writing', 'Week 4: Crafting Persuasive Writing: Students will focus on using persuasive language and techniques to make their writing convincing.', '[]'::jsonb, 'Std: W5.1 W5.4 W5.9
EE.RL5.1', '[{"type": "link", "label": "Writing: Opinion Writing", "url": "https://padlet.com/awsajprimary/unit-4-writing-opinion-writing-4gd5bwj3thrzifyb", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['d876a792-7434-531b-80fd-f3f78ecd1216']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e4e60efd-c95a-52fa-af57-9703e50de13d', '165cfaae-ffa5-58e5-9d47-eed87e742ea5', '00000000-0000-0000-0000-0000000005d4', 22, 'sun'::weekday, 'Parts of Speech', 'Week 4: Parts of Speech: The Sequel!: Now they analyze sentences, identifying parts of speech AND their function.', '[]'::jsonb, 'Std: CC: L.5.1
 EE.L.5.1', '[{"type": "link", "label": "Grammar: Advanced Punctuation and Style", "url": "https://padlet.com/awsajprimary/unit-4-grammar-advanced-punctuation-and-style-d25ix61199ob9f2v", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['2bc1f10b-84f1-5e6e-a034-9e627ac70d86', 'b017a6a6-3d2e-5c16-9929-01aeb94c7d14']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d94ca75e-d340-5c00-b431-5305b48cedca', '9ff375f9-74ea-5870-a272-f4e92ccfef7a', '00000000-0000-0000-0000-0000000005d7', 23, 'sun'::weekday, 'Living vs Nonliving & Food Chains', 'Living vs Nonliving & Food Chains
• 7 Characteristics of Living Things
• Living vs nonliving picture sort
• Producers, consumers, decomposers — Food Chain components
• Build food chains (sun → plants → animals)
• Sentence frames: ''The sun gives energy to ___''', '[]'::jsonb, 'Std: Life Science Standards: Living Things, Plants, Fungi', '[{"type": "doc", "label": "Week 1 plan", "url": "https://docs.google.com/document/d/1Q8WEGtJ4jaSSlGlOwfoOqcnoS-yskxuEd2atqzMZtH8/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5c027cdb-3417-5682-aff5-f19b06f3c680', '8f7c4845-b713-55e6-b2ab-e1c90709b7ee', '00000000-0000-0000-0000-0000000005d1', 23, 'sun'::weekday, 'Week 1', 'Week 1:
• Math Review (Ramadan spiral review)', '[]'::jsonb, 'Std: M.5.OA.A.3
M.EE.5.OA.3', '[]'::jsonb, array['ab6cc45f-d60e-5039-a6a5-a439ebd0bbc7']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('7cd062d3-813f-5a6d-912a-b6aeaeab455d', '5acb9a7c-064f-5202-bb5d-cd2db57e15fe', '00000000-0000-0000-0000-0000000005d2', 23, 'sun'::weekday, 'Ramadan', 'Week 1: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0be18428-bbcb-5d5e-a206-0a85e0f16647', '986d83be-52f5-503a-b987-b2a93cd23883', '00000000-0000-0000-0000-0000000005d3', 23, 'sun'::weekday, 'Ramadan', 'Week 1: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('dc9071b4-9d37-5864-907b-50b823cd4d2c', '8d8d0b61-0d35-534b-b29f-71f48ea53807', '00000000-0000-0000-0000-0000000005d4', 23, 'sun'::weekday, 'Ramadan', 'Week 1: Ramadan', '[]'::jsonb, 'Std: W.5.1.A
W.5.1.B
W.5.2.A
EE5.1.1.A:
EE5.1.1.B', '[]'::jsonb, array['00a1f3e5-1fa5-5fb3-b6d9-317d9f6e5e82', '979c8e51-2d2c-597b-a032-2d5482d47b27', '354f6c33-42d1-5fc9-a503-1c20b66e3d86', 'fa347fa3-24ce-5254-8809-5dc012fd316d']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('93539406-41fc-5969-9d73-7ed265ff01bf', '9ff375f9-74ea-5870-a272-f4e92ccfef7a', '00000000-0000-0000-0000-0000000005d7', 24, 'sun'::weekday, 'Plant & Animal Life Cycles', 'Plant & Animal Life Cycles
• Parts of a plant (root, stem, leaf, flower) and functions
• Plant reproduction & life cycle (seed → seedling → adult → seeds)
• Animal life cycles (egg → caterpillar → chrysalis → butterfly)
• Metamorphosis — major change during growth
• Compare animal vs human life cycles', '[]'::jsonb, 'Std: Life Science Standards: Living Things, Plants, Fungi', '[{"type": "doc", "label": "Week 2 plan", "url": "https://docs.google.com/document/d/11bP2GjiPaEQMmf75egmywpNU0UZc9zruSSE1EDOe_Gc/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('11a28ada-4076-509a-9652-666a66890a87', '8f7c4845-b713-55e6-b2ab-e1c90709b7ee', '00000000-0000-0000-0000-0000000005d1', 24, 'sun'::weekday, 'Week 2', 'Week 2:
• Math Review (Ramadan spiral review)', '[]'::jsonb, 'Std: M.5.OA.A.1
M.EE.5.OA.1', '[]'::jsonb, array['b2f81c7d-3ec5-50cf-a59a-465f96176c23']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('9a831899-baef-50bf-9b03-e6d4fcf41b0e', '5acb9a7c-064f-5202-bb5d-cd2db57e15fe', '00000000-0000-0000-0000-0000000005d2', 24, 'sun'::weekday, 'Ramadan', 'Week 2: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f8a54e88-63e8-5612-8de7-a4d758c1e61c', '986d83be-52f5-503a-b987-b2a93cd23883', '00000000-0000-0000-0000-0000000005d3', 24, 'sun'::weekday, 'Ramadan', 'Week 2: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('cab093fb-5a89-57f3-bd7e-87446c986f18', '8d8d0b61-0d35-534b-b29f-71f48ea53807', '00000000-0000-0000-0000-0000000005d4', 24, 'sun'::weekday, 'Ramadan', 'Week 2: Ramadan', '[]'::jsonb, 'Std: CCW.5.2.D
CCW.5.4
CCL.5.1.D
EE5.1.2.A
EE 5.1.2.B', '[]'::jsonb, array['59b543c1-9f51-51d1-abf5-da21c95f3bf1', '7e5609bc-8c68-5da0-9f94-503914356385', '395b5165-beaa-5bed-9d89-a2eb51d5945f', 'd0da9756-2c02-5343-b3e6-e93c0e3c0590']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('636efe5d-65a5-5863-9c61-0cdea900eade', '9ff375f9-74ea-5870-a272-f4e92ccfef7a', '00000000-0000-0000-0000-0000000005d7', 25, 'sun'::weekday, 'Fungi as Decomposers', 'Fungi as Decomposers
• What are Fungi? — different from plants and animals
• Fungi/Mushroom anatomy (cap, stem)
• Fungi as decomposers — recycle nutrients to soil
• Why decomposers matter for ecosystem balance
• ''What is fungi''s job in nature?''', '[]'::jsonb, 'Std: Life Science Standards: Living Things, Plants, Fungi', '[{"type": "doc", "label": "Week 3 plan", "url": "https://docs.google.com/document/d/15jNfZpoJGQ0slUUHJnRSdSTWurJQhhHlGzsIprrNJtg/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c9e6e6e1-0d8a-5c46-8f49-c5feba2273b5', '8f7c4845-b713-55e6-b2ab-e1c90709b7ee', '00000000-0000-0000-0000-0000000005d1', 25, 'sun'::weekday, 'Week 3', 'Week 3:
• Math Review (Ramadan spiral review)', '[]'::jsonb, 'Std: M.5.OA.A.1
M.EE.5.OA.1', '[]'::jsonb, array['b2f81c7d-3ec5-50cf-a59a-465f96176c23']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a2a0c45e-c41e-5342-9907-be61055597c7', '5acb9a7c-064f-5202-bb5d-cd2db57e15fe', '00000000-0000-0000-0000-0000000005d2', 25, 'sun'::weekday, 'Ramadan', 'Week 3: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ffd9f057-f38b-55e0-8ca0-340376394fc0', '986d83be-52f5-503a-b987-b2a93cd23883', '00000000-0000-0000-0000-0000000005d3', 25, 'sun'::weekday, 'Ramadan', 'Week 3: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b5f48730-8752-57c1-8d02-325dddd84227', '8d8d0b61-0d35-534b-b29f-71f48ea53807', '00000000-0000-0000-0000-0000000005d4', 25, 'sun'::weekday, 'Ramadan', 'Week 3: Ramadan', '[]'::jsonb, 'Std: CCW.5.7
CCW.5.8:
CCW.5.9
EE5.1.3.A
EE5.1.3.B', '[]'::jsonb, array['2a9ef057-085c-506b-8c22-200bec9e353a', '9d3d3db6-388a-5bc4-adba-6b3509f0bff2', '9a8ef552-fa31-595a-8e76-bb41245c040d', '4c87d9fb-daa5-5907-b80d-d1ea36a8b6bb']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('711da076-6f52-54aa-b556-363408a614ea', '9ff375f9-74ea-5870-a272-f4e92ccfef7a', '00000000-0000-0000-0000-0000000005d7', 26, 'sun'::weekday, 'Fungi Life Cycle & Review', 'Fungi Life Cycle & Review
• Fungi life cycle — reproduction via spores
• How spores travel: wind, animals, water
• Review food-chain roles (producer / consumer / decomposer)
• Connect fungi to ecosystem balance
• Review and catch-up', '[]'::jsonb, 'Std: Life Science Standards: Living Things, Plants, Fungi', '[{"type": "doc", "label": "Week 4 plan", "url": "https://docs.google.com/document/d/1QyAjSjSt2XXbiBqiHsAbF5mXxE7kKjgdzlJoJK-bRoI/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('bb070518-2164-504a-a14a-9be486c2d2cf', '8f7c4845-b713-55e6-b2ab-e1c90709b7ee', '00000000-0000-0000-0000-0000000005d1', 26, 'sun'::weekday, 'Week 4', 'Week 4:
• Math Review (Ramadan spiral review)', '[]'::jsonb, 'Std: M.5.OA.A.2
M.EE.5.OA.1', '[]'::jsonb, array['5cc287f1-1d91-55ef-af04-2adb8077f784']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c4f084e4-8cdf-51b9-9216-ed75ad78bb9e', '5acb9a7c-064f-5202-bb5d-cd2db57e15fe', '00000000-0000-0000-0000-0000000005d2', 26, 'sun'::weekday, 'Ramadan', 'Week 4: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('916c70f4-8b98-5b81-9acb-85a4139b7ae2', '986d83be-52f5-503a-b987-b2a93cd23883', '00000000-0000-0000-0000-0000000005d3', 26, 'sun'::weekday, 'Ramadan', 'Week 4: Ramadan', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4433a2eb-03dc-5947-ba60-4b3dde40710d', '8d8d0b61-0d35-534b-b29f-71f48ea53807', '00000000-0000-0000-0000-0000000005d4', 26, 'sun'::weekday, 'Ramadan', 'Week 4: Ramadan', '[]'::jsonb, 'Std: CCW.5.1.C
CCW.5.6
CCSL.5.1.D
EE.5.1.4.A
EE.5.1.4.B', '[]'::jsonb, array['d7cb00d1-fc2d-5450-8531-3c684ab5e46b', '336ee7dc-7daa-5ce7-acfd-faae0c96d639', '3965bee0-795b-59bd-a11a-2a8c93eb7646', '31abbf31-783f-53ed-96da-77a94dbc6132', '926912f8-4698-585f-86cb-470b86ae03e3']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ea0b1f61-0e7e-5aad-b496-2bd12ea789b5', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 27, 'sun'::weekday, 'Solar System Intro & Planets', 'Solar System Intro & Planets
• Wrap previous unit (Living Things) assessment
• Sun / Moon / Earth fact sort: True / False / Uncertain (group cards)
• Name all planets in the solar system
• Pluto as a dwarf planet discussion
• Planet size and distance comparisons', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 1 plan", "url": "https://docs.google.com/document/d/1yBYK9_WCPKlLMIFJL5U57dATh-10TaLYaz4_Q7B2Zc4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('64cb6e5c-bad3-533e-b10e-2bcc64b44c42', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 27, 'sun'::weekday, 'Week 1', 'Week 1:
• PEMDAS — Introducing Order of Operations
• PEMDAS with Brackets
• PEMDAS with Brackets Practice
• PEMDAS Activities
• IXL Review and Formative (5.OA.A.1)', '[]'::jsonb, 'Std: M.5.NF.A.1
M.EE.5.NF.1', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e42dd54a-74cf-59dc-b58e-e541fc427b8a']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('031eddd3-9a5b-53fc-8b6f-925da8f5a073', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 27, 'sun'::weekday, 'Stepping into Another''s Shoes', 'Week 1: Stepping into Another''s Shoes: Point of View: Students explore how point of view shapes a story''s impact by analyzing texts and practicing writing from different perspectives. Activities include point-of-view shift writing', '[]'::jsonb, 'Std: RL5.6
EE.RL5.6', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['d6052737-9e41-5fbf-ae1f-f400ce44a5aa', 'a2929a80-c5de-54d0-89a9-ec17634d86e0']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4357c5e6-d713-550f-b7c8-3ad37f9efea9', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 27, 'sun'::weekday, 'Worldbuilding Wonders', 'Week 1: Worldbuilding Wonders: Where Stories Take Flight: Students will explore different types of narratives and learn about key story elements.', '[]'::jsonb, 'Std: RL5.2 RL5.5
EE.RL5.1 EE.RL5.2', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e09f1c30-bf9d-5446-8a80-f2e4ce5d218e', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 27, 'sun'::weekday, 'Paragraph Power', 'Week 1: Paragraph Power: Beyond the Sentence: Teach indentation, topic sentences, how to structure multiple sentences together.', '[]'::jsonb, 'Std: L.5.1.F, L.5.2.A
EE.L.5.1.F, EE.L.5.2.A', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['90a64689-57b5-5104-bd10-b4d757a3f652', 'fdc20ecf-f104-5a02-8595-3b83fa8c04ce', '7e6bf663-968c-5261-9ca2-4e8bd7cf96ed', 'f2dbee30-836f-5ea9-adcc-a99bd4e7fcdb']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('af834301-1fc3-5c97-93e5-407b5ee5c3ff', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 28, 'sun'::weekday, 'Solar System Scale Model & Earth''s Rotation', 'Solar System Scale Model & Earth''s Rotation
• Build a Solar System scale model using planet diameter data
• ''Does the Sun move?'' — shadow investigation
• Earth''s rotation and revolution (Crash Course Kids)
• Spin the Earth: globe + flashlight to model day / night
• Sunrise & Sunset Investigation — graph longest/shortest days across countries', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 2 plan", "url": "https://docs.google.com/document/d/16vzBH-XpLh3dXdbfRypI0Ahp27W0-pLxAL97ufJ-vNY/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('502585c6-2c25-5df5-a99f-1cfc5d4f600a', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 28, 'sun'::weekday, 'Week 2', 'Week 2:
• Solving Equations Using Addition & Subtraction
• Solving Equations Using Multiplication & Division
• One-Step Equations: Mixed Practice
• One-Step Equations: Mixed Practice (continued)
• IXL Review and Formative (6.EE.B.', '[]'::jsonb, 'Std: M.5.NF.A.1
M.EE.5.NF.1', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e42dd54a-74cf-59dc-b58e-e541fc427b8a']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('113a968f-d62f-53e9-9004-617258ccafc5', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 28, 'sun'::weekday, 'Painting with Words', 'Week 2: Painting with Words: Figurative Language: Students discover the power of figurative language in creating vivid and descriptive writing. They participate in activities like figurative language scavenger hunts, charades, and', '[]'::jsonb, 'Std: RL5.4
EE.RL5.4', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['0fe164ef-3254-5636-8b62-fc61cba0b47b', 'fac5abc0-2659-5957-b41c-f96afd78b264']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4de785f8-9ae0-5266-9553-16eee37fd9bd', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 28, 'sun'::weekday, 'Characters and Settings', 'Week 2: Characters and Settings: Building Blocks of Story: Students will focus on creating compelling characters, settings, and conflicts.', '[]'::jsonb, 'Std: RL5.3 W5.3d
EE.RF5.4 EE.RL5.1', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e725b37a-b25b-5cdc-8954-9f6e505e5860', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 28, 'sun'::weekday, 'Formal vs. Informal', 'Week 2: Formal vs. Informal: Code-Switching Our Writing: Connect to real-life situations: letters to friends vs. school reports.', '[]'::jsonb, 'Std: L.5.3.B
EE.L.5.3.B', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['4c631127-5b29-5b2e-a627-773743b6b56a', 'c2affd1c-493a-5a66-bcf0-64bec2b6d461']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('23ee2c7f-ecc0-5f8a-a24a-050921458b2f', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 29, 'sun'::weekday, 'Day, Night & Seasons', 'Day, Night & Seasons
• Catch-up: complete prior week''s Sun investigation
• Session 1: Does the Sun Move? — Sun Chase, shadow tracking
• Session 2 (moved): Day, Night & Seasons — Spin the Earth demo
• Extension and research tasks
• Catch-up sessions', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 3 plan", "url": "https://docs.google.com/document/d/1qN8jim8QgUEfhOkxHk3DIeDmAkcuXQxz0p6c17RW-Vg/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ccc10b80-64c9-5304-afb1-59554629497a', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 29, 'sun'::weekday, 'Week 3', 'Week 3:
• Solving Equations: Addition & Subtraction (review)
• Solving Equations: Multiplication & Division (review)
• Mixed Operations Practice
• Applying One-Step Equations: Mixed Practice
• IXL Review and Formative (6.EE.B.7)', '[]'::jsonb, 'Std: M.5.NF.A.2
M.EE.5.NF.2', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['380a0c7d-3ff5-59ab-93f5-0effd6b365b0']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ebe9a56f-def8-578e-9706-62453ef2e953', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 29, 'sun'::weekday, 'Vocabulary & Reference Tools Strategies for determining…', 'Week 3: Vocabulary & Reference Tools Strategies for determining word meaning (context clues, dictionaries, thesauruses), practice using reference tools to enhance vocabulary.', '[]'::jsonb, 'Std: L5.2 L5.4
EE.L5.2 EE.L5.4', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('9d58b765-a022-576e-88c1-1b1924e52bce', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 29, 'sun'::weekday, 'Action! Plot and Conflict', 'Week 3: Action! Plot and Conflict: The Engine of Story: Students will learn to develop engaging plots with rising action, climax, and resolution.', '[]'::jsonb, 'Std: RL5.5 W5.3a
EE.RI5.1 EE.RL5.2', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('8ea6b96d-f47e-58ef-b3c2-98705ce0a7c8', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 29, 'sun'::weekday, 'Editing & Proofreading', 'Week 3: Editing & Proofreading: Finding Our Mistakes: Teach strategies and editing notation that students then use on their own writing.', '[]'::jsonb, 'Std: CC: L.5.2.E
EE.L.5.2.H', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e9645a88-4cd8-582d-8c6e-e282f069266d', '68cdafb3-ada1-537b-96cc-1e06aa3c01b8']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('803c50b0-d32d-5e23-b38b-d8e57e6d756a', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 30, 'sun'::weekday, 'Moon Phases & Eclipses', 'Moon Phases & Eclipses
• Moon phases / Earth-Moon-Sun system
• Eclipses and orbits
• Continue Earth''s rotation / revolution learning
• Practical demos with globe and flashlight
• TBD — confirm specific lesson list for 26-27', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 4 plan", "url": "https://docs.google.com/document/d/1FouG9dxHPgYmnQ9dPJ6bukwHgy_CVCUaBA9Mb3qGUUg/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('32d6aea1-5dd2-5d8f-80a0-637567c88120', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 30, 'sun'::weekday, 'Week 4', 'Week 4:
• Numerical Patterns (5.OA.B.3)
• Patterns on the Coordinate Plane
• The Coordinate Plane (5.G.A.1)
• Distance in the Coordinate Plane (5.G.A.2)
• Practice and Formative Assessment', '[]'::jsonb, 'Std: M.5.NF.A.1
M.EE.5.NF.1', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e42dd54a-74cf-59dc-b58e-e541fc427b8a']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e77fd52f-d8e7-5ec7-83bb-1afac8108f61', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 30, 'sun'::weekday, 'Making Connections', 'Week 4: Making Connections: Text, Self, and the World: Students deepen their understanding and engagement with texts by exploring text-to-self, text-to-text, and text-to-world connections. They discuss and write about how these co', '[]'::jsonb, 'Std: RL5.9 RI5.9
EE.RL5.9 EE.RI5.9', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f396fdd2-88dc-5819-b59a-4e1016c8af09', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 30, 'sun'::weekday, 'Show, Don''t Tell', 'Week 4: Show, Don''t Tell: Bringing Your Story to Life: Students will practice using descriptive language and sensory details to bring their stories to life.', '[]'::jsonb, 'Std: W5.3c W5.3d
EE.RF5.3 EE.RL5.1', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('620dbca1-ed93-599c-adaa-cd33da8816ea', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 30, 'sun'::weekday, 'Grammar in Action', 'Week 4: Grammar in Action: Analyzing and Correcting Real Writing: Use age-appropriate samples (news, stories) to identify grammar elements at work.', '[]'::jsonb, 'Std: L.5.1
L.5.2 EE.L.5.1
EE.L.5.2', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['2bc1f10b-84f1-5e6e-a034-9e627ac70d86', '67ac5c6c-843d-528b-b428-fe97d9e57f42']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6c71321e-4252-553d-9d65-d03a8951771c', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 31, 'sun'::weekday, 'Catch-Up & Review', 'Catch-Up & Review
• Catch-up / Review week
• Exit Point CANCELLED in 25-26 (parent attendance) — replan for 26-27
• Finish-off activities from previous weeks
• TBD — confirm content for 26-27
• TBD', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 5 plan", "url": "https://docs.google.com/document/d/1hWZ222aMzejpzbklQ3QNRU0aqDcKStAoHLvHwwGI0wQ/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c902401f-ef7e-5a7c-a598-4b1fc358c594', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 31, 'sun'::weekday, 'Week 5', 'Week 5:
• What is a Fraction? — Introduction
• Fractions on a Number Line
• Equivalent Fractions with Number Lines
• Simplifying Fractions
• Formative Assessment (IXL)', '[]'::jsonb, 'Std: M.5.NF.B.3
M.EE.5.NF.3', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['3e9aa654-1ef0-5286-bbfa-7969d0db37cf']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('828603ab-2667-5b15-9af3-5e094637ce6b', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 31, 'sun'::weekday, 'The Art of Debate', 'Week 5: The Art of Debate: Evidence & Reasoning: Students develop critical thinking and communication skills by engaging in structured debates. They learn to support their claims with evidence, construct logical arguments, and pra', '[]'::jsonb, 'Std: SL5.1 SL5.3
EE.SL5.1 EE.SL5.3', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('ea262973-73ba-5b77-b5ef-060b611344f9', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 31, 'sun'::weekday, 'Bringing Voices to Life', 'Week 5: Bringing Voices to Life: Using Dialogue - Let your characters speak! Learn how to use dialogue effectively.', '[]'::jsonb, 'Std: W5.3b W5.3d
EE.RF5.3 EE.RL5.1', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('89887449-f0ff-5463-95c8-43fdb75302db', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 31, 'sun'::weekday, 'Peer-Editing & Proofreading Our Friend’s Mistakes', 'Week 5: Peer-Editing & Proofreading Our Friend’s Mistakes:  Teach strategies and editing notation that students then use on their peers.', '[]'::jsonb, 'Std: L.5.2.E
EE.L.5.2.H', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['e9645a88-4cd8-582d-8c6e-e282f069266d', '68cdafb3-ada1-537b-96cc-1e06aa3c01b8']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('91aeb123-6caf-50c3-816c-84171ce4fe80', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 32, 'sun'::weekday, 'Catch-Up & Review', 'Catch-Up & Review
• Catch-up / Review week
• Finish-off activities from previous weeks
• TBD — confirm content for 26-27
• TBD
• TBD', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 6 plan", "url": "https://docs.google.com/document/d/17JNNMsnqATAXAWgzJPGY2_ZoFWgqG4ScxTr1j6M0kWo/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f94442b3-ae99-5ddd-b7f0-6117bea73725', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 32, 'sun'::weekday, 'Week 6', 'Week 6:
• Introduction to Percents
• Connecting Percents and Decimals
• Converting Percents and Fractions
• Ratios, Rates, and Percents in Context
• IXL Mastery Check: Fractions, Decimals, Percents', '[]'::jsonb, 'Std: M.5.NBT.A.3
M.EE.5.NBT.3', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['045d2b2b-29ac-5e11-837f-529feb1e40d2']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('709087de-c246-5ee9-bcaa-b04671208469', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 32, 'sun'::weekday, 'Bringing Texts to Life', 'Week 6: Bringing Texts to Life: Reader''s Theater & Performance: This week infuses creativity and collaboration into reading as students adapt texts for performance. They work together to create scripts, assign roles, rehearse, and', '[]'::jsonb, 'Std: RF5.4 SL5.4
EE.RF5.4 EE.SL5.4', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0a4f6f40-ac98-56d0-8ebd-18be7ce6d165', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 32, 'sun'::weekday, 'Reaching the Peak', 'Week 6: Reaching the Peak: Building Climax and Resolution: Create excitement and bring your story to a satisfying end.', '[]'::jsonb, 'Std: W5.3a W5.3b
EE.RI5.1 EE.RL5.2', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('93188f37-5dd8-5c83-940a-1fd61a958daa', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 32, 'sun'::weekday, 'Grammar Gurus', 'Week 6: Grammar Gurus: Putting It All Together: Students write a handbook, poster, presentation, or guide of a key area of English grammar, come up with their own examples, and present what they have learned to the class.', '[]'::jsonb, 'Std: L.5.1
L.5.2
EE.L.5.1 EE.L.5.2', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['2bc1f10b-84f1-5e6e-a034-9e627ac70d86', '3e10a176-a7c6-521b-b933-7e5a5cc3d23e']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('c4be4ecc-6f30-5d66-9fb3-d850b2592fda', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 33, 'sun'::weekday, 'MAP Focus & End-of-Unit Task', 'MAP Focus & End-of-Unit Task
• MAP testing focus areas this week
• End-of-Unit task work (G5 Team to confirm task design for 26-27)
• Continue Earth, Space content
• Differentiation as needed
• TBD — confirm details for 26-27', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 7 plan", "url": "https://docs.google.com/document/d/10dy4SNnt5VhvW75HP3__d3yjWMfriDrGE9XXAK9ZFm4/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b2363be1-2fa3-53ff-a380-19848f77c840', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 33, 'sun'::weekday, 'Week 7', 'Week 7:
• Percents — extended practice
• Connecting Percents and Decimals (deepen)
• Converting Percents and Fractions (deepen)
• Ratios, Rates, and Percents in Context
• IXL Mastery Check: Fractions, Decimals, Percents', '[]'::jsonb, 'Std: M.5.NF.B.3
M.EE.5.NF.3', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['3e9aa654-1ef0-5286-bbfa-7969d0db37cf']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6b2e8fcc-5f39-570a-970a-5d1d34991d8b', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 33, 'sun'::weekday, 'Independent Reading Adventures', 'Week 7: Independent Reading Adventures: Projects & Sharing: Students cultivate a love of reading through independent reading and student-choice projects. They select books based on their interests, set reading goals, and engage in', '[]'::jsonb, 'Std: RL5.10 RI5.10
EE.RL5.9 EE.RI5.9', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('7ab3b27e-106a-56aa-84bb-72d74384c0ef', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 33, 'sun'::weekday, 'Peer Review & Editing and Polishing', 'Week 7: Peer Review & Editing and Polishing: Students will engage in peer review to provide and receive feedback on their writing so that they can edit their story, grammar, mechanics, and clarity.', '[]'::jsonb, 'Std: W5.5
EE.RF5.4', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['dc8bda08-f548-5221-9323-08dcd62fadfe', '4847c54c-ec1a-5407-abf4-6f41a9357254']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6d80c4d8-e0f6-5060-9ff9-4feb89b5dbeb', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 33, 'sun'::weekday, 'Electronic editing and publication', 'Week 7: Electronic editing and publication: Students will take a piece of their writing and then learn how to use editing and publication software to perfect and publish their own writings.', '[]'::jsonb, 'Std: W.5.4
W.5.5
EE.W.5.4
EE.W.5.5', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['7e5609bc-8c68-5da0-9f94-503914356385', 'dce66c59-e5e8-5d0e-9bff-397ff95cf200', 'c670e5d5-2610-5682-b902-d8e1ac60a285', 'f3effafd-9d36-5222-ac09-2b06617be189']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4d791cd9-a242-5b0c-b1d3-07fc1abec6d3', 'd35d79bf-6c35-5d29-b7ea-3d67b1b9ff0e', '00000000-0000-0000-0000-0000000005d7', 34, 'sun'::weekday, 'Final Project & Unit Wrap-Up', 'Final Project & Unit Wrap-Up
• End-of-Unit assessment work
• Final project / Exit Point
• Review and reflection on Earth, Space and More
• TBD — confirm final week activities for 26-27
• TBD', '[]'::jsonb, 'Std: Earth Science Standards: Earth, Space, Astronomy', '[{"type": "doc", "label": "Week 8 plan", "url": "https://docs.google.com/document/d/1wK2grC2id2ckJ4zCr2A6qHnffZmK_V26hY6sn4l1Njo/edit", "provider": "gdocs", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('96e23f3d-849a-59c8-9cef-61a1300ebafe', 'a9c8e8b6-8492-59b2-884b-564febf22b88', '00000000-0000-0000-0000-0000000005d1', 34, 'sun'::weekday, 'Week 8', 'Week 8:
• Comparing Like Fractions
• Comparing Fractions Using Benchmarks
• Equivalent Fractions
• Practice with Equivalent Fractions
• Formative Assessment (IXL)', '[]'::jsonb, 'Std: M.5.NF.B.7
M.EE.5.NF.4', '[{"type": "link", "label": "Math: Algebra, FDP, Fractions", "url": "https://padlet.com/awsajprimary/unit-6-math-algebra-fdp-fractions-qknxyd29fpdha5kn", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['43c92756-d1b0-53ce-8551-b5d9d9e57093']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e2ecdbfc-eaf6-514e-a595-db162afc9d10', '28e56d40-c191-52c4-8b1e-be172fdb38f5', '00000000-0000-0000-0000-0000000005d2', 34, 'sun'::weekday, 'Unit Celebration & Reflection', 'Week 8: Unit Celebration & Reflection: The unit culminates with a celebration of learning. Students participate in activities that showcase their understanding of the key concepts covered throughout the eight weeks, followed by a', '[]'::jsonb, '', '[{"type": "link", "label": "Reading: Creative Expression", "url": "https://padlet.com/awsajprimary/unit-6-reading-creative-expression-oxkiyt5zunoa812t", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('61aafaa0-c1b9-5491-b54a-ee0f8c428c12', '0df9e44c-757f-5569-ab82-b3a2c0986495', '00000000-0000-0000-0000-0000000005d3', 34, 'sun'::weekday, 'Sharing and Celebrating Writing', 'Week 8: Sharing and Celebrating Writing: Students will share their final narratives through presentations, publications, or other creative means.', '[]'::jsonb, 'Std: W5.4 W5.6
EE.W5.6', '[{"type": "link", "label": "Writing: Fiction Writing", "url": "https://padlet.com/awsajprimary/unit-6-writing-fiction-writing-t2bti1vx405hel9e", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['b4cdf870-f999-5406-a6b0-7340550f4519']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('df5cfc4b-8239-579a-8c3b-146a1b8f067d', '0d607ffd-a95f-5ab4-9f56-aeb2e39d187e', '00000000-0000-0000-0000-0000000005d4', 34, 'sun'::weekday, 'Final Assessment & Reflection', 'Week 8: Final Assessment & Reflection: Grammar Superstars!: This can be a traditional test, a writing sample demonstrating mastery, or a combination.', '[]'::jsonb, 'Std: L.5.1
L.5.2
EE.L.5.1 EE.L.5.2', '[{"type": "link", "label": "Grammar: Editing", "url": "https://padlet.com/awsajprimary/unit-6-grammar-editing-coqap4d9k05wt8we", "provider": "website", "displayMode": "hyperlink"}]'::jsonb, array['2bc1f10b-84f1-5e6e-a034-9e627ac70d86', '3e10a176-a7c6-521b-b933-7e5a5cc3d23e']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d3bae72d-696c-525b-99e9-ed055b782632', '3a135d4a-b415-5f25-842a-59a849662139', '00000000-0000-0000-0000-0000000005d7', 35, 'sun'::weekday, 'Natural Disasters & Spiral Review', '', '[]'::jsonb, '', '[{"type": "doc", "label": "Week 1 plan", "url": "https://drive.google.com/open?id=1we3bp6fMXeeXHHquPCjg5MRy85lF6JNm", "provider": "gdrive", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e3788809-9e5e-59f5-ad40-ebb1e024aafa', '46e7394d-7331-57a6-8946-5b93f72742eb', '00000000-0000-0000-0000-0000000005d1', 35, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('089737f3-6c50-5ff1-b63e-77d3d57270c0', 'ab4ceb52-b676-5398-a355-12897004262e', '00000000-0000-0000-0000-0000000005d2', 35, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e188ef06-5acb-53c1-b495-ebb8975f6f52', '8ef80640-a29f-57bf-b368-0330b6983ab8', '00000000-0000-0000-0000-0000000005d3', 35, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('121c95e3-71e2-585f-968a-93dda2b872cd', '305c0370-4aeb-5fd3-a5aa-62f3edee37a2', '00000000-0000-0000-0000-0000000005d4', 35, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5c37c1e8-ecfd-5516-aa13-eeccf6d4943e', '3a135d4a-b415-5f25-842a-59a849662139', '00000000-0000-0000-0000-0000000005d7', 36, 'sun'::weekday, 'Natural Disasters & Spiral Review', '', '[]'::jsonb, '', '[{"type": "doc", "label": "Week 2 plan", "url": "https://drive.google.com/open?id=17NiEwdwr9rXgb4NEWUqZLZdavt7MuD7B", "provider": "gdrive", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('09d20306-a43b-5c46-bd27-847251ff8ed4', '46e7394d-7331-57a6-8946-5b93f72742eb', '00000000-0000-0000-0000-0000000005d1', 36, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a1fed955-effd-5a3a-a2d7-0dfbab83b9e1', 'ab4ceb52-b676-5398-a355-12897004262e', '00000000-0000-0000-0000-0000000005d2', 36, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('23cc527b-abf1-526f-949f-cead2b5ffcfa', '8ef80640-a29f-57bf-b368-0330b6983ab8', '00000000-0000-0000-0000-0000000005d3', 36, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('41832100-cbc6-5400-ad69-3f9cdd98990d', '305c0370-4aeb-5fd3-a5aa-62f3edee37a2', '00000000-0000-0000-0000-0000000005d4', 36, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e88e4ed4-0ffe-5433-8c98-54100165f121', '3a135d4a-b415-5f25-842a-59a849662139', '00000000-0000-0000-0000-0000000005d7', 37, 'sun'::weekday, 'Natural Disasters & Spiral Review', '', '[]'::jsonb, '', '[{"type": "doc", "label": "Week 3 plan", "url": "https://drive.google.com/open?id=1kHjw03D8RX_jujpLm_31v_D_2sgZT2zp", "provider": "gdrive", "displayMode": "hyperlink"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6b48bb59-6705-5e3c-bacb-7d57ec0ee26e', '46e7394d-7331-57a6-8946-5b93f72742eb', '00000000-0000-0000-0000-0000000005d1', 37, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('edb58f9f-0584-56ab-abea-b5ecbf7c3f94', 'ab4ceb52-b676-5398-a355-12897004262e', '00000000-0000-0000-0000-0000000005d2', 37, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('73db702a-5b83-5c72-94e8-c7ed28ef2237', '8ef80640-a29f-57bf-b368-0330b6983ab8', '00000000-0000-0000-0000-0000000005d3', 37, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('2be1e7e5-f3bd-546a-9ea9-b1f71d7dfd08', '305c0370-4aeb-5fd3-a5aa-62f3edee37a2', '00000000-0000-0000-0000-0000000005d4', 37, 'sun'::weekday, 'Spiral Review', 'End-of-year spiral review.', '[]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 3)
  on conflict (id) do nothing;

-- Done: 1 school year (2026-2027), 108 standards, 35 units, 185 lessons.
