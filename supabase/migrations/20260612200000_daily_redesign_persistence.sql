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
-- whole by the Differentiation pane; null = never set.

alter table master_core_lesson_events         add column differentiation jsonb;
alter table personal_core_lesson_event_copies add column differentiation jsonb;
alter table personal_authored_lessons         add column differentiation jsonb;

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
  -- Clear the caller's existing rows for this lesson. `is not distinct from`
  -- matches a NULL owner_id (team/master sections) as well as a concrete owner,
  -- so the delete scope mirrors exactly what we are about to reinsert.
  delete from lesson_sections
   where owner_lesson_id = p_owner_lesson_id
     and owner_id is not distinct from p_owner_id
     and owner_kind = p_owner_kind::lesson_owner_kind;

  -- Reinsert one row per element of the JSON array. coalesce() reproduces the
  -- table defaults when a key is absent. A NULL p_sections (or a JSON array
  -- with zero elements) inserts nothing — leaving the lesson with no sections,
  -- which is the intended "cleared" state.
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
