// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// deriveLaunch() against real, live registry entries -- same "no mocking of
// the descriptor" precedent as official-registry.test.js, fetched directly
// with curl (not the adapter) since this is pure mapping logic, not the
// adapter's own HTTP behavior. Skips itself if the registry is unreachable,
// exactly like official-registry.test.js's own hasNetworkAccess() guard.
//
// Pure dispatch/error-path cases (argument rendering, package precedence)
// are covered separately below with hand-built McpServerJson fixtures, no
// network needed -- mirroring resolve-mcp-server.test.js's fake-vs-real split.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import type { McpServerJson } from "@medullaflow/ribosome-schema";
import { deriveLaunch } from "../dist/index.js";

const OFFICIAL_URL = "https://registry.modelcontextprotocol.io";

function hasNetworkAccess(): boolean {
  try {
    execFileSync("curl", ["-fsS", "--max-time", "10", `${OFFICIAL_URL}/v0.1/health`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const skip = !hasNetworkAccess();
// timeout comfortably above fetchServer()'s own worst case (3 attempts x
// 25s curl + incremental backoff between them (1000ms + 2000ms), D51 ->
// ~78s), not just a single request's own budget.
const testOpts = {
  skip: skip ? "registry.modelcontextprotocol.io unreachable" : false,
  timeout: 85000,
};

const FETCH_MAX_ATTEMPTS = 3;
const FETCH_RETRY_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries a transient curl failure with incremental backoff -- the live
// registry has been observed to intermittently stall and recover within
// seconds, and separately to enter sustained multi-minute periods of
// ~12-13s response times even while answering with a real 200 (see
// docs/ARCHITECTURE.md D47 and D51, which gave OfficialMcpRegistry itself
// the same resilience/headroom). This helper bypasses that adapter
// deliberately (see the file header comment), so it needs its own copy of
// the same retry logic, not a shared one -- there's no HTTP status to
// distinguish transient-vs-definitive here (curl's own exit code doesn't
// separate them), but every server this file queries is a real, known-good,
// already-published fixture, so a failure here is always network flakiness,
// never a genuine 404.
async function fetchServer(name: string, version: string): Promise<McpServerJson> {
  const url = `${OFFICIAL_URL}/v0.1/servers/${encodeURIComponent(name)}/versions/${version}`;
  for (let attempt = 1; ; attempt++) {
    try {
      // --max-time above the ~12-13s the live registry has been observed
      // taking even when healthy (D51), with real headroom, not just
      // matching that latency.
      const raw = execFileSync("curl", ["-fsS", "--max-time", "25", url]);
      return JSON.parse(raw.toString()).server;
    } catch (err) {
      if (attempt >= FETCH_MAX_ATTEMPTS) throw err;
      await sleep(FETCH_RETRY_BACKOFF_MS * attempt);
    }
  }
}

test("deriveLaunch(): real npm/npx server produces a working stdio command", testOpts, async () => {
  const server = await fetchServer("com.pulsemcp/remote-filesystem", "0.1.2");
  const launch = deriveLaunch(server);
  assert.deepEqual(launch, {
    transport: "stdio",
    command: ["npx", "-y", "remote-filesystem-mcp-server@0.1.2"],
  });
});

test(
  "deriveLaunch(): real pypi/uvx server produces a working stdio command",
  testOpts,
  async () => {
    const server = await fetchServer("ai.adeu/adeu", "1.5.2");
    const launch = deriveLaunch(server);
    assert.deepEqual(launch, { transport: "stdio", command: ["uvx", "adeu@1.5.2"] });
  },
);

test("deriveLaunch(): real remote-only server produces an http launch", testOpts, async () => {
  const server = await fetchServer("ac.tandem/docs-mcp", "0.3.2");
  const launch = deriveLaunch(server);
  assert.deepEqual(launch, { transport: "http", url: "https://tandem.ac/mcp" });
});

test(
  "deriveLaunch(): real oci-only server (unsupported, no remote fallback) throws",
  testOpts,
  async () => {
    const server = await fetchServer("ai.aliengiraffe/spotdb", "0.1.0");
    assert.throws(() => deriveLaunch(server), /unsupported registryType.*oci/);
  },
);

// ── Pure dispatch/error-path cases: hand-built fixtures, no network ─────────

test("deriveLaunch(): prefers the first package it can actually invoke over an earlier unsupported one", () => {
  const server: McpServerJson = {
    name: "com.example/mixed",
    description: "test",
    version: "1.0.0",
    packages: [
      {
        registryType: "oci",
        identifier: "docker.io/example/mixed:1.0.0",
        transport: { type: "stdio" },
      },
      {
        registryType: "npm",
        identifier: "@example/mixed",
        version: "1.0.0",
        transport: { type: "stdio" },
      },
    ],
  };
  const launch = deriveLaunch(server);
  assert.deepEqual(launch, { transport: "stdio", command: ["npx", "@example/mixed@1.0.0"] });
});

test("deriveLaunch(): falls back to a remote when no declared package is launchable", () => {
  const server: McpServerJson = {
    name: "com.example/oci-with-remote-fallback",
    description: "test",
    version: "1.0.0",
    packages: [
      {
        registryType: "oci",
        identifier: "docker.io/example/x:1.0.0",
        transport: { type: "stdio" },
      },
    ],
    remotes: [{ type: "streamable-http", url: "https://example.test/mcp" }],
  };
  assert.deepEqual(deriveLaunch(server), { transport: "http", url: "https://example.test/mcp" });
});

test("deriveLaunch(): explicit runtimeHint overrides the registryType default", () => {
  const server: McpServerJson = {
    name: "com.example/podman",
    description: "test",
    version: "1.0.0",
    packages: [
      {
        registryType: "npm",
        identifier: "@example/thing",
        version: "2.0.0",
        runtimeHint: "bunx",
        transport: { type: "stdio" },
      },
    ],
  };
  assert.deepEqual(deriveLaunch(server), {
    transport: "stdio",
    command: ["bunx", "@example/thing@2.0.0"],
  });
});

test("deriveLaunch(): named argument with a value renders as two tokens", () => {
  const server: McpServerJson = {
    name: "com.example/named-arg",
    description: "test",
    version: "1.0.0",
    packages: [
      {
        registryType: "npm",
        identifier: "@example/named-arg",
        version: "1.0.0",
        transport: { type: "stdio" },
        packageArguments: [{ type: "named", name: "--port", value: "8080" }],
      },
    ],
  };
  assert.deepEqual(deriveLaunch(server), {
    transport: "stdio",
    command: ["npx", "@example/named-arg@1.0.0", "--port", "8080"],
  });
});

test("deriveLaunch(): argument with no literal value (only valueHint) throws", () => {
  const server: McpServerJson = {
    name: "com.example/unfilled-arg",
    description: "test",
    version: "1.0.0",
    packages: [
      {
        registryType: "npm",
        identifier: "@example/unfilled-arg",
        version: "1.0.0",
        transport: { type: "stdio" },
        packageArguments: [{ type: "named", name: "--token", valueHint: "<your-token>" }],
      },
    ],
  };
  assert.throws(() => deriveLaunch(server), /no literal value/);
});

test("deriveLaunch(): no packages and no remotes throws", () => {
  const server: McpServerJson = {
    name: "com.example/empty",
    description: "test",
    version: "1.0.0",
  };
  assert.throws(() => deriveLaunch(server), /declares neither packages nor remotes/);
});
