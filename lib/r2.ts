// lib/r2.ts — AWS S3-compatible SigV4 presigner for Cloudflare R2.
//
// Exports:
//   • presignPut(key, contentType, opts) — URL the browser PUTs to.
//   • presignGet(key, opts)               — URL the browser GETs from,
//                                            optionally with inline disposition.
//   • headObject(key)                     — server-side authenticated HEAD that
//                                            returns the OBJECT's REAL content-
//                                            type + byte size (the security gate
//                                            for "verify the object, not the
//                                            client's claims").
//   • buildR2Key(scope, ownerEventId, resourceId, filename)
//                                         — compose a SERVER-BOUND object key.
//                                            The `scope` segment must be derived
//                                            from the authenticated user's
//                                            verified grade/team, NEVER a client
//                                            field.
//
// Why presigned URLs and not the Workers R2 binding for browser traffic:
// the binding only works server-side. To let the browser upload directly
// to R2 (avoiding a hop through the Worker), we presign a PUT. For reads
// we presign a GET so the Worker doesn't proxy every PDF/image stream.
//
// SECURITY NOTE (audit finding #10): a presigned PUT with UNSIGNED-PAYLOAD
// cannot bind the uploaded object's Content-Type or byte size — R2 stores
// whatever the browser sends. Therefore the upload route must NEVER trust the
// client-claimed MIME/size; after the PUT lands it must call `headObject()` and
// validate the REAL stored content-type + Content-Length against the allowlist
// and the size cap before any resource row is created.
//
// SigV4 reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
// R2 quirks:
//   • region is fixed to "auto"
//   • service is "s3"
//   • presigned URLs sign only `host`; payload is "UNSIGNED-PAYLOAD"
//   • the HEAD path signs `host` + an empty-body SHA-256 with an Authorization
//     header (a normal signed request, not a presigned URL).

const SERVICE = "s3";
const REGION = "auto";

interface PresignOpts {
  /** TTL on the presigned URL in seconds. Defaults: PUT 600s, GET 3600s. */
  expiresSeconds?: number;
}

