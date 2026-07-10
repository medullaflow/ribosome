# Roadmap

Live status — milestones, issues, and their descriptions — is tracked
entirely on GitHub, not in this file:

**[github.com/medullaflow/ribosome/milestones](https://github.com/medullaflow/ribosome/milestones)**

This file deliberately does **not** duplicate that content. A milestone
list mirrored by hand in git drifts from the live one the moment either
side changes — that drift, and the manual reconciliation it costs, is
exactly what this pointer avoids. What *does* belong in git, and stays in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), is the durable material that
doesn't change per sprint: the design-decision log (D1–D17 and onward),
the dependency rules, the architecture diagrams. Read that file for *why*
things are built the way they are; read the GitHub milestones for *what's
currently open, done, or next*.

For a human or an agent landing in this repo with no GitHub access: the
milestones as of this writing are **Environment Provider** (closed),
**MCP Registry Adapter** (closed), **Multi-Registry Support** (closed —
per-source auth headers, an offline/local registry adapter, and proven
multi-source dispatch), **Orchestrator Pipeline** (closed — the phased
manifest-to-lockfile pipeline, aggregate-all-failures, lockfile-writing
effects layer, and the cross-milestone convergence check against a real
registry + real environment provider), **Distribution** (binary + npm
library packaging), and **Guardrails & Governance** (converting documented
conventions — lint, architectural boundaries, type/test adequacy — into
machine-enforced checks, since most of this repo's code is agent-authored) —
but treat that list as a snapshot, not a source of truth; the link above
always wins.
