---
title: CLI reference
description: Every ribosome command, flag, and exit code.
---

```
Usage: ribosome <command> [options]

Commands:
  resolve [manifest]   Resolve dependencies into ribosome.lock.json (default manifest: ribosome.json)
  prune                Remove runtimes no longer referenced by any tracked project

Options:
  --cwd <dir>          Project root the manifest and lockfile are anchored to (default: cwd)
  --dry-run            prune: report what would be removed, without removing it
  -h, --help           Show this help message
  -v, --version        Show version number
```

This is the CLI's real, unedited `--help` output — captured from a build at
publish time rather than hand-copied, so it can't drift from what the
installed CLI actually prints.

## `ribosome resolve [manifest]`

Reads a manifest (`ribosome.json` by default, or the path given as the first
positional argument), provisions every declared runtime, resolves every
declared MCP server, and writes `ribosome.lock.json` alongside it.

```sh
ribosome resolve                    # reads ./ribosome.json
ribosome resolve path/to/other.json # reads an explicit manifest path
ribosome resolve --cwd ../other-project
```

On success, prints a one-line summary of what was resolved and exits `0`. On
failure, every independent problem is reported at once — a missing tool, an
unresolvable registry entry, a malformed manifest — rather than stopping at
the first one, so you don't fix-and-rerun repeatedly to discover the next
failure.

## `ribosome prune [--dry-run]`

Removes runtimes that no manifest in scope references anymore — the cleanup
side of the same runtime pool `resolve` provisions into.

```sh
ribosome prune             # actually remove unreferenced runtimes
ribosome prune --dry-run   # report what would be removed, without removing it
```

## Global options

| Flag | Applies to | Meaning |
|---|---|---|
| `--cwd <dir>` | both | Project root the manifest and lockfile are anchored to. Defaults to the current working directory. |
| `--dry-run` | `prune` | Report what would be removed without removing it. |
| `-h`, `--help` | — | Print usage and exit `0`. Also triggered by no arguments at all. |
| `-v`, `--version` | — | Print the installed CLI's version and exit `0`. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | Invalid manifest — unreadable, not valid JSON, or fails schema validation. Also used for an unknown command. |
| `2` | Resolution failure — the manifest was valid, but one or more runtimes/servers couldn't be resolved. Every failure is listed in the output. |
| `3` | Internal error — something ribosome itself didn't handle explicitly. Worth [filing an issue](https://github.com/medullaflow/ribosome/issues) with the printed stack trace. |

## Embedding instead of shelling out

A host orchestrator that wants programmatic access to the same resolution
pipeline, without spawning the CLI as a subprocess, uses the library
directly — see the [Library API reference](/reference/api/).
