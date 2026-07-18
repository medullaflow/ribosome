---
title: MCP server schema
description: Where the normative server.json and manifest/lockfile schemas live.
---

ribosome is the *package manager*; **[ribosome-schema](https://github.com/medullaflow/ribosome-schema)**
is the *format* it reads and writes — think npm-the-CLI vs. the `package.json`
format. The normative JSON Schemas, a conformance corpus, and a TypeScript
binding all live there, not here, so there's exactly one source of truth for
the standard regardless of which repo you're reading.

- **[ribosome-schema on GitHub](https://github.com/medullaflow/ribosome-schema)** —
  the spec, conformance corpus, and TypeScript binding.
- **[`manifest.schema.json`](https://schema.ribosome.medullaflow.org/v1/manifest.schema.json)** —
  what `ribosome.json` must conform to. See also this site's own
  [manifest reference](/reference/manifest/) for a reader-friendly walkthrough.
- **[`lockfile.schema.json`](https://schema.ribosome.medullaflow.org/v1/lockfile.schema.json)** —
  what `ribosome.lock.json` conforms to after a successful `resolve`.

ribosome depends on `@medullaflow/ribosome-schema` as an ordinary package and
carries no schema files, conformance fixtures, or validation logic of its
own — `validateManifest`/`validateLockfile`, re-exported from
`@medullaflow/ribosome-schema` through ribosome's own
[Library API](/reference/api/), are the only validation path.
