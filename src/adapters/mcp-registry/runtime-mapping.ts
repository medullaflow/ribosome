// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Derives runtime requirements from a resolved server.json. This is the concrete
// realization of the rule "the registry determines the MCP server's runtime":
// a package's `registryType`/`runtimeHint` implies the runtime family, and the
// project's declared runtimes supply the version policy. Pure and adapter-shared.

import type { McpPackage, McpServerJson } from "@medullaflow/ribosome-schema";
import type { RuntimeRequirement } from "../../ports/environment-provider";

/** registryType / runtimeHint -> runtime tool family. */
const REGISTRY_TYPE_TO_TOOL: Record<string, string> = {
  npm: "node",
  pypi: "python",
  nuget: "dotnet",
  cargo: "rust",
  oci: "docker",
};

const RUNTIME_HINT_TO_TOOL: Record<string, string> = {
  npx: "node",
  uvx: "python",
  dnx: "dotnet",
  docker: "docker",
  podman: "docker",
};

/** Map one package to its runtime tool family, if any. `mcpb` bundles are self-contained. */
export function toolForPackage(pkg: McpPackage): string | undefined {
  return (
    RUNTIME_HINT_TO_TOOL[pkg.runtimeHint ?? ""] ??
    REGISTRY_TYPE_TO_TOOL[pkg.registryType] ??
    undefined
  );
}

/**
 * Derive the deduplicated runtime requirements a server needs. The version for
 * each tool comes from `versionPolicy` (the project's declared runtimes); when a
 * tool is not pinned there, `versionSpec` is left empty so the provider uses its
 * default stable release (recorded in the lockfile for reproducibility).
 *
 * Remote-only servers (no packages, just `remotes`) need no local runtime.
 */
export function deriveRuntimeRequirements(
  server: McpServerJson,
  versionPolicy: Record<string, string> = {},
): RuntimeRequirement[] {
  const byTool = new Map<string, RuntimeRequirement>();
  for (const pkg of server.packages ?? []) {
    const tool = toolForPackage(pkg);
    if (!tool || byTool.has(tool)) continue;
    byTool.set(tool, { tool, versionSpec: versionPolicy[tool] ?? "" });
  }
  return [...byTool.values()];
}
