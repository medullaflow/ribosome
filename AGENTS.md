# AGENTS.md

Operating contract for **AI coding agents** working in this repo. Humans:
read [CONTRIBUTING.md](CONTRIBUTING.md) instead — it covers the same ground
in prose. This file states only what an agent **cannot infer** from the code
and would otherwise rediscover (and get wrong) each session. Keep it that way:
if something is discoverable by reading the source, it does not belong here.

Most of this repo's code is written by agents. Treat every rule below as a
hard constraint, not a suggestion — several are (or will be) mechanically
enforced, and the ones that aren't yet are called out explicitly so you know
where your own discipline is currently the only thing holding the line.

## Toolchain: bun, not Node

This repo's own dev/build/test/compile toolchain runs entirely on
[bun](https://bun.sh) (≥ 1.3.0), **not Node** — see
[`docs/ARCHITECTURE.md` D14](docs/ARCHITECTURE.md#design-decisions). Do not
reach for `node`, `npm run`, `npx`, or a Node-based script runner for this
repo's tasks. (`tsc` is still the type-checker and still emits the portable
`dist/` that downstream `npm install` consumers get — that's a consumer
concern, not your toolchain.)

## One-time setup you can't infer

This repo depends on `@medullaflow/ribosome-schema` via a local `file:` link
to a **sibling checkout**, not a published npm version. Both repos must sit
side by side or `bun install` cannot resolve the dependency:

```
some-dir/
├── ribosome/          (this repo)
└── ribosome-schema/   (https://github.com/medullaflow/ribosome-schema)
```

## Commands

```bash
bun install       # installs deps, links the sibling schema repo, wires git hooks
bun run build     # tsc — type-check and emit dist/
bun run test      # build, then run the full suite (incl. a live mise integration test)
bun run compile   # bun build --compile — proves the standalone-binary path still works
bun run lint      # Biome check (lint + format + import-organize), no writes
bun run lint:fix  # Biome check --write — auto-fix everything fixable
bun run format    # Biome format --write — reformat only
bun run spdx:check   # verify SPDX headers on all source files
bun run spdx:fix     # insert any missing SPDX headers
```

The mise integration test self-skips if `mise` isn't on `PATH`; CI installs
mise so it runs for real there. **Run `bun run lint:fix` before committing** —
lint and formatting are enforced (pre-commit + CI), so unformatted or
lint-failing code will not merge.

## Hard constraints

Each constraint is tagged with how it's currently enforced. **Enforced** = a
check will fail if you break it. **Convention only** = nothing stops you yet;
don't rely on that lasting.

- **Lint + formatting** (Biome — style, formatting, import order, correctness
  rules; config in `biome.json`). *Enforced* — pre-commit hook (staged files)
  + CI (whole tree). Run `bun run lint:fix` before committing.
- **SPDX headers** on every `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`/`.scss`/`.css`
  file (see `.github/HEADER_TEMPLATE.txt` for the exact per-type format).
  *Enforced* — pre-commit hook + CI. Run `bun run spdx:fix` if you add a file.
- **DCO sign-off** on every commit (`git commit -s`, a `Signed-off-by`
  trailer matching the committer's email). *Enforced* — CI (`dco.yml`).
- **Hexagonal dependency rules** (see below). *Convention only* — an
  automated fitness function is tracked in
  [#29](https://github.com/medullaflow/ribosome/issues/29); until then these
  are your responsibility to honor by hand.
- **Commit ↔ issue linkage.** Reference the issue a commit advances with a
  `Refs #N` trailer, or `Closes #N` when the commit fully resolves it (see
  [CONTRIBUTING.md](CONTRIBUTING.md#link-commits-to-their-issue)).
  *Convention* — not blocked, but expected; it's how work stays traceable
  without a hand-kept task list.

## Architecture boundaries you must not cross

This is a [ports & adapters](https://alistair.cockburn.us/hexagonal-architecture/)
design. Full reasoning and diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
The four rules that keep it decoupled — **honor these by hand until
[#29](https://github.com/medullaflow/ribosome/issues/29) makes them
mechanical**:

1. `src/ports/` imports nothing from `src/adapters/`. Adapters import ports +
   the schema package; **adapters never import each other**.
2. The orchestrator receives adapters by **constructor injection** — it never
   constructs a concrete adapter. Default wiring lives **only** in `src/index.ts`.
3. The JSON Schema is authoritative; TypeScript types are **generated from
   it** — and that happens in `ribosome-schema`, never here.
4. The lockfile is declarative and portable — no shell/activation snippets
   leak into it.

## Where things live

```
src/ports/         abstractions — EnvironmentProvider, McpRegistry
src/adapters/      concretions — mise/, mcp-registry/
src/orchestrator/  the phased materialization pipeline
src/index.ts       the public API surface + default wiring (the only place wiring lives)
test/              the test suite
docs/ARCHITECTURE.md   design, dependency rules, decision log (D1–D17)
```

Planned work is tracked as
[GitHub milestones + issues](https://github.com/medullaflow/ribosome/milestones),
not in a file. [ROADMAP.md](ROADMAP.md) is only a pointer to them.
