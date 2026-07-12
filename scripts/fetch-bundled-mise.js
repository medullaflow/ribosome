// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Downloads the pinned mise (#8) release binary for one release target and
// verifies it against the checksum recorded in src/vendor/mise-version.ts,
// before it's placed in a packaged artifact's package-private "mise-bundled"
// sibling directory (the layout resolveMiseBinary() looks for, see
// src/adapters/mise/resolve-mise-binary.ts). Run at CI release-build time
// (.github/workflows/cross-compile.yml) — never commits the binary itself,
// unlike the small vendored MCP schema JSON in the sibling ribosome-schema
// repo: five mise binaries are multiple hundred MB combined, and unlike a
// schema, a release build can always re-fetch them fresh, verified, from
// mise's own immutable GitHub release.
//
//   node scripts/fetch-bundled-mise.js <target> <outputDir>
//
// Writes <outputDir>/mise (or mise.exe on windows-x64), executable on the
// unix targets.

const { writeFileSync, mkdirSync, chmodSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createHash } = require("node:crypto");
const { MISE_TARGETS } = require("./mise-targets");

// Deliberately regex-parsed, not `require()`d as a module: this script runs
// under plain `node` (no TypeScript loader assumed), same discipline as
// vendor-mise-update.js's own read of this file for its "old version" diff.
const pinFile = join(__dirname, "..", "src", "vendor", "mise-version.ts");
const pinSrc = readFileSync(pinFile, "utf8");
const MISE_VERSION = /MISE_VERSION\s*=\s*"([^"]+)"/.exec(pinSrc)?.[1];
if (!MISE_VERSION) throw new Error(`could not parse MISE_VERSION from ${pinFile}`);

const [target, outputDir] = process.argv.slice(2);
const entry = target ? MISE_TARGETS[target] : undefined;
if (!entry || !outputDir) {
  console.error("usage: node scripts/fetch-bundled-mise.js <target> <outputDir>");
  console.error(`  <target> one of: ${Object.keys(MISE_TARGETS).join(", ")}`);
  process.exit(2);
}

// A single fixed pattern parses every pinned checksum at once, then `target`
// (already validated above against MISE_TARGETS' own keys) is a plain object
// lookup -- deliberately not a per-target `new RegExp(target)`, which would
// build a regular expression out of a command-line argument.
const checksums = {};
for (const m of pinSrc.matchAll(/"([a-z0-9-]+)":\s*"([a-f0-9]{64})"/g)) {
  checksums[m[1]] = m[2];
}
const expectedSha256 = checksums[target];
if (!expectedSha256) throw new Error(`no pinned checksum for target "${target}" in ${pinFile}`);

(async () => {
  const assetName = `mise-v${MISE_VERSION}-${entry.assetSuffix}`;
  const url = `https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/${assetName}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `checksum mismatch for ${assetName}: expected ${expectedSha256}, got ${actualSha256} ` +
        `— refusing to bundle an unverified mise binary`,
    );
  }

  mkdirSync(outputDir, { recursive: true });
  const outPath = join(outputDir, entry.binName);
  writeFileSync(outPath, bytes);
  if (entry.binName !== "mise.exe") chmodSync(outPath, 0o755);

  console.log(`✓ fetched + verified mise ${MISE_VERSION} (${target}) -> ${outPath}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
