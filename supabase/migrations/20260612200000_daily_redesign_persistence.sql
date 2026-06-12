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
-- whole by the Differentiation pane; null = never set. The object-typeof
-- check rejects scalar/array garbage at the door (the TS mapper is defensive
-- on read, but bad data should never land).

alter table master_core_lesson_events
  add column differentiation jsonb,
  add constraint master_events_differentiation_object
    check (differentiation is null or jsonb_typeof(differentiation) = 'object');
alter table personal_core_lesson_event_copies
  add column differentiation jsonb,
  add constraint personal_copies_differentiation_object
    check (differentiation is null or jsonb_typeof(differentiation) = 'object');
alter table personal_authored_lessons
  add column differentiation jsonb,
  add constraint personal_authored_differentiation_object
    check (differentiation is null or jsonb_typeof(differentiation) = 'object');

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
begin
  if p_owner_kind = 'personal_copy' then
    -- owner_lesson_id is the MASTER event id (the TS contract). The parent
    -- must exist; ownership of the section row itself is the policy's job.
    return exists (
      select 1 from master_core_lesson_events m
       where m.id = p_owner_lesson_id
    );
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

-- ── replace_lesson_sections: carry the two new section fields ──────────────
-- Same signature (uuid, text, uuid, uuid, jsonb) → existing grants
-- (authenticated) and the revoke-from-public stand. SECURITY INVOKER — RLS
-- still applies to the delete + insert exactly as before.

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
begin
  -- Reject non-array payloads outright. NULL used to silently clear the
  -- owner's rows — too easy to trigger by a serialization bug; an explicit
  -- clear is an EMPTY ARRAY.
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'replace_lesson_sections: p_sections must be a jsonb array'
      using errcode = 'check_violation';
  end if;

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
    p_grade_level_id,
    nullif(elem ->> 'template_section_id', '')::uuid,
    coalesce(elem ->> 'heading', ''),
    coalesce(elem ->> 'prompt', ''),
    coalesce(elem ->> 'body', ''),
    coalesce(elem -> 'resources', '[]'::jsonb),
    coalesce((elem ->> 'display_order')::integer, 0),
    nullif(elem ->> 'minutes', '')::integer,
    coalesce(nullif(elem ->> 'status', ''), 'idle')
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as elem;
end;
$$;
