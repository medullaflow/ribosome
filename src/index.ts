// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Public API of @medullaflow/ribosome. Import from here, not from internal
// paths — the internal structure of src/ is not a stable API.
//
// Layers (see docs/ARCHITECTURE.md):
//   @medullaflow/ribosome-schema  the standard: schemas, generated types,
//                                 validation, versions — a separate,
//                                 Apache-2.0-licensed package/repo, so anyone
//                                 can implement the standard without touching
//                                 this package's AGPL code.
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

// ── Orchestrator ────────────────────────────────────────────────────────────
export type {
  DependencyMaterializer,
  MaterializeOptions,
  MaterializerDeps,
  ResolutionFailure,
} from "./orchestrator/materializer";
export { Materializer, ResolutionError } from "./orchestrator/materializer";

// ── Adapters (default wiring) ───────────────────────────────────────────────
export { MiseEnvironmentProvider } from "./adapters/mise/mise-environment-provider";
export { OfficialMcpRegistry } from "./adapters/mcp-registry/official-registry";
export { deriveRuntimeRequirements, toolForPackage } from "./adapters/mcp-registry/runtime-mapping";
