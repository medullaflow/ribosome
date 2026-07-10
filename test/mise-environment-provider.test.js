// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Integration test against a REAL mise install (see Phase 1 acceptance
// criteria in ROADMAP.md) — no mocking of the mise CLI. Skips itself if mise
// isn't on PATH, so `npm test` stays green in environments without it (CI
// should install mise; see .github/workflows/ci.yml).
//
// Uses jq (small, fast) and node (the tool every manifest example in this
// project actually uses) so the "pathPrepend resolves the right binary"
// acceptance criterion is checked against a real interpreter, not just a
// trivial CLI.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { mkdtempSync } = require("node:fs");
const { join } = require("node:path");

const { MiseEnvironmentProvider } = require("../dist/index.js");

function hasMise() {
  try {
    execFileSync("mise", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const skip = !hasMise();
const testOpts = { skip: skip ? "mise not found on PATH" : false };

test("materialize() installs and dedups by exact resolved version", testOpts, async () => {
  const provider = new MiseEnvironmentProvider();
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

  const pool = await provider.materialize(
    [
      { tool: "jq", versionSpec: "latest" },
      { tool: "node", versionSpec: "22" },
      { tool: "node", versionSpec: "22.23" }, // different spec, same tool family
    ],
    { cwd },
  );

  const jq = pool.find((p) => p.tool === "jq");
  const nodeEntries = pool.filter((p) => p.tool === "node");

  assert.ok(jq, "jq should be in the pool");
  assert.match(jq.version, /^\d+\.\d+\.\d+$/, "jq version should be a concrete semver");
  assert.equal(jq.id, `jq@${jq.version}`);

  // "22" and "22.23" should both resolve to the SAME installed node -> one pool entry.
  assert.equal(nodeEntries.length, 1, "node@22 and node@22.23 should dedup to one pool entry");
  assert.match(nodeEntries[0].version, /^22\./, "resolved node version should be a 22.x patch");
});

test("composeView() produces a pathPrepend that resolves the right binary", testOpts, async () => {
  const provider = new MiseEnvironmentProvider();
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

  const pool = await provider.materialize([{ tool: "node", versionSpec: "22" }], { cwd });
  const node = pool[0];

  const view = provider.composeView(pool, [node.id]);
  assert.ok(view.pathPrepend.length > 0, "pathPrepend should not be empty");
  assert.deepEqual(view.envVars, {});

  // The acceptance criterion, literally: PATH built from pathPrepend must
  // resolve `node --version` to the exact version mise reported.
  const version = execFileSync("node", ["--version"], {
    env: { ...process.env, PATH: `${view.pathPrepend.join(":")}:${process.env.PATH}` },
    encoding: "utf8",
  }).trim();
  assert.equal(version, `v${node.version}`);
});

test("composeView() throws for a pool id it never materialized", testOpts, () => {
  const provider = new MiseEnvironmentProvider();
  assert.throws(
    () =>
      provider.composeView(
        [{ id: "node@1.2.3", tool: "node", requested: "1", version: "1.2.3" }],
        ["node@1.2.3"],
      ),
    /no cached bin paths/,
  );
});

test(
  "materialize() aggregates failures instead of throwing on the first one",
  testOpts,
  async () => {
    const provider = new MiseEnvironmentProvider();
    const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

    await assert.rejects(
      provider.materialize(
        [
          { tool: "totally-not-a-real-tool-xyz", versionSpec: "1" },
          { tool: "also-not-real-abc", versionSpec: "1" },
        ],
        { cwd },
      ),
      (err) => {
        assert.match(err.message, /totally-not-a-real-tool-xyz/);
        assert.match(err.message, /also-not-real-abc/);
        return true;
      },
    );
  },
);
