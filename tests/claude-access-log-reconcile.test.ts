import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// Text-invariant guardrails for the claude_access_log reconcile migration
// (supabase/migrations/20260607120000_claude_access_log_reconcile.sql).
//
// Same convention as workspace-notebook-admin.test.ts: this repo has no DB test
// harness, so we lock in the load-bearing SECURITY + REPAIR guarantees over the
// migration TEXT. The runtime behaviors (owner-only read, success-row insert with
// reason=NULL, drift repair) were verified end-to-end against the live DB on
// 2026-06-07; these assertions stop a future edit from silently dropping one of
// the guarantees in CI.
// ───────────────────────────────────────────────────────────────────────────

const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260607120000_claude_access_log_reconcile.sql",
);
const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("claude_access_log reconcile — owner gate", () => {
  it("defines is_claude_admin() as SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(
      /create or replace function public\.is_claude_admin\(\)/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path to ''/i);
  });
});

describe("claude_access_log reconcile — the schema audit() writes", () => {
  it("creates the canonical table with ok + pathname NOT NULL", () => {
    expect(sql).toMatch(
      /create table if not exists public\.claude_access_log/i,
    );
    expect(sql).toMatch(/ok\s+boolean\s+not null/i);
    expect(sql).toMatch(/pathname\s+text\s+not null/i);
  });

  it("repairs a drifted old-shape table via guarded renames", () => {
    expect(sql).toMatch(/rename column success to ok/i);
    expect(sql).toMatch(/rename column path to pathname/i);
  });

  it("guarantees reason exists and is NULLABLE (success rows log reason=NULL)", () => {
    // add-if-not-exists BEFORE drop-not-null so a sparse drifted table can't error.
    const reasonAdd = sql.search(/add column if not exists reason text/i);
    const reasonDrop = sql.search(/alter column reason drop not null/i);
    expect(
      reasonAdd,
      "reason add-if-not-exists must be present",
    ).toBeGreaterThan(-1);
    expect(reasonDrop, "reason drop-not-null must be present").toBeGreaterThan(
      -1,
    );
    expect(reasonAdd).toBeLessThan(reasonDrop);
  });

  it("reloads the PostgREST schema cache after column changes", () => {
    expect(sql).toMatch(/notify pgrst, 'reload schema'/i);
  });
});

describe("claude_access_log reconcile — RLS is owner-only and tamper-proof", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/enable row level security/i);
  });

  it("clears ALL pre-existing policies deterministically before recreating", () => {
    // RLS policies are permissive (OR'd); a stale broad policy under any name
    // would re-open the leak, so the migration drops every existing policy first.
    expect(sql).toMatch(/from pg_policies/i);
    expect(sql).toMatch(
      /drop policy if exists %I on public\.claude_access_log/i,
    );
  });

  it("owner read policy is SELECT-only (never FOR ALL) and gated by is_claude_admin()", () => {
    const policy = sql.match(/create policy "claude_admin_read"[\s\S]*?;/i);
    expect(policy, "claude_admin_read policy should exist").not.toBeNull();
    expect(policy![0]).toMatch(/for select/i);
    expect(policy![0]).not.toMatch(/for all/i);
    expect(policy![0]).toMatch(/using \(public\.is_claude_admin\(\)\)/i);
  });

  it("never restores the broad authenticated-read policy (no USING (true))", () => {
    // Strip SQL line-comments first: the migration's prose legitimately mentions
    // the retired `authenticated selects USING (true)` policy, and we only want
    // to assert over executable SQL, not documentation.
    const sqlCode = sql.replace(/--[^\n]*/g, "");
    expect(sqlCode).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sqlCode).not.toMatch(/create policy "authenticated selects"/i);
  });

  it("keeps writes service-role-only", () => {
    const ins = sql.match(/create policy "service_role inserts"[\s\S]*?;/i);
    expect(ins, "service_role inserts policy should exist").not.toBeNull();
    expect(ins![0]).toMatch(/for insert/i);
    expect(ins![0]).toMatch(/to service_role/i);
  });
});
