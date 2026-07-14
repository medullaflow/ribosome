---
title: "Manifest reference: ribosome.json"
description: Every field in the ribosome.json manifest format.
---

The full, normative format lives in
**[ribosome-schema](https://github.com/medullaflow/ribosome-schema)** — see
[Two repos, on purpose](#two-repos-on-purpose) below for why that's a separate
repository. This page is a reader-friendly walkthrough of the same schema,
kept in sync by hand; the JSON Schema itself is the source of truth for
tooling and validation.

```jsonc
{
  "$schema": "https://schema.ribosome.medullaflow.org/v1/manifest.schema.json",
  "schemaVersion": "1",

  "runtimes": { "node": "24", "python": "3.12" },

  "registries": {
    "default": "official",
    "sources": { "official": { "url": "https://registry.modelcontextprotocol.io" } }
  },

  "mcpServers": {
    "fs": { "source": "registry", "name": "io.modelcontextprotocol/filesystem", "version": "1.2.0" }
  },

  "pool": { "dir": ".ribosome/pool" },
  "extends": []
}
```

## Top-level fields

| Field | Required | Description |
|---|---|---|
| `schemaVersion` | yes | Manifest format version. Currently `"1"`. Bumped only on breaking changes. |
| `runtimes` | no | Tool/runtime version requirements — both for your own project's tools and as the version *policy* for MCP runtimes (e.g. declaring `node` here pins the Node version any npm-based MCP server resolves to). Each value is a version spec string like `"24"`, `"3.12"`, `"20.11.0"`. |
| `registries` | no | Named MCP registry sources this project resolves against. Required if any `mcpServers` entry uses `"source": "registry"`. |
| `mcpServers` | no | Map of local server id → server declaration. See [Server sources](#server-sources) below. |
| `pool` | no | Where the runtime pool materializes. Omitted means the environment provider's own default (typically a shared store, maximizing install reuse across projects). Setting `pool.dir` trades that reuse for isolation — hermetic CI, or per-package pools in a monorepo. |
| `extends` | no | **Reserved for a future minor version.** Paths to external MCP config files (`.mcp.json`, `.vscode/mcp.json`, ...) to import. Declaring the field now keeps that capability additive and non-breaking later. |

## `registries`

```jsonc
"registries": {
  "default": "official",
  "sources": {
    "official": { "url": "https://registry.modelcontextprotocol.io" },
    "internal": {
      "url": "https://mcp.internal.example.com",
      "auth": [{ "header": "Authorization", "envVar": "INTERNAL_REGISTRY_TOKEN" }]
    }
  }
}
```

- `default` — name of the `sources` entry used by a registry server that omits an explicit `registry`.
- `sources.<name>.url` — the registry's base URL.
- `sources.<name>.auth` — HTTP headers to send when resolving against this source. Each header's **value is read from the named environment variable at resolve time** — never a literal credential in the manifest itself.

## Server sources

Every entry in `mcpServers` is exactly one of three shapes, discriminated by
its `source` field.

### `registry`

Resolved from a named registry by reverse-DNS name. The registry's own
`server.json` response determines the server's runtime, transport, and launch
command — not this manifest.

```jsonc
"fs": {
  "source": "registry",
  "registry": "official",       // optional — defaults to registries.default
  "name": "io.modelcontextprotocol/filesystem",
  "version": "1.2.0",           // optional — omit for the registry's latest
  "permissions": ["fs:read"]
}
```

### `inline`

A custom server described with a full, standard `server.json` document — it
declares its own packages/runtime/env and participates in resolution exactly
like a registry server would. This is the natural path from "custom server"
to "published to a registry" later, with no shape change required.

```jsonc
"custom": {
  "source": "inline",
  "server": { /* a complete server.json document */ },
  "permissions": []
}
```

### `process`

A compatibility bridge: a raw local process launch, field-compatible with
`.mcp.json`/editor MCP config, for copy-paste migration. **Not
runtime-resolved by ribosome** — the command is the caller's responsibility,
though it still runs inside the project's runtime pool environment.

```jsonc
"legacy": {
  "source": "process",
  "command": "npx",
  "args": ["-y", "@foo/bar"],
  "env": { "FOO_TOKEN": "..." },
  "transport": "stdio"          // or "http", which then requires "url"
}
```

## `permissions`

All three server shapes accept an optional `permissions` array — opaque
scope strings passed through to the orchestrator embedding ribosome.
Semantics are defined by that orchestrator, not by ribosome itself.

## Two repos, on purpose

ribosome is the *tool*; `ribosome-schema` is the *format* it reads — think
npm-the-CLI vs. `package.json`. ribosome depends on
[`@medullaflow/ribosome-schema`](https://github.com/medullaflow/ribosome-schema)
as an ordinary package and carries no schema files of its own, so the
normative format has exactly one source of truth regardless of which repo you
land in.
