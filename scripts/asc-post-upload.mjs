#!/usr/bin/env node
// Post-upload helper: poll for the just-uploaded build to finish processing,
// set Export Compliance (no non-exempt encryption), and assign to all
// internal tester groups so testers see the update immediately.
//
// Usage: node asc-post-upload.mjs <buildVersion>

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
const TARGET_VERSION = process.argv[2];
if (!TARGET_VERSION) {
  console.error("usage: asc-post-upload.mjs <buildVersion>");
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

function derToJose(der) {
  let o = 2;
  let rL = der[o + 1];
  let r = der.subarray(o + 2, o + 2 + rL);
  o += 2 + rL;
  let sL = der[o + 1];
  let s = der.subarray(o + 2, o + 2 + sL);
  while (r.length > 32 && r[0] === 0) r = r.subarray(1);
  while (s.length > 32 && s[0] === 0) s = s.subarray(1);
  return Buffer.concat([
    Buffer.alloc(32 - r.length, 0),
    r,
    Buffer.alloc(32 - s.length, 0),
    s,
  ]);
}

const mkJwt = () => {
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
  const sig = createSign("SHA256")
    .update(signingInput)
    .sign(createPrivateKey({ key: pem, format: "pem" }));
  return `${signingInput}.${b64url(derToJose(sig))}`;
};

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mkJwt()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`▶ Polling for build ${TARGET_VERSION} to finish processing…`);
let build = null;
const start = Date.now();
const TIMEOUT_MS = 30 * 60 * 1000;
while (true) {
  const list = await api(
    "/v1/builds?sort=-uploadedDate&limit=5",
  );
  build = list.data.find((b) => b.attributes.version === TARGET_VERSION);
  if (build && build.attributes.processingState === "VALID") break;
  if (Date.now() - start > TIMEOUT_MS) {
    console.error(`✗ Timeout waiting for build ${TARGET_VERSION}`);
    process.exit(1);
  }
  const state = build?.attributes.processingState ?? "not-yet-listed";
  process.stdout.write(`  state=${state}…\r`);
  await sleep(20_000);
}
console.log(`\n✓ Build ${TARGET_VERSION} is VALID (${build.id})`);

// Set Export Compliance if missing.
if (build.attributes.usesNonExemptEncryption === null) {
  console.log("▶ Setting Export Compliance (usesNonExemptEncryption=false)…");
  await api(`/v1/builds/${build.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "builds",
        id: build.id,
        attributes: { usesNonExemptEncryption: false },
      },
    }),
  });
  console.log("  ✓ set");
}

// Assign to all tester groups (Apple's auto-add for hasAccessToAllBuilds:true
// groups often lags; calling this explicitly forces the assignment).
console.log("▶ Assigning to tester groups…");
const apps = await api("/v1/apps?limit=20");
const app = apps.data.find(
  (a) => a.attributes.bundleId === "com.jakeschwartz.guildenstern",
);
const groups = await api(`/v1/apps/${app.id}/betaGroups?limit=20`);
for (const g of groups.data) {
  try {
    await api(`/v1/builds/${build.id}/relationships/betaGroups`, {
      method: "POST",
      body: JSON.stringify({
        data: [{ type: "betaGroups", id: g.id }],
      }),
    });
    console.log(`  ✓ ${g.attributes.name}`);
  } catch (e) {
    // Internal groups with hasAccessToAllBuilds:true reject manual assignment
    // (they auto-add); that's fine — testers will see the build anyway.
    if (e.body?.includes("Cannot add internal group")) {
      console.log(`  ⏸ ${g.attributes.name} (internal, auto-add)`);
    } else {
      console.log(`  ✗ ${g.attributes.name} — ${e.message}`);
    }
  }
}

console.log(
  `\n✓ Build ${TARGET_VERSION} is live for testers. Open TestFlight on the phone to update.`,
);
