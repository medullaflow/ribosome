// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Cross-milestone convergence check (#26): the MCP Registry Adapter milestone
// and the Orchestrator Pipeline milestone were each built and tested against
// their own test doubles (FakeRegistry in resolve-mcp-server.test.js /
// materializer.test.js, a fixture file in file-registry.test.js, and so on).
// That parallelism is only safe if the two actually compose once both are
// real -- this is that checkpoint. No test doubles anywhere in this file:
// OfficialMcpRegistry makes a real HTTP call to the live registry,
// MiseEnvironmentProvider runs a real `mise install`, and the resulting
// lockfile is validated against the standard's own real JSON Schema
// (validateLockfile), not just this repo's own TypeScript types -- then
// written to and read back from a real temp directory.
//
// Skips itself if the live registry or mise isn't reachable, exactly like
// official-registry.test.js's and mise-environment-provider.test.js's own
// guards, so `bun run test` stays green in environments without either.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { RibosomeManifest } from "@medullaflow/ribosome-schema";
import {
  LOCKFILE_FILENAME,
  Materializer,
  MiseEnvironmentProvider,
  OfficialMcpRegistry,
  validateLockfile,
  writeLockfile,
} from "../dist/index.js";
import { withMiseInstallLock } from "./mise-install-lock";

const OFFICIAL_URL = "https://registry.modelcontextprotocol.io";
// Same real, known-published server official-registry.test.js and
// launch-mapping.test.js already resolve against -- small, stable, an npm
// package with a plain stdio launch, so the environment-provider leg only
// needs to provision node, not something heavier.
const KNOWN_SERVER = { name: "com.pulsemcp/remote-filesystem", version: "0.1.2" };

function hasNetworkAccess(): boolean {
  try {
    execFileSync("curl", ["-fsS", "--max-time", "5", `${OFFICIAL_URL}/v0.1/health`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
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

const skipReason = !hasNetworkAccess()
  ? "registry.modelcontextprotocol.io unreachable"
  : !hasMise()
    ? "mise not found on PATH"
    : false;
// Generous: above the adapter's own 10s resolve timeout and a real
// `mise install`, and withMiseInstallLock (see ./mise-install-lock.ts) can
// make this test queue behind a sibling test FILE's own cold install (a real
// download + extract + attestation check, empirically ~50s each) first.
const testOpts = { skip: skipReason, timeout: 180000 };

test(
  "materialize(): a manifest referencing a real, live public MCP server resolves to a schema-valid lockfile with no test doubles anywhere in the path",
  testOpts,
  async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ribosome-convergence-test-"));

    const manifest: RibosomeManifest = {
      schemaVersion: "1",
      registries: { default: "official", sources: { official: { url: OFFICIAL_URL } } },
      mcpServers: {
        fs: {
          source: "registry",
          name: KNOWN_SERVER.name,
          version: KNOWN_SERVER.version,
        },
      },
    };

    const materializer = new Materializer({
      environmentProvider: new MiseEnvironmentProvider(),
      registries: [new OfficialMcpRegistry()],
    });

    const lockfile = await withMiseInstallLock(() => materializer.materialize(manifest, { cwd }));

    // Real registry adapter resolved the real server and the real
    // environment provider provisioned the real runtime it needs.
    assert.equal(lockfile.mcpServers.length, 1);
    const fs = lockfile.mcpServers[0];
    assert.ok(fs);
    assert.equal(fs.id, "fs");
    assert.deepEqual(fs.launch, {
      transport: "stdio",
      command: ["npx", "-y", "remote-filesystem-mcp-server@0.1.2"],
    });
    const node = lockfile.runtimePool.find((p) => p.tool === "node");
    assert.ok(node, "node should have been provisioned into the pool");
    assert.match(node.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(fs.uses, [node.id]);
    assert.ok(fs.environment.pathPrepend.length > 0);

    // Not just "satisfies this repo's TypeScript types" -- actually valid
    // against the standard's own real JSON Schema.
    validateLockfile(lockfile);

    // The one remaining pipeline step: persist it, then validate what
    // actually landed on disk, not just the in-memory value.
    await writeLockfile(lockfile, cwd);
    const written = JSON.parse(readFileSync(join(cwd, LOCKFILE_FILENAME), "utf8"));
    validateLockfile(written);
    // Compare against the same JSON round-trip (not the raw in-memory value):
    // JSON.stringify drops undefined-valued keys like the unset `permissions`
    // on ResolvedMcpServer, which is a harmless serialization detail, not a
    // discrepancy between what was resolved and what was written.
    assert.deepEqual(written, JSON.parse(JSON.stringify(lockfile)));
  },
);
