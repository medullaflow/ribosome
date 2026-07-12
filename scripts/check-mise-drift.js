// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Verifies the pinned mise (#8) release, two ways, mirroring the sibling
// ribosome-schema repo's own vendor-drift check for its vendored MCP schema:
//   1. Immutability — the pinned version's SHASUMS256.txt still records the
//      same checksums this repo has pinned (a published GitHub release
//      being edited/re-uploaded after the fact would be a real problem).
//   2. Staleness — mise has published a newer release than the one pinned
//      here (#9: a pin with no process for noticing it's gone stale is an
//      unmaintained dependency, not a reproducibility feature).
// Exits non-zero on either. Run in CI (scheduled) so drift surfaces as a
// failed job / opened issue. Bumping the pin is deliberate — see
// scripts/vendor-mise-update.js. Never edits anything.

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { MISE_TARGETS } = require("./mise-targets");

const pinFile = join(__dirname, "..", "src", "vendor", "mise-version.ts");

function readPin() {
  const src = readFileSync(pinFile, "utf8");
  const version = /MISE_VERSION\s*=\s*"([^"]+)"/.exec(src)?.[1];
  if (!version) throw new Error(`could not parse MISE_VERSION from ${pinFile}`);

  // One fixed pattern parses every pinned checksum at once, rather than
  // building a per-target `new RegExp(target)` (same discipline as
  // fetch-bundled-mise.js, even though these target names come from this
  // repo's own MISE_TARGETS, never external input).
  const checksums = {};
  for (const m of src.matchAll(/"([a-z0-9-]+)":\s*"([a-f0-9]{64})"/g)) {
    checksums[m[1]] = m[2];
  }
  for (const target of Object.keys(MISE_TARGETS)) {
    if (!checksums[target])
      throw new Error(`could not parse checksum for "${target}" from ${pinFile}`);
  }
  return { version, checksums };
}

(async () => {
  const pin = readPin();
  const problems = [];

  const shasumsUrl = `https://github.com/jdx/mise/releases/download/v${pin.version}/SHASUMS256.txt`;
  try {
    const res = await fetch(shasumsUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    for (const [target, { assetSuffix }] of Object.entries(MISE_TARGETS)) {
      const assetName = `mise-v${pin.version}-${assetSuffix}`;
      const line = text.split("\n").find((l) => l.trim().endsWith(`./${assetName}`));
      const upstreamSha256 = line?.trim().split(/\s+/)[0];
      if (!upstreamSha256) {
        problems.push(`immutability: no checksum line for ${assetName} in ${shasumsUrl}`);
      } else if (upstreamSha256 !== pin.checksums[target]) {
        problems.push(
          `immutability: ${assetName} now hashes to ${upstreamSha256}, pin is ` +
            `${pin.checksums[target]} (upstream changed a "frozen" release — investigate)`,
        );
      }
    }
  } catch (err) {
    problems.push(`could not fetch upstream ${shasumsUrl}: ${err.message}`);
  }

  try {
    const res = await fetch("https://api.github.com/repos/jdx/mise/releases/latest");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { tag_name: tag } = await res.json();
    const latest = tag?.replace(/^v/, "");
    if (latest && latest !== pin.version) {
      problems.push(`staleness: mise ${latest} is out, this repo pins ${pin.version}`);
    }
  } catch (err) {
    problems.push(`could not fetch mise's latest release: ${err.message}`);
  }

  if (problems.length) {
    console.error(`✗ mise drift check FAILED for pinned version ${pin.version}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`✓ mise ${pin.version} verified (checksums match, no newer release published).`);
})();
