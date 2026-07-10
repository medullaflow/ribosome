// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Public API of @medullaflow/ribosome. Import from here, not from internal
// paths — the internal structure of src/ is not a stable API.
//
// Layers (see docs/ARCHITECTURE.md):
//   @medullaflow/ribosome-schema  the standard: schemas, generated types,
//                                 validation, versions — a separate,
//                                 Apache-2.0-licensed package/repo, so anyone
//                                 can implement the standard without any
//                                 copyleft obligation at all.
//   ports/         abstractions: EnvironmentProvider, McpRegistry
//   adapters/      concretions: mise, official MCP registry
//   orchestrator/  the phased materialization pipeline
//
// Exports are grouped by architectural layer, on purpose — Biome's import
// organizer is disabled for this one file (see biome.json overrides) so the
// grouping reads as public-API documentation rather than an alphabetical list.

// ── The standard (re-exported for convenience) ─────────────────────────────
export * from "@medullaflow/ribosome-schema";

// ── Ports (abstractions) ────────────────────────────────────────────────────
export type {
  EnvironmentProvider,
  EnvironmentDelta,
  MaterializeContext,
  RuntimeRequirement,
} from "./ports/environment-provider";
export type { McpRegistry, RegistryQuery } from "./ports/mcp-registry";
export {
  InvalidServerDescriptorError,
  McpRegistryError,
  RegistryUnreachableError,
  ServerNotFoundError,
} from "./ports/mcp-registry";

// ── Orchestrator ────────────────────────────────────────────────────────────
export type {
  DependencyMaterializer,
  MaterializeOptions,
  MaterializerDeps,
  ResolutionFailure,
} from "./orchestrator/materializer";
export { Materializer, ResolutionError } from "./orchestrator/materializer";
export { deriveRuntimeRequirements, toolForPackage } from "./orchestrator/runtime-mapping";
export { deriveLaunch } from "./orchestrator/launch-mapping";
export type {
  RegistryResolutionContext,
  ResolvedMcpServerRef,
} from "./orchestrator/resolve-mcp-server";
export { resolveMcpServer } from "./orchestrator/resolve-mcp-server";

// ── Adapters (default wiring) ───────────────────────────────────────────────
export { MiseEnvironmentProvider } from "./adapters/mise/mise-environment-provider";
export { OfficialMcpRegistry } from "./adapters/mcp-registry/official-registry";
