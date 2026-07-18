# Status & roadmap

**ribosome is in alpha.** The resolution pipeline and the npm library
distribution are real, live, and integration-tested; cross-platform binary
distribution is the beta track.

Live status — what's open, in progress, or next — is tracked on GitHub
milestones, not mirrored here. A milestone list hand-copied into git drifts
from the real one the moment either side changes, so the link is the source of
truth:

**[github.com/medullaflow/ribosome/milestones](https://github.com/medullaflow/ribosome/milestones)**

## What's real today

| Part | State |
|------|-------|
| Manifest & lockfile format + validation | **Real** — defined by the ribosome schema, consumed here as a published dependency |
| The `EnvironmentProvider` and `McpRegistry` ports | **Real** interfaces |
| Runtime provisioning (reference provider) | **Real** — integration-tested against a real runtime-manager install |
| Registry resolution + the phased `Materializer` pipeline | **Real** — integration-tested against the live MCP registry, convergence-tested end-to-end |
| CLI (`ribosome resolve` / `prune`) | **Real** — `npx` / global install today; standalone binaries are the beta track |
| npm package `@medullaflow/ribosome` | **Published** — via an automated OIDC pipeline with a post-publish smoke test |
| Test-adequacy & review guardrails | **Real** — per-file coverage floor, advisory mutation signal, required review gate |

## Maturity bars

What each stage means for this project — the bar, not a snapshot of it. Check
the milestones for where things actually stand.

**Alpha (current).** A CLI that installs and runs without cloning the repo,
with install documentation, a published release that's been smoke-tested end
to end, and the test-adequacy and human-review guardrails in place. Not gated
on multi-platform binaries or signed installers.

**Beta.** Both distribution tracks real, and someone outside this repo depends
on a published release: all three platforms packaged through one release
workflow; every artifact genuinely zero-setup (the runtime manager is vendored
into it, not assumed on `PATH`) with checksums + build-provenance attestation
and an automated install-and-run smoke test; and install docs covering both
tracks.

**v1 / GA.** A compatibility promise: a documented stability policy for
ribosome's own exported surface (the `Materializer`, the ports, the CLI's
subcommands and flags), sustained breaking-change-free usage by an external
consumer, and the remaining deferred distribution scope — a signed macOS
installer and at least one native package-manager channel.
