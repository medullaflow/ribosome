// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Normalizes a manifest's three MCP server source kinds (registry | inline |
// process) into one common shape before the phased pipeline
// (materializer.ts) takes over. Registry and inline sources converge on the
// same server.json descriptor (a registry lookup resolves to exactly what an
// inline server already carries); process sources carry no server.json at
// all and pass through unresolved, per the manifest schema's own doc comment
// on ProcessServer ("Not runtime-resolved by ribosome").
//
// Deliberately stops here: deriving an actual runtime pool / launch command
// from the "server-json" branch's `packages` is the phased pipeline's job
// (see docs/ARCHITECTURE.md's Orchestrator Pipeline milestone), not this
// normalization step's.
//
// The "inline" branch validates its server.json the same way a registry
// adapter validates what it receives over the wire (checkMcpServerJson,
// non-throwing so its errors can be aggregated like every other resolution
// failure here, not raised as a standalone throw): a manifest is untrusted
// input until validateManifest()/checkManifest() has run over it, and that
// step lives upstream of this one (see docs/ARCHITECTURE.md's pipeline step
// 1), not inside it — so a malformed inline server.json must still be
// caught here rather than surfacing later as a confusing failure deep in
// runtime-mapping/launch-mapping.

import type {
  McpServer,
  McpServerJson,
  Permissions,
  ProcessServer,
  RegistrySource,
  RibosomeManifest,
} from "@medullaflow/ribosome-schema";
import { checkMcpServerJson } from "@medullaflow/ribosome-schema";
import type { McpRegistry } from "../ports/mcp-registry";

/** Matches OfficialMcpRegistry.type — the implicit default when RegistrySource.type is omitted. */
const DEFAULT_REGISTRY_TYPE = "mcp-registry-v1";

/**
 * The common shape every McpServer source normalizes to. A discriminated
 * union, not a single merged shape: process servers structurally have no
 * server.json (no packages, no registry-derived runtime info), so forcing
 * them into that shape would mean inventing fields that don't exist.
 */
export type ResolvedMcpServerRef =
  | { kind: "server-json"; server: McpServerJson; permissions?: Permissions }
  | { kind: "process"; process: ProcessServer; permissions?: Permissions };

export interface RegistryResolutionContext {
  /** manifest.registries — named sources + which one is the default. */
  registries?: RibosomeManifest["registries"];
  /** Available adapter instances, one per registry protocol (McpRegistry.type). */
  adapters: McpRegistry[];
}

function findRegistrySource(
  registryName: string | undefined,
  ctx: RegistryResolutionContext,
): {
  name: string;
  source: RegistrySource;
} {
  const name = registryName ?? ctx.registries?.default;
  if (!name) {
    throw new Error(
      "MCP server declares no `registry` and the manifest has no `registries.default` to fall back to",
    );
  }
  const source = ctx.registries?.sources?.[name];
  if (!source) {
    throw new Error(`registry "${name}" is not declared in this manifest's \`registries.sources\``);
  }
  return { name, source };
}

function findAdapter(source: RegistrySource, ctx: RegistryResolutionContext): McpRegistry {
  const type = source.type ?? DEFAULT_REGISTRY_TYPE;
  const adapter = ctx.adapters.find((a) => a.type === type);
  if (!adapter) {
    throw new Error(`no McpRegistry adapter registered for registry type "${type}"`);
  }
  return adapter;
}

/** Normalize one manifest MCP server entry, whichever of the three sources it declares. */
export async function resolveMcpServer(
  entry: McpServer,
  ctx: RegistryResolutionContext,
): Promise<ResolvedMcpServerRef> {
  switch (entry.source) {
    case "registry": {
      const { source } = findRegistrySource(entry.registry, ctx);
      const adapter = findAdapter(source, ctx);
      const server = await adapter.resolve({
        name: entry.name,
        ...(entry.version !== undefined && { version: entry.version }),
        source,
      });
      return {
        kind: "server-json",
        server,
        ...(entry.permissions !== undefined && { permissions: entry.permissions }),
      };
    }
    case "inline": {
      const { valid, errors } = checkMcpServerJson(entry.server);
      if (!valid) {
        throw new Error(
          `inline server.json is not a valid McpServerJson:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
        );
      }
      return {
        kind: "server-json",
        server: entry.server,
        ...(entry.permissions !== undefined && { permissions: entry.permissions }),
      };
    }
    case "process":
      return {
        kind: "process",
        process: entry,
        ...(entry.permissions !== undefined && { permissions: entry.permissions }),
      };
  }
}
