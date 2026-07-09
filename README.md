# ribosome

**Upfront dependency materializer for tool/runtime versions and MCP servers.**

Given a project's declared runtimes and MCP servers, ribosome resolves and
materializes them **before any workflow runs** — deduplicating runtimes into a
shared pool and pinning everything into one reproducible lockfile — so missing
tools or unresolvable servers fail at validation time, not mid-execution.

[![CI](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml/badge.svg)](https://github.com/medullaflow/ribosome/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
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
  a conformance corpus, and a TypeScript binding. **Apache-2.0** — implement it
  in any product, open or closed, with no obligation.
- **ribosome (this repo)** — the *reference resolver/orchestrator*: mise +
  MCP registry adapters and the materialization pipeline. **AGPL-3.0-or-later**
  — run a modified copy as a network service and you must share your changes.

ribosome depends on `@medullaflow/ribosome-schema` as an ordinary package, the
same way it depends on any other library. This repo carries **no schema, no
JSON Schema files, no conformance fixtures** — see
[ribosome-schema](https://github.com/medullaflow/ribosome-schema) for those.

## Install

```bash
npm install @medullaflow/ribosome
```

> Pre-alpha: not yet published (see [Status](#status)). During development,
> this repo depends on `@medullaflow/ribosome-schema` via a local `file:`
> reference to a sibling checkout — see [Development](#development).

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

> **Pre-alpha:** `MiseEnvironmentProvider` is real (installs via mise,
> integration-tested against a real mise). The registry adapter and the
> orchestrator pipeline still throw `not implemented`. See [Status](#status).

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
| Registry adapter, orchestrator pipeline | **Skeleton** — stubs throw `not implemented` |

Roadmap: implement the mise adapter (`mise install`/`where`), the registry HTTP
adapter, and the phased orchestrator. See [ROADMAP.md](ROADMAP.md).

## Development

This repo currently depends on `@medullaflow/ribosome-schema` via a local
`file:` reference to a sibling checkout (not yet published to npm):

```bash
# clone as a sibling directory:
#   some-dir/
#   ├── ribosome/          (this repo)
#   └── ribosome-schema/   (https://github.com/medullaflow/ribosome-schema)

bun install     # also wires the pre-commit SPDX-header check; links the sibling repo
bun run build   # tsc — still the type-checked source of dist/, the npm-embeddable artifact
bun run test    # build, then run the real test suite (includes a live mise integration test)
bun run compile # bun build --compile — proves the standalone-binary path still works
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

AGPL-3.0-or-later — see [LICENSE](LICENSE) and [NOTICE](NOTICE). This repo is
the reference *implementation*; the *standard* it implements
([ribosome-schema](https://github.com/medullaflow/ribosome-schema)) is a
separate Apache-2.0 repo with no such obligation. See
[CONTRIBUTING.md](CONTRIBUTING.md#why-agpl) for the reasoning.

ribosome is a component of the [medullaflow](https://github.com/medullaflow/medullaflow)
project, designed to be reusable standalone.

## Attribution

**Primary author:** Matteo Lacchio — [@ookmash](https://github.com/ookmash).
Principal authorship and copyright: [AUTHORS](AUTHORS). Full contributor list:
the repository's [Contributors graph](https://github.com/medullaflow/ribosome/graphs/contributors).

---

Made by Matteo Lacchio and Contributors.
