#!/usr/bin/env node
// Configures the Supabase Apple Auth provider via the Management API.
// Generates the Apple client_secret JWT locally and PATCHes the project's auth
// config. Idempotent — run again to rotate the JWT before it expires (Apple
// allows up to 6 months).
//
// Reads everything from .env.local in the repo root.

import { readFileSync } from "node:fs";
import { createSign, createPrivateKey } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// --- load .env.local ---
const env = Object.fromEntries(
  readFileSync(resolve(repoRoot, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const required = [
  "APPLE_TEAM_ID",
  "APPLE_BUNDLE_ID",
  "APPLE_SERVICES_ID",
  "APPLE_SIGN_IN_KEY_ID",
  "APPLE_SIGN_IN_KEY_PATH",
  "SUPABASE_PAT",
  "SUPABASE_PROJECT_REF",
];
for (const k of required) {
  if (!env[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

// --- generate Apple client_secret JWT (ES256) ---
const privateKeyPem = readFileSync(env.APPLE_SIGN_IN_KEY_PATH, "utf8");

const now = Math.floor(Date.now() / 1000);
const expiresIn = 60 * 60 * 24 * 180; // 180 days (Apple max is ~6 months)

const header = { alg: "ES256", kid: env.APPLE_SIGN_IN_KEY_ID };
const payload = {
  iss: env.APPLE_TEAM_ID,
  iat: now,
  exp: now + expiresIn,
  aud: "https://appleid.apple.com",
  sub: env.APPLE_SERVICES_ID,
};

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

// node's createSign with ECDSA returns DER-encoded signature; Apple needs raw R||S (JOSE).
const derSig = createSign("SHA256")
  .update(signingInput)
  .sign(createPrivateKey({ key: privateKeyPem, format: "pem" }));

// DER -> raw R||S for ES256 (each component padded to 32 bytes)
function derToJose(der) {
  let offset = 2; // skip 0x30 (SEQUENCE), length
  if (der[offset] !== 0x02) throw new Error("Bad DER: expected INTEGER");
  let rLen = der[offset + 1];
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (der[offset] !== 0x02) throw new Error("Bad DER: expected INTEGER");
  let sLen = der[offset + 1];
  let s = der.subarray(offset + 2, offset + 2 + sLen);
  // Strip leading zeros
  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1);
  // Left-pad to 32 bytes
  const rPad = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
  const sPad = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);
  return Buffer.concat([rPad, sPad]);
}

const jwt = `${signingInput}.${b64url(derToJose(derSig))}`;

console.log(`Generated Apple client_secret JWT (exp in ${expiresIn / 86400} days)`);

// --- call Supabase Management API ---
const clientIds = `${env.APPLE_BUNDLE_ID},${env.APPLE_SERVICES_ID}`;

const body = {
  external_apple_enabled: true,
  external_apple_client_id: clientIds,
  external_apple_secret: jwt,
};

const url = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/config/auth`;

console.log(`PATCH ${url}`);
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${env.SUPABASE_PAT}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const respText = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(respText);
  process.exit(1);
}

console.log("✓ Apple provider configured");
// Print just the apple-related fields back for confirmation
try {
  const parsed = JSON.parse(respText);
  const appleFields = Object.fromEntries(
    Object.entries(parsed).filter(([k]) => k.startsWith("external_apple_")),
  );
  console.log(appleFields);
} catch {
  console.log(respText);
}
