// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Tests for the architecture fitness function (#29): proves each mechanically
// checkable dependency rule (docs/ARCHITECTURE.md#dependency-rules 1-3) both
// passes on the real tree and actually fires when deliberately violated, per
// this issue's own acceptance criteria. Rule 4 (the lockfile's data shape,
// not an import-graph property) is instead covered by a behavioral test in
// materializer.test.js -- see the note there.
//
// Fixtures are synthetic ports/adapters/orchestrator trees written to a temp
// directory per test, not the real src/ -- checkArchitecture() is generic
// over its root argument specifically so this is possible.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  checkArchitecture,
  checkImportGraph,
  checkNoLocalSchema,
} = require("../scripts/architecture-rules");

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "ribosome-arch-fixture-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("the real src/ tree has no architecture-boundary violations", () => {
  const srcRoot = join(__dirname, "..", "src");
  const violations = checkImportGraph(srcRoot);
  assert.deepEqual(violations, []);
});

test("the repo has no local *.schema.json files (rule 3)", () => {
  const repoRoot = join(__dirname, "..");
  const violations = checkNoLocalSchema(repoRoot);
  assert.deepEqual(violations, []);
});

test("rule 1: ports/ importing from adapters/ is flagged", () => {
  const root = fixture({
    "ports/environment-provider.ts": `import { Thing } from "../adapters/mise/mise-environment-provider";\nexport type { Thing };\n`,
    "adapters/mise/mise-environment-provider.ts": `export const Thing = 1;\n`,
  });
  const violations = checkImportGraph(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "PORTS_NO_ADAPTERS");
  assert.equal(violations[0].file, "ports/environment-provider.ts");
});

test("rule 1: one adapter importing a sibling adapter is flagged", () => {
  const root = fixture({
    "adapters/mcp-registry/official-registry.ts": `import { readLocal } from "../mise/mise-environment-provider";\nexport { readLocal };\n`,
    "adapters/mise/mise-environment-provider.ts": `export const readLocal = () => {};\n`,
  });
  const violations = checkImportGraph(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "ADAPTERS_NO_SIBLINGS");
});

test("rule 2: the orchestrator importing adapters/ directly is flagged", () => {
  const root = fixture({
    "orchestrator/materializer.ts": `import { MiseEnvironmentProvider } from "../adapters/mise/mise-environment-provider";\nexport { MiseEnvironmentProvider };\n`,
    "adapters/mise/mise-environment-provider.ts": `export class MiseEnvironmentProvider {}\n`,
  });
  const violations = checkImportGraph(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "ORCHESTRATOR_NO_ADAPTERS");
});

test("index.ts (the composition root) is exempt -- wiring adapters there is not a violation", () => {
  const root = fixture({
    "index.ts": `export { MiseEnvironmentProvider } from "./adapters/mise/mise-environment-provider";\n`,
    "adapters/mise/mise-environment-provider.ts": `export class MiseEnvironmentProvider {}\n`,
    "orchestrator/materializer.ts": `export class Materializer {}\n`,
  });
  assert.deepEqual(checkImportGraph(root), []);
});

test("rule 3: a stray *.schema.json file anywhere in the repo is flagged", () => {
  const root = fixture({
    "src/index.ts": `export const x = 1;\n`,
    "src/adapters/oops/leaked.schema.json": `{}`,
  });
  const violations = checkNoLocalSchema(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "NO_LOCAL_SCHEMA");
});

test("checkArchitecture() combines the import-graph and schema-file checks", () => {
  const root = fixture({
    "src/ports/p.ts": `import { a } from "../adapters/x/a";\nexport { a };\n`,
    "src/adapters/x/a.ts": `export const a = 1;\n`,
    "stray.schema.json": `{}`,
  });
  const violations = checkArchitecture(join(root, "src"), root);
  const rules = violations.map((v) => v.rule).sort();
  assert.deepEqual(rules, ["NO_LOCAL_SCHEMA", "PORTS_NO_ADAPTERS"]);
});
