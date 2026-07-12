// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Bumps the pinned mise (https://mise.jdx.dev, MIT) release bundled into
// packaged binary artifacts (#8). Deliberate, always landed as a reviewed
// PR — mirrors ribosome-schema's own vendor-update.js for its vendored MCP
// schema (same "pin a specific external version on purpose" precedent).
//
//   node scripts/vendor-mise-update.js <version, e.g. 2026.7.5>
//
// Fetches that release's own published SHASUMS256.txt from GitHub and
// extracts the checksums for ribosome's five release targets, then writes
// the pin + checksums to src/vendor/mise-version.ts. Never downloads the
// (multi-hundred-MB, five-times-over) binaries themselves here — that only
// happens at CI release-build time (scripts/fetch-bundled-mise.js), verified
// against the checksums this script records.

const { writeFileSync, readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { MISE_TARGETS } = require("./mise-targets");

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("usage: node scripts/vendor-mise-update.js <version, e.g. 2026.7.5>");
  process.exit(2);
}

const root = join(__dirname, "..");
const pinFile = join(root, "src", "vendor", "mise-version.ts");

(async () => {
  const shasumsUrl = `https://github.com/jdx/mise/releases/download/v${version}/SHASUMS256.txt`;
  const res = await fetch(shasumsUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${shasumsUrl}`);
  const text = await res.text();

  const checksums = {};
  for (const [target, { assetSuffix }] of Object.entries(MISE_TARGETS)) {
    const assetName = `mise-v${version}-${assetSuffix}`;
    const line = text.split("\n").find((l) => l.trim().endsWith(`./${assetName}`));
    if (!line) throw new Error(`no checksum line for ${assetName} in ${shasumsUrl}`);
    const sha256 = line.trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{64}$/.test(sha256 || "")) {
      throw new Error(`could not parse a sha256 from line: "${line}"`);
    }
    checksums[target] = sha256;
  }

  const oldVersion = existsSync(pinFile)
    ? /MISE_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(pinFile, "utf8"))?.[1]
    : undefined;

  const body = `// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Pinned mise (https://mise.jdx.dev, MIT) release bundled into every packaged
// binary artifact (#8) — a deliberate, reproducible pin, not "latest",
// mirroring the vendored-and-pinned MCP schema precedent in the sibling
// ribosome-schema repo. Bump via \`node scripts/vendor-mise-update.js
// <version>\`, never by hand: that script re-fetches the matching checksums
// from mise's own published SHASUMS256.txt so this file's pin and its
// integrity proof always move together. Staleness is caught separately, on
// a schedule (#9) — see scripts/check-mise-drift.js.
//
// Checksums cover the five raw, uncompressed release binaries mise publishes
// 1:1 against ribosome's own five release targets — not the .tar.gz/.zip
// archives, which packaging steps don't need.

export const MISE_VERSION = "${version}";

export const MISE_CHECKSUMS: Record<string, string> = {
${Object.entries(checksums)
  .map(([target, sha256]) => `  "${target}": "${sha256}",`)
  .join("\n")}
};
`;

  writeFileSync(pinFile, body);

  console.log(
    `${oldVersion && oldVersion !== version ? `✓ bumped mise ${oldVersion} -> ${version}` : `✓ pinned mise ${version}`}, checksums for ${Object.keys(checksums).length} targets written to ${pinFile}.`,
  );
  console.log("\nNow, by hand, in this PR:");
  console.log("  1. Update NOTICE's vendored-mise entry if the version changed materially.");
  console.log("  2. `bun run test` must pass.");
  console.log("  3. Add a CHANGELOG entry.");
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
