// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// writeLockfile() against a real temp directory -- no mocking of node:fs,
// same discipline as file-registry.test.js. This is the one effects layer
// in the pipeline that actually touches disk; everything upstream of it
// (Materializer.materialize(), see test/materializer.test.js) is exercised
// with zero filesystem access, per #25's own acceptance criterion.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { writeLockfile, LOCKFILE_FILENAME } = require("../dist/index.js");

const SAMPLE_LOCKFILE = {
  schemaVersion: "1",
  resolvedAt: "2026-07-10T00:00:00.000Z",
  runtimePool: [{ id: "node@22.3.0", tool: "node", requested: "22", version: "22.3.0" }],
  project: { pathPrepend: [], envVars: {} },
  mcpServers: [
    {
      id: "example",
      uses: ["node@22.3.0"],
      launch: { transport: "stdio", command: ["npx", "@example/a"] },
      environment: { pathPrepend: ["/pool/node@22.3.0/bin"], envVars: {} },
    },
  ],
};

test("writeLockfile(): writes the exact lockfile value as formatted JSON at <cwd>/ribosome.lock.json", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-lockfile-writer-test-"));

  await writeLockfile(SAMPLE_LOCKFILE, cwd);

  const raw = readFileSync(join(cwd, LOCKFILE_FILENAME), "utf8");
  assert.deepEqual(JSON.parse(raw), SAMPLE_LOCKFILE);
  assert.ok(raw.endsWith("\n"));
});

test("writeLockfile(): overwrites a previously written lockfile", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-lockfile-writer-test-"));

  await writeLockfile(SAMPLE_LOCKFILE, cwd);
  const updated = { ...SAMPLE_LOCKFILE, resolvedAt: "2026-07-10T01:00:00.000Z" };
  await writeLockfile(updated, cwd);

  const raw = readFileSync(join(cwd, LOCKFILE_FILENAME), "utf8");
  assert.equal(JSON.parse(raw).resolvedAt, "2026-07-10T01:00:00.000Z");
});
