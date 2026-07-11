// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// End-to-end tests for the CLI entry point (#5): spawns bin/ribosome.ts as a
// real child process (via `bun`, not compiled -- bun runs .ts directly) and
// asserts on argv/stdout/stderr/exit-code, the actual user-facing contract.
// Everything below the "resolve" happy path reuses the same
// FileMcpRegistry-plus-fixture pattern as file-registry.test.js so it stays
// offline; only the final happy-path test needs mise on PATH (guarded like
// mise-environment-provider.test.js and convergence.test.js).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { mkdtempSync, writeFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const { withMiseInstallLock } = require("./mise-install-lock");

const REPO_ROOT = join(__dirname, "..");
const BIN = join(REPO_ROOT, "bin", "ribosome.ts");
const FIXTURE = join(__dirname, "fixtures", "local-registry.json");

function runCli(args, cwd) {
  try {
    const stdout = execFileSync("bun", [BIN, ...args], {
      cwd: cwd ?? REPO_ROOT,
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

function hasMise() {
  try {
    execFileSync("mise", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("--help (and no args) prints usage and exits 0", () => {
  for (const args of [["--help"], ["-h"], []]) {
    const { status, stdout } = runCli(args);
    assert.equal(status, 0);
    assert.match(stdout, /Usage: ribosome/);
  }
});

test("--version prints the package.json version and exits 0", () => {
  const { status, stdout } = runCli(["--version"]);
  assert.equal(status, 0);
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(stdout.trim(), pkg.version);
});

test("an unknown command exits 1 with a usage-shaped error", () => {
  const { status, stderr } = runCli(["frobnicate"]);
  assert.equal(status, 1);
  assert.match(stderr, /unknown command "frobnicate"/);
});

test("resolve against a missing manifest exits 1 (invalid manifest)", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-cli-test-"));
  const { status, stderr } = runCli(["resolve"], cwd);
  assert.equal(status, 1);
  assert.match(stderr, /cannot read manifest/);
});

test("resolve against malformed JSON exits 1 (invalid manifest)", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-cli-test-"));
  writeFileSync(join(cwd, "ribosome.json"), "{ not json");
  const { status, stderr } = runCli(["resolve"], cwd);
  assert.equal(status, 1);
  assert.match(stderr, /not valid JSON/);
});

test("resolve against a schema-invalid manifest exits 1 (invalid manifest)", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-cli-test-"));
  writeFileSync(join(cwd, "ribosome.json"), JSON.stringify({ schemaVersion: "not-a-valid-enum" }));
  const { status, stderr } = runCli(["resolve"], cwd);
  assert.equal(status, 1);
  assert.match(stderr, /Invalid ribosome manifest/);
});

test("resolve end-to-end against a local file registry writes a valid lockfile and exits 0", {
  skip: !hasMise() ? "mise not found on PATH" : false,
  // Generous: withMiseInstallLock (see ./mise-install-lock.js) can make this
  // test queue behind a sibling test FILE's own cold install (a real
  // download + extract + attestation check, empirically ~50s each) first.
  timeout: 180000,
}, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-cli-test-"));
  const manifest = {
    schemaVersion: "1",
    registries: {
      default: "local",
      sources: { local: { type: "file", url: pathToFileURL(FIXTURE).href } },
    },
    mcpServers: {
      tool: { source: "registry", name: "com.example/local-tool", version: "1.0.0" },
    },
  };
  writeFileSync(join(cwd, "ribosome.json"), JSON.stringify(manifest));

  const { status, stdout } = await withMiseInstallLock(() => runCli(["resolve"], cwd));
  assert.equal(status, 0);
  assert.match(stdout, /Resolved 1 MCP server\(s\) and \d+ runtime\(s\)/);

  const lockfile = JSON.parse(readFileSync(join(cwd, "ribosome.lock.json"), "utf8"));
  assert.equal(lockfile.mcpServers.length, 1);
  assert.equal(lockfile.mcpServers[0].id, "tool");
});
