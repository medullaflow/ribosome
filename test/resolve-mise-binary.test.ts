// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// resolveMiseBinary()'s resolution order (#8): env override > bundled
// sibling path > PATH. Internal implementation detail, not part of the
// public API (see src/index.ts) -- imported straight from its own compiled
// module rather than through dist/index.js, same reasoning as importing any
// other internal-only unit under test.

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { MISE_BIN_ENV_VAR, resolveMiseBinary } from "../dist/vendor/resolve-mise-binary.js";

test("resolveMiseBinary(): falls back to a bare PATH lookup when nothing else applies", () => {
  const result = resolveMiseBinary({
    env: {},
    execPath: "/usr/bin/node",
    platform: "linux",
    exists: () => false,
  });
  assert.equal(result, "mise");
});

test("resolveMiseBinary(): uses the bundled sibling path when it exists", () => {
  const seen: string[] = [];
  const result = resolveMiseBinary({
    env: {},
    execPath: "/opt/ribosome/ribosome",
    platform: "linux",
    exists: (path) => {
      seen.push(path);
      return path === "/opt/ribosome/mise-bundled/mise";
    },
  });
  assert.equal(result, "/opt/ribosome/mise-bundled/mise");
  assert.deepEqual(seen, ["/opt/ribosome/mise-bundled/mise"]);
});

test("resolveMiseBinary(): picks mise.exe as the bundled binary name on win32", () => {
  // node:path's join() follows the HOST OS's separator regardless of the
  // `platform` option here (that option only selects the binary filename,
  // "mise" vs "mise.exe") -- so the expectation is built with the same
  // join(), not a literal backslash, to stay correct on any CI host OS.
  const expected = join("ribosome", "mise-bundled", "mise.exe");
  const result = resolveMiseBinary({
    env: {},
    execPath: join("ribosome", "ribosome.exe"),
    platform: "win32",
    exists: (path) => path === expected,
  });
  assert.equal(result, expected);
});

test("resolveMiseBinary(): the env override wins even when a bundled binary also exists", () => {
  const result = resolveMiseBinary({
    env: { [MISE_BIN_ENV_VAR]: "/custom/mise" },
    execPath: "/opt/ribosome/ribosome",
    platform: "linux",
    exists: () => true,
  });
  assert.equal(result, "/custom/mise");
});

test("resolveMiseBinary(): with no options, resolves against the real process (no bundled sibling, no override) -> bare 'mise'", () => {
  const result = resolveMiseBinary();
  assert.equal(result, "mise");
});
