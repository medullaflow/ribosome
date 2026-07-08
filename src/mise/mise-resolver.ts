// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

import type {
  DependenciesManifest,
  McpServerManifest,
} from "../core/manifest-types";
import type {
  DependencyResolver,
  DependencyResolutionFailure,
  McpServerLaunch,
  ResolveOptions,
  ResolvedDependencies,
  ResolvedMcpServer,
  ResolvedRuntime,
} from "../core/resolver";
import { DependencyResolutionError } from "../core/resolver";

/**
 * Concrete DependencyResolver wrapping the mise-en-place CLI (runtimes)
 * and the MCP Registry (mcpServers). This is the ONLY file in ribosome
 * allowed to know either of those exist.
 *
 * Both external tools are CLI-only — mise is a Rust CLI (`mise install`,
 * `mise where <tool>`), and the MCP Registry is accessed over HTTP. Neither
 * exposes a programmatic library API, so all integration is subprocess
 * wrappers or HTTP calls.
 *
 * Interface shape only for now: method bodies are stubs (throw
 * "not implemented"), not working subprocess logic — that's real
 * engineering still to do.
 */
export class MiseDependencyResolver implements DependencyResolver {
  async resolve(deps: DependenciesManifest, options: ResolveOptions): Promise<ResolvedDependencies> {
    const failures: DependencyResolutionFailure[] = [];

    const runtimes = await this.resolveRuntimes(deps.runtimes ?? {}, options, failures);
    const mcpServers = await this.resolveMcpServers(deps.mcpServers ?? {}, options, failures);

    if (failures.length > 0) {
      throw new DependencyResolutionError(failures);
    }

    return {
      resolvedAt: new Date().toISOString(),
      runtimes,
      mcpServers,
    };
  }

  /**
   * Writes/updates mise.toml from `runtimes`, shells out to `mise
   * install`, then `mise where <tool>` per tool for the resolved
   * version + bin path. Appends one DependencyResolutionFailure per
   * tool that fails to install, rather than throwing on the first.
   */
  private async resolveRuntimes(
    runtimes: Record<string, string>,
    _options: ResolveOptions,
    _failures: DependencyResolutionFailure[],
  ): Promise<ResolvedRuntime[]> {
    void runtimes;
    throw new Error("not implemented: shell out to `mise install` / `mise where`");
  }

  /**
   * `source: "registry"` entries resolve `ref` against the MCP Registry —
   * the registry response determines the launch, not the manifest.
   * `source: "command"` entries are already concrete; `commandToLaunch`
   * just reshapes them. Appends one DependencyResolutionFailure per
   * server that fails to resolve.
   */
  private async resolveMcpServers(
    servers: Record<string, McpServerManifest>,
    _options: ResolveOptions,
    _failures: DependencyResolutionFailure[],
  ): Promise<ResolvedMcpServer[]> {
    void servers;
    throw new Error("not implemented: registry lookup for source=registry, passthrough via commandToLaunch for source=command");
  }

  private commandToLaunch(manifest: Extract<McpServerManifest, { source: "command" }>): McpServerLaunch {
    if (manifest.transport === "http") {
      if (!manifest.url) {
        throw new Error("mcpServer.url is required when transport is 'http' (loader-level rule, not schema-enforced)");
      }
      return { transport: "http", url: manifest.url };
    }
    return { transport: "stdio", command: manifest.command };
  }
}
