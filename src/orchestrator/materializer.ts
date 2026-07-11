// SPDX-License-Identifier: MPL-2.0
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
import { resolve as resolvePath } from "node:path";
import type {
  Environment,
  PooledRuntime,
  ResolvedMcpServer,
  RibosomeLockfile,
  RibosomeManifest,
} from "@medullaflow/ribosome-schema";
import type {
  EnvironmentDelta,
  EnvironmentProvider,
  RuntimeRequirement,
} from "../ports/environment-provider";
import type { McpRegistry } from "../ports/mcp-registry";
import { deriveLaunch, deriveProcessLaunch } from "./launch-mapping";
import type { RegistryResolutionContext, ResolvedMcpServerRef } from "./resolve-mcp-server";
import { resolveMcpServer } from "./resolve-mcp-server";
import { deriveRuntimeRequirements } from "./runtime-mapping";

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

/** Drop the port-internal `activationHook` -- the lockfile schema deliberately has no such field. */
function toEnvironment(delta: EnvironmentDelta): Environment {
  return { pathPrepend: delta.pathPrepend, envVars: delta.envVars };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class Materializer implements DependencyMaterializer {
  constructor(private readonly deps: MaterializerDeps) {}

  async materialize(
    manifest: RibosomeManifest,
    options: MaterializeOptions,
  ): Promise<RibosomeLockfile> {
    const failures: ResolutionFailure[] = [];
    const versionPolicy = manifest.runtimes ?? {};
    const registryCtx: RegistryResolutionContext = {
      registries: manifest.registries,
      adapters: this.deps.registries,
    };

    // Phase 2: resolve each MCP server entry (registry | inline -> server-json, process -> passthrough).
    const entries = Object.entries(manifest.mcpServers ?? {});
    const settled = await Promise.allSettled(
      entries.map(([, entry]) => resolveMcpServer(entry, registryCtx)),
    );
    const resolved: { id: string; ref: ResolvedMcpServerRef }[] = [];
    settled.forEach((result, i) => {
      // entries[i] always exists: settled is entries.map(...), so the two
      // arrays are index-aligned by construction.
      const [id] = entries[i] as (typeof entries)[number];
      if (result.status === "fulfilled") {
        resolved.push({ id, ref: result.value });
      } else {
        failures.push({
          kind: "mcpServer",
          id,
          reason: describeError(result.reason),
          cause: result.reason,
        });
      }
    });

    // Phase 3a: derive per-server runtime requirements from the registry-determined
    // packages (server-json branch only -- process servers carry no packages and
    // run inside the project's own pool view instead, see the "process" branch below).
    const requirementsById = new Map<string, RuntimeRequirement[]>();
    for (const { id, ref } of resolved) {
      requirementsById.set(
        id,
        ref.kind === "server-json" ? deriveRuntimeRequirements(ref.server, versionPolicy) : [],
      );
    }

    // Phase 3b: merge the project's own declared runtimes (the version policy)
    // with every server's derived requirements, deduped by tool -- two servers
    // needing the same runtime must not provision it twice.
    const projectRequirements: RuntimeRequirement[] = Object.entries(versionPolicy).map(
      ([tool, versionSpec]) => ({ tool, versionSpec }),
    );
    const poolRequirementsByTool = new Map<string, RuntimeRequirement>();
    for (const req of projectRequirements) poolRequirementsByTool.set(req.tool, req);
    for (const reqs of requirementsById.values()) {
      for (const req of reqs) {
        if (!poolRequirementsByTool.has(req.tool)) poolRequirementsByTool.set(req.tool, req);
      }
    }
    const poolRequirements = [...poolRequirementsByTool.values()];

    // Phase 4: materialize the deduplicated pool. Even if some servers failed to
    // resolve above, still attempt this so environment failures surface in the
    // same pass instead of a fix-one-rerun loop.
    // manifest.pool.dir is resolved relative to the project root (cwd), same
    // anchor as everything else here -- not the manifest file's own location,
    // which Materializer never sees (only the already-parsed manifest value).
    const poolDir = manifest.pool?.dir ? resolvePath(options.cwd, manifest.pool.dir) : undefined;

    let pool: PooledRuntime[] = [];
    try {
      pool = await this.deps.environmentProvider.materialize(poolRequirements, {
        cwd: options.cwd,
        ...(options.refresh !== undefined && { refresh: options.refresh }),
        ...(poolDir !== undefined && { poolDir }),
      });
    } catch (err) {
      failures.push({
        kind: "runtime",
        id: poolRequirements.map((r) => r.tool).join(", ") || "(none)",
        reason: describeError(err),
        cause: err,
      });
    }

    if (failures.length > 0) {
      throw new ResolutionError(failures);
    }

    // Phase 5: compose isolated environment views -- the project's own, and one
    // per server -- over the shared pool. Isolation at the view level,
    // deduplication at the install level.
    const poolIdsForTools = (tools: string[]): string[] => {
      const wanted = new Set(tools);
      return pool.filter((p) => wanted.has(p.tool)).map((p) => p.id);
    };

    const projectPoolIds = poolIdsForTools(projectRequirements.map((r) => r.tool));
    const projectView = toEnvironment(
      this.deps.environmentProvider.composeView(pool, projectPoolIds),
    );

    const mcpServers: ResolvedMcpServer[] = resolved.map(({ id, ref }) => {
      if (ref.kind === "process") {
        // Compatibility bridge: runs inside the project's own pool view, plus
        // whatever env overrides the process entry itself declares.
        return {
          id,
          uses: projectPoolIds,
          launch: deriveProcessLaunch(ref.process),
          environment: {
            pathPrepend: projectView.pathPrepend,
            envVars: { ...projectView.envVars, ...(ref.process.env ?? {}) },
          },
          ...(ref.permissions !== undefined && { permissions: ref.permissions }),
        };
      }
      const uses = poolIdsForTools((requirementsById.get(id) ?? []).map((r) => r.tool));
      const environment = toEnvironment(this.deps.environmentProvider.composeView(pool, uses));
      return {
        id,
        uses,
        launch: deriveLaunch(ref.server),
        environment,
        ...(ref.permissions !== undefined && { permissions: ref.permissions }),
      };
    });

    // Phase 6: assemble the lockfile.
    return {
      schemaVersion: "1",
      resolvedAt: new Date().toISOString(),
      runtimePool: pool,
      project: projectView,
      mcpServers,
    };
  }
}
