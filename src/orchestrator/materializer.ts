// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// The orchestrator: composes the spec, registry and environment layers into the
// phased materialization pipeline that turns a manifest into a lockfile. It
// depends only on ports (EnvironmentProvider, McpRegistry) — never on mise or a
// concrete registry. Adapters are injected; the default wiring lives in index.ts.
//
// Pipeline (see docs/ARCHITECTURE.md):
//   1. resolve each MCP server to a server.json descriptor (registry | inline | process)
//   2. derive runtime requirements from those descriptors
//   3. merge with the project's runtimes, dedup -> pool requirements
//   4. environmentProvider.materialize(pool)               -> RuntimePool
//   5. compose isolated environment views (project + per server)
//   6. assemble the lockfile, aggregating ALL failures
//
// Interface shape only for now: effectful phases delegate to ports whose bodies
// are still stubs, so materialize() throws until adapters are implemented.

import type { RibosomeLockfile, RibosomeManifest } from "@medullaflow/ribosome-schema";
import type { EnvironmentProvider } from "../ports/environment-provider";
import type { McpRegistry } from "../ports/mcp-registry";

export interface MaterializeOptions {
  /** Project root — where the lockfile lives and backends anchor their work. */
  cwd: string;
  /** Ignore any locked state and re-resolve from scratch. */
  refresh?: boolean;
}

/**
 * The single public entry point an orchestrator (e.g. medullaflow's engine)
 * depends on. It sees only manifests and lockfiles — never mise, a registry, or
 * a pool internal.
 */
export interface DependencyMaterializer {
  /**
   * Validate and materialize every declared dependency up front. Either
   * everything resolves, or it throws {@link ResolutionError} listing every
   * failure at once (not just the first).
   */
  materialize(manifest: RibosomeManifest, options: MaterializeOptions): Promise<RibosomeLockfile>;
}

export interface ResolutionFailure {
  kind: "runtime" | "mcpServer";
  /** Runtime tool name or MCP server id, matching the manifest. */
  id: string;
  /** Human-readable, shown to the user as-is. */
  reason: string;
  /** Underlying error, for logs/debugging. */
  cause?: unknown;
}

export class ResolutionError extends Error {
  constructor(readonly failures: ResolutionFailure[]) {
    super(
      `Failed to resolve ${failures.length} ` +
        `${failures.length === 1 ? "dependency" : "dependencies"}: ` +
        failures.map((f) => `${f.kind}:${f.id}`).join(", "),
    );
    this.name = "ResolutionError";
  }
}

export interface MaterializerDeps {
  environmentProvider: EnvironmentProvider;
  /** One adapter per registry protocol; selected by RegistrySource.type. */
  registries: McpRegistry[];
}

export class Materializer implements DependencyMaterializer {
  constructor(private readonly deps: MaterializerDeps) {}

  async materialize(
    manifest: RibosomeManifest,
    options: MaterializeOptions,
  ): Promise<RibosomeLockfile> {
    void manifest;
    void options;
    void this.deps;
    throw new Error(
      "not implemented: phased resolution (registry/inline -> requirements -> pool -> views -> lockfile)",
    );
  }
}
