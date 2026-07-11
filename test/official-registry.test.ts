// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Integration test against the REAL official MCP Registry (registry.
// modelcontextprotocol.io) — no mocking of the HTTP call itself, mirroring
// mise-environment-provider.test.js's "real tool, not a fake" approach.
// Skips itself if the registry is unreachable, so `bun run test` stays green
// offline (CI has network access; see .github/workflows/ci.yml).
//
// Reachability is checked via a synchronous `curl` (execFileSync), exactly
// like the mise test's own hasMise() — NOT an async fetch resolved before
// registration: Bun's node:test shim does not support test() being called
// from inside a still-pending async task at module load (nested-test error,
// https://github.com/oven-sh/bun/issues/5090), which an async top-level
// check would trigger here.
//
// The "unreachable" and "malformed descriptor" failure categories (#22) are
// exercised for real too, without mocking application logic: "unreachable"
// points at a genuinely non-routable address (real timeout, real
// AbortSignal.timeout path); "malformed" spins up a throwaway local HTTP
// server (node:http, no new dependency) that serves a deliberately broken
// body, so only the network target changes — the adapter's own fetch/parse/
// validate code runs for real in every case.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import {
  InvalidServerDescriptorError,
  MissingRegistryCredentialError,
  OfficialMcpRegistry,
  RegistryUnreachableError,
  ServerNotFoundError,
} from "../dist/index.js";

const OFFICIAL_URL = "https://registry.modelcontextprotocol.io";
// A real, known-published server (verified while designing this adapter) —
// small, stable, unlikely to be unpublished.
const KNOWN_SERVER = { name: "com.pulsemcp/remote-filesystem", version: "0.1.2" };

function officialSource() {
  return { type: "mcp-registry-v1" as const, url: OFFICIAL_URL };
}

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

function addressPort(server: http.Server): number {
  return (server.address() as AddressInfo).port;
}

const skip = !hasNetworkAccess();
// timeout comfortably above the adapter's own 10s resolve timeout (and above
// the ~5s default node:test timeout), since bun test --parallel now runs
// every test file concurrently -- these real HTTP calls can queue behind
// each other under that concurrent load, not just behind the adapter's own
// single-request timeout.
const testOpts = {
  skip: skip ? "registry.modelcontextprotocol.io unreachable" : false,
  timeout: 20000,
};

test("resolve() fetches a real, known server from the live registry", testOpts, async () => {
  const registry = new OfficialMcpRegistry();
  const server = await registry.resolve({
    name: KNOWN_SERVER.name,
    version: KNOWN_SERVER.version,
    source: officialSource(),
  });

  assert.equal(server.name, KNOWN_SERVER.name);
  assert.equal(server.version, KNOWN_SERVER.version);
  assert.ok(Array.isArray(server.packages) && server.packages.length > 0);
});

test("resolve() defaults to the latest version when none is given", testOpts, async () => {
  const registry = new OfficialMcpRegistry();
  const server = await registry.resolve({ name: KNOWN_SERVER.name, source: officialSource() });
  assert.equal(server.name, KNOWN_SERVER.name);
  assert.match(server.version, /^\d+\.\d+\.\d+$/);
});

test("resolve() throws ServerNotFoundError for a name that doesn't exist", testOpts, async () => {
  await assert.rejects(
    new OfficialMcpRegistry().resolve({
      name: "io.ribosome-test/definitely-not-a-real-server-xyz",
      source: officialSource(),
    }),
    (err: unknown) => {
      assert.ok(err instanceof ServerNotFoundError);
      return true;
    },
  );
});

// Timeout here is longer than the adapter's own 10s resolve timeout
// (official-registry.ts), which this test deliberately waits out in full.
test("resolve() throws RegistryUnreachableError against a non-routable address", {
  timeout: 15000,
}, async () => {
  await assert.rejects(
    new OfficialMcpRegistry().resolve({
      name: "whatever",
      // TEST-NET-1 (RFC 5737): reserved, guaranteed non-routable, no real
      // network flakiness risk — this always times out.
      source: { type: "mcp-registry-v1", url: "http://192.0.2.1" },
    }),
    (err: unknown) => {
      assert.ok(err instanceof RegistryUnreachableError);
      return true;
    },
  );
});

test("resolve() throws InvalidServerDescriptorError on a malformed body", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: { name: "missing-required-fields" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = addressPort(server);

  try {
    await assert.rejects(
      new OfficialMcpRegistry().resolve({
        name: "whatever",
        source: { type: "mcp-registry-v1", url: `http://127.0.0.1:${port}` },
      }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidServerDescriptorError);
        assert.ok(err.validationErrors.length > 0);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("resolve() throws InvalidServerDescriptorError on a non-JSON body", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("not json at all");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = addressPort(server);

  try {
    await assert.rejects(
      new OfficialMcpRegistry().resolve({
        name: "whatever",
        source: { type: "mcp-registry-v1", url: `http://127.0.0.1:${port}` },
      }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidServerDescriptorError);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("resolve() sends every header declared in source.auth, value read from its named env var", async () => {
  let receivedHeaders: http.IncomingHttpHeaders | undefined;
  const server = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ server: { name: "com.example/x", description: "d", version: "1.0.0" } }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = addressPort(server);

  process.env.RIBOSOME_TEST_API_KEY = "secret-key-123";
  process.env.RIBOSOME_TEST_TENANT_ID = "tenant-456";
  try {
    await new OfficialMcpRegistry().resolve({
      name: "whatever",
      source: {
        type: "mcp-registry-v1",
        url: `http://127.0.0.1:${port}`,
        auth: [
          { header: "X-API-Key", envVar: "RIBOSOME_TEST_API_KEY" },
          { header: "X-Tenant-ID", envVar: "RIBOSOME_TEST_TENANT_ID" },
        ],
      },
    });
    assert.equal(receivedHeaders?.["x-api-key"], "secret-key-123");
    assert.equal(receivedHeaders?.["x-tenant-id"], "tenant-456");
  } finally {
    delete process.env.RIBOSOME_TEST_API_KEY;
    delete process.env.RIBOSOME_TEST_TENANT_ID;
    server.close();
  }
});

test("resolve() throws MissingRegistryCredentialError, without making any request, when the named env var isn't set", async () => {
  let requestMade = false;
  const server = http.createServer((_req, res) => {
    requestMade = true;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: {} }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = addressPort(server);

  delete process.env.RIBOSOME_TEST_MISSING_VAR;
  try {
    await assert.rejects(
      new OfficialMcpRegistry().resolve({
        name: "whatever",
        source: {
          type: "mcp-registry-v1",
          url: `http://127.0.0.1:${port}`,
          auth: [{ header: "Authorization", envVar: "RIBOSOME_TEST_MISSING_VAR" }],
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof MissingRegistryCredentialError);
        assert.equal(err.header, "Authorization");
        assert.equal(err.envVar, "RIBOSOME_TEST_MISSING_VAR");
        return true;
      },
    );
    assert.equal(requestMade, false);
  } finally {
    server.close();
  }
});
