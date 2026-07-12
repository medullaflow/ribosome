# Public API surface

This is ribosome's **library integration contract** — what a host orchestrator
imports to embed ribosome directly, bypassing the CLI entirely. It is
deliberately separate from the CLI's own documentation (tracked in
[#15](https://github.com/medullaflow/ribosome/issues/15)): a library consumer
and a CLI user are different consumers with different needs, and conflating
the two docs would make neither one clear.

**The contract is exactly what [`src/index.ts`](../src/index.ts) exports —
nothing more.** Importing from an internal path (e.g.
`@medullaflow/ribosome/dist/orchestrator/materializer`) is unsupported: once
this package is published ([#18](https://github.com/medullaflow/ribosome/issues/18)),
`src/index.ts`'s export list becomes a real, versioned contract, and only that
list is covered by semver. Internal restructuring that doesn't touch it is a
patch; anything that does is a breaking change.

## What's exported, and why

| Export | Kind | Layer | Why a library consumer needs it |
|---|---|---|---|
| `RibosomeManifest`, `RibosomeLockfile`, `McpServer`, `RegistryServer`, `InlineServer`, `ProcessServer`, `RegistrySource`, `RegistryAuthHeader`, `Launch`, `PooledRuntime`, `Environment`, `ResolvedMcpServer`, `Permissions`, `McpServerJson`, `McpPackage`, `McpRemoteTransport`, `McpTransport`, `McpArgument`, `McpKeyValueInput`, `SCHEMA_VERSION`, `MCP_SERVER_SCHEMA_VERSION`, `MCP_SERVER_SCHEMA_ID`, `MCP_SERVER_SCHEMA_SHA256` | types + consts | the standard (re-exported from `@medullaflow/ribosome-schema`) | The manifest/lockfile shapes a consumer reads and writes, re-exported so `@medullaflow/ribosome-schema` doesn't need to be a second, separately-versioned direct dependency for basic use. |
| `validateManifest`, `validateLockfile`, `checkManifest`, `validateMcpServerJson`, `checkMcpServerJson`, `SchemaValidationError` | functions + error | the standard (re-exported) | Untyped input (a parsed `ribosome.json`) must be validated before it's trustworthy; this is the one and only validation path, offline, no network round-trip. |
| `EnvironmentProvider`, `EnvironmentDelta`, `MaterializeContext`, `RuntimeRequirement`, `PruneContext`, `PrunedRuntime`, `PruneResult` | types | ports | The abstraction a consumer implements to plug in a runtime backend other than mise (asdf, nix, devbox, ...). `prune()` is optional on the interface — only adapters with a native "no longer referenced" mechanism implement it. |
| `McpRegistry`, `RegistryQuery` | types | ports | The abstraction for a registry protocol other than the official MCP Registry. |
| `McpRegistryError`, `RegistryUnreachableError`, `ServerNotFoundError`, `InvalidServerDescriptorError`, `MissingRegistryCredentialError` | error classes | ports | The typed failure shapes every `McpRegistry` adapter (present or future) rejects with — a consumer catches these, not adapter-specific errors. |
| `Materializer`, `DependencyMaterializer`, `MaterializeOptions`, `MaterializerDeps`, `ResolutionError`, `ResolutionFailure` | class + types | orchestrator | **The** entry point: wire adapters in, call `materialize()`, get a lockfile or a `ResolutionError` listing every failure at once. |
| `resolveMcpServer`, `RegistryResolutionContext`, `ResolvedMcpServerRef` | function + types | orchestrator | Exposed for a consumer that wants to resolve one server outside the full pipeline (e.g. tooling, tests) rather than a hard dependency of normal use. |
| `deriveRuntimeRequirements`, `toolForPackage` | functions | orchestrator | The registry-type → runtime-family mapping, exposed so a consumer building custom tooling around the pipeline doesn't have to reimplement it. |
| `deriveLaunch`, `deriveProcessLaunch` | functions | orchestrator | The server.json/process-entry → `Launch` mapping, same rationale. |
| `LOCKFILE_FILENAME`, `writeLockfile` | const + function | orchestrator | The one place the lockfile touches disk; a consumer that wants ribosome's own file-naming/writing convention uses this instead of reinventing it. |
| `MiseEnvironmentProvider` | class | adapters (default wiring) | The reference `EnvironmentProvider` — what nearly every consumer actually wires up. |
| `OfficialMcpRegistry`, `FileMcpRegistry` | classes | adapters (default wiring) | The reference `McpRegistry` adapters — the live official registry, and an offline/local one for air-gapped or test setups. |

## Completeness and minimality, reviewed deliberately

This section is the actual acceptance criterion of
[#19](https://github.com/medullaflow/ribosome/issues/19): not an incidental
byproduct of what happened to be exported during development, but a one-time,
deliberate review.

**Minimal:** every symbol above traces to a specific consumer need (embedding
the pipeline, implementing a custom port, or handling a typed failure). Nothing
is exported as a side effect of module structure — `src/index.ts` already
groups exports by architectural layer for exactly this reason (see its own
top-of-file comment), and Biome's import organizer is deliberately disabled
for that one file so the grouping stays legible.

**Complete, relative to this repo's own internals:** every symbol exported
from `src/ports/*.ts`, `src/adapters/**/*.ts`, and `src/orchestrator/*.ts` is
re-exported from `src/index.ts` — cross-checked file by file, not assumed.
Nothing internal is reachable only through a deep import.

**A known integration-boundary naming decision:** an early consumer's engine
was written to import a type named `ResolvedDependencies` from this package —
**but no export by that name exists.** The shape it means is this package's own
`RibosomeLockfile` (the materializer's actual return type: pool + per-consumer
environment views). Resolving it is a deliberate decision for whoever owns that
boundary — rename the consuming side to `RibosomeLockfile`, or add a
`ResolvedDependencies` alias here for a more domain-appropriate name at the
integration seam — not a drive-by in an API-surface audit. Noted here so the
choice isn't lost; until it's made, a consumer written against the old name
won't type-check against a real `ribosome` install.
