# Contributing to ribosome

Read [README.md](README.md) first — it describes ribosome's scope and design
(a standalone dependency resolver for tool/runtime versions and MCP servers).

## Attribution Policy

- **Primary Author**: Matteo Lacchio (original creator)
- **Contributors**: Retain copyright of their own contributions, licensed under the same terms as the project
- **License**: All contributions must be compatible with MPL-2.0. (The *standard* ribosome implements — schemas, conformance corpus — lives separately in [ribosome-schema](https://github.com/medullaflow/ribosome-schema), Apache-2.0; contribute there for schema changes.)

## Adding Yourself to AUTHORS

Submit a PR adding yourself to `AUTHORS`:

    Your Name (<https://github.com/yourusername>) (2026-present)
    - Brief contribution description

## License Compliance

By contributing, you agree that your contribution is licensed under the
Mozilla Public License, version 2.0 (MPL-2.0) — the same license as the
rest of the project. You retain copyright of your own contributions.

If your contribution includes code from a third-party library, note it
in `NOTICE` along with that library's license.

## Sign off your commits (DCO)

Every commit must carry a `Signed-off-by` trailer matching your git
`user.email` — this is the [Developer Certificate of Origin](https://developercertificate.org/),
your assertion that you have the right to submit the contribution under
this project's license. No CLA, nothing to sign externally — just:

    git commit -s

Enforced in CI (`.github/workflows/dco.yml`) on every PR; missing/
mismatched sign-offs block the merge. Fix an existing commit with
`git commit --amend -s` (or `git rebase --exec 'git commit --amend --no-edit -s'`
for a range), then force-push the PR branch.

## Link commits to their issue

Work is tracked as [GitHub issues under milestones](https://github.com/medullaflow/ribosome/milestones),
not in a hand-kept file (see [ROADMAP.md](ROADMAP.md)) — so a commit is only
traceable back to *why* it exists if it says so itself. Reference the issue
in the commit body:

    Refs #42

or, when the commit is the complete fix for that issue:

    Closes #42

Both are plain git trailers — GitHub links the commit into the issue's
timeline either way; `Closes`/`Fixes` on a commit that lands on `main` also
closes the issue automatically. Prefer one issue per commit (or per tightly
related group of commits) over a single commit spanning several unrelated
issues — that's what keeps `git log --grep '#42'` and the issue's own
timeline actually useful as an audit trail later, instead of every commit
pointing at "various fixes."

Not every commit needs a reference — a typo fix or a formatting pass has
nothing to link to, and forcing one would just produce noise. Reference an
issue when the commit *implements* or *advances* tracked work.

`gh issue develop <number>` creates a branch already linked to an issue, if
you'd rather have GitHub do the association than rely on the commit trailer
alone.

## SPDX Headers & Git Hooks

Every `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.scss` and `.css` file
must carry an SPDX header (see `.github/HEADER_TEMPLATE.txt` for the exact
format per file type).

Running `bun install` once after cloning configures git to use the
versioned hooks in `.githooks/` (via `core.hooksPath` — no husky, no extra
dependency). From then on, `git commit` blocks if a staged source file is
missing its header. Useful commands:

    bun run spdx:check   # check every file in the repo
    bun run spdx:fix     # insert missing headers automatically

This repo's toolchain is [bun](https://bun.sh) (install/build/test/compile),
not Node — see [`docs/ARCHITECTURE.md` D14](docs/ARCHITECTURE.md#design-decisions).

## Why MPL-2.0?

ribosome is meant to be consumed two ways: as a CLI/binary people run directly,
and as a library other orchestrators embed in their own products — including
closed-source, commercial ones. Strong copyleft (GPL/AGPL) is a poor fit for
the second case: under the classic GPL-family "derivative work" theory, a
product that embeds AGPL-licensed code can be read as obligated to release its
*entire* combined source, not just the parts that touch ribosome. For a
project whose whole positioning is "conform on the config axis, compete on the
runtime axis" (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) — i.e. wants
broad adoption of the resolver itself, not just the format — that's the wrong
trade-off.

MPL-2.0 is copyleft at the **file level**: if you modify a file that's part of
ribosome and distribute it — including embedded inside an otherwise-proprietary
product — you must share your changes to *that file* under MPL-2.0. You are
free to combine it with proprietary code in a larger work; only the files that
were actually part of ribosome carry the obligation. That matches the actual
goal: improvements to ribosome's own code come back to the project, without
requiring anyone who embeds it to open their whole product. Unlike the AGPL,
MPL-2.0 has no separate network-service clause — running a modified version
as a hosted/SaaS offering, without distributing copies, does not by itself
trigger the source-sharing requirement. That trade-off was made deliberately:
see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#design-decisions) for the
full reasoning and the alternatives considered (LGPL, permissive).

This does **not** mirror [medullaflow](https://github.com/medullaflow/medullaflow)'s
own license choice (AGPL) — that project is the orchestrator ribosome was
originally extracted from, and its own licensing is a separate decision for
its own maintainers; ribosome's fit as a widely-embeddable resolver library
is different from medullaflow's fit as a hosted orchestrator product.

Contact: https://github.com/medullaflow/ribosome/discussions
