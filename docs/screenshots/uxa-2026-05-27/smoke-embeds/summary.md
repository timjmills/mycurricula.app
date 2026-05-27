# Resource embed smoke test — 2026-05-27 (live deploy)

Live deploy: `https://mycurricula.app` Worker version `0a0e04b5-5c4c-4d66-b897-14402283a1f1`
Supabase migrations on remote: `20260518102823_initial_schema.sql` + `20260527120000_resources_embed_fields.sql` (pushed 2026-05-28).

## Smoke A — URL embed providers (`scripts/smoke-resource-embeds.mjs`)

For each of the 6 seeded fixtures in `lib/mock/lessons.ts`, deep-link to `/daily?lesson=<id>` and count iframe/img elements whose `src` matches the provider's canonical embed host.

| Provider | Lesson ID | Result | Iframe / img |
|---|---|---|---|
| Google Slides | `m-11-1` | ✓ | 1 iframe @ `docs.google.com/presentation/.../embed` |
| Google Drive PDF | `w-11-3` | ✓ | 1 iframe @ `drive.google.com/file/.../preview` |
| YouTube | `m-12-0` | ✓ | 1 iframe @ `youtube-nocookie.com/embed/...` |
| Vimeo | `m-12-1` | ✓ | 1 iframe @ `player.vimeo.com/video/...` |
| Google Doc | `r-12-0` | ✓ | 1 iframe @ `docs.google.com/document/.../preview` |
| Wikimedia image | `e-12-0` | ✓ | 1 `<img>` @ `upload.wikimedia.org/...` |

**Findings + fixes during smoke:** YouTube + Vimeo initially failed because `IframeEmbed` used the raw `resource.url` (watch page / `/<id>` URL, both with `X-Frame-Options: sameorigin`). Fixed in commit `23a21ac` by piping the URL through `parseResourceUrl()` so the renderer always uses the rewritten `/embed` form. CSP also needed `static.cloudflareinsights.com` in `script-src` (Cloudflare's auto-injected web-analytics beacon).

## Smoke B — Hosted file uploads (`scripts/smoke-r2-upload.mjs`)

End-to-end: bootstrap auth → POST `/api/resources/upload` → server presigns R2 URL via `lib/r2.ts` (SigV4) → PUT file directly to R2.

### Five file types — round-trip

| Type | MIME | Presign | R2 PUT |
|---|---|---|---|
| PDF | application/pdf | 200 | 200 ✓ |
| DOCX | application/vnd.openxmlformats…document | 200 | 200 ✓ |
| PNG | image/png | 200 | 200 ✓ |
| JPG | image/jpeg | 200 | 200 ✓ |
| WebP | image/webp | 200 | 200 ✓ |

### Size cap + mime allowlist

| Request | Expected | Got | Response |
|---|---|---|---|
| 26 MB PDF (cap 25 MB) | 400 | 400 ✓ | `{"error":"too_large","cap":26214400}` |
| 6 MB image (cap 5 MB) | 400 | 400 ✓ | `{"error":"too_large","cap":5242880}` |
| `application/zip` (off allowlist) | 400 | 400 ✓ | `{"error":"bad_mime","detail":"application/zip"}` |
| 25 MB PDF (at cap) | 200 | 200 ✓ | resource_id minted |
| 5 MB image (at cap) | 200 | 200 ✓ | resource_id minted |

## Not covered by this smoke

- **11th-file rejection** (count cap). Would require uploading 10 + checking the 11th rejects with `file_limit` / `image_limit`. The DB trigger backstops; not exercised here.
- **RLS** (team scoping) — the upload route used the bypass user. Cross-teacher visibility untested.
- **`/api/resources` POST** (finalize-row after R2 PUT). The PUT lands the bytes; the row-finalize call has not been exercised yet.
- **OG preview** beyond `example.com`. Quick sanity check returned `{"title":"Example Domain","domain":"example.com","canEmbed":true}` ✓.

## Live URLs / IDs for follow-up

- Supabase project: `xuukfpvonsbvvbspsrsl`
- R2 bucket: `lesson-resources` on account `009d3815b362e176031f124202abbcf9`
- Worker version: `0a0e04b5-5c4c-4d66-b897-14402283a1f1`
- Owner event IDs used in smoke:
  - `00000000-0000-0000-0000-000000000001` — 5 round-trip uploads (2 docs + 3 images)
  - `00000000-0000-0000-0000-000000000002` — 2 cap-accepts (25 MB PDF + 5 MB image)
