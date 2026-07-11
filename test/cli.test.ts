// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// End-to-end tests for the CLI entry point (#5): spawns bin/ribosome.ts as a
// real child process (via `bun`, not compiled -- bun runs .ts directly) and
// asserts on argv/stdout/stderr/exit-code, the actual user-facing contract.
// Everything below the "resolve" happy path reuses the same
// FileMcpRegistry-plus-fixture pattern as file-registry.test.js so it stays
// offline; only the final happy-path test needs mise on PATH (guarded like
// mise-environment-provider.test.js and convergence.test.js).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { withMiseInstallLock } from "./mise-install-lock";

const REPO_ROOT = join(__dirname, "..");
const BIN = join(REPO_ROOT, "bin", "ribosome.ts");
const FIXTURE = join(__dirname, "fixtures", "local-registry.json");

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface ExecFileSyncError {
  status: number;
  stdout?: string;
  stderr?: string;
}

function isExecFileSyncError(err: unknown): err is ExecFileSyncError {
  return typeof err === "object" && err !== null && "status" in err;
}

function runCli(args: string[], cwd?: string, env?: Record<string, string>): CliResult {
  try {
    const stdout = execFileSync("bun", [BIN, ...args], {
      cwd: cwd ?? REPO_ROOT,
      encoding: "utf8",
      env: env ? { ...process.env, ...env } : process.env,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    if (!isExecFileSyncError(err)) throw err;
    return { status: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

function hasMise(): boolean {
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
  // Generous: withMiseInstallLock (see ./mise-install-lock.ts) can make this
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

test("prune --dry-run reports an untracked install without removing it (#61)", {
  skip: !hasMise() ? "mise not found on PATH" : false,
  timeout: 180000,
}, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-cli-test-"));
  // Isolated pool: prune is destructive, so this test must never touch the
  // machine's real default mise store. Inherited by the spawned CLI process
  // via runCli's env param, not the shared process.env (see mise-install-lock
  // usage elsewhere in this file for why: no mutating shared test state).
  const poolDir = mkdtempSync(join(tmpdir(), "ribosome-cli-pool-"));
  const env = { MISE_DATA_DIR: poolDir };

  await withMiseInstallLock(() =>
    execFileSync("mise", ["install", "jq@1.7"], { cwd, env: { ...process.env, ...env } }),
  );

  const dryRun = runCli(["prune", "--dry-run"], cwd, env);
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.stdout, /Would prune 1 runtime\(s\)/);
  assert.match(dryRun.stdout, /jq@1\.7/);

  // Must still be there -- a dry run reports, never removes.
  const stillThere = execFileSync("mise", ["where", "jq@1.7"], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  }).trim();
  assert.ok(stillThere.startsWith(poolDir));

  const real = runCli(["prune"], cwd, env);
  assert.equal(real.status, 0);
  assert.match(real.stdout, /Pruned 1 runtime\(s\)/);

  assert.throws(
    () =>
      execFileSync("mise", ["where", "jq@1.7"], {
        cwd,
        env: { ...process.env, ...env },
        stdio: "pipe",
      }),
    /./,
    "jq@1.7 should actually be gone after a real prune",
  );

  const nothingLeft = runCli(["prune"], cwd, env);
  assert.equal(nothingLeft.status, 0);
  assert.match(nothingLeft.stdout, /Nothing to prune/);
});
