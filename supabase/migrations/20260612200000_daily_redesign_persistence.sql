-- ###########################################################################
-- Daily redesign persistence (6.11.26 design_handoff_daily_view)
--
-- WHY: the /daily redesign added three teacher-editable fields that the UI
-- writes but the schema could not hold, so under the Supabase planner flag
-- they silently reverted on reload (false success):
--   • lesson_sections.minutes — a phase's planned length ("· 15 min").
--     Worse than non-persistence: any section write (e.g. tapping a status
--     chip) ran replace_lesson_sections, which dropped the template-seeded
--     minutes for EVERY phase of that lesson.
--   • lesson_sections.status — the per-phase teach-time chip
--     (idle | progress | done). Independent of lesson completion; never
--     forks a lesson (CLAUDE.md §2 — completion semantics unchanged).
--   • <lesson>.differentiation — the planning panel's Differentiation pane
--     (support / onLevel / extension rich-text tiers), one nullable jsonb
--     on each of the three lesson content tables.
--
-- PRIVACY (plan §11.4): all three are teacher lesson content — the same
-- class as directions/notes. STRUCTURE only; never student data.
--
-- Backward/forward safe: additive nullable columns (status carries the
-- 'idle' default the UI already assumes). Code deployed before this
-- migration ignores the columns; code deployed after reads/writes them.
-- ###########################################################################

-- ── lesson_sections: planned minutes + teach-time status ───────────────────

alter table lesson_sections
  add column minutes integer,
  add column status  text not null default 'idle';

-- UI clamps minutes to 0..999 (lesson-flow commitMinutes); mirror it here.
alter table lesson_sections
  add constraint lesson_sections_minutes_range
    check (minutes is null or (minutes >= 0 and minutes <= 999)),
  add constraint lesson_sections_status_enum
    check (status in ('idle', 'progress', 'done'));

-- ── differentiation jsonb on the three lesson content tables ───────────────
-- Shape: { "support": html, "onLevel": html, "extension": html } — written
-- whole by the Differentiation pane; null = never set. The shared validator
-- pins the EXACT shape (no extra keys, every present tier a string) so bad
-- data can never land and later read back as silently-blank panes.

create or replace function is_valid_differentiation(d jsonb)
returns boolean
language sql immutable
as $$
  select d is null or (
    jsonb_typeof(d) = 'object'
    and (d - 'support' - 'onLevel' - 'extension') = '{}'::jsonb
    and jsonb_typeof(coalesce(d -> 'support', '""'::jsonb)) = 'string'
    and jsonb_typeof(coalesce(d -> 'onLevel', '""'::jsonb)) = 'string'
    and jsonb_typeof(coalesce(d -> 'extension', '""'::jsonb)) = 'string'
  );
$$;

alter table master_core_lesson_events
  add column differentiation jsonb,
  add constraint master_events_differentiation_shape
    check (is_valid_differentiation(differentiation));
alter table personal_core_lesson_event_copies
  add column differentiation jsonb,
  add constraint personal_copies_differentiation_shape
    check (is_valid_differentiation(differentiation));
alter table personal_authored_lessons
  add column differentiation jsonb,
  add constraint personal_authored_differentiation_shape
    check (is_valid_differentiation(differentiation));

-- ── FIX: can_edit_lesson_section_parent's personal_copy contract ────────────
-- The TS planner source keys EVERY personal_copy section row by the
-- MASTER-facing lesson id (reads: getSections / getSectionsBatch query
-- owner_lesson_id = master id; writes pass the same id), but the
-- 20260604140000 validator required owner_lesson_id to equal the COPY row's
-- OWN uuid — an id the client never uses. Net effect: the parent-validation
-- trigger raised on every personal section save for a master-derived lesson,
-- so section persistence was broken under the planner flag. Re-point the
-- personal_copy branch at the master event (existence = referential
-- integrity; per-row OWNERSHIP stays enforced by the lesson_sections_write
-- policy's `owner_id = auth.uid()` arm, and a personal copy of the lesson is
-- NOT required — section rows are their own personal layer).

