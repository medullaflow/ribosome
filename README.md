# ribosome

**Upfront dependency materializer for tool/runtime versions and MCP servers.**

Given a project's declared runtimes and MCP servers, ribosome resolves and
materializes them **before any workflow runs** — deduplicating runtimes into a
shared pool and pinning everything into one reproducible lockfile — so missing
tools or unresolvable servers fail at validation time, not mid-execution.

[![CI](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml/badge.svg)](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](https://www.mozilla.org/en-US/MPL/2.0/)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#status)

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

> Pre-alpha: not yet published (see [Status](#status)). `@medullaflow/ribosome-schema`,
> the standard this repo implements, is already published — see
> [Development](#development).

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
```

> **Pre-alpha, but the pipeline above is real end-to-end:** `MiseEnvironmentProvider`,
> `OfficialMcpRegistry`, and `Materializer` are all implemented and
> integration-tested against a real mise install and the live MCP registry —
> see [`test/convergence.test.ts`](test/convergence.test.ts). What's still
> missing is a CLI to invoke this as a standalone tool and an npm publish; see
> [Status](#status).

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
| CLI (`ribosome` binary) | **Not started** — no `bin/`, no argument parsing; library-only for now |
| npm package | **Unpublished** — `private: true`; the library builds and passes tests, but isn't installable yet |

What's left is packaging, not resolution logic: a CLI entry point, binary
compilation per platform, and the npm publish itself. See the
[Distribution](https://github.com/medullaflow/ribosome/milestones) and
[Guardrails & Governance](https://github.com/medullaflow/ribosome/milestones)
milestones, and [ROADMAP.md](ROADMAP.md).

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
