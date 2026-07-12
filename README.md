# ribosome

**Upfront dependency materializer for tool/runtime versions and MCP servers.**

Given a project's declared runtimes and MCP servers, ribosome resolves and
materializes them **before any workflow runs** — deduplicating runtimes into a
shared pool and pinning everything into one reproducible lockfile — so missing
tools or unresolvable servers fail at validation time, not mid-execution.

[![CI](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml/badge.svg)](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@medullaflow/ribosome)](https://www.npmjs.com/package/@medullaflow/ribosome)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](https://www.mozilla.org/en-US/MPL/2.0/)
[![Status: alpha](https://img.shields.io/badge/status-alpha-yellow.svg)](#status)

---

## Why ribosome

The ecosystem already has runtime managers (mise, asdf, nix) and MCP clients
that read `server.json` and launch servers. **Nobody unifies the two**: resolve
your runtimes *and* your MCP servers together, dedup shared runtimes, and pin a
single reproducible lockfile — up front.

ribosome fills exactly that gap. It **conforms on the config axis** (its
`mcpServers` section is a compatible superset of existing MCP config formats) and
**competes on the runtime axis** (the provisioning those formats don't do).

## Two repos, on purpose

- **[ribosome-schema](https://github.com/medullaflow/ribosome-schema)** — the
  *standard*: normative JSON Schemas for `ribosome.json`/`ribosome.lock.json`,
  a conformance corpus, and a TypeScript binding. **Apache-2.0**.
- **ribosome (this repo)** — the *reference resolver/orchestrator*: pluggable
  runtime + MCP registry provisioning, and the materialization pipeline.
  **MPL-2.0** — see [Licensing](#licensing).

ribosome depends on `@medullaflow/ribosome-schema` as an ordinary package, the
same way it depends on any other library. This repo carries **no schema, no
JSON Schema files, no conformance fixtures** — see
[ribosome-schema](https://github.com/medullaflow/ribosome-schema) for those.

## Install

```bash
npm install @medullaflow/ribosome
```

Once installed, confirm it resolved correctly before writing any of your own
code against it:

```bash
node -e "const r = require('@medullaflow/ribosome'); console.log(typeof r.Materializer === 'function' ? 'ribosome installed OK' : 'unexpected export shape')"
```

This is a minimal sanity check (the package's own real exports respond, not a
placeholder), not the automated install-and-run verification the release
process itself does on every publish — see
[`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml)'s
`smoke-test` job for that.

## The manifest — `ribosome.json`

Full format: [ribosome-schema](https://github.com/medullaflow/ribosome-schema).

```jsonc
{
  "$schema": "https://schema.ribosome.medullaflow.org/v1/manifest.schema.json",
  "schemaVersion": "1",

  // Tool versions for your project — and the version policy for MCP runtimes.
  "runtimes": { "node": "24", "python": "3.12" },

  // Named MCP registries to resolve against.
  "registries": {
    "default": "official",
    "sources": { "official": { "url": "https://registry.modelcontextprotocol.io" } }
  },

  "mcpServers": {
    // Resolve from a registry by reverse-DNS name; the registry's server.json
    // determines runtime, transport and launch.
    "fs": { "source": "registry", "name": "io.modelcontextprotocol/filesystem", "version": "1.2.0" },

    // A custom server, described with a full standard server.json (declares its
    // own runtime/packages; migrates cleanly to a registry later).
    "custom": { "source": "inline", "server": { /* server.json */ } },

    // Copy-paste bridge from .mcp.json / editor config.
    "legacy": { "source": "process", "command": "npx", "args": ["-y", "@foo/bar"] }
  }
}
```

## Usage

```typescript
import {
  validateManifest,   // re-exported from @medullaflow/ribosome-schema
  Materializer,
  MiseEnvironmentProvider,
  OfficialMcpRegistry,
  writeLockfile,       // optional: persist the result to ribosome.lock.json
} from "@medullaflow/ribosome";

// 1. Validate untyped input against the normative schema — throws listing every
//    error at once, offline (no network round-trip).
const manifest = validateManifest(JSON.parse(rawRibosomeJson));

// 2. Wire the adapters you want (mise here; swap freely) and materialize.
const materializer = new Materializer({
  environmentProvider: new MiseEnvironmentProvider(),
  registries: [new OfficialMcpRegistry()],
});

const lock = await materializer.materialize(manifest, { cwd: projectRoot });
// lock.runtimePool — deduplicated runtimes, exact versions
// lock.project     — the project's environment view (pathPrepend + envVars)
// lock.mcpServers  — resolved servers: launch command + isolated environment

// 3. Optional: persist it, the same way the CLI's own `resolve` command does.
await writeLockfile(lock, projectRoot);
```

> **Pre-alpha, but the pipeline above is real end-to-end:** `MiseEnvironmentProvider`,
> `OfficialMcpRegistry`, and `Materializer` are all implemented and
> integration-tested against a real mise install and the live MCP registry —
> see [`test/convergence.test.ts`](test/convergence.test.ts). A CLI
> ([`bin/ribosome.ts`](bin/ribosome.ts)) exists and wraps this same pipeline;
> what's still missing is the npm publish itself — see [Status](#status).

## How it works

ribosome is a [ports & adapters](https://alistair.cockburn.us/hexagonal-architecture/)
design, coupled to no concrete tool:

| Layer | Role |
|-------|------|
| **[ribosome-schema](https://github.com/medullaflow/ribosome-schema)** (external) | The standard: normative JSON Schemas, generated types, validation. |
| **ports** | Abstractions: `EnvironmentProvider`, `McpRegistry`. |
| **adapters** | Concretions: mise, the official MCP registry. Swappable. |
| **orchestrator** | The phased pipeline that emits the lockfile. |

Runtimes are deduplicated into a **shared pool**; the project and each MCP server
get an **isolated environment view** over it. An MCP server's runtime is
**derived from the registry** (`server.json`), not restated by you.

**→ Full design, diagrams, and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**
**→ The versioned library integration contract: [docs/API.md](docs/API.md).**

## Project layout

```
src/
├── ports/         abstractions — EnvironmentProvider, McpRegistry
├── adapters/      concretions — mise/, mcp-registry/
└── orchestrator/  the phased materialization pipeline
```

The standard (schemas, generated types, validation, conformance corpus) lives
in the separate [ribosome-schema](https://github.com/medullaflow/ribosome-schema)
repo, not here.

## Status

| Part | State |
|------|-------|
| The standard (ribosome-schema): schemas, validation, conformance corpus | **Real** — tested, in its own repo |
| Ports (`EnvironmentProvider`, `McpRegistry`) | **Real** interfaces |
| `MiseEnvironmentProvider` | **Real** — integration-tested against a real mise install |
| `OfficialMcpRegistry` and the phased `Materializer` pipeline | **Real** — integration-tested against the live MCP registry, convergence-tested end-to-end (see [`test/convergence.test.ts`](test/convergence.test.ts)) |
| CLI (`ribosome` binary) | **Real** — [`bin/ribosome.ts`](bin/ribosome.ts): `resolve`/`prune` subcommands, tested (see [`test/cli.test.ts`](test/cli.test.ts)), compiles via `bun build --compile` |
| Test-adequacy + review guardrails | **Real** — per-file coverage floor, an advisory mutation-score signal, and a required code-owner review gate on the merge path (see [Guardrails & Governance](https://github.com/medullaflow/ribosome/milestones)) |
| npm package | **Published** — [`@medullaflow/ribosome`](https://www.npmjs.com/package/@medullaflow/ribosome) on npm; `v0.1.1` went through the fully automated OIDC publish pipeline, `smoke-test` included |

What's left is binary packaging, not resolution logic or npm distribution —
both of those are real and live. See the
[Distribution](https://github.com/medullaflow/ribosome/milestones) milestone
and [ROADMAP.md](ROADMAP.md).

### What "alpha" meant

This package cleared its own alpha bar — kept here as a record of what that
bar was, not a live checklist:

1. ✅ **A CLI exists** and can be invoked directly, not only embedded as a
   library — [`bin/ribosome.ts`](bin/ribosome.ts).
2. ✅ **It's installable** by someone who isn't cloning this repo —
   `npm install @medullaflow/ribosome`, published via
   [`publish-npm.yml`](.github/workflows/publish-npm.yml)'s OIDC trusted
   publishing.
3. ✅ **Install documentation exists** — see [Install](#install) and
   [Usage](#usage) above.
4. ✅ **A released artifact has been verified to actually run**: `v0.1.1`'s
   `smoke-test` job installed the real published tarball into an isolated
   project and exercised its real exports — not just "it compiled."
5. ✅ **The test-adequacy and human-review guardrails are in place**
   ([Guardrails & Governance](https://github.com/medullaflow/ribosome/milestones)):
   a coverage floor plus a mutation-adequacy signal, and a required
   code-owner review gate on the merge path.

Not gated on full three-platform binary packaging, signed installers,
SBOM/provenance, or package-manager distribution — those are real, tracked
in the [Distribution](https://github.com/medullaflow/ribosome/milestones)
milestone, and are beta-track expansion, not an alpha requirement.

### What "beta" means

Alpha proves one distribution track works end-to-end. Beta means **both
tracks are real, and someone other than this repo depends on it**:

1. **All three binary platforms are packaged and released through one
   orchestration workflow**, not manual, ad hoc steps — Windows
   ([#7](https://github.com/medullaflow/ribosome/issues/7)), Linux
   ([#10](https://github.com/medullaflow/ribosome/issues/10)), and macOS
   ([#11](https://github.com/medullaflow/ribosome/issues/11)) archives, tied
   together by [#14](https://github.com/medullaflow/ribosome/issues/14).
2. **A packaged binary is genuinely zero-setup**: `mise` is vendored into
   every artifact ([#8](https://github.com/medullaflow/ribosome/issues/8))
   rather than assumed to be on the user's `PATH`, with drift-detection
   ([#9](https://github.com/medullaflow/ribosome/issues/9)) keeping that pin
   from silently going stale.
3. **Every artifact has a checksum and build-provenance attestation**
   ([#12](https://github.com/medullaflow/ribosome/issues/12)) and an
   automated install-and-run smoke test
   ([#13](https://github.com/medullaflow/ribosome/issues/13)) — the same
   "verified to actually run" bar alpha set for npm, extended to every
   platform.
4. **Install documentation covers both tracks**
   ([#15](https://github.com/medullaflow/ribosome/issues/15)), not just npm.
5. **SBOM generation is live**
   ([#77](https://github.com/medullaflow/ribosome/issues/77)).
6. **A real external consumer depends on a published release, not a local
   link** — [medullaflow](https://github.com/medullaflow) resolves ribosome
   via its published npm version, not a `file:`/workspace reference.
   Guardrails and test adequacy prove this repo trusts itself; an outside
   consumer actually shipping against a release proves someone else can
   trust it too.

Not gated on a signed macOS installer
([#17](https://github.com/medullaflow/ribosome/issues/17)) or
package-manager distribution
([#16](https://github.com/medullaflow/ribosome/issues/16)) — both are
recorded as deliberately deferred scope in their own issue titles, not
unstarted beta work. A zip a user downloads and runs is a complete beta
experience; installing the way a platform's users normally install
software is the step after.

### What "v1 / GA" means

Beta means it works everywhere and someone depends on it. GA means **a
compatibility promise**, not just more packaging:

1. **A documented compatibility policy for ribosome's own exported surface**
   — `Materializer`, the ports (`EnvironmentProvider`, `McpRegistry`), and
   the CLI's subcommands/flags — spelling out what counts as a breaking
   change and how a major version bump signals one. This is distinct from
   [ribosome-schema](https://github.com/medullaflow/ribosome-schema)'s own
   `schemaVersion`/`SPEC.md`, which already makes this promise for the
   manifest/lockfile *shape*; this is the same discipline applied to
   ribosome's own library and CLI API.
2. **Sustained, breaking-change-free real usage**: medullaflow has run
   against a released version for a meaningful stretch without needing an
   unreleased or patched fix — the actual evidence a compatibility promise
   is one this project can keep, not just one it's written down.
3. **The remaining deferred Distribution scope lands**: a signed macOS
   installer ([#17](https://github.com/medullaflow/ribosome/issues/17)) and
   at least one native package-manager channel
   ([#16](https://github.com/medullaflow/ribosome/issues/16)) — GA implies
   installing the way each platform's users normally install software, not
   only a downloaded archive.
4. **A docs site is live**
   ([#51](https://github.com/medullaflow/ribosome/issues/51)) — GA implies a
   newcomer's path is a URL, not "read the README on GitHub."
5. **The test-adequacy signals hold steady release over release** — the
   coverage floor stays enforced and the mutation score doesn't regress
   from one release to the next, not just "was real once at alpha."

Not a fixed issue checklist here either — same caveat as alpha: check the
milestones for current state, this is the bar, not a snapshot of it.

## Development

```bash
git clone https://github.com/medullaflow/ribosome && cd ribosome

bun install     # also wires the pre-commit SPDX-header + lint check; @medullaflow/ribosome-schema resolves from npm
bun run build   # tsc — still the type-checked source of dist/, the npm-embeddable artifact
bun run test    # build, then run the real test suite (includes a live mise integration test)
bun run compile # bun build --compile — proves the standalone-binary path still works
bun run lint    # Biome — lint + format + import-organize check
```

This repo's own dev/build/test toolchain runs entirely on **[bun](https://bun.sh)**,
not Node — see [`docs/ARCHITECTURE.md` D14](docs/ARCHITECTURE.md#design-decisions).
`npm install @medullaflow/ribosome` (above) still works for consumers: `tsc`
still emits a plain, portable `dist/` for embedding in any Node/TS host: bun is
this repo's own toolchain choice, not a requirement placed on consumers.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution/attribution workflow
and DCO sign-off.

### Built by humans and agents, together

This repo is designed to be developed by **people and LLM coding agents
side by side** — most of its code is agent-authored. That shapes how it's
built: conventions the standard tooling can only *suggest* are being
converted into deterministic, machine-enforced guardrails (linting,
architectural boundary checks, type-safety and test-adequacy gates), so a
change can't merge while breaking the architecture regardless of who or what
wrote it. That work is tracked in the
[Guardrails & Governance milestone](https://github.com/medullaflow/ribosome/milestones).

Agents working in this repo should read **[AGENTS.md](AGENTS.md)** first — the
machine-readable operating contract (toolchain, setup, commands, and the hard
constraints an agent can't infer from the code). It's the agent-facing
counterpart to `CONTRIBUTING.md`.

## Why "ribosome"?

Ribosomes are the cell's dependency materializers: they take a declaration
(mRNA) and turn it into working machinery (proteins). Same idea here.

## Licensing

**MPL-2.0** — see [LICENSE](LICENSE) and [NOTICE](NOTICE) for what that means
and why, and [CONTRIBUTING.md](CONTRIBUTING.md#why-mpl-20) for the full
reasoning behind the choice. This repo is the reference *implementation*;
the *standard* it implements
([ribosome-schema](https://github.com/medullaflow/ribosome-schema)) is a
separate, Apache-2.0 repo.

ribosome is a component of the [medullaflow](https://github.com/medullaflow/medullaflow)
project, designed to be reusable standalone.

## Built on

ribosome provisions runtimes and MCP servers by orchestrating existing,
focused tools rather than reimplementing them — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.
The reference adapters currently build on:

- **[mise](https://github.com/jdx/mise)** — runtime version management
- **[MCP Registry](https://github.com/modelcontextprotocol/registry)** — the
  official Model Context Protocol server registry

Full third-party attribution, if any is ever bundled rather than just
depended on: [NOTICE](NOTICE).

## Attribution

**Primary author:** Matteo Lacchio — [@ookmash](https://github.com/ookmash).
Principal authorship and copyright: [AUTHORS](AUTHORS). Full contributor list:
the repository's [Contributors graph](https://github.com/medullaflow/ribosome/graphs/contributors).

---

Made by Matteo Lacchio and Contributors.