export interface PresignGetOpts extends PresignOpts {
  /** Set `Content-Disposition: inline; filename="..."` so PDFs render in-browser. */
  inline?: boolean;
  /** Filename presented to the browser for save-as. */
  filename?: string;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function r2Host(): string {
  // e.g. <accountid>.r2.cloudflarestorage.com
  return env("R2_PUBLIC_HOST");
}

function bucket(): string {
  return env("R2_BUCKET");
}

// ── Web Crypto helpers ─────────────────────────────────────────────────────

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return toHex(hash);
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  msg: string,
): Promise<ArrayBuffer> {
  const keyBuf: BufferSource =
    key instanceof Uint8Array
      ? (key.buffer.slice(
          key.byteOffset,
          key.byteOffset + key.byteLength,
        ) as ArrayBuffer)
      : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Date formatting ────────────────────────────────────────────────────────

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
  // 20240101T120000Z / 20240101
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

// ── Canonical URI helpers ──────────────────────────────────────────────────

function uriEncode(s: string, encodeSlash = true): string {
  // AWS-style: every byte except [A-Za-z0-9-_.~]; '/' optionally exempt.
  let out = "";
  for (const c of s) {
    if (/^[A-Za-z0-9\-_.~]$/.test(c)) {
      out += c;
    } else if (c === "/" && !encodeSlash) {
      out += c;
    } else {
      for (const byte of new TextEncoder().encode(c)) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

// ── Core sign ──────────────────────────────────────────────────────────────

async function deriveSigningKey(
  secret: string,
  dateStamp: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(
    new TextEncoder().encode("AWS4" + secret),
    dateStamp,
  );
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

interface SignArgs {
  method: "PUT" | "GET";
  key: string;
  query: Record<string, string>;
  expiresSeconds: number;
}

async function presign(args: SignArgs): Promise<string> {
  const { method, key, query, expiresSeconds } = args;
  const accessKey = env("R2_ACCESS_KEY_ID");
  const secretKey = env("R2_SECRET_ACCESS_KEY");
  const host = r2Host();
  const { amzDate, dateStamp } = amzDates();
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  // Canonical request
  const canonicalUri = "/" + uriEncode(`${bucket()}/${key}`, false);
  const signedHeaders = "host";
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
    ...query,
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretKey, dateStamp);
  const signature = toHex(await hmac(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Presign a PUT URL the browser can upload directly to. The browser sends
 *  the file with `Content-Type: <contentType>`; the type is not part of the
 *  signed payload (we set X-Amz-Content-Sha256 = UNSIGNED-PAYLOAD), so any
 *  Content-Type the browser sends is accepted by R2. */
export async function presignPut(
  key: string,
  contentType: string,
  opts: PresignOpts = {},
): Promise<string> {
  // contentType is accepted for API symmetry; R2 honors whatever the browser
  // sends on the PUT. It's not signed.
  void contentType;
  return presign({
    method: "PUT",
    key,
    query: {},
    expiresSeconds: opts.expiresSeconds ?? 600,
  });
}

/** Presign a GET URL. When `inline` is true, the URL carries a
 *  `response-content-disposition=inline` override so PDFs / images render
 *  in-browser instead of triggering a save dialog. */
export async function presignGet(
  key: string,
  opts: PresignGetOpts = {},
): Promise<string> {
  const query: Record<string, string> = {};
  if (opts.inline) {
    const name = opts.filename
      ? `; filename="${opts.filename.replace(/"/g, "")}"`
      : "";
    query["response-content-disposition"] = `inline${name}`;
  }
  return presign({
    method: "GET",
    key,
    query,
    expiresSeconds: opts.expiresSeconds ?? 3600,
  });
}

/** Validate that a string is a plain UUID. The scope / owner-event / resource
 *  segments of an object key are all server-derived UUIDs; this guards against
 *  any path-traversal or prefix-injection sneaking in through a segment that
 *  was supposed to be server-controlled. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize a client-supplied filename to a safe leaf segment.
 *
 * The filename is the ONLY client-influenced part of the object key, so it is
 * locked down hard: strip any directory component, collapse anything that
 * isn't a conservative filename character, forbid leading dots (no `.` / `..`
 * traversal, no dotfiles), and cap the length. Always returns a non-empty
 * value (`file` when the input sanitizes to nothing).
 */
export function sanitizeFilename(filename: string): string {
  // Take only the basename — drop any path the client tried to embed.
  const base = String(filename ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!;
  // Allow letters, digits, dot, dash, underscore, space; replace the rest.
  let safe = base.replace(/[^A-Za-z0-9._\- ]/g, "_").trim();
  // Forbid leading dots so a crafted ".." / ".env" can't sneak through.
  safe = safe.replace(/^\.+/, "");
  // Collapse runs of separators and cap length to keep keys sane.
  safe = safe.replace(/\s+/g, " ").slice(0, 128).trim();
  return safe.length > 0 ? safe : "file";
}

/**
 * Compose a SERVER-BOUND R2 object key.
 *
 * **Security (audit #10):** every structural segment except the leaf filename
 * is a server-derived UUID and is validated here. `scope` MUST be the
 * authenticated user's verified grade/team id (resolved server-side) — never a
 * value taken from the request body. `ownerEventId` and `resourceId` are
 * likewise server-validated UUIDs. The filename is sanitized to a safe leaf.
 * Throws if any UUID segment is malformed, so a caller can never produce a key
 * that escapes the `<scope>/<event>/<resource>/` prefix.
 */
export function buildR2Key(
  scope: string,
  ownerEventId: string,
  resourceId: string,
  filename: string,
): string {
  if (!UUID_RE.test(scope)) {
    throw new Error("buildR2Key: scope must be a server-derived UUID");
  }
  if (!UUID_RE.test(ownerEventId)) {
    throw new Error("buildR2Key: ownerEventId must be a UUID");
  }
  if (!UUID_RE.test(resourceId)) {
    throw new Error("buildR2Key: resourceId must be a server-minted UUID");
  }
  return `${scope}/${ownerEventId}/${resourceId}/${sanitizeFilename(filename)}`;
}

/**
 * Server-side authenticated HEAD against a stored R2 object.
 *
 * Returns the object's REAL `Content-Type` and byte size (`Content-Length`),
 * or `null` when the object does not exist (404). This is the verification gate
 * for the upload finalize path: the client's claimed MIME/size are never
 * trusted — the row is only created after this confirms the stored object
 * matches the allowlist + size cap.
 *
 * Uses a normal SigV4-signed request (Authorization header), not a presigned
 * URL, because it runs server-to-R2 with the service credentials.
 */
export async function headObject(
  key: string,
): Promise<{
  contentType: string | null;
  contentLength: number | null;
} | null> {
  const res = await signedRequest("HEAD", key);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2 HEAD failed: ${res.status} ${res.statusText}`);
  }
  const len = res.headers.get("content-length");
  return {
    contentType: res.headers.get("content-type"),
    contentLength: len !== null ? Number(len) : null,
  };
}

// ── Authorization-header signing (for server-to-R2 HEAD/GET) ─────────────────

/**
 * Issue a SigV4-signed request to R2 from the server using an Authorization
 * header (as opposed to a presigned URL). Used by headObject(). Signs `host`
 * and the empty-body payload hash.
 */
async function signedRequest(
  method: "HEAD" | "GET",
  key: string,
): Promise<Response> {
  const accessKey = env("R2_ACCESS_KEY_ID");
  const secretKey = env("R2_SECRET_ACCESS_KEY");
  const host = r2Host();
  const { amzDate, dateStamp } = amzDates();
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const canonicalUri = "/" + uriEncode(`${bucket()}/${key}`, false);
  // Empty-body SHA-256 (the well-known constant for a zero-length payload).
  const payloadHash = await sha256Hex("");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    method,
    canonicalUri,
    "", // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretKey, dateStamp);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  });
}
