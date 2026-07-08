// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

import type { DependenciesManifest } from "./manifest-types";

/**
 * The core abstract interface for ribosome. Orchestrators (e.g. medullaflow's
 * Engine) depend only on this — they must not know mise or the MCP Registry
 * exist. src/mise/ holds the only concrete implementation today.
 */
export interface DependencyResolver {
  /**
   * Validates and materializes every declared dependency upfront — before
   * any workflow execution. Must collect all failures: either everything
   * resolves, or it throws DependencyResolutionError listing every failure
   * at once (not just the first), so a caller can report all of them together.
   */
  resolve(deps: DependenciesManifest, options: ResolveOptions): Promise<ResolvedDependencies>;
}

export interface ResolveOptions {
  /** Project root — where mise.toml and the lockfile live. */
  cwd: string;
  /** Previous resolution result, if any (for lockfile-based reproducible re-runs). */
  lockfile?: ResolvedDependencies;
  /** Ignore the lockfile and re-resolve everything from scratch. */
  refresh?: boolean;
}

/**
 * Output of a successful resolve() — this is the shape persisted to
 * medullaflow.lock.json (see medullaflow's schema/medullaflow.lock.schema.json).
 * Orchestrators consume this directly and need nothing else: they never
 * see mise or the MCP Registry, only resolved runtimes/servers they can act on.
 */
export interface ResolvedDependencies {
  resolvedAt: string; // ISO 8601
  runtimes: ResolvedRuntime[];
  mcpServers: ResolvedMcpServer[];
}

export interface ResolvedRuntime {
  name: string;
  requestedVersion: string; // as declared in the manifest, e.g. "20"
  resolvedVersion: string; // exact version installed, e.g. "20.11.0"
  /** Prepend to PATH (or equivalent) so the orchestrator's subprocesses pick up this version. */
  binPath: string;
}

export interface ResolvedMcpServer {
  id: string;
  /** Everything the orchestrator needs to actually start/connect to this server — no source/ref/mise details leak through. */
  launch: McpServerLaunch;
  permissions: string[];
}

export type McpServerLaunch =
  | { transport: "stdio"; command: string[] }
  | { transport: "http"; url: string };

export class DependencyResolutionError extends Error {
  constructor(public readonly failures: DependencyResolutionFailure[]) {
    super(
      `Failed to resolve ${failures.length} ${failures.length === 1 ? "dependency" : "dependencies"}: ` +
        failures.map((f) => `${f.kind}:${f.id}`).join(", "),
    );
    this.name = "DependencyResolutionError";
  }
}

export interface DependencyResolutionFailure {
  kind: "runtime" | "mcpServer";
  id: string; // runtime name or mcpServer id, matches the manifest key
  reason: string; // human-readable, shown to the user as-is
  cause?: unknown; // underlying subprocess/network error, for logs/debugging
}
