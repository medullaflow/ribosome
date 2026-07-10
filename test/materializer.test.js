// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Unit tests for Materializer.materialize() -- the phased resolution pipeline
// (see #23 / docs/ARCHITECTURE.md's "The phased pipeline"). Covered entirely
// against fake port implementations (FakeRegistry, FakeEnvironmentProvider),
// never a real registry or real mise, per this milestone's own stated
// acceptance criterion: the manifest-to-lockfile path must be testable
// independent of any real adapter being available in the test run.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { Materializer, ResolutionError } = require("../dist/index.js");

/** Fake McpRegistry: resolves whatever server.json map it was constructed with. */
class FakeRegistry {
  constructor(type, servers) {
    this.type = type;
    this.servers = servers; // name -> McpServerJson | Error
  }
  async resolve(query) {
    const entry = this.servers[query.name];
    if (entry instanceof Error) throw entry;
    if (!entry) throw new Error(`FakeRegistry: no fixture for "${query.name}"`);
    return entry;
  }
}

/**
 * Fake EnvironmentProvider: "installs" by echoing back one PooledRuntime per
 * requirement (version = versionSpec or a fixed placeholder), and records
 * every materialize() call so tests can assert exactly which -- and how
 * many -- requirements actually reached the provider (the dedup proof).
 */
class FakeEnvironmentProvider {
  constructor({ failTools = [] } = {}) {
    this.failTools = new Set(failTools);
    this.materializeCalls = [];
  }

  async materialize(reqs, _ctx) {
    this.materializeCalls.push(reqs);
    const failing = reqs.filter((r) => this.failTools.has(r.tool));
    if (failing.length > 0) {
      throw new Error(`fake provisioning failure: ${failing.map((r) => r.tool).join(", ")}`);
    }
    return reqs.map((r) => ({
      id: `${r.tool}@${r.versionSpec || "0.0.0"}`,
      tool: r.tool,
      requested: r.versionSpec,
      version: r.versionSpec || "0.0.0",
    }));
  }

  composeView(pool, select) {
    for (const id of select) {
      if (!pool.some((p) => p.id === id)) throw new Error(`unknown pool id "${id}"`);
    }
    return { pathPrepend: select.map((id) => `/pool/${id}/bin`), envVars: {} };
  }
}

const SERVER_A = {
  name: "com.example/a",
  description: "needs node",
  version: "1.0.0",
  packages: [{ registryType: "npm", identifier: "@example/a", transport: { type: "stdio" } }],
};

const SERVER_B = {
  name: "com.example/b",
  description: "needs node and python",
  version: "1.0.0",
  packages: [
    { registryType: "npm", identifier: "@example/b", transport: { type: "stdio" } },
    { registryType: "pypi", identifier: "example-b", transport: { type: "stdio" } },
  ],
};

function baseManifest(extra = {}) {
  return {
    schemaVersion: "1",
    runtimes: { jq: "1.7" },
    mcpServers: {
      serverA: { source: "inline", server: SERVER_A },
      serverB: { source: "inline", server: SERVER_B },
      serverC: { source: "process", command: "npx", args: ["-y", "@foo/bar"], env: { FOO: "bar" } },
    },
    ...extra,
  };
}

test("materialize(): shares one pool install across servers that need the same runtime", async () => {
  const environmentProvider = new FakeEnvironmentProvider();
  const materializer = new Materializer({ environmentProvider, registries: [] });

  const lockfile = await materializer.materialize(baseManifest(), { cwd: "/project" });

  // Exactly one materialize() call, with one entry per DISTINCT tool -- not
  // one per (server, tool) pair. jq (project) + node (A, B) + python (B).
  assert.equal(environmentProvider.materializeCalls.length, 1);
  const reqTools = environmentProvider.materializeCalls[0].map((r) => r.tool).sort();
  assert.deepEqual(reqTools, ["jq", "node", "python"]);

  // The pool itself has exactly one "node" entry, shared by both A and B.
  const nodeEntries = lockfile.runtimePool.filter((p) => p.tool === "node");
  assert.equal(nodeEntries.length, 1);

  const serverA = lockfile.mcpServers.find((s) => s.id === "serverA");
  const serverB = lockfile.mcpServers.find((s) => s.id === "serverB");
  assert.deepEqual(serverA.uses, [nodeEntries[0].id]);
  assert.ok(
    serverB.uses.includes(nodeEntries[0].id),
    "serverB shares the same node pool id as serverA",
  );
});

test("materialize(): isolates each server's composed environment view despite the shared pool", async () => {
  const environmentProvider = new FakeEnvironmentProvider();
  const materializer = new Materializer({ environmentProvider, registries: [] });

  const lockfile = await materializer.materialize(baseManifest(), { cwd: "/project" });

  const serverA = lockfile.mcpServers.find((s) => s.id === "serverA");
  const serverB = lockfile.mcpServers.find((s) => s.id === "serverB");

  // A needs only node; B needs node AND python. A's view must not leak B's python path.
  assert.equal(serverA.uses.length, 1);
  assert.equal(serverB.uses.length, 2);
  assert.ok(!serverA.environment.pathPrepend.some((p) => p.includes("python")));
  assert.ok(serverB.environment.pathPrepend.some((p) => p.includes("python")));

  // Neither server's view leaks the project's own "jq" pool entry.
  assert.ok(!serverA.environment.pathPrepend.some((p) => p.includes("jq")));
  assert.ok(!serverB.environment.pathPrepend.some((p) => p.includes("jq")));
  assert.ok(lockfile.project.pathPrepend.some((p) => p.includes("jq")));
});

