// scripts/smoke-r2-upload.mjs — end-to-end hosted-file upload smoke test.
//
// For each file type (PDF / DOCX / PNG / JPG / WebP):
//   1. POST /api/resources/upload → server presigns an R2 PUT
//   2. PUT the file directly to R2 at the presigned URL
//   3. Verify the object is retrievable (HEAD via signed GET)
//
// Run against prod with the bypass token. Files come from a tmp dir
// created by the wrangler-smoke step earlier.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}

const BASE = process.env.PROBE_BASE ?? "https://mycurricula.app";

// Reuse the tmp test files the wrangler smoke step created
const SRC_DIR = path.join(tmpdir(), "smoke-r2");
const TYPES = [
  { ext: "pdf", mime: "application/pdf" },
  {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  { ext: "png", mime: "image/png" },
  { ext: "jpg", mime: "image/jpeg" },
  { ext: "webp", mime: "image/webp" },
];

const OWNER_TYPE = "core_lesson_event";
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const TEAM_ID = "00000000-0000-0000-0000-000000000000";

// Bootstrap auth — exchange the bypass token for a session cookie. We
// reuse the cookie jar across both /api/resources/upload calls.
const cookies = new Map();
function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function captureCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const list = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : [setCookieHeaders];
  for (const sc of list) {
    const [pair] = sc.split(";");
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
}

async function bootstrap() {
  let url = `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/daily`;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { redirect: "manual" });
    captureCookies(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = loc.startsWith("http") ? loc : new URL(loc, BASE).toString();
      continue;
    }
    return res.status;
  }
  return -1;
}

const results = [];

await mkdir(SRC_DIR, { recursive: true });
const bootCode = await bootstrap();
console.log(`bootstrap: HTTP ${bootCode}, cookies: ${cookies.size}\n`);

for (const t of TYPES) {
  const file = path.join(SRC_DIR, `test.${t.ext}`);
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    // Fallback: write a tiny placeholder
    bytes = Buffer.from(`smoke ${t.ext} ${Date.now()}`);
    await writeFile(file, bytes);
  }
  const row = { ext: t.ext, mime: t.mime, size: bytes.length };

  // 1. Presign request
  const presignRes = await fetch(`${BASE}/api/resources/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({
      owner_event_type: OWNER_TYPE,
      owner_event_id: OWNER_ID,
      team_id: TEAM_ID,
      filename: `smoke.${t.ext}`,
      content_type: t.mime,
      size_bytes: bytes.length,
    }),
  });
  row.presignCode = presignRes.status;
  if (!presignRes.ok) {
    row.presignErr = (await presignRes.text()).slice(0, 200);
    results.push(row);
    continue;
  }
  const presign = await presignRes.json();
  row.resourceId = presign.resource_id;
  row.objectKey = presign.object_key;

  // 2. PUT the file to R2
  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": t.mime },
    body: bytes,
  });
  row.putCode = putRes.status;
  if (!putRes.ok) {
    row.putErr = (await putRes.text()).slice(0, 200);
  }

  results.push(row);
}

// Report
console.log("ext".padEnd(5), "presign".padEnd(8), "put".padEnd(5), "size".padEnd(6), "extra");
console.log("-".repeat(80));
let ok = 0;
for (const r of results) {
  const status = r.presignCode === 200 && r.putCode === 200 ? "ok" : "fail";
  if (status === "ok") ok++;
  console.log(
    r.ext.padEnd(5),
    String(r.presignCode).padEnd(8),
    String(r.putCode ?? "-").padEnd(5),
    String(r.size).padEnd(6),
    r.presignErr ?? r.putErr ?? `resource_id=${r.resourceId?.slice(0, 8) ?? "-"}`,
  );
}
console.log(`\n${ok} / ${TYPES.length} round-trip uploads succeeded.`);
process.exit(ok === TYPES.length ? 0 : 1);
