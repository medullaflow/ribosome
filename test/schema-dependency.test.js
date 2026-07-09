// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// The full manifest/lockfile conformance corpus now lives in the
// @medullaflow/ribosome-schema repo (it's the standard's own executable spec,
// not ribosome's — see docs/ARCHITECTURE.md). This is a small smoke test
// proving ribosome actually wires up to that dependency correctly: it can
// import and call the re-exported schema helpers end-to-end. Runs against the
// built output (dist/), so `npm test` builds first.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { checkManifest, SCHEMA_VERSION } = require("../dist/index.js");

test("re-exports @medullaflow/ribosome-schema and validates through it", () => {
  assert.equal(SCHEMA_VERSION, "1");

  const { valid, errors } = checkManifest({ schemaVersion: "1" });
  assert.equal(valid, true, `expected valid, got errors:\n${errors.join("\n")}`);

  const rejected = checkManifest({ schemaVersion: "not-a-real-version" });
  assert.equal(rejected.valid, false);
});
