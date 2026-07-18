---
title: Quickstart
description: Install ribosome and resolve your first manifest into a lockfile.
---

The mental model: write a manifest (`ribosome.json`), then resolve it into a
lockfile (`ribosome.lock.json`). ribosome provisions the runtimes your MCP
servers need and pins everything — servers and runtimes together — in one
pass.

## Install

No install needed — `npx` fetches and runs the CLI from npm on the fly:

```sh
npx @medullaflow/ribosome resolve
```

For repeat use, install it globally:

```sh
npm install -g @medullaflow/ribosome
ribosome resolve
```

:::note
A standalone binary requiring no Node at all is the
[Distribution](https://github.com/medullaflow/ribosome/milestones) (beta)
track — packaging for Windows, Linux, and macOS already ships checksums and
build-provenance attestation on every release, but full per-platform install
instructions land with
[#15](https://github.com/medullaflow/ribosome/issues/15) once the
verification tier closes. Until then, npm is the supported install path.
:::

## Write a manifest

Create `ribosome.json` in your project root:

```jsonc
{
  "$schema": "https://schema.ribosome.medullaflow.org/v1/manifest.schema.json",
  "schemaVersion": "1",

  "runtimes": { "node": "24" },

  "registries": {
    "default": "official",
    "sources": { "official": { "url": "https://registry.modelcontextprotocol.io" } }
  },

  "mcpServers": {
    "fs": {
      "source": "registry",
      "name": "io.modelcontextprotocol/filesystem",
      "version": "1.2.0"
    }
  }
}
```

See the [manifest reference](/reference/manifest/) for every field, including
inline and legacy `process` server sources.

## Resolve

```sh
ribosome resolve
```

This reads `ribosome.json`, provisions the `node@24` runtime via
[mise](https://mise.jdx.dev), resolves the `fs` server against the MCP
Registry, and writes `ribosome.lock.json` — a deduplicated runtime pool plus
one resolved environment view per server. If anything can't be resolved (a
missing tool, an unknown registry entry), `resolve` fails up front, before any
workflow that depends on the lockfile runs, and reports every failure at
once rather than stopping at the first one.

## Prune

Once a project stops referencing a runtime — you remove a server, or bump a
version — its old install lingers until you reclaim it:

```sh
ribosome prune              # remove runtimes no tracked project references anymore
ribosome prune --dry-run    # report what would be removed, without removing it
```

## Embedding as a library

A host orchestrator that wants to call the resolver directly, instead of
shelling out to the CLI, installs the library and wires it up itself — see the
[Library API reference](/reference/api/).