-- Resolve the parent lesson's grade for a section row (master events may
-- carry a null denormalized grade — fall back to the unit's). NULL = parent
-- missing/unresolvable; callers fail closed on it.
create or replace function lesson_section_parent_grade(
  p_owner_kind      lesson_owner_kind,
  p_owner_lesson_id uuid
)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_grade uuid;
begin
  if p_owner_kind = 'personal_authored' then
    select a.grade_level_id into v_grade
      from personal_authored_lessons a
     where a.id = p_owner_lesson_id;
  else
    select coalesce(m.grade_level_id, u.grade_level_id) into v_grade
      from master_core_lesson_events m
      left join units u on u.id = m.unit_id
     where m.id = p_owner_lesson_id;
  end if;
  return v_grade;
end;
$$;

revoke execute on function lesson_section_parent_grade(lesson_owner_kind, uuid) from public;
grant execute on function lesson_section_parent_grade(lesson_owner_kind, uuid) to authenticated;

create or replace function can_edit_lesson_section_parent(
  p_owner_kind      lesson_owner_kind,
  p_owner_lesson_id uuid
)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_subject uuid;
  v_grade uuid;
begin
  if p_owner_kind = 'personal_copy' then
    -- owner_lesson_id is the MASTER event id (the TS contract). The parent
    -- must exist AND sit in a grade the caller can read — visibility also
    -- closes the master-uuid existence oracle (an invisible master answers
    -- exactly like a missing one). Ownership of the section row itself is
    -- the write policy's job (owner_id = auth.uid()).
    v_grade := lesson_section_parent_grade(p_owner_kind, p_owner_lesson_id);
    if v_grade is null then
      return false;  -- parent missing / grade unresolvable → fail closed
    end if;
    return can_read_grade(v_grade);
  elsif p_owner_kind = 'personal_authored' then
    return exists (
      select 1 from personal_authored_lessons a
       where a.id = p_owner_lesson_id and a.owner_id = auth.uid()
    );
  elsif p_owner_kind = 'master' then
    select m.subject_id into v_subject
      from master_core_lesson_events m
     where m.id = p_owner_lesson_id;
    if v_subject is null then
      return false;  -- parent master lesson does not exist → fail closed
    end if;
    return can_edit_subject_master(v_subject);
  else
    return false;
  end if;
end;
$$;

-- The parent-validation trigger additionally pins the section row's
-- DENORMALIZED grade to the parent's: a direct INSERT (bypassing the RPC)
-- can no longer attach a row to a foreign grade's read scope.
create or replace function validate_lesson_section_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grade uuid;
begin
  if tg_op = 'UPDATE'
     and new.owner_kind = old.owner_kind
     and new.owner_lesson_id = old.owner_lesson_id
     and new.grade_level_id = old.grade_level_id then
    return new;  -- parent pointer + grade unchanged → validated on insert
  end if;

  if not can_edit_lesson_section_parent(new.owner_kind, new.owner_lesson_id) then
    raise exception 'lesson_section parent missing or not editable by caller'
      using errcode = 'check_violation';
  end if;

  v_grade := lesson_section_parent_grade(new.owner_kind, new.owner_lesson_id);
  if v_grade is null or new.grade_level_id <> v_grade then
    raise exception 'lesson_section grade does not match its parent lesson'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ── replace_lesson_sections: carry the two new section fields ──────────────
-- Same signature (uuid, text, uuid, uuid, jsonb) → existing grants
-- (authenticated) and the revoke-from-public stand. SECURITY INVOKER — RLS
-- still applies to the delete + insert exactly as before. Hardened:
--   • p_sections must be a jsonb ARRAY of OBJECTS with sane field types —
--     a malformed payload raises BEFORE the delete, so it can never replace
--     real rows with blank ones.
--   • the parent is authorized explicitly up front (no silent no-op
--     "success" for unauthorized callers whose DELETE RLS-filters to zero).
--   • grade_level_id is DERIVED from the parent lesson server-side; the
--     caller-supplied p_grade_level_id is only cross-checked. A direct
--     caller can therefore never attach section rows to a foreign grade.

