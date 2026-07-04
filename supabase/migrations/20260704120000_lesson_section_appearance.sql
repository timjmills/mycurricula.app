-- ###########################################################################
-- Lesson-section appearance (W3.8 v2 lesson editor — D2/D3)
--
-- WHY: the v2 lesson editor gives every section a wash color (a curated
-- design-token NAME, e.g. '--subj-10-bright' — NEVER a hex; the client
-- resolves it through tokens.css so all six themes re-tint it) and a tint
-- scope ('header' = banner only, 'field' = banner + body field, the
-- default). Without columns these round-trip nowhere and silently revert on
-- reload under the planner flag — the same false-success class the 6.12.26
-- minutes/status migration closed.
--
-- LAUNCH-COUPLED — NOT applied to any database yet (task #13 pattern): this
-- file ships in-repo with the v2 wave and is applied as part of the v2
-- launch runbook, BEFORE the code that selects the new columns deploys
-- (lib/planner/supabase-source.ts lists them in SECTION_COLS, so the code
-- half of this change must not reach prod ahead of the migration).
--
-- Backward/forward safe for the DEPLOYED v1 app:
--   • Columns are additive + nullable — v1 code neither selects nor writes
--     them; NULL means "no stored appearance" and the client falls back to
--     its round-robin default wash.
--   • replace_lesson_sections keeps the SAME signature
--     (uuid, text, uuid, uuid, jsonb) — existing grants stand and v1
--     callers, whose p_sections elements simply lack the `color` /
--     `tint_scope` keys, keep working: absent keys coalesce to NULL.
--     (A v1 full-list replace of a v2-authored lesson therefore RESETS its
--     stored appearance to NULL — the documented cost of the v1 RPC's
--     replace semantics, and the client falls back to default washes.)
--
-- PRIVACY (plan §11.4): appearance is teacher lesson STRUCTURE — no student
-- data.
-- ###########################################################################

-- ── lesson_sections: wash color + tint scope ────────────────────────────────

alter table lesson_sections
  add column color      text,
  add column tint_scope text;

-- `color` stores a CSS custom-property NAME from the client's curated ramp
-- (lib/lesson-flow.ts SECTION_SWATCH_TOKENS). The format CHECK pins the
-- token-name shape so a raw hex, url(), or any CSS-injection payload can
-- never land; the client additionally allowlists against the exact ramp
-- before injecting the value into an inline style (defense in depth).
alter table lesson_sections
  add constraint lesson_sections_color_token
    check (color is null or color ~ '^--[a-z0-9-]{1,64}$'),
  add constraint lesson_sections_tint_scope_enum
    check (tint_scope is null or tint_scope in ('header', 'field'));

-- ── replace_lesson_sections: carry the two new appearance fields ────────────
-- Same signature (uuid, text, uuid, uuid, jsonb) → existing grants
-- (authenticated) and the revoke-from-public stand; SECURITY INVOKER — RLS
-- still applies to the delete + insert exactly as before. Identical to the
-- 20260612200000 revision except:
--   • the element validation loop additionally requires `color` and
--     `tint_scope` (when present) to be json strings or null — a malformed
--     payload still raises BEFORE the delete;
--   • `tint_scope` values are validated in the same pre-delete pass (so a
--     bad value can never abort the transaction mid-replace via the table
--     CHECK), and `color` is format-checked to the token-name shape;
--   • the insert carries both columns, with absent/empty keys → NULL
--     (backward-compatible: v1 payloads omit the keys entirely).

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
       -- W3.8 appearance fields — optional; when present, string or null.
       or jsonb_typeof(coalesce(elem -> 'color', '""'::jsonb))
            not in ('string', 'null')
       or jsonb_typeof(coalesce(elem -> 'tint_scope', '""'::jsonb))
            not in ('string', 'null')
    then
      raise exception 'replace_lesson_sections: malformed section element'
        using errcode = 'check_violation';
    end if;
    -- Value-level validation BEFORE the delete, mirroring the table CHECKs,
    -- so an out-of-range value raises up front instead of aborting the
    -- transaction mid-insert. Empty string is treated as absent (→ NULL).
    if nullif(elem ->> 'color', '') is not null
       and (elem ->> 'color') !~ '^--[a-z0-9-]{1,64}$' then
      raise exception 'replace_lesson_sections: color must be a css token name'
        using errcode = 'check_violation';
    end if;
    if nullif(elem ->> 'tint_scope', '') is not null
       and (elem ->> 'tint_scope') not in ('header', 'field') then
      raise exception 'replace_lesson_sections: invalid tint_scope'
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
    status,
    color,
    tint_scope
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
    coalesce(nullif(elem2 ->> 'status', ''), 'idle'),
    nullif(elem2 ->> 'color', ''),
    nullif(elem2 ->> 'tint_scope', '')
  from jsonb_array_elements(p_sections) as elem2;
end;
$$;

-- Grants: CREATE OR REPLACE on the same signature preserves existing ACLs,
-- but restate them so this file is self-contained (mirrors 20260604150000).
revoke execute on function replace_lesson_sections(uuid, text, uuid, uuid, jsonb) from public;
grant execute on function replace_lesson_sections(uuid, text, uuid, uuid, jsonb) to authenticated;
