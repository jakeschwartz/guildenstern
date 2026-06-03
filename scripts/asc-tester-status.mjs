#!/usr/bin/env node
// Check tester group setup: which groups exist, which build each has, and
// who's in each group.

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

const api = async (path) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    console.error(`✗ ${path} → ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }
  return res.json();
};

// Find Guildenstern app
const apps = await api("/v1/apps?limit=20");
const app = apps.data.find((a) => a.attributes.bundleId === "com.jakeschwartz.guildenstern");
if (!app) {
  console.log("No Guildenstern app found.");
  process.exit(0);
}

console.log(`App: Guildenstern (${app.id})\n`);

// Beta groups
const groups = await api(`/v1/apps/${app.id}/betaGroups?limit=20`);
for (const g of groups.data) {
  const a = g.attributes;
  console.log(`Group: ${a.name}`);
  console.log(`  type: ${a.isInternalGroup ? "internal" : "external"}`);
  console.log(`  hasAccessToAllBuilds: ${a.hasAccessToAllBuilds}`);
  console.log(`  publicLinkEnabled: ${a.publicLinkEnabled}`);

  const testers = await api(`/v1/betaGroups/${g.id}/betaTesters?limit=50`);
  console.log(`  testers (${testers.data.length}):`);
  for (const t of testers.data) {
    console.log(
      `    - ${t.attributes.firstName ?? ""} ${t.attributes.lastName ?? ""} <${t.attributes.email}>  state=${t.attributes.state}`,
    );
  }

  const builds = await api(`/v1/betaGroups/${g.id}/builds?limit=10`);
  console.log(`  assigned builds: ${builds.data.map((b) => b.attributes.version).join(", ") || "(none)"}`);
  console.log("");
}
