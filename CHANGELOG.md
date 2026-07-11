# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/)

## [Unreleased]

### Added
- **Mutation-adequacy signal** (`stryker.conf.json`, `scripts/mutation-test.sh`,
  the `mutation-test` CI job) — closes the remaining half of #31 (coverage
  floor landed separately, above). Stryker's generic `command` runner
  (no third-party bun plugin — see
  [`docs/ARCHITECTURE.md` D39](docs/ARCHITECTURE.md#design-decisions)) against
  a fixed, fully-deterministic 4-file subset of the suite, run `inPlace` to
  sidestep a TypeScript 7 Compiler API removal that crashes Stryker's default
  sandboxed mode outright. Advisory (`continue-on-error: true`), not gating,
  per the issue's own explicit allowance for a young suite. First real run:
  63.49% mutation score (200 killed / 115 survived of 315 mutants); weakest
  file `runtime-mapping.ts` at 44.83% — a concrete, visible pointer to where
  today's tests execute code without actually pinning down its behavior.

### Fixed
- **CI's `test` job retries once on a specific, confirmed upstream Bun bug**
  ([oven-sh/bun#23077](https://github.com/oven-sh/bun/issues/23077)):
  bun's `node:test` compat layer occasionally mis-detects two real,
  module-level `test()` calls in different files as "nested" when one is a
  long-running async test — surfaced (not caused) by dropping `--parallel`
  in the coverage-floor change below, since sequential execution puts this
  suite's real network/mise-install integration tests closer together in
  bun's scheduler. Confirmed via bun's own issue tracker as a real,
  independently-reported regression, still present in 1.3.14 (the latest
  release); not reproducible with synthetic sleeps/subprocess calls of the
  same shape after repeated attempts to isolate the exact trigger. The
  retry is narrow, not blanket: it only fires when the output matches the
  bug's exact error string, and gives up after one retry either way — a
  real, deterministic test regression fails immediately with no retry. See
  [`docs/ARCHITECTURE.md` D38](docs/ARCHITECTURE.md#design-decisions).

### Added
- **Coverage floor** (`bunfig.toml`, `bun test`'s built-in `coverageThreshold`)
  — the first half of #31. Per-file, not aggregate-only (a new 0%-covered
  file shouldn't be able to hide behind an already-high repo-wide average):
  80% lines/functions/statements, set just below today's lowest real file
  rather than at today's average, so it's a regression floor rather than a
  tax on ordinary changes. `test/**` (fixture/mock helpers, not production
  code) is excluded from the gate. Also dropped `--parallel` from the `test`
  script's default invocation — bun's coverage collection under `--parallel`
  reproducibly undercounts (verified: one file's reported line coverage
  dropped from 97.56% to 76.92% between parallel and sequential runs of the
  *same* suite, no code change) — worth revisiting if the suite grows large
  enough to make parallel execution a real speed necessity. The other half
  of #31, a mutation-adequacy signal, stays open as a separate follow-up:
  Stryker Mutator's bun-test-runner support needs a short spike to confirm
  it actually works before committing to it. See
  [`docs/ARCHITECTURE.md` D37](docs/ARCHITECTURE.md#design-decisions).
- **Required code-owner review** on every PR (`require_code_owner_review`
  on the branch-protection ruleset) and an explicit **"Agent-directed
  contributions"** section in `CONTRIBUTING.md` — closes #34. Most of this
  repo's code is written by an agent under direction; this makes the
  existing accountability model (DCO sign-off, `AUTHORS` attribution)
  explicit for that case rather than leaving it implicit, and defines the
  human-review gate the automated guardrails ultimately serve. With a
  single maintainer, every merge today still goes through a repo-admin
  bypass — a deliberate, visible, audited action, not a workaround — until
  a second `CODEOWNERS` entry exists. See
  [`docs/ARCHITECTURE.md` D36](docs/ARCHITECTURE.md#design-decisions).
- **`bun audit`** (`.github/workflows/audit.yml`, push/PR + weekly schedule)
  and **CodeQL** (`.github/workflows/codeql.yml`, `javascript-typescript`) —
  two of five supply-chain tools suggested in a Copilot code-review comment,
  adopted after checking each against this repo's actual state rather than
  the comment's own framing (which assumed this package is already published
  to npm; it isn't yet — see #18). `bun audit` closes a real gap
  `dependency-review-action` (D32) can't: a CVE disclosed *after* a
  dependency is already merged into the lockfile. CodeQL catches a different
  bug class than Biome (dataflow/taint analysis, relevant given real
  `execFileSync` shell-outs and manifest-driven path resolution). SBOM
  generation and dependency license-compliance scanning were declined for
  now (one runtime dependency total — nothing meaningful to scan yet) and
  tracked as follow-up issues instead. See
  [`docs/ARCHITECTURE.md` D35](docs/ARCHITECTURE.md#design-decisions).
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
- **DCO checks were failing on every Dependabot PR.** `check-dco.js` required
  the `Signed-off-by` trailer's email to exactly match the commit author's
  email; Dependabot authors as `...@users.noreply.github.com` but signs off
  as `dependabot[bot] <support@github.com>` — same bot, different address,
  so the exact match always failed. Fixed by exempting Dependabot's own
  commits by author email (not branch name); a short-lived
  `dco-auto-sign.yml` workaround that rebased and force-pushed a sign-off
  onto PR branches was removed instead of patched further — it collided
  with the separate "Signed commits" ruleset (rewritten commits aren't
  cryptographically signed) and risked re-triggering itself indefinitely.
  See [`docs/ARCHITECTURE.md` D33](docs/ARCHITECTURE.md#design-decisions).
  Also reverted an unrelated premature fix for TypeScript 7.0 compatibility
  in `scripts/architecture-rules.js` — the 7.0 bump was never actually
  merged (`typescript` stays on `^5.7.0`; `dependabot.yml` now ignores
  major-version updates for it specifically, pending deliberate review).
- **Deliberately migrated to TypeScript 7.0** (the native/Go compiler,
  `typescript@^7.0.2`), completing the item deferred above. TypeScript 7.0
  ships with no programmatic API at all (Microsoft's own words), so
  `scripts/architecture-rules.js` — the one script that parses real source
  via the classic Compiler API — now depends on `@typescript/typescript6`
  (Microsoft's own sanctioned bridge package) instead of reaching for the
  `typescript/unstable/ast` subpath, which exists but is explicitly not
  meant to be built on yet. `dependabot.yml`'s major-version ignore rule for
  `typescript` is removed now that the migration is done. See
  [`docs/ARCHITECTURE.md` D34](docs/ARCHITECTURE.md#design-decisions).

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
