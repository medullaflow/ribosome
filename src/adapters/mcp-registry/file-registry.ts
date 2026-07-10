// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Adapter: an offline/local MCP registry backed by a single JSON file on
// disk -- for air-gapped setups or local testing, distinct from pointing a
// RegistrySource at a self-hosted instance of the official registry binary
// (already works today via OfficialMcpRegistry with zero new code, since
// adapters are selected by RegistrySource.type, not by URL). One of the only
// two places in ribosome allowed to know a concrete MCP registry mechanism
// exists (the other being any sibling adapter).
//
// Reuses the official registry's own bulk-list envelope shape
// (`{ servers: [...] }`, the same shape `GET /v0.1/servers` returns) for the
// on-disk file, rather than inventing a new one -- so
// `curl https://registry.modelcontextprotocol.io/v0.1/servers > servers.json`
// is directly usable as a local registry, and validation reuses the same
// `checkMcpServerJson` path OfficialMcpRegistry already relies on.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { McpServerJson } from "@medullaflow/ribosome-schema";
import { checkMcpServerJson } from "@medullaflow/ribosome-schema";
import {
  InvalidServerDescriptorError,
  type McpRegistry,
  type RegistryQuery,
  RegistryUnreachableError,
  ServerNotFoundError,
} from "../../ports/mcp-registry";

/** The on-disk envelope: identical shape to the official registry's `GET /v0.1/servers` response. */
interface ServersEnvelope {
  servers: unknown[];
}

/** Resolves `query.source.url` (a `file:` URI) to a filesystem path, or throws a typed failure. */
function filePath(query: RegistryQuery): string {
  let url: URL;
  try {
    url = new URL(query.source.url);
  } catch (cause) {
    throw new RegistryUnreachableError(query, cause);
  }
  if (url.protocol !== "file:") {
    throw new RegistryUnreachableError(
      query,
      new Error(`FileMcpRegistry requires a "file:" URL, got "${url.protocol}"`),
    );
  }
  return fileURLToPath(url);
}

/**
 * Minimal dot-numeric version comparator (higher wins) used only to pick
 * "latest" among same-named entries when `query.version` is omitted -- not a
 * full semver implementation (no prerelease/build-metadata handling), which
 * this adapter's local/offline use case doesn't need.
 */
function compareVersions(a: string, b: string): number {
  const as = a.split(".");
  const bs = b.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const an = Number(as[i]);
    const bn = Number(bs[i]);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) return an - bn;
    } else {
      const cmp = (as[i] ?? "").localeCompare(bs[i] ?? "");
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

function isNamedEntry(name: string) {
  return (s: unknown): s is Record<string, unknown> =>
    typeof s === "object" && s !== null && (s as Record<string, unknown>).name === name;
}

export class FileMcpRegistry implements McpRegistry {
  readonly type = "file";

  async resolve(query: RegistryQuery): Promise<McpServerJson> {
    const path = filePath(query);

    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (cause) {
      throw new RegistryUnreachableError(query, cause);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch (cause) {
      throw new InvalidServerDescriptorError(query, [
        `"${path}" is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      ]);
    }

    const envelope = body as Partial<ServersEnvelope> | null;
    if (!envelope || typeof envelope !== "object" || !Array.isArray(envelope.servers)) {
      throw new InvalidServerDescriptorError(query, [`"${path}" is missing a "servers" array`]);
    }

    const candidates = envelope.servers.filter(isNamedEntry(query.name));
    if (candidates.length === 0) {
      throw new ServerNotFoundError(query);
    }

    const match = query.version
      ? candidates.find((s) => s.version === query.version)
      : candidates.reduce((best, s) =>
          compareVersions(String(s.version ?? ""), String(best.version ?? "")) > 0 ? s : best,
        );
    if (!match) {
      throw new ServerNotFoundError(query);
    }

    const { valid, errors } = checkMcpServerJson(match);
    if (!valid) {
      throw new InvalidServerDescriptorError(query, errors);
    }
    return match as McpServerJson;
  }
}
