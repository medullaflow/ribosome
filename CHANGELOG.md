# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/)

## [Unreleased]

### Added
- **Biome** as the linter + formatter (`biome.json`), enforced at the
  pre-commit hook (staged files) and in CI (whole tree) — the first of the
  [Guardrails & Governance](https://github.com/medullaflow/ribosome/milestones)
  guardrails that turn documented conventions into machine-enforced rules for
  a codebase written mostly by LLM agents. `bun run lint` / `lint:fix` /
  `format`. Import-organize is on everywhere except the curated `src/index.ts`
  public-API barrel.
- `AGENTS.md` — machine-readable operating contract for AI coding agents
  (toolchain, setup, commands, hard constraints), the agent-facing counterpart
  to `CONTRIBUTING.md`. README notes the human+agent development model.
- **Stricter `tsconfig.json`** (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noImplicitReturns`) — another
  [Guardrails & Governance](https://github.com/medullaflow/ribosome/milestones)
  item: catching the shapes-and-nulls mistakes generated code is most prone to
  at compile time rather than runtime. **The whole test suite moved from
  `.js` to typechecked `.ts`** (a new `tsconfig.check.json` + `bun run
  typecheck:test`, CI-enforced, covering `src/` + `bin/` + `test/` together —
  `bin/ribosome.ts` had no compiler coverage at all before this, only
  `bun build`'s own transpilation), so a type mismatch in a test now fails
  the build instead of only surfacing at `bun test` runtime.
- **Supply-chain and secret hygiene on the merge path** — another
  [Guardrails & Governance](https://github.com/medullaflow/ribosome/milestones)
  item: `.github/workflows/secret-scan.yml` runs a version-pinned `gitleaks`
  CLI directly (not `gitleaks/gitleaks-action`, which needs a paid license
  for organization-owned repos) over the working tree and full commit
  history on every push/PR; `.github/workflows/dependency-review.yml` runs
  `actions/dependency-review-action` on every PR, surfacing a new/updated
  dependency's advisory status as a check on that exact PR; `.github/
  dependabot.yml` adds scheduled weekly update PRs for both the `npm`
  ecosystem and GitHub Actions themselves. All three are free for this
  public repo via GitHub's native Dependency Graph/Advisory Database — no
  external account or secret to provision.

### Fixed
- Turning on `exactOptionalPropertyTypes` surfaced (and this fixes) three
  spots that explicitly assigned `undefined` to an optional field
  (`MaterializeContext.refresh`/`.poolDir`, `ResolvedMcpServer.permissions`,
  `RegistryQuery.version`) instead of omitting the key — harmless before,
  but caught one real, previously-undetected test regression along the way:
  `resolve-mcp-server.test.ts`'s own fixtures still asserted the old
  key-present-as-undefined shape via `assert.deepEqual`, silently broken
  since the `#60` pool-dir work switched those call sites to the
  correct key-omitting construction. Fixed the assertions to match the
  now-correct behavior, not reverted.

### Changed
- **Relicensed from `AGPL-3.0-or-later` to `MPL-2.0`.** ribosome is meant to
  be consumed both as a CLI and as a library embedded in other (including
  closed-source, commercial) orchestrators; strong copyleft actively worked
  against that goal, since embedding AGPL code can be read as obligating a
  consumer's entire product, not just the parts touching ribosome. MPL-2.0's
  file-level copyleft gets the protection that was actually wanted — changes
  to ribosome's own files come back — without that side effect. Every SPDX
  header, `LICENSE`, `NOTICE`, and `package.json` updated accordingly; full
  reasoning and alternatives considered (LGPL, permissive) in
  [`docs/ARCHITECTURE.md` D18](docs/ARCHITECTURE.md#design-decisions).
- **Split the standard into its own repo.** The manifest/lockfile JSON Schemas,
  conformance corpus, and TypeScript binding moved to
  [ribosome-schema](https://github.com/medullaflow/ribosome-schema)
  (Apache-2.0), published as `@medullaflow/ribosome-schema`. This repo now
  depends on it as an ordinary published package (`^0.1.3`) instead of owning
  the schema. Rationale in
  [`docs/ARCHITECTURE.md` D13](docs/ARCHITECTURE.md#design-decisions).
- **Reframed from "medullaflow extraction" to a standalone standard.** The
  manifest is now an independent, versioned `ribosome.json` (source of truth),
  not a hand-kept mirror of medullaflow's schema. Types are generated from the
  schema, not the reverse.
- Split the single `DependencyResolver` into a runtime port and a registry port;
  runtime resolution is now an `EnvironmentProvider` (no mise/`binPath` coupling).
- MCP server runtimes are derived from the registry `server.json`, not declared
  by the user.

### Added
- **Ports (`src/ports/`)** — `EnvironmentProvider` (env-delta abstraction,
  backend-agnostic) and `McpRegistry`.
- **Phase 1: `MiseEnvironmentProvider` is real.** `materialize()` resolves each
  requirement via `mise install` → `mise where` (exact version) → `mise
  bin-paths` (re-queried by the exact version, never the original spec),
  concurrently, deduplicated into the pool by `(tool, exact version)`, with
  aggregated failures. `composeView()` is synchronous, reading bin paths
  cached from the same instance's last `materialize()` — no subprocesses.
  Integration-tested against a real mise install (not mocked); CI installs
  mise so the suite actually runs. See
  [`docs/ARCHITECTURE.md` D14](docs/ARCHITECTURE.md#design-decisions) for why
  distribution (no Node required to run ribosome) is solved by compiling to a
  binary, not by a Rust rewrite.
- **This repo's toolchain now runs on bun**, not Node (`bun install`/`build`/
  `test`/`compile`; `tsc` unchanged as the type-checker and the source of the
  plain, portable `dist/` that npm consumers get). `bun build --compile` is
  wired up (`bun run compile`) and CI-checked as a compileability regression
  guard — verified end-to-end: a compiled standalone binary, run with zero
  bun/node on `PATH`, correctly drove `MiseEnvironmentProvider` through a real
  `mise install`. CI (`ci.yml`) uses `oven-sh/setup-bun`; Node is kept only for
  the `ribosome-schema` sibling checkout step (a plain npm library, no
  standalone-binary goal of its own).
- **Adapters (`src/adapters/`)** — `OfficialMcpRegistry` (skeleton), and a
  real, pure runtime-derivation helper mapping `server.json` packages to
  runtime requirements.
- **Orchestrator (`src/orchestrator/`)** — `DependencyMaterializer` interface,
  `Materializer`, and `ResolutionError` (aggregated failures).
- **Docs** — rewritten `README.md`; [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  with the architecture map, dependency rules, data model, phased pipeline, and
  a design-decisions record; [`ROADMAP.md`](ROADMAP.md).
- `test/schema-dependency.test.ts` — integration smoke test proving the
  `@medullaflow/ribosome-schema` dependency wiring works end-to-end.
- `test/mise-environment-provider.test.ts` — real mise integration tests.
- CI (`ci.yml`) now actually runs `npm test` (it never did before), checks out
  the `ribosome-schema` sibling the `file:` dependency needs, and installs mise.

### Removed
- `src/core/manifest-types.ts`, `src/core/resolver.ts`, `src/mise/mise-resolver.ts`
  (superseded by the ports/adapters/orchestrator layers).
- `src/spec/` and its associated scripts/tests, moved to the
  [ribosome-schema](https://github.com/medullaflow/ribosome-schema) repo.
- `REUSE.toml` and the Apache-2.0/MIT license texts (no longer needed here —
  this repo is single-licensed again).

### Licensing
- MPL-2.0 scaffold: `LICENSE`, `COPYING.md`, `NOTICE`, `AUTHORS`, SPDX
  headers; native pre-commit SPDX enforcement via `core.hooksPath`.

### Contributors
- **Matteo Lacchio** — Initial extraction, standardization, and architecture
