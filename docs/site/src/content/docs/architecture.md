---
title: How ribosome works
description: A reader-friendly tour of ribosome's design -- ports & adapters, the pool + views model, and the phased resolution pipeline.
---

This page is a guided tour of the design. For the full engineering
decision log — every trade-off, with dated rationale — see
[`docs/ARCHITECTURE.md`](https://github.com/medullaflow/ribosome/blob/main/docs/ARCHITECTURE.md)
on GitHub; it's written for contributors, not first-time readers, so it isn't
reproduced here verbatim.

## The niche

Runtime managers (mise, asdf, nix) provision tool versions. MCP clients read
a `server.json` and launch a server. **Nobody does the unified, upfront
step**: runtimes *and* MCP servers, resolved together, deduplicated into a
shared pool, and pinned into one reproducible lockfile — before any workflow
runs, so a missing tool or unresolvable server fails at validation time, not
mid-execution.

ribosome conforms on the config axis and competes on the runtime axis: its
`mcpServers` manifest section is a compatible superset of existing MCP config
formats, not "yet another way to list servers." The value is the runtime
provisioning those formats don't do.

## Ports & adapters

ribosome is a [hexagonal (ports & adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
design — every layer is an abstraction plus one or more implementations, and
no layer is coupled to a concrete tool.

| Layer | Abstraction | Implementation | Responsibility |
|---|---|---|---|
| **Spec** ([ribosome-schema](https://github.com/medullaflow/ribosome-schema), external) | Normative JSON Schemas + validation contract | validator, generated types, version pins | The standard — source of truth for the manifest & lockfile formats. |
| **Ports** (`src/ports/`) | `EnvironmentProvider`, `McpRegistry` (+ typed failures) | — (interfaces only) | The seams the orchestrator depends on. |
| **Adapters** (`src/adapters/`) | — | `MiseEnvironmentProvider`, `OfficialMcpRegistry`, `FileMcpRegistry` | The only code that knows mise, or a concrete registry, exists. |
| **Orchestrator** (`src/orchestrator/`) | `DependencyMaterializer` | `Materializer`, `resolveMcpServer()`, `deriveLaunch()`, `writeLockfile()` | Composes the layers into the phased pipeline; emits the lockfile. |

Every dependency arrow points **inward**, toward the orchestrator core — the
concrete tools (mise, a specific registry) sit at the edge, reachable only
through their own adapter. A consumer wanting a different runtime backend
(asdf, nix, devbox) or a different registry protocol implements the same
port; the orchestrator never knows the difference. This is mechanically
enforced, not just a convention — an architecture fitness function walks the
real import graph in CI and fails the build on a forbidden edge (e.g.
`ports/` importing from `adapters/`).

## The pool + views model

The single most important idea in the design:

- **Runtime pool** — *one per project*, deduplicated by `(tool, exact
  version)`. Ten MCP servers all needing `node@24` produce **one** pool
  entry, one install.
- **Environment views** — the project and *each* MCP server get their own
  view: a selection of pool entries composed into an environment delta
  pointing at just those entries. **Isolation at the environment level,
  deduplication at the install level.**

This isn't an abstraction imposed from outside — it's how real backends
already work (mise's shared installs directory + per-consumer `PATH` views;
Nix's shared store + per-consumer profiles). The model is native to them,
which is what keeps ribosome uncoupled from any one backend.

## The phased pipeline

Runtime requirements are discovered in two phases, because **an MCP server's
runtime is determined by the registry, not the user**: resolving a
`server.json` reveals its package registry type (npm, PyPI, NuGet, ...),
which implies the runtime family (npm → Node, PyPI → Python, ...). The
*version* comes from the project's declared `runtimes` (the version policy),
or a provider default when unpinned.

1. Validate `ribosome.json` against the spec.
2. Resolve each `mcpServers` entry — registry lookup, inline passthrough, or
   process passthrough.
3. Derive runtime requirements from each resolved server's package metadata.
4. Merge project runtimes + server-derived requirements, deduplicated, into
   one set of pool requirements.
5. `EnvironmentProvider.materialize()` — one install per `(tool, version)`.
6. Compose environment views: one for the project, one per server.
7. Assemble the lockfile, aggregating **every** failure across the whole
   run rather than stopping at the first one.
8. The one filesystem write: persist `ribosome.lock.json`.

Resolution failures are always aggregated — either everything resolves, or
you get a report listing every independent problem at once (a missing tool,
an unresolvable registry entry), each tagged with the manifest entry it came
from, so you don't fix-and-rerun repeatedly to discover the next one.

## Purity and effects

Two kinds of side effects, only one of which is extractable:

- **Resolution effects** (`mise install`, registry HTTP calls) are intrinsic
  I/O and live inside adapters — an `EnvironmentProvider` has to be allowed
  to install things.
- **Persistence effects** (writing the lockfile) are extracted: the
  orchestrator's own logic — merging, phasing, failure aggregation — is pure
  and returns a lockfile as data; a separate, thin step persists it.

This is why `Materializer.materialize()` is fully testable with zero
filesystem access: it never writes anything itself, it just returns a value.

## Two repos, one standard

The manifest/lockfile format is a separate standard with its own repository and
license — see the [schema reference](/reference/schema/) for where it lives and
why that separation is deliberate rather than a code-organization detail.
