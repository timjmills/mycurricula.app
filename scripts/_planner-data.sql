-- Planner data (units + standards + lessons). Idempotent.
-- Generated from lib/mock by scripts/gen-planner-sql.mjs.

-- Units
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000000c1', 'Unit 3 · Fractions on a Number Line', 9, 14)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d2', '00000000-0000-0000-0000-0000000000c1', 'Unit 2 · Realistic Fiction', 7, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('cd202763-bed9-5cab-a204-45e778301f39', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d3', '00000000-0000-0000-0000-0000000000c1', 'Unit 3 · Personal Narrative', 10, 15)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('2afe4da9-9c2b-5238-a362-9b1272a72426', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d4', '00000000-0000-0000-0000-0000000000c1', 'Unit 2 · Verb Tense & Agreement', 8, 13)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('447a2ee3-40a2-598a-97b5-00d84ebe1b3c', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000000c1', 'List 12 · Greek Roots', 12, 12)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d6', '00000000-0000-0000-0000-0000000000c1', 'Lessons 84–92 · Multisyllabic Words', 9, 14)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('3b713686-18d7-5696-bcd8-a0fed28d5085', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000000c1', 'Unit 2 · Ancient Egypt', 8, 14)
  on conflict (id) do nothing;
insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)
  values ('e0a402e1-3504-5e7f-9a59-3c95bf94c731', '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000005d8', '00000000-0000-0000-0000-0000000000c1', 'Unit 2 · Conflict & Resolution', 9, 12)
  on conflict (id) do nothing;

-- Standards framework (CCSS) + grade assignment
insert into standards_frameworks (id, name, short_code, provenance)
  values ('9bf19ac5-57a2-553e-a83c-9f35df33a996', 'Common Core State Standards', 'CCSS', 'catalog')
  on conflict (id) do nothing;
insert into grade_framework_assignments (id, grade_level_id, framework_id)
  values ('7d49cd05-a625-5d16-8ffb-3f4e8ca2113c', '00000000-0000-0000-0000-0000000000b5', '9bf19ac5-57a2-553e-a83c-9f35df33a996')
  on conflict (id) do nothing;

