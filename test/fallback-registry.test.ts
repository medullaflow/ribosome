// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Unit tests against local throwaway HTTP servers (node:http) and a closed
// local port standing in for "unreachable" — no live network dependency,
// unlike official-registry.test.ts's own live-registry tests, since
// FallbackMcpRegistry's own logic (which URL gets tried, in what order, on
// which failures) is entirely mechanical and doesn't need a real registry
// to exercise.

import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import {
  parseMirrorUrls,
  REGISTRY_MIRRORS_ENV_VAR,
} from "../dist/adapters/mcp-registry/fallback-registry.js";
import {
  FallbackMcpRegistry,
  OfficialMcpRegistry,
  RegistryUnreachableError,
  ServerNotFoundError,
} from "../dist/index.js";

const SERVER_JSON = { name: "com.example/x", description: "d", version: "1.0.0" };

function localUrl(server: http.Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function okServer(): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: SERVER_JSON }));
  });
}

function notFoundServer(): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "not found" }));
  });
}

/** A closed local port: nothing listens, so any request fails fast with ECONNREFUSED. */
async function unreachableUrl(): Promise<string> {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const url = localUrl(probe);
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return url;
}

function query(url: string) {
  return { name: "whatever", source: { type: "mcp-registry-v1" as const, url } };
}

test("resolve() uses the primary URL and never touches a mirror when it succeeds", async () => {
  const primary = okServer();
  const mirror = notFoundServer(); // would produce a different, wrong outcome if ever hit
  await new Promise<void>((resolve) => primary.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => mirror.listen(0, "127.0.0.1", resolve));

  try {
    const registry = new FallbackMcpRegistry(new OfficialMcpRegistry(), [localUrl(mirror)]);
    const result = await registry.resolve(query(localUrl(primary)));
    assert.equal(result.name, SERVER_JSON.name);
  } finally {
    primary.close();
    mirror.close();
  }
});

test("resolve() falls through to a mirror when the primary URL is unreachable", async () => {
  const mirror = okServer();
  await new Promise<void>((resolve) => mirror.listen(0, "127.0.0.1", resolve));
  const deadUrl = await unreachableUrl();

  try {
    const registry = new FallbackMcpRegistry(new OfficialMcpRegistry(), [localUrl(mirror)]);
    const result = await registry.resolve(query(deadUrl));
    assert.equal(result.name, SERVER_JSON.name);
  } finally {
    mirror.close();
  }
});

test("resolve() tries mirrors in order and throws the last RegistryUnreachableError once all are exhausted", async () => {
  const deadUrl1 = await unreachableUrl();
  const deadUrl2 = await unreachableUrl();

  const registry = new FallbackMcpRegistry(new OfficialMcpRegistry(), [deadUrl2]);
  await assert.rejects(registry.resolve(query(deadUrl1)), (err: unknown) => {
    assert.ok(err instanceof RegistryUnreachableError);
    return true;
  });
});

test("resolve() does not fall through to a mirror on ServerNotFoundError -- the primary answered definitively", async () => {
  const primary = notFoundServer();
  const mirror = okServer();
  let mirrorRequestCount = 0;
  mirror.on("request", () => {
    mirrorRequestCount += 1;
  });
  await new Promise<void>((resolve) => primary.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => mirror.listen(0, "127.0.0.1", resolve));

  try {
    const registry = new FallbackMcpRegistry(new OfficialMcpRegistry(), [localUrl(mirror)]);
    await assert.rejects(registry.resolve(query(localUrl(primary))), (err: unknown) => {
      assert.ok(err instanceof ServerNotFoundError);
      return true;
    });
    assert.equal(mirrorRequestCount, 0);
  } finally {
    primary.close();
    mirror.close();
  }
});

test("type mirrors the wrapped adapter's type", () => {
  const registry = new FallbackMcpRegistry(new OfficialMcpRegistry(), []);
  assert.equal(registry.type, new OfficialMcpRegistry().type);
});

test("parseMirrorUrls() returns an empty list when the env var is unset", () => {
  assert.deepEqual(parseMirrorUrls({}), []);
});

test("parseMirrorUrls() splits, trims, and drops empty entries", () => {
  const env = { [REGISTRY_MIRRORS_ENV_VAR]: " https://a.example , https://b.example ,,  " };
  assert.deepEqual(parseMirrorUrls(env), ["https://a.example", "https://b.example"]);
});
