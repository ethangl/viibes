#!/usr/bin/env node
/**
 * Generate an Apple Music developer token (ES256 JWT) for server-side catalog
 * resolution — see docs/multi-provider-playback.md (step 3-1 / 3-2).
 *
 * The token is app-level (not per-user) and valid up to ~6 months. Generate it
 * locally once your Apple Developer account is approved, then store it as a
 * Convex env var — there is NO runtime signing in the app.
 *
 * Inputs (CLI flag or env var):
 *   --key <path>     | APPLE_MUSIC_KEY_PATH      Path to the .p8 private key file
 *   --key-id <id>    | APPLE_MUSIC_KEY_ID        10-char Key ID (from the key)
 *   --team-id <id>   | APPLE_MUSIC_TEAM_ID       10-char Team ID (Membership page)
 *   --days <n>       | (optional, default 180)   Expiry in days (max 180)
 *
 * Usage:
 *   node scripts/generate-apple-token.mjs --key ./AuthKey_ABC123.p8 \
 *     --key-id ABC123DEFG --team-id WXYZ987654
 *
 *   # then set it in Convex (the token is printed to stdout):
 *   npx convex env set APPLE_MUSIC_DEVELOPER_TOKEN "$(node scripts/generate-apple-token.mjs \
 *     --key ./AuthKey_ABC123.p8 --key-id ABC123DEFG --team-id WXYZ987654)"
 *
 * Diagnostics go to stderr; only the token goes to stdout, so it's pipe-safe.
 */

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const MAX_DAYS = 180; // Apple rejects tokens expiring more than ~6 months out.

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`flag --${key} expects a value`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

const args = parseArgs(process.argv.slice(2));

const keyPath = args.key ?? process.env.APPLE_MUSIC_KEY_PATH;
const keyId = args["key-id"] ?? process.env.APPLE_MUSIC_KEY_ID;
const teamId = args["team-id"] ?? process.env.APPLE_MUSIC_TEAM_ID;
const days = Number(args.days ?? 180);

if (!keyPath) fail("missing --key (path to .p8) or APPLE_MUSIC_KEY_PATH");
if (!keyId) fail("missing --key-id or APPLE_MUSIC_KEY_ID");
if (!teamId) fail("missing --team-id or APPLE_MUSIC_TEAM_ID");
if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) {
  fail(`--days must be between 1 and ${MAX_DAYS}`);
}

let privateKey;
try {
  privateKey = createPrivateKey({
    key: readFileSync(keyPath, "utf8"),
    format: "pem",
  });
} catch (cause) {
  fail(`could not read/parse private key at ${keyPath}: ${cause.message}`);
}

const issuedAt = Math.floor(Date.now() / 1000);
const expiresAt = issuedAt + days * 24 * 60 * 60;

const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
const payload = base64url(
  JSON.stringify({ iss: teamId, iat: issuedAt, exp: expiresAt }),
);
const signingInput = `${header}.${payload}`;

// ES256 requires the JOSE-format signature (raw r||s, 64 bytes), not DER —
// `dsaEncoding: "ieee-p1363"` gives us that.
const signature = sign("sha256", Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: "ieee-p1363",
}).toString("base64url");

const token = `${signingInput}.${signature}`;

console.error(
  `Apple Music developer token (expires ${new Date(
    expiresAt * 1000,
  ).toISOString()}):`,
);
process.stdout.write(`${token}\n`);
