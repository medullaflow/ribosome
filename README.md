# ribosome

A standalone dependency resolver for tool/runtime versions and MCP servers.
Given a project's declared dependencies, ribosome resolves and materializes them
**upfront** — before any workflow or process runs — so missing tools fail at
validation time, not mid-execution.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

## What it does

- **Runtimes** — wraps [mise-en-place](https://mise.jdx.dev/) to install and
  locate exact tool/runtime versions (`node`, `python`, `go`, …) and expose
  their `binPath` so subprocesses pick up the right version automatically.
- **MCP servers** — resolves `source: registry` entries against the
  [MCP Registry](https://registry.modelcontextprotocol.io/) to get exact launch
  commands; passes through `source: command` entries as-is.
- **Lockfile output** — produces a `ResolvedDependencies` object (matching
  [medullaflow's `medullaflow.lock.json` schema](https://github.com/medullaflow/medullaflow/blob/main/schema/medullaflow.lock.schema.json))
  that can be persisted for reproducible re-runs.

## Design

ribosome exposes a single abstract interface (`DependencyResolver`) plus one
concrete implementation (`MiseDependencyResolver`). Callers depend only on the
interface — swapping the concrete resolver is a one-line change.

```
src/
├── core/
│   ├── resolver.ts        # DependencyResolver interface + ResolvedDependencies types
│   └── manifest-types.ts  # input shape (mirrors medullaflow.json's dependencies section)
└── mise/
    └── mise-resolver.ts   # MiseDependencyResolver: mise-en-place + MCP Registry
```

## Status

Pre-alpha — extracted from [medullaflow](https://github.com/medullaflow/medullaflow)
as a standalone library. Interface definitions are real and stable; concrete
method bodies are stubs (`throw "not implemented"`) pending actual subprocess
implementation.

## Usage

```typescript
import { MiseDependencyResolver } from "@medullaflow/ribosome";

const resolver = new MiseDependencyResolver();
const resolved = await resolver.resolve(manifest.dependencies, { cwd: projectRoot });
// resolved.runtimes  — exact versions + bin paths
// resolved.mcpServers — launch commands
```

## Why "ribosome"?

Ribosomes are the cell's dependency materializers: they take a declaration
(mRNA) and turn it into working machinery (proteins). Same idea here.

## License

AGPLv3-or-later. See [LICENSE](LICENSE).

ribosome is a component of the [medullaflow](https://github.com/medullaflow/medullaflow)
project and designed to be reusable standalone. If you run a modified version
as a network service, you must make your changes' source available to its users —
see [CONTRIBUTING.md](CONTRIBUTING.md#why-agpl) for the full reasoning.

## Attribution

### Primary Author
**Matteo Lacchio** — [@ookmash](https://github.com/ookmash)

### Contributors
_Full list: [AUTHORS](AUTHORS)_

## Development

```bash
npm install   # also wires up the pre-commit SPDX-header check
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution/attribution workflow.

## Contact

- GitHub: [@ookmash](https://github.com/ookmash)
- Repo: https://github.com/medullaflow/ribosome

---

Made by Matteo Lacchio and Contributors
