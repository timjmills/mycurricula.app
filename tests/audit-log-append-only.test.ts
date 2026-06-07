import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// Text-invariant guardrails for the audit_log append-only hardening migration
// (supabase/migrations/20260607140000_audit_log_append_only.sql).
//
// Same convention as claude-access-log-reconcile.test.ts: this repo has no DB
// test harness, so we lock in the load-bearing SECURITY guarantee over the
// migration TEXT — that audit_log's owner gate is SELECT-only (append-only),
// never FOR ALL. The live posture (claude_admin_all dropped; SELECT-only owner
// read; SECURITY DEFINER log_audit_event() remains the only write path) was
// verified against the linked DB on 2026-06-07; these assertions stop a future
// edit from silently re-opening the UPDATE/DELETE tamper vector in CI.
// ───────────────────────────────────────────────────────────────────────────

const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260607140000_audit_log_append_only.sql",
);
const sql = readFileSync(MIGRATION_PATH, "utf8");

// Executable SQL only — strip line-comments so assertions never trip over the
// header prose (which legitimately names the retired `claude_admin_all FOR ALL`
// policy and the `for all` distinction it is closing).
const sqlCode = sql.replace(/--[^\n]*/g, "");

describe("audit_log append-only — retires the FOR-ALL tamper vector", () => {
  it("enables row level security", () => {
    expect(sqlCode).toMatch(
      /alter table public\.audit_log enable row level security/i,
    );
  });

  it("drops the claude_admin_all FOR-ALL policy on audit_log", () => {
    expect(sqlCode).toMatch(
      /drop policy if exists "claude_admin_all" on public\.audit_log/i,
    );
  });

  it("re-creating the read policy is idempotent (drops claude_admin_read first)", () => {
    expect(sqlCode).toMatch(
      /drop policy if exists "claude_admin_read" on public\.audit_log/i,
    );
  });

  it("never re-introduces a FOR-ALL policy in executable SQL", () => {
    // The only `create policy` this migration runs must be SELECT-only. A future
    // edit that restored FOR ALL (the tamper vector) would fail here.
    expect(sqlCode).not.toMatch(/create policy[\s\S]*?for all/i);
  });
});

describe("audit_log append-only — owner read is SELECT-only and gated", () => {
  it("owner read policy is claude_admin_read, SELECT-only, gated by is_claude_admin()", () => {
    const policy = sql.match(/create policy "claude_admin_read"[\s\S]*?;/i);
    expect(policy, "claude_admin_read policy should exist").not.toBeNull();
    expect(policy![0]).toMatch(/on public\.audit_log/i);
    expect(policy![0]).toMatch(/for select/i);
    expect(policy![0]).not.toMatch(/for all/i);
    expect(policy![0]).toMatch(/to authenticated/i);
    expect(policy![0]).toMatch(/using \(public\.is_claude_admin\(\)\)/i);
  });

  it("never widens reads to everyone (no USING (true))", () => {
    expect(sqlCode).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("leaves the pre-existing admin read policy (audit_log_read) untouched", () => {
    // audit_log_read is a correctly-scoped SELECT-only admin policy, not a
    // tamper vector — this migration must NOT drop it. Guard against a future
    // edit that over-reaches and clears it.
    expect(sqlCode).not.toMatch(/drop policy[^\n]*"audit_log_read"/i);
  });
});
