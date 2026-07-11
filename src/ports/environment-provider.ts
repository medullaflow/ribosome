// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Port: provisioning of tool/runtime versions. The orchestrator depends on this
// interface only — it must not know mise, asdf, nix, devbox or any concrete
// backend exist. Adapters live under src/adapters/.

import type { Environment, PooledRuntime } from "@medullaflow/ribosome-schema";

/** A single runtime requirement: a tool at a version spec. */
export interface RuntimeRequirement {
  tool: string;
  /** Version spec, e.g. "24", "3.12". Empty/"latest" means "provider's default stable". */
  versionSpec: string;
}

/**
 * An environment view over the pool. Extends the portable, declarative lockfile
 * `Environment` with an OPTIONAL activation hook — a backend-specific escape
 * hatch (e.g. a nix/direnv shell snippet) for backends that cannot be reduced to
 * PATH + env vars. The hook is INTERNAL to this port: it is deliberately absent
 * from the lockfile schema so the lockfile stays portable across languages and
 * platforms. When a lockfile is re-applied, the provider re-derives the hook.
 */
export interface EnvironmentDelta extends Environment {
  activationHook?: string;
}

export interface MaterializeContext {
  /** Project root, for backends that key installs/config off the working dir. */
  cwd: string;
  /** Ignore any cached/locked state and re-resolve from scratch. */
  refresh?: boolean;
  /**
   * Absolute directory to materialize the pool into, if the manifest set
   * `pool.dir` (see @medullaflow/ribosome-schema's RibosomeManifest) — the
   * caller resolves it to an absolute path before this point, this port
   * never does path resolution itself. Omitted means the provider's own
   * default, typically a store shared across projects that maximizes
   * install reuse; setting it trades that reuse for isolation. A provider
   * with no relocatable store may ignore this.
   */
  poolDir?: string;
}

/**
 * Resolves runtime requirements into a deduplicated pool, and composes isolated
 * environment views over that pool.
 *
 * Storage is shared (one install per (tool, version)); environments are
 * isolated (each consumer selects the pool entries it needs). This mirrors how
 * mise (shared installs dir) and nix (shared store + per-consumer profiles)
 * already work — the abstraction is native to real backends, not imposed.
 */
export interface EnvironmentProvider {
  /**
   * Install/locate every requirement, deduplicating by (tool, exact version).
   * Effectful by nature (network, disk); this is where the real I/O lives.
   */
  materialize(reqs: RuntimeRequirement[], ctx: MaterializeContext): Promise<PooledRuntime[]>;

  /**
   * Compose an environment view selecting the given pool entries (by pool id).
   * No new installs: it derives the concrete paths from the state left by the
   * most recent `materialize` on this provider instance. The resulting
   * pathPrepend/envVars are persisted into the lockfile, so re-applying a
   * lockfile later needs no provider at all.
   */
  composeView(pool: PooledRuntime[], select: string[]): EnvironmentDelta;
}