test("materialize(): a process entry runs inside the project's own pool view plus its own env overrides", async () => {
  const environmentProvider = new FakeEnvironmentProvider();
  const materializer = new Materializer({ environmentProvider, registries: [] });

  const lockfile = await materializer.materialize(baseManifest(), { cwd: "/project" });

  const serverC = lockfile.mcpServers.find((s) => s.id === "serverC");
  const jqPoolIds = lockfile.runtimePool.filter((p) => p.tool === "jq").map((p) => p.id);
  assert.deepEqual(serverC.uses, jqPoolIds); // same selection as the project's own view
  assert.deepEqual(serverC.launch, { transport: "stdio", command: ["npx", "-y", "@foo/bar"] });
  assert.equal(serverC.environment.envVars.FOO, "bar");
  assert.deepEqual(serverC.environment.pathPrepend, lockfile.project.pathPrepend);
});

test("materialize(): the full manifest-to-lockfile path needs no real registry or environment provider", async () => {
  const registry = new FakeRegistry("mcp-registry-v1", { "com.example/registered": SERVER_A });
  const environmentProvider = new FakeEnvironmentProvider();
  const materializer = new Materializer({ environmentProvider, registries: [registry] });

  const manifest = {
    schemaVersion: "1",
    registries: { default: "official", sources: { official: { url: "https://example.test" } } },
    mcpServers: {
      registered: { source: "registry", name: "com.example/registered" },
    },
  };

  const lockfile = await materializer.materialize(manifest, { cwd: "/project" });
  assert.equal(lockfile.schemaVersion, "1");
  assert.ok(lockfile.resolvedAt);
  assert.equal(lockfile.mcpServers.length, 1);
  assert.deepEqual(lockfile.mcpServers[0].launch, {
    transport: "stdio",
    command: ["npx", "@example/a"],
  });
});

test("materialize(): aggregates a registry-resolution failure and an environment-provisioning failure together", async () => {
  const registry = new FakeRegistry("mcp-registry-v1", {
    good: SERVER_A,
    bad: new Error("boom: registry lookup failed"),
  });
  const environmentProvider = new FakeEnvironmentProvider({ failTools: ["node"] });
  const materializer = new Materializer({ environmentProvider, registries: [registry] });

  const manifest = {
    schemaVersion: "1",
    registries: { default: "official", sources: { official: { url: "https://example.test" } } },
    mcpServers: {
      goodServer: { source: "registry", name: "good" },
      badServer: { source: "registry", name: "bad" },
    },
  };

  await assert.rejects(materializer.materialize(manifest, { cwd: "/project" }), (err) => {
    assert.ok(err instanceof ResolutionError);
    const byKind = Object.fromEntries(err.failures.map((f) => [f.kind, f]));
    assert.equal(byKind.mcpServer.id, "badServer");
    assert.match(byKind.mcpServer.reason, /boom: registry lookup failed/);
    assert.equal(byKind.runtime.id, "node");
    return true;
  });
});

test("materialize(): reports every independent failure (registry lookup + inline validation + runtime provisioning) in one attempt, each tagged with its own manifest entry", async () => {
  const registry = new FakeRegistry("mcp-registry-v1", {
    bad: new Error("boom: registry lookup failed"),
  });
  const environmentProvider = new FakeEnvironmentProvider({ failTools: ["node"] });
  const materializer = new Materializer({ environmentProvider, registries: [registry] });

  const manifest = {
    schemaVersion: "1",
    registries: { default: "official", sources: { official: { url: "https://example.test" } } },
    mcpServers: {
      badRegistryServer: { source: "registry", name: "bad" },
      badInlineServer: {
        source: "inline",
        server: { name: "com.example/malformed", description: "missing required version" },
      },
      goodServer: { source: "inline", server: SERVER_A },
    },
  };

  await assert.rejects(materializer.materialize(manifest, { cwd: "/project" }), (err) => {
    assert.ok(err instanceof ResolutionError);
    assert.equal(
      err.failures.length,
      3,
      "registry + inline validation + runtime, not just the first",
    );

    const byId = Object.fromEntries(err.failures.map((f) => [f.id, f]));
    assert.equal(byId.badRegistryServer.kind, "mcpServer");
    assert.match(byId.badRegistryServer.reason, /boom: registry lookup failed/);
    assert.equal(byId.badInlineServer.kind, "mcpServer");
    assert.match(byId.badInlineServer.reason, /not a valid McpServerJson/);
    assert.equal(byId.node.kind, "runtime");
    return true;
  });
});