-- Standards
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('446a3c8d-d4f9-58e1-8edb-103b035fac2d', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', '5.NF.B.3', 'Interpret a fraction as division of the numerator by the denominator (a/b = a ÷ b).')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('50080ca7-a983-51ff-bada-6ca062019db2', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', '5.NF.B.4', 'Apply and extend previous understandings of multiplication to multiply a fraction by a fraction.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('1725655b-e780-5c08-b630-090183a626d9', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', '5.NF.A.1', 'Add and subtract fractions with unlike denominators.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('4e1ab698-bce2-5235-9313-6f64f51837cd', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', '5.NF.A.2', 'Solve word problems involving addition and subtraction of fractions.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('8229994a-6b86-5239-95bb-729b2ab4e0b0', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', '5.NBT.B.5', 'Fluently multiply multi-digit whole numbers using the standard algorithm.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL.5.3', 'Compare and contrast two or more characters, settings, or events in a story.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('61b8841c-24fc-5b65-aeba-30a4921618e1', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL.5.6', 'Describe how a narrator''s or speaker''s point of view influences events.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('cea73b82-2cf7-5bf8-a512-db077149f870', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RL.5.2', 'Determine a theme of a story from details in the text.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('88439755-d52b-54a9-aaf9-6ba633858f0f', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.3', 'Write narratives to develop real or imagined experiences using effective technique.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('38c24224-876b-53e8-a401-92c52500113c', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'W.5.3.B', 'Use narrative techniques, such as dialogue, description, and pacing.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('e5b4eb4b-be06-5e65-8181-c89da058e4e3', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.C', 'Use verb tense to convey various times, sequences, states, and conditions.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('395b5165-beaa-5bed-9d89-a2eb51d5945f', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.1.D', 'Recognize and correct inappropriate shifts in verb tense.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('e9645a88-4cd8-582d-8c6e-e282f069266d', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'L.5.2.E', 'Spell grade-appropriate words correctly, consulting references as needed.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('66abf161-c5f5-58dc-844d-d2dfec099458', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RF.5.3', 'Know and apply grade-level phonics and word analysis skills.')
  on conflict (id) do nothing;
insert into standards (id, framework_id, grade_level_id, code, description)
  values ('dd21d2f2-a702-50a3-a23b-9c671dbf4492', '9bf19ac5-57a2-553e-a83c-9f35df33a996', '00000000-0000-0000-0000-0000000000b5', 'RF.5.4', 'Read with sufficient accuracy and fluency to support comprehension.')
  on conflict (id) do nothing;

-- Lessons (master core lesson events)
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f209d8b7-ff00-5487-90f5-d08d0338c9bd', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 11, 'mon'::weekday, 'Equivalent fractions — area models', 'Fold-and-shade activity building equivalent fractions, then a gallery walk comparing strategies.', '["I can generate equivalent fractions with area models."]'::jsonb, '', '[{"type":"slides","label":"Area model deck","url":"https://docs.google.com/presentation/d/1eu3J4tLkTpW2gC2DLrNgVH71Hjt7sHM9Ie4yWNL2u0Y/edit","provider":"gslides"}]'::jsonb, array['1725655b-e780-5c08-b630-090183a626d9']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f8df161d-f1bc-5072-8125-caf6036e0c25', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 11, 'tue'::weekday, 'Wonder, chs 10–13 — character study', 'Compare August and Jack across three scenes; chart what each notices and fears.', '["I can compare two characters using text evidence."]'::jsonb, '', '[{"type":"doc","label":"Character chart"}]'::jsonb, array['b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('cb9abc18-316c-5849-903a-bd98d1f2ffe0', 'cd202763-bed9-5cab-a204-45e778301f39', '00000000-0000-0000-0000-0000000005d3', 11, 'wed'::weekday, 'Narrative planning — story arc', 'Students map their chosen memory onto a five-point arc before drafting next week.', '["I can plan a personal narrative on a story-arc map."]'::jsonb, '', '[{"type":"pdf","label":"Story arc map","url":"https://drive.google.com/file/d/1n-jB_yJ8sZ4uV4dVL9z6KZpL_2H8KdH8X/view","provider":"gdrive"}]'::jsonb, array['88439755-d52b-54a9-aaf9-6ba633858f0f']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('183fd186-4460-5ad6-a43a-f844614c839c', '2afe4da9-9c2b-5238-a362-9b1272a72426', '00000000-0000-0000-0000-0000000005d4', 11, 'mon'::weekday, 'Verb tense — diagnostic', 'Short diagnostic to baseline the unit; results group students for the week.', '["I can show what I already know about verb tense."]'::jsonb, '', '[]'::jsonb, array['e5b4eb4b-be06-5e65-8181-c89da058e4e3']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('48f226ce-9236-5530-a495-97cadf9df2ae', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 11, 'thu'::weekday, 'Lesson 83 — review & probe', 'Cumulative review of closed and r-controlled syllables, then a one-page probe.', '["I can demonstrate decoding growth on the weekly probe."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('47c2ada9-c8cc-5ede-ba2d-61fd0a9699f4', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 12, 'sun'::weekday, 'Equivalent fractions warm-up', 'Number-talk routine: pairs find three equivalent fractions for 3/4, share strategies, then class consolidates the visual model on the board.', '["I can find three equivalent fractions for a given fraction."]'::jsonb, 'If they struggle, fall back to the strip diagrams from Lesson 22. Maya''s class skipped this in October — extend by 5min.', '[{"type":"youtube","label":"Fraction Basics","url":"https://www.youtube.com/watch?v=8E5K2dnyFOY","provider":"youtube","thumbnailUrl":"https://img.youtube.com/vi/8E5K2dnyFOY/hqdefault.jpg"},{"type":"slides","label":"Equivalent Fractions Deck","url":"https://docs.google.com/presentation/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcd/edit","provider":"gslides"},{"type":"image","label":"Fraction Wall Diagram","url":"https://upload.wikimedia.org/wikipedia/commons/4/45/Equivalent_fractions.svg","provider":"image","thumbnailUrl":"https://upload.wikimedia.org/wikipedia/commons/4/45/Equivalent_fractions.svg"},{"type":"pdf","label":"Fraction Wall Poster","url":"https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf","provider":"pdf"},{"type":"link","label":"Khan Academy — Equivalent Fractions","url":"https://www.khanacademy.org/math/arithmetic/fraction-arithmetic","provider":"website"},{"type":"doc","label":"Anchor Chart Template"},{"type":"pdf","label":"Fraction Examples Sheet"}]'::jsonb, array['446a3c8d-d4f9-58e1-8edb-103b035fac2d', '1725655b-e780-5c08-b630-090183a626d9']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('38c922b4-c670-5ac1-b3b7-40492df7f462', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 12, 'mon'::weekday, 'Fractions as division — bake sale problem', 'Open with the bake-sale anchor on slide 3. Give pairs 10 min to model. Pull two contrasting samples for the whole-class discussion. Closing exit ticket: one new problem of their own.', '["I can interpret a fraction as division and model it two ways."]'::jsonb, 'Pull aside Aya, Tariq, Lara if they''re still on the array model.', '[{"type":"slides","label":"Lesson 23 deck"},{"type":"doc","label":"Exit ticket"},{"type":"youtube","label":"Bar models (4min)","url":"https://vimeo.com/76979871","provider":"vimeo"}]'::jsonb, array['446a3c8d-d4f9-58e1-8edb-103b035fac2d']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('cc44f952-a567-5ea7-89ae-a88955b4bd69', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 12, 'mon'::weekday, 'Math centers (last 20 min)', 'Rotation chart on the back wall. Each station is 6 minutes. I sit at fluency to catch the bottom three.', '["I can fluently practice math facts and fractions at three stations."]'::jsonb, '', '[{"type":"pdf","label":"Station task cards"},{"type":"image","label":"Rotation chart"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e832c435-7cf0-5cfc-9120-ec0672f46405', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 12, 'tue'::weekday, 'Multiplying a fraction by a whole number', 'Concrete-pictorial-abstract sequence. Start with fraction tiles, move to area models, end with the algorithm.', '["I can multiply a fraction by a whole number using a model and equation."]'::jsonb, '', '[{"type":"slides","label":"CPA sequence"},{"type":"pdf","label":"Practice set B"}]'::jsonb, array['50080ca7-a983-51ff-bada-6ca062019db2']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('99abc29c-cc7b-53b4-9569-26fdf0c567fc', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 12, 'wed'::weekday, 'Mid-unit check — fractions', 'Independent 20-minute check covering equivalence, fractions as division, and multiplication of a fraction by a whole number.', '["I can show what I know about equivalence, division, and multiplication of fractions."]'::jsonb, '', '[{"type":"pdf","label":"Mid-unit check"}]'::jsonb, array['446a3c8d-d4f9-58e1-8edb-103b035fac2d', '50080ca7-a983-51ff-bada-6ca062019db2']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d4033662-6df2-5fe6-a44b-5a6ddddb084c', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 12, 'thu'::weekday, 'Re-engagement: error analysis', 'Look at three flawed student solutions on equivalent fractions. Identify the misconception, repair the work, then write a one-sentence rule.', '["I can identify and repair errors in fraction work."]'::jsonb, '', '[{"type":"slides","label":"Three flawed solutions"}]'::jsonb, array['1725655b-e780-5c08-b630-090183a626d9']::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('83fd6e4a-1ca4-5cf8-899d-7cdb69547a0c', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 12, 'sun'::weekday, 'Wonder, chs 14–17 — point of view', 'First-person narrator shift from August to Via. Students annotate three places the same event is reframed.', '["I can describe how a narrator''s point of view influences events."]'::jsonb, 'Lara was absent for ch 13 — have her partner with Sofia.', '[{"type":"doc","label":"Annotation sheet","url":"https://docs.google.com/document/d/1mGJ_yJ8sZ4uV4dVL9z6KZpL_2H8KdH8XzNgN6Hpx0fM/edit","provider":"gdocs"},{"type":"website","label":"Lit-circle prompts"}]'::jsonb, array['61b8841c-24fc-5b65-aeba-30a4921618e1', 'b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('433757e3-2b47-54db-9f27-c64c039b81b5', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 12, 'tue'::weekday, 'Literacy Centers (90 min)', 'Bell rings at 9:35 — Group A starts at reading, B at grammar, C at writing. Rotate at the chime. I conference at the writing station throughout.', '["I can rotate through three literacy stations and complete each task."]'::jsonb, 'Print rotation chart for the back wall. Tariq''s group should start at writing (he needs the longest at writing today).', '[{"type":"image","label":"Rotation chart"},{"type":"doc","label":"Conferring tracker"}]'::jsonb, array['b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7', '395b5165-beaa-5bed-9d89-a2eb51d5945f', '88439755-d52b-54a9-aaf9-6ba633858f0f']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('315c5b98-bf62-542d-8066-4b56161dc591', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 12, 'tue'::weekday, 'Inference workshop', 'Mini-lesson on inference using a short Eve Bunting passage, then partners apply to Wonder chs 18–20.', '["I can make text-based inferences using evidence and prior knowledge."]'::jsonb, '', '[{"type":"slides","label":"Inference mini"}]'::jsonb, array['b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('1a4a23b7-3792-5921-9d90-254b44f652ea', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 12, 'tue'::weekday, 'Small-group strategy — fluency', 'Pull three readers to the back table while the rest do partner reading. Cold-read passage, two re-reads, charted WPM.', '["I can re-read for fluency and track my words-per-minute."]'::jsonb, '', '[{"type":"pdf","label":"Cold-read passage"},{"type":"doc","label":"WPM tracking form"}]'::jsonb, array['dd21d2f2-a702-50a3-a23b-9c671dbf4492']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('d56b66b0-c78c-5f3a-a0d0-0544033c4c55', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 12, 'wed'::weekday, 'Theme mapping', 'Build a class theme map. Each student adds one piece of evidence from chapters 1–20 supporting kindness as a theme.', '["I can identify a theme of a story from details in the text."]'::jsonb, '', '[{"type":"slides","label":"Theme map template"}]'::jsonb, array['cea73b82-2cf7-5bf8-a512-db077149f870']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('b9cc7c50-f1b9-511d-b0ad-c3ad13930055', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 12, 'thu'::weekday, 'Independent reading + conferences', '20-min sustained silent reading; teacher conferences with 4 students rotating through fluency, comprehension, and goal-setting.', '["I can read independently and set one fluency goal."]'::jsonb, '', '[]'::jsonb, array['cea73b82-2cf7-5bf8-a512-db077149f870']::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('1bed3b42-eeb1-5d64-adc2-01cb973e0f77', 'cd202763-bed9-5cab-a204-45e778301f39', '00000000-0000-0000-0000-0000000005d3', 12, 'sun'::weekday, 'Lead sentences — three rewrites', 'Students rewrite the same opening three ways: with dialogue, with sensory detail, with a question. Share-out and class vote on strongest.', '["I can write three different effective leads for the same story."]'::jsonb, '', '[{"type":"slides","label":"Mentor leads"}]'::jsonb, array['88439755-d52b-54a9-aaf9-6ba633858f0f', '38c24224-876b-53e8-a401-92c52500113c']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('48838689-9193-5ca6-96c4-a980d5535c83', 'cd202763-bed9-5cab-a204-45e778301f39', '00000000-0000-0000-0000-0000000005d3', 12, 'tue'::weekday, 'Drafting day — narrative middle', '30-minute sustained drafting block on the rising action of their personal narrative. Quiet writing, music optional.', '["I can draft the rising action of my personal narrative."]'::jsonb, '', '[]'::jsonb, array['88439755-d52b-54a9-aaf9-6ba633858f0f']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('a469af14-7cda-593b-8c6b-9fb6d787bc0b', '2afe4da9-9c2b-5238-a362-9b1272a72426', '00000000-0000-0000-0000-0000000005d4', 12, 'sun'::weekday, 'Past, present, future review', 'Sort 18 sample sentences into three columns by verb tense. Identify three sentences with shifts.', '["I can sort sentences by verb tense and spot inconsistent shifts."]'::jsonb, '', '[{"type":"pdf","label":"Sort sheet"}]'::jsonb, array['e5b4eb4b-be06-5e65-8181-c89da058e4e3']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('2c25777f-ca0a-53c6-a1e4-6f6a507683f5', '2afe4da9-9c2b-5238-a362-9b1272a72426', '00000000-0000-0000-0000-0000000005d4', 12, 'tue'::weekday, 'Inappropriate shifts in tense', 'Edit a one-paragraph narrative that drifts between tenses. Highlight every verb, then rewrite consistently in past.', '["I can edit a paragraph to fix inappropriate shifts in tense."]'::jsonb, '', '[{"type":"doc","label":"Editing paragraph"}]'::jsonb, array['395b5165-beaa-5bed-9d89-a2eb51d5945f']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e317dd5f-f0d7-5b21-9110-ea193d02c460', '2afe4da9-9c2b-5238-a362-9b1272a72426', '00000000-0000-0000-0000-0000000005d4', 12, 'thu'::weekday, 'Quick check — verb tense', '10-question multiple-choice and 3 short-answer rewrites. Goes home as a study tool.', '["I can apply verb-tense rules in a short assessment."]'::jsonb, '', '[]'::jsonb, array['e5b4eb4b-be06-5e65-8181-c89da058e4e3', '395b5165-beaa-5bed-9d89-a2eb51d5945f']::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('11e45f46-a163-554c-9e0e-d7098a784801', '447a2ee3-40a2-598a-97b5-00d84ebe1b3c', '00000000-0000-0000-0000-0000000005d5', 12, 'sun'::weekday, 'List 12 introduction — Greek roots', 'Introduce -graph, -phone, -scope, -meter. Build five words from each root with the class. Send list home.', '["I can identify Greek roots and build new words from them."]'::jsonb, '', '[{"type":"pdf","label":"List 12"}]'::jsonb, array['e9645a88-4cd8-582d-8c6e-e282f069266d']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('4858aeb3-7b60-570a-83b6-905459dd9925', '447a2ee3-40a2-598a-97b5-00d84ebe1b3c', '00000000-0000-0000-0000-0000000005d5', 12, 'tue'::weekday, 'Word sort + sentence frames', 'Students sort the week''s 20 words by root, then write three sentences each using two roots. Pair-share.', '["I can sort spelling words by root and use two roots in a sentence."]'::jsonb, '', '[]'::jsonb, array['e9645a88-4cd8-582d-8c6e-e282f069266d']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5212df9e-cbb2-5080-8cb0-404d203ca1ca', '447a2ee3-40a2-598a-97b5-00d84ebe1b3c', '00000000-0000-0000-0000-0000000005d5', 12, 'thu'::weekday, 'Friday quiz', 'Standard dictation-style quiz on List 12. Includes two challenge words from previous lists.', '["I can spell List 12 words correctly under timed dictation."]'::jsonb, '', '[]'::jsonb, array['e9645a88-4cd8-582d-8c6e-e282f069266d']::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('fd8c1d13-5df9-5e4d-8d12-df2963202e24', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 12, 'sun'::weekday, 'Lesson 84 — closed syllables review', '10-min warm-up, blending drill, two decodable passages. Track decoding errors on the class form.', '["I can blend and read closed-syllable words at speed."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('11954f26-a81a-5f27-be75-27c11191e3c3', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 12, 'mon'::weekday, 'Lesson 85 — V/CV and VC/V split', 'Introduce the two patterns for syllable division before a single consonant. 12 words, marking syllables.', '["I can apply V/CV and VC/V division to read multisyllabic words."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('9f571626-b889-5925-981d-802c51e6ea48', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 12, 'tue'::weekday, 'Lesson 86 — practice & decodable', 'Re-read yesterday''s words at speed; new decodable passage with embedded V/CV words. Partner reading.', '["I can read a decodable passage with V/CV words accurately."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('7940d54b-1e98-5bf9-9453-49cccd1e9cd1', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 12, 'wed'::weekday, 'Lesson 87 — open syllables intro', 'Open-syllable rule. Sort 16 words by syllable type. Quick-check at end.', '["I can identify open syllables and read open-syllable words."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('0b0f62c6-c637-5cf8-92f0-bdcbf40b7a98', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 12, 'thu'::weekday, 'Lesson 88 — cumulative review', 'Sprint review of lessons 80–87. Mixed practice and a one-page progress probe.', '["I can demonstrate growth on the cumulative phonics probe."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 4)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('5998af95-4440-5f14-ab1c-435188c62d93', '3b713686-18d7-5696-bcd8-a0fed28d5085', '00000000-0000-0000-0000-0000000005d7', 12, 'mon'::weekday, 'Nile geography — why here?', 'Maps activity: students annotate four features of the Nile valley that made it attractive for civilization. Compare with Tigris/Euphrates next week.', '["I can explain why the Nile valley supported civilization."]'::jsonb, '', '[{"type":"image","label":"Nile satellite","url":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Story_arc.svg/640px-Story_arc.svg.png","provider":"image","thumbnailUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Story_arc.svg/640px-Story_arc.svg.png"},{"type":"pdf","label":"Annotation map"}]'::jsonb, '{}'::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6f69d86d-1b0f-5aa9-ab05-fd171d17db60', '3b713686-18d7-5696-bcd8-a0fed28d5085', '00000000-0000-0000-0000-0000000005d7', 12, 'wed'::weekday, 'Hieroglyphs cartouche workshop', 'Students build their own name cartouche in hieroglyphs using the phonetic alphabet handout. Display in the hallway.', '["I can build my own hieroglyph cartouche using the phonetic alphabet."]'::jsonb, 'Have extra cartouche strips ready — runs out fast. Glue, not tape.', '[{"type":"pdf","label":"Phonetic chart"},{"type":"image","label":"Sample cartouches"}]'::jsonb, '{}'::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('f7bfef1c-a56f-507a-bc8c-6e1b2437f9ff', 'e0a402e1-3504-5e7f-9a59-3c95bf94c731', '00000000-0000-0000-0000-0000000005d8', 12, 'tue'::weekday, 'Conflict — name it, claim it', 'Class circle. Students share one small recent conflict (anonymously written), the group identifies its trigger and one repair move.', '["I can name a recent conflict and identify one repair move."]'::jsonb, '', '[]'::jsonb, '{}'::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('9b87946c-3ac9-5066-828f-fa0ee1e45daa', 'b6c5d38c-136b-5d79-aca7-c941a974da5f', '00000000-0000-0000-0000-0000000005d1', 13, 'mon'::weekday, 'Adding fractions with unlike denominators', 'Build the need for a common denominator with fraction strips before introducing the procedure.', '["I can add fractions with unlike denominators using a common unit."]'::jsonb, '', '[{"type":"slides","label":"Common denominator deck"}]'::jsonb, array['1725655b-e780-5c08-b630-090183a626d9']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('df03c421-3dae-5bd3-b673-f8ee57c24bcb', 'ac3fb91e-f83d-504a-a2b7-f31871c14d71', '00000000-0000-0000-0000-0000000005d2', 13, 'sun'::weekday, 'Wonder, chs 21–24 — turning points', 'Track the shift in the playground conflict; students mark the moment the story changes direction.', '["I can identify a turning point and explain its effect on the plot."]'::jsonb, '', '[{"type":"doc","label":"Plot tracker"}]'::jsonb, array['b8e2eb84-84b9-5f2c-ba64-5e92ae39f0f7']::uuid[], 0)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('18ec5140-017b-5b8b-a6e7-500bd7264c45', 'cd202763-bed9-5cab-a204-45e778301f39', '00000000-0000-0000-0000-0000000005d3', 13, 'tue'::weekday, 'Drafting day — narrative ending', 'Sustained drafting block on the resolution; mini-lesson on three ways to end a narrative.', '["I can draft a satisfying ending for my personal narrative."]'::jsonb, '', '[]'::jsonb, array['88439755-d52b-54a9-aaf9-6ba633858f0f']::uuid[], 2)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('e5e65832-b31c-56a5-bca0-d0db12778ef1', '2afe4da9-9c2b-5238-a362-9b1272a72426', '00000000-0000-0000-0000-0000000005d4', 13, 'wed'::weekday, 'Subject–verb agreement', 'Sort tricky agreement cases (collective nouns, intervening phrases) and edit a short passage.', '["I can make subjects and verbs agree in number."]'::jsonb, '', '[]'::jsonb, array['e5b4eb4b-be06-5e65-8181-c89da058e4e3']::uuid[], 3)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('2784de31-af67-5088-b3c1-2dbeaf2520f8', 'e9c9b092-f6b7-54a9-b9c8-250c848a2cc9', '00000000-0000-0000-0000-0000000005d6', 13, 'mon'::weekday, 'Lesson 89 — vowel teams review', 'Review ai/ay, ee/ea, oa/ow; word sort and a decodable passage.', '["I can read words with common vowel teams accurately."]'::jsonb, '', '[]'::jsonb, array['66abf161-c5f5-58dc-844d-d2dfec099458']::uuid[], 1)
  on conflict (id) do nothing;
insert into master_core_lesson_events
  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)
  values ('6058b401-0687-5571-944f-3609b2e6d284', '3b713686-18d7-5696-bcd8-a0fed28d5085', '00000000-0000-0000-0000-0000000005d7', 13, 'thu'::weekday, 'Pyramids — engineering challenge', 'Stations on ramps, levers, and labor; groups present one technique to the class.', '["I can explain one technique used to build the pyramids."]'::jsonb, '', '[{"type":"image","label":"Pyramid diagrams"}]'::jsonb, '{}'::uuid[], 4)
  on conflict (id) do nothing;

-- Done: 8 units, 15 standards, 39 lessons.