create or replace function replace_lesson_sections(
  p_owner_lesson_id uuid,
  p_owner_kind      text,
  p_owner_id        uuid,
  p_grade_level_id  uuid,
  p_sections        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_grade uuid;
  elem jsonb;
begin
  -- Reject non-array payloads outright. NULL used to silently clear the
  -- owner's rows — too easy to trigger by a serialization bug; an explicit
  -- clear is an EMPTY ARRAY.
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'replace_lesson_sections: p_sections must be a jsonb array'
      using errcode = 'check_violation';
  end if;

  -- Validate EVERY element before touching any row: each must be an object,
  -- `resources` (when present) an array, scalars the expected json types.
  -- Raising here means a malformed payload can never half-replace content.
  for elem in select * from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(elem) <> 'object'
       or jsonb_typeof(coalesce(elem -> 'resources', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(elem -> 'heading', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(elem -> 'prompt', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(elem -> 'body', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(elem -> 'status', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(elem -> 'minutes', '0'::jsonb))
            not in ('number', 'null')
       or jsonb_typeof(coalesce(elem -> 'display_order', '0'::jsonb))
            <> 'number'
    then
      raise exception 'replace_lesson_sections: malformed section element'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Explicit parent authorization up front (defense in depth): without this,
  -- an unauthorized caller's DELETE is silently filtered by RLS and an empty
  -- insert reports false success. Same validator the write policy + parent
  -- trigger use, so the three stay in lock-step.
  if not can_edit_lesson_section_parent(
    p_owner_kind::lesson_owner_kind, p_owner_lesson_id
  ) then
    raise exception 'lesson_section parent missing or not editable by caller'
      using errcode = 'check_violation';
  end if;

  -- Derive the grade from the PARENT lesson server-side (shared helper —
  -- the same resolution the validation trigger pins rows to). The caller's
  -- p_grade_level_id is only cross-checked: a mismatch is a client bug or a
  -- forged write. Grade VISIBILITY for personal writes is enforced inside
  -- can_edit_lesson_section_parent above.
  v_grade := lesson_section_parent_grade(
    p_owner_kind::lesson_owner_kind, p_owner_lesson_id
  );
  if v_grade is null then
    raise exception 'replace_lesson_sections: parent grade unresolved'
      using errcode = 'check_violation';
  end if;
  if p_grade_level_id is not null and p_grade_level_id <> v_grade then
    raise exception 'replace_lesson_sections: grade mismatch with parent'
      using errcode = 'check_violation';
  end if;

  -- Clear the caller's existing rows for this lesson. `is not distinct from`
  -- matches a NULL owner_id (team/master sections) as well as a concrete owner,
  -- so the delete scope mirrors exactly what we are about to reinsert.
  delete from lesson_sections
   where owner_lesson_id = p_owner_lesson_id
     and owner_id is not distinct from p_owner_id
     and owner_kind = p_owner_kind::lesson_owner_kind;

  -- Reinsert one row per element of the JSON array. coalesce() reproduces the
  -- table defaults when a key is absent. An EMPTY array inserts nothing —
  -- leaving the lesson with no sections, the intended explicit "cleared"
  -- state (NULL is rejected above).
  insert into lesson_sections (
    owner_kind,
    owner_lesson_id,
    owner_id,
    grade_level_id,
    template_section_id,
    heading,
    prompt,
    body,
    resources,
    display_order,
    minutes,
    status
  )
  select
    p_owner_kind::lesson_owner_kind,
    p_owner_lesson_id,
    p_owner_id,
    v_grade,
    nullif(elem2 ->> 'template_section_id', '')::uuid,
    coalesce(elem2 ->> 'heading', ''),
    coalesce(elem2 ->> 'prompt', ''),
    coalesce(elem2 ->> 'body', ''),
    coalesce(elem2 -> 'resources', '[]'::jsonb),
    coalesce((elem2 ->> 'display_order')::integer, 0),
    nullif(elem2 ->> 'minutes', '')::integer,
    coalesce(nullif(elem2 ->> 'status', ''), 'idle')
  from jsonb_array_elements(p_sections) as elem2;
end;
$$;
