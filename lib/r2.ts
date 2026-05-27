// lib/r2.ts — AWS S3-compatible SigV4 presigner for Cloudflare R2.
//
// Two exports:
//   • presignPut(key, contentType, opts) — URL the browser PUTs to.
//   • presignGet(key, opts)               — URL the browser GETs from,
//                                            optionally with inline disposition.
//
// Why presigned URLs and not the Workers R2 binding for browser traffic:
// the binding only works server-side. To let the browser upload directly
// to R2 (avoiding a hop through the Worker), we presign a PUT. For reads
// we presign a GET so the Worker doesn't proxy every PDF/image stream.
//
// SigV4 reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
// R2 quirks:
//   • region is fixed to "auto"
//   • service is "s3"
//   • only `host` is signed; payload is "UNSIGNED-PAYLOAD"

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

/** Compose the canonical R2 object key. The team_id / event_id / resource_id
 *  segments make the key auditable and let a future RLS-aware sweep know
 *  which row each object belongs to. */
export function r2Key(
  teamId: string,
  ownerEventId: string,
  resourceId: string,
  filename: string,
): string {
  // Strip path separators from filename so a crafted name can't escape its
  // resource folder.
  const safe = filename.replace(/[\\/]/g, "_");
  return `${teamId}/${ownerEventId}/${resourceId}/${safe}`;
}
