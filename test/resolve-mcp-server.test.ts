// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Unit tests for resolveMcpServer()'s dispatch/normalization logic — a fake
// McpRegistry (an in-memory port double), never a real network call. This
// is orchestration logic, not an adapter: it should be covered against fake
// port implementations, independent of any real registry being reachable
// (see the Orchestrator Pipeline milestone's own stated acceptance
// criterion). The adapter's own real-HTTP behavior is covered separately,
// for real, in official-registry.test.js.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpServerJson } from "@medullaflow/ribosome-schema";
import { resolveMcpServer } from "../dist/index.js";
import type { McpRegistry, RegistryQuery } from "../src/ports/mcp-registry";

/** A fake McpRegistry: resolves whatever server.json it was constructed with. */
class FakeRegistry implements McpRegistry {
  constructor(
    readonly type: string,
    private readonly server: McpServerJson,
  ) {}
  async resolve(_query: RegistryQuery): Promise<McpServerJson> {
    return this.server;
  }
}

const FAKE_SERVER_JSON: McpServerJson = {
  name: "com.example/fake",
  description: "a fake server for testing resolveMcpServer's dispatch",
  version: "1.0.0",
  packages: [
    {
      registryType: "npm",
      identifier: "@example/fake",
      runtimeHint: "npx",
      transport: { type: "stdio" },
    },
  ],
};

test("inline source: unwraps .server, no adapter call needed", async () => {
  const result = await resolveMcpServer(
    { source: "inline", server: FAKE_SERVER_JSON, permissions: ["net"] },
    { adapters: [] },
  );
  assert.deepEqual(result, { kind: "server-json", server: FAKE_SERVER_JSON, permissions: ["net"] });
});

test("inline source: throws when the inline server.json fails schema validation", async () => {
  const malformed = { name: "com.example/malformed", description: "missing required version" };
  await assert.rejects(
    resolveMcpServer({ source: "inline", server: malformed as McpServerJson }, { adapters: [] }),
    /not a valid McpServerJson/,
  );
});

test("process source: passes through unresolved, no adapter call needed", async () => {
  const processEntry = { source: "process" as const, command: "npx", args: ["-y", "@foo/bar"] };
  const result = await resolveMcpServer(processEntry, { adapters: [] });
  // permissions is omitted (not present-as-undefined) when the manifest
  // entry doesn't declare it -- exactOptionalPropertyTypes discipline, see
  // resolve-mcp-server.ts's own conditional-spread construction.
  assert.deepEqual(result, { kind: "process", process: processEntry });
});

test("registry source: resolves via the matching adapter (by RegistrySource.type)", async () => {
  const adapter = new FakeRegistry("mcp-registry-v1", FAKE_SERVER_JSON);
  const result = await resolveMcpServer(
    { source: "registry", name: "com.example/fake", registry: "official" },
    {
      registries: { default: "official", sources: { official: { url: "https://example.test" } } },
      adapters: [adapter],
    },
  );
  assert.deepEqual(result, {
    kind: "server-json",
    server: FAKE_SERVER_JSON,
  });
});

test("registry source: falls back to registries.default when the entry omits `registry`", async () => {
  const adapter = new FakeRegistry("mcp-registry-v1", FAKE_SERVER_JSON);
  const result = await resolveMcpServer(
    { source: "registry", name: "com.example/fake" },
    {
      registries: { default: "official", sources: { official: { url: "https://example.test" } } },
      adapters: [adapter],
    },
  );
  assert.equal(result.kind, "server-json");
});

test("registry source: throws when no registry name is resolvable (no entry.registry, no default)", async () => {
  await assert.rejects(
    resolveMcpServer(
      { source: "registry", name: "com.example/fake" },
      { registries: { sources: {} }, adapters: [] },
    ),
    /no `registries\.default`/,
  );
});

test("registry source: throws when the named registry isn't declared", async () => {
  await assert.rejects(
    resolveMcpServer(
      { source: "registry", name: "com.example/fake", registry: "nonexistent" },
      { registries: { sources: {} }, adapters: [] },
    ),
    /not declared/,
  );
});

test("registry source: throws when no adapter matches the source's protocol type", async () => {
  await assert.rejects(
    resolveMcpServer(
      { source: "registry", name: "com.example/fake", registry: "official" },
      {
        registries: {
          sources: { official: { type: "some-other-protocol", url: "https://example.test" } },
        },
        adapters: [new FakeRegistry("mcp-registry-v1", FAKE_SERVER_JSON)], // wrong type
      },
    ),
    /no McpRegistry adapter registered/,
  );
});

test("one pass: registry, inline, and process entries all resolve correctly together", async () => {
  const ctx = {
    registries: { default: "official", sources: { official: { url: "https://example.test" } } },
    adapters: [new FakeRegistry("mcp-registry-v1", FAKE_SERVER_JSON)],
  };
  const manifestServers = {
    a: { source: "registry" as const, name: "com.example/fake" },
    b: { source: "inline" as const, server: FAKE_SERVER_JSON },
    c: { source: "process" as const, command: "npx", args: ["-y", "@foo/bar"] },
  };

  const resolved: Record<string, Awaited<ReturnType<typeof resolveMcpServer>>> = {};
  for (const [id, entry] of Object.entries(manifestServers)) {
    resolved[id] = await resolveMcpServer(entry, ctx);
  }

  assert.equal(resolved.a?.kind, "server-json");
  assert.equal(resolved.b?.kind, "server-json");
  assert.equal(resolved.c?.kind, "process");
  assert.deepEqual(resolved.a && "server" in resolved.a && resolved.a.server, FAKE_SERVER_JSON);
  assert.deepEqual(resolved.b && "server" in resolved.b && resolved.b.server, FAKE_SERVER_JSON);
});
