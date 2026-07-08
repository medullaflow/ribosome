# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/)

## [Unreleased]

### Added
- Initial extraction from [medullaflow](https://github.com/medullaflow/medullaflow)'s
  `packages/dependency-manager/` into a standalone package.
- AGPLv3-or-later licensing scaffold: `LICENSE`, `COPYING.md`, `NOTICE`,
  `AUTHORS`, SPDX headers on source files.
- Pre-commit SPDX header enforcement — native git hook (`.githooks/pre-commit`)
  wired via `core.hooksPath`, no husky/extra dependency.
- `DependencyResolver` interface and `ResolvedDependencies` types (`src/core/resolver.ts`).
- `DependenciesManifest` / `McpServerManifest` input types, mirroring medullaflow's
  manifest schema (`src/core/manifest-types.ts`).
- `MiseDependencyResolver`: concrete implementation wrapping mise-en-place (runtimes)
  and the MCP Registry (MCP servers). Interface satisfied; method bodies are stubs
  pending actual subprocess implementation (`src/mise/mise-resolver.ts`).

### Contributors
- **Matteo Lacchio** — Initial extraction and scaffolding
