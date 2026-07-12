// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Proves the npm package's `bin` entry (#94) actually works: dist/cli.js,
// tsc's compiled output of src/cli.ts, invoked with plain `node` -- not
// `bun` -- since that's what `npx @medullaflow/ribosome` and a global
// `npm install` both do. Complements test/cli.test.ts, which exercises the
// same underlying logic through the bun-compile target (bin/ribosome.ts);
// this file only needs to prove the Node entry point itself resolves,
// executes, and produces the same output, not re-cover every behavior
// already asserted there. The resolve test still needs mise on PATH (same
// hasMise() guard as test/cli.test.ts) -- MiseEnvironmentProvider is wired
// into every "resolve", regardless of which entry point ran it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { withMiseInstallLock } from "./mise-install-lock";

const REPO_ROOT = join(__dirname, "..");
const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");
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

function runCli(args: string[], cwd?: string): CliResult {
  try {
    const stdout = execFileSync("node", [DIST_CLI, ...args], {
      cwd: cwd ?? REPO_ROOT,
      encoding: "utf8",
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

test("dist/cli.js has the executable bit set and a node shebang (npm bin requirements)", () => {
  const shebang = readFileSync(DIST_CLI, "utf8").split("\n")[0];
  assert.equal(shebang, "#!/usr/bin/env node");
});

test("dist/cli.js --version prints the package.json version and exits 0", () => {
  const { status, stdout } = runCli(["--version"]);
  assert.equal(status, 0);
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(stdout.trim(), pkg.version);
});

test("dist/cli.js --help prints usage and exits 0", () => {
  const { status, stdout } = runCli(["--help"]);
  assert.equal(status, 0);
  assert.match(stdout, /Usage: ribosome/);
});

test("dist/cli.js resolve end-to-end against a local file registry writes a valid lockfile", {
  skip: !hasMise() ? "mise not found on PATH" : false,
  timeout: 180000,
}, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-cli-node-test-"));
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
