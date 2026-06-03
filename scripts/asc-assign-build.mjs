#!/usr/bin/env node
// Assign the latest build to all internal tester groups so it goes live
// for testing immediately.
//
// Apple normally auto-assigns when hasAccessToAllBuilds is true, but there's
// often a propagation lag. Calling this explicitly forces the assignment.

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

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${init.method ?? "GET"} ${path} → ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
};

const apps = await api("/v1/apps?limit=20");
const app = apps.data.find(
  (a) => a.attributes.bundleId === "com.jakeschwartz.guildenstern",
);
if (!app) {
  console.log("No Guildenstern app found.");
  process.exit(0);
}

const builds = await api(
  `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=1`,
);
const latest = builds.data[0];
if (!latest) {
  console.log("No builds.");
  process.exit(0);
}

const buildVersion = latest.attributes.version;
console.log(`Latest build: ${buildVersion} (${latest.id})`);

const groups = await api(`/v1/apps/${app.id}/betaGroups?limit=20`);
for (const g of groups.data) {
  const name = g.attributes.name;
  const isInternal = g.attributes.isInternalGroup;
  console.log(`\nAssigning to ${name} (${isInternal ? "internal" : "external"})…`);
  // Reverse direction: add the betaGroup to the build's relationships.
  await api(`/v1/builds/${latest.id}/relationships/individualTesters`, {
    method: "POST",
    body: JSON.stringify({ data: [] }),
  }).catch(() => {});
  await api(`/v1/builds/${latest.id}/relationships/betaGroups`, {
    method: "POST",
    body: JSON.stringify({
      data: [{ type: "betaGroups", id: g.id }],
    }),
  });
  console.log("  ✓ assigned");
}

console.log(`\nDone. Build ${buildVersion} is now live for all groups.`);
