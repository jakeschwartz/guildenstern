#!/usr/bin/env node
// Query App Store Connect for recent build statuses, so we can see whether
// the latest upload is still "Processing" or "Ready to Test."

import { readFileSync } from "node:fs";
import { createSign, createPrivateKey } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY_ID = env.APP_STORE_CONNECT_KEY_ID;
const ISSUER_ID = env.APP_STORE_CONNECT_ISSUER_ID;
const PRIVATE_KEY_PATH = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

// DER → JOSE (R||S 64-byte) for ES256
function derToJose(der) {
  let offset = 2;
  let rLen = der[offset + 1];
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  let sLen = der[offset + 1];
  let s = der.subarray(offset + 2, offset + 2 + sLen);
  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1);
  const rPad = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
  const sPad = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);
  return Buffer.concat([rPad, sPad]);
}

const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
const payload = {
  iss: ISSUER_ID,
  iat: now,
  exp: now + 20 * 60,
  aud: "appstoreconnect-v1",
};
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const pem = readFileSync(PRIVATE_KEY_PATH, "utf8");
const der = createSign("SHA256")
  .update(signingInput)
  .sign(createPrivateKey({ key: pem, format: "pem" }));
const jwt = `${signingInput}.${b64url(derToJose(der))}`;

const res = await fetch(
  "https://api.appstoreconnect.apple.com/v1/builds?sort=-uploadedDate&limit=5",
  { headers: { Authorization: `Bearer ${jwt}` } },
);
const data = await res.json();

if (!res.ok) {
  console.error("HTTP", res.status);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const builds = data.data ?? [];
if (builds.length === 0) {
  console.log("No builds found yet.");
  process.exit(0);
}

console.log(`Latest ${builds.length} builds:\n`);
for (const b of builds) {
  const a = b.attributes ?? {};
  console.log(
    `  build ${a.version ?? "?"}  ${a.processingState ?? "?"}  uploaded ${a.uploadedDate ?? "?"}`,
  );
  if (a.expired) console.log(`    (expired)`);
}
