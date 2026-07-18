// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Proves multi-source registry dispatch end-to-end through resolveMcpServer():
// two distinct `registries.sources` entries, both of type "mcp-registry-v1",
// resolved via the same shared OfficialMcpRegistry adapter instance in one
// run -- the official live registry (real HTTP, skipped if unreachable, same
// hasNetworkAccess() guard as official-registry.test.js) plus a local
// throwaway HTTP server that requires an auth header, standing in for a real
// independent authenticated subregistry (e.g. PulseMCP) without depending on
// any third-party account/API key. See #40 for why this was descoped from a
// real external subregistry.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { OfficialMcpRegistry, resolveMcpServer } from "../dist/index.js";

const OFFICIAL_URL = "https://registry.modelcontextprotocol.io";
const KNOWN_SERVER = { name: "com.pulsemcp/remote-filesystem", version: "0.1.2" };
const LOCAL_AUTH_TOKEN = "local-test-token-abc123";

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
// Matches the adapter's own full worst case (3 attempts x 20s + 1000ms +
// 2000ms backoff = 63s, D51) -- this test goes through the real adapter,
// so it can legitimately need all 3 attempts before settling, and a
// tighter test-level timeout would fire before the adapter's own retry
// loop finishes (see official-registry.test.ts for how this was caught).
const testOpts = {
  skip: skip ? "registry.modelcontextprotocol.io unreachable" : false,
  timeout: 70000,
};

test(
  "resolveMcpServer(): resolves from two distinct registries.sources (official + a local authenticated stand-in) in one run",
  testOpts,
  async () => {
    const localServer = http.createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${LOCAL_AUTH_TOKEN}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          server: { name: "com.example/local-auth-test", description: "d", version: "1.0.0" },
        }),
      );
    });
    await new Promise<void>((resolve) => localServer.listen(0, "127.0.0.1", resolve));
    const port = (localServer.address() as AddressInfo).port;

    process.env.RIBOSOME_TEST_LOCAL_AUTH_TOKEN = `Bearer ${LOCAL_AUTH_TOKEN}`;
    try {
      const ctx = {
        registries: {
          default: "official",
          sources: {
            official: { type: "mcp-registry-v1", url: OFFICIAL_URL },
            local: {
              type: "mcp-registry-v1",
              url: `http://127.0.0.1:${port}`,
              auth: [{ header: "Authorization", envVar: "RIBOSOME_TEST_LOCAL_AUTH_TOKEN" }],
            },
          },
        },
        adapters: [new OfficialMcpRegistry()],
      };

      const [official, local] = await Promise.all([
        resolveMcpServer(
          {
            source: "registry",
            registry: "official",
            name: KNOWN_SERVER.name,
            version: KNOWN_SERVER.version,
          },
          ctx,
        ),
        resolveMcpServer(
          { source: "registry", registry: "local", name: "com.example/local-auth-test" },
          ctx,
        ),
      ]);

      assert.equal(official.kind, "server-json");
      assert.equal(local.kind, "server-json");
      if (official.kind !== "server-json" || local.kind !== "server-json") {
        throw new Error("unreachable: both asserted server-json above");
      }
      assert.equal(official.server.name, KNOWN_SERVER.name);
      assert.equal(local.server.name, "com.example/local-auth-test");
    } finally {
      delete process.env.RIBOSOME_TEST_LOCAL_AUTH_TOKEN;
      localServer.close();
    }
  },
);
