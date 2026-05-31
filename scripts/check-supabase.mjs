#!/usr/bin/env node
// scripts/check-supabase.mjs — preflight validator for the Supabase wiring.
//
// Reads .env.local (no extra deps — a tiny built-in dotenv parser), checks that
// every required env var is present AND not an obvious placeholder, then pings
// the Supabase REST endpoint with the anon key to confirm the project URL + key
// actually resolve. Prints a PASS/FAIL line per check and exits non-zero on any
// failure. Secrets are NEVER printed — only booleans and lengths.
//
// Usage:
//   node scripts/check-supabase.mjs            # reads .env.local
//   node scripts/check-supabase.mjs path/.env  # reads a custom env file
//
// Documented in docs/SUPABASE_SETUP.md (verification checklist).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── tiny .env parser ────────────────────────────────────────────────────────
// Good enough for KEY=VALUE lines: ignores blanks + `#` comments, strips
// matching surrounding quotes, and does NOT do shell interpolation.
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// ── output helpers ──────────────────────────────────────────────────────────
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let failures = 0;
let warnings = 0;

function pass(label, detail = "") {
  console.log(
    `${GREEN}PASS${RESET}  ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`,
  );
}
function fail(label, detail = "") {
  failures += 1;
  console.log(`${RED}FAIL${RESET}  ${label}${detail ? `  ${detail}` : ""}`);
}
function warn(label, detail = "") {
  warnings += 1;
  console.log(`${YELLOW}WARN${RESET}  ${label}${detail ? `  ${detail}` : ""}`);
}

// ── placeholder / dummy detection ───────────────────────────────────────────
// Flags the dummy values that ship in .env.local.example or a half-filled file.
const PLACEHOLDER_PATTERNS = [
  /your-?project/i,
  /your-?anon/i,
  /your-?service/i,
  /your-?google/i,
  /your-?project-ref/i,
  /example\.com/i,
  /localhost-?dummy/i,
  /^dummy/i,
  /changeme/i,
  /<.*>/, // angle-bracket templates like <from-supabase-dashboard>
  /xxxx/i,
];

function looksLikePlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

// ── load env ─────────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), process.argv[2] || ".env.local");
let env;
try {
  env = parseEnv(readFileSync(envPath, "utf8"));
} catch {
  console.log(`${RED}FAIL${RESET}  could not read env file at ${envPath}`);
  console.log(
    `\n${DIM}Copy .env.local.example to .env.local and fill it in:${RESET}\n  cp .env.local.example .env.local`,
  );
  process.exit(1);
}

console.log(`${DIM}Checking ${envPath}${RESET}\n`);

// ── required vars ────────────────────────────────────────────────────────────
// `minLen` is a heuristic floor that flags obviously-truncated keys. Real anon /
// service-role keys are JWTs (~200+ chars) or the newer sb_publishable_/sb_secret_
// keys; either way well above these floors.
const REQUIRED = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", minLen: 20, kind: "url" },
  // New-format keys (sb_publishable_… / sb_secret_…) are shorter than the legacy
  // JWTs; this floor stays below either real length but above an obvious cut-off.
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", minLen: 20, kind: "key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", minLen: 20, kind: "key" },
];

// Optional-but-recommended: warn (not fail) when missing/dummy.
const OPTIONAL = [
  { name: "NEXT_PUBLIC_GOOGLE_CLIENT_ID", minLen: 20, kind: "key" },
  { name: "CLAUDE_BYPASS_TOKEN", minLen: 16, kind: "key" },
  { name: "CLAUDE_USER_EMAIL", minLen: 6, kind: "email" },
];

function checkVar({ name, minLen, kind }, { optional }) {
  const value = env[name];
  const report = optional ? warn : fail;

  if (value === undefined || value === "") {
    report(`${name} is set`, optional ? "(optional — missing)" : "(missing)");
    return null;
  }
  if (looksLikePlaceholder(value)) {
    report(`${name} is real`, `still a placeholder/dummy value`);
    return null;
  }
  if (value.length < minLen) {
    report(`${name} length`, `only ${value.length} chars (looks truncated)`);
    return null;
  }
  if (kind === "url") {
    let u;
    try {
      u = new URL(value);
    } catch {
      report(`${name} is a valid URL`, "not parseable as a URL");
      return null;
    }
    if (u.protocol !== "https:") {
      report(`${name} uses https`, `protocol is ${u.protocol}`);
      return null;
    }
    if (/localhost|127\.0\.0\.1/.test(u.hostname)) {
      report(`${name} is a real project URL`, "points at localhost");
      return null;
    }
    pass(`${name} present`, `host=${u.hostname}`);
    return value;
  }
  if (kind === "email") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      report(`${name} is a valid email`, "not an email address");
      return null;
    }
    pass(`${name} present`, "(valid email)");
    return value;
  }
  // generic key
  pass(`${name} present`, `len=${value.length}`);
  return value;
}

console.log("Required:");
const url = checkVar(REQUIRED[0], { optional: false });
const anon = checkVar(REQUIRED[1], { optional: false });
checkVar(REQUIRED[2], { optional: false });

console.log("\nOptional (recommended for SSO + Claude bypass):");
for (const v of OPTIONAL) checkVar(v, { optional: true });

// ── live REST ping ───────────────────────────────────────────────────────────
// Hits ${URL}/rest/v1/ with the anon key. A reachable PostgREST root returns
// 200 (or 404 on some configs) — either proves the URL + key resolve. A 401
// means the anon key does not match the project; a network error means the URL
// is wrong / unreachable.
async function pingRest() {
  if (!url || !anon) {
    warn("REST ping skipped", "URL or anon key not valid above");
    return;
  }
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/`;
  console.log(`\nLive check:`);
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      signal: ac.signal,
    });
    clearTimeout(t);
    if (res.status === 401 || res.status === 403) {
      fail(
        "REST ping authenticates",
        `HTTP ${res.status} — anon key rejected by this project`,
      );
    } else if (res.ok || res.status === 404) {
      pass("REST ping reachable + key accepted", `HTTP ${res.status}`);
    } else {
      warn("REST ping returned an unexpected status", `HTTP ${res.status}`);
    }
  } catch (err) {
    const reason =
      err?.name === "AbortError"
        ? "timed out after 10s"
        : err?.message || String(err);
    fail("REST ping reachable", reason);
  }
}

await pingRest();

// ── summary ──────────────────────────────────────────────────────────────────
console.log("");
if (failures > 0) {
  console.log(
    `${RED}${failures} check(s) failed${RESET}${warnings ? `, ${warnings} warning(s)` : ""}.`,
  );
  console.log(`${DIM}See docs/SUPABASE_SETUP.md to resolve.${RESET}`);
  process.exit(1);
}
console.log(
  `${GREEN}All required checks passed${RESET}${warnings ? `, ${warnings} warning(s)` : ""}.`,
);
process.exit(0);
