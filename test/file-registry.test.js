// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// FileMcpRegistry reads a real fixture file from disk -- no mocking of
// node:fs -- mirroring the "no mocking the registry" discipline of
// official-registry.test.js. test/fixtures/local-registry.json reuses the
// official registry's own `{ servers: [...] }` bulk-list envelope shape.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

const {
  FileMcpRegistry,
  RegistryUnreachableError,
  ServerNotFoundError,
  InvalidServerDescriptorError,
} = require("../dist/index.js");

const FIXTURE_URL = pathToFileURL(join(__dirname, "fixtures", "local-registry.json")).href;

function localSource() {
  return { type: "file", url: FIXTURE_URL };
}

test("resolve() reads a named, versioned entry from a local file", async () => {
  const server = await new FileMcpRegistry().resolve({
    name: "com.example/local-tool",
    version: "1.0.0",
    source: localSource(),
  });
  assert.equal(server.name, "com.example/local-tool");
  assert.equal(server.version, "1.0.0");
});

test("resolve() picks the highest version when none is given", async () => {
  const server = await new FileMcpRegistry().resolve({
    name: "com.example/local-tool",
    source: localSource(),
  });
  assert.equal(server.version, "2.1.0");
});

test("resolve() throws ServerNotFoundError for an unknown name", async () => {
  await assert.rejects(
    new FileMcpRegistry().resolve({ name: "com.example/nope", source: localSource() }),
    (err) => {
      assert.ok(err instanceof ServerNotFoundError);
      return true;
    },
  );
});

test("resolve() throws ServerNotFoundError for a known name but unknown version", async () => {
  await assert.rejects(
    new FileMcpRegistry().resolve({
      name: "com.example/local-tool",
      version: "9.9.9",
      source: localSource(),
    }),
    (err) => {
      assert.ok(err instanceof ServerNotFoundError);
      return true;
    },
  );
});

test("resolve() throws InvalidServerDescriptorError for an entry failing schema validation", async () => {
  await assert.rejects(
    new FileMcpRegistry().resolve({ name: "com.example/malformed", source: localSource() }),
    (err) => {
      assert.ok(err instanceof InvalidServerDescriptorError);
      return true;
    },
  );
});

test("resolve() throws RegistryUnreachableError when the file doesn't exist", async () => {
  await assert.rejects(
    new FileMcpRegistry().resolve({
      name: "whatever",
      source: { type: "file", url: pathToFileURL("/nonexistent/servers.json").href },
    }),
    (err) => {
      assert.ok(err instanceof RegistryUnreachableError);
      return true;
    },
  );
});

test("resolve() throws RegistryUnreachableError for a non-file: URL", async () => {
  await assert.rejects(
    new FileMcpRegistry().resolve({
      name: "whatever",
      source: { type: "file", url: "https://example.com/servers.json" },
    }),
    (err) => {
      assert.ok(err instanceof RegistryUnreachableError);
      return true;
    },
  );
});
