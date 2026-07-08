# Contributing to ribosome

Read [README.md](README.md) first — it describes ribosome's scope and design
(a standalone dependency resolver for tool/runtime versions and MCP servers).

## Attribution Policy

- **Primary Author**: Matteo Lacchio (original creator)
- **Contributors**: Retain copyright of their own contributions, licensed under the same terms as the project
- **License**: All contributions must be compatible with the GNU AGPLv3-or-later

## Adding Yourself to AUTHORS

Submit a PR adding yourself to `AUTHORS`:

    Your Name (<https://github.com/yourusername>) (2026-present)
    - Brief contribution description

## License Compliance

By contributing, you agree that your contribution is licensed under the
GNU Affero General Public License v3 (or, at your option, any later
version) — the same license as the rest of the project. You retain
copyright of your own contributions.

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

## SPDX Headers & Git Hooks

Every `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.scss` and `.css` file
must carry an SPDX header (see `.github/HEADER_TEMPLATE.txt` for the exact
format per file type).

Running `npm install` once after cloning configures git to use the
versioned hooks in `.githooks/` (via `core.hooksPath` — no husky, no extra
dependency). From then on, `git commit` blocks if a staged source file is
missing its header. Useful commands:

    npm run spdx:check   # check every file in the repo
    npm run spdx:fix     # insert missing headers automatically

## Why AGPL?

ribosome uses the AGPL (rather than the plain GPL) specifically so that anyone
running a modified version as a network service must also publish their changes.
If you're building on top of ribosome — including as part of a hosted product —
please keep that in mind.

This mirrors the license chosen for [medullaflow](https://github.com/medullaflow/medullaflow),
the orchestrator ribosome was extracted from. See medullaflow's CONTRIBUTING.md
for the full reasoning behind the AGPL choice over Apache 2.0.

Contact: https://github.com/medullaflow/ribosome/discussions
