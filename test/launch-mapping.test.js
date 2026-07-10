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

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const { deriveLaunch } = require("../dist/index.js");

const OFFICIAL_URL = "https://registry.modelcontextprotocol.io";

function hasNetworkAccess() {
  try {
    execFileSync("curl", ["-fsS", "--max-time", "5", `${OFFICIAL_URL}/v0.1/health`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const skip = !hasNetworkAccess();
// timeout comfortably above fetchServer()'s own --max-time 10 curl call --
// bun test --parallel now runs every test file concurrently, so these real
// HTTP calls can queue behind each other under that concurrent load, not
// just behind curl's own single-request timeout.
const testOpts = {
  skip: skip ? "registry.modelcontextprotocol.io unreachable" : false,
  timeout: 20000,
};

function fetchServer(name, version) {
  const url = `${OFFICIAL_URL}/v0.1/servers/${encodeURIComponent(name)}/versions/${version}`;
  // --max-time above the ~5s this normally takes, with headroom for the
  // concurrent load bun test --parallel now puts on the live registry.
  const raw = execFileSync("curl", ["-fsS", "--max-time", "15", url]);
  return JSON.parse(raw.toString()).server;
}

test("deriveLaunch(): real npm/npx server produces a working stdio command", testOpts, () => {
  const server = fetchServer("com.pulsemcp/remote-filesystem", "0.1.2");
  const launch = deriveLaunch(server);
  assert.deepEqual(launch, {
    transport: "stdio",
    command: ["npx", "-y", "remote-filesystem-mcp-server@0.1.2"],
  });
});

test("deriveLaunch(): real pypi/uvx server produces a working stdio command", testOpts, () => {
  const server = fetchServer("ai.adeu/adeu", "1.5.2");
  const launch = deriveLaunch(server);
  assert.deepEqual(launch, { transport: "stdio", command: ["uvx", "adeu@1.5.2"] });
});

test("deriveLaunch(): real remote-only server produces an http launch", testOpts, () => {
  const server = fetchServer("ac.tandem/docs-mcp", "0.3.2");
  const launch = deriveLaunch(server);
  assert.deepEqual(launch, { transport: "http", url: "https://tandem.ac/mcp" });
});

test(
  "deriveLaunch(): real oci-only server (unsupported, no remote fallback) throws",
  testOpts,
  () => {
    const server = fetchServer("ai.aliengiraffe/spotdb", "0.1.0");
    assert.throws(() => deriveLaunch(server), /unsupported registryType.*oci/);
  },
);

// ── Pure dispatch/error-path cases: hand-built fixtures, no network ─────────

test("deriveLaunch(): prefers the first package it can actually invoke over an earlier unsupported one", () => {
  const server = {
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
  const server = {
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
  const server = {
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
  const server = {
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
  const server = {
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
  const server = { name: "com.example/empty", description: "test", version: "1.0.0" };
  assert.throws(() => deriveLaunch(server), /declares neither packages nor remotes/);
});
