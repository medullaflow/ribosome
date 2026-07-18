#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: © 2026 ribosome contributors

# Runs Stryker mutation testing (#31). Used to also toggle bunfig.toml's
# coverage floor (D37) off around the run, since Stryker's per-mutant `bun
# test` invocation would otherwise trip it on every file its fast,
# deterministic 4-file subset (see stryker.conf.json) doesn't touch --
# bunfig.toml is gone (D50, the test-runner migration off `bun test`), so
# there's no coverage config left for that subset to conflict with.
set -euo pipefail
cd "$(dirname "$0")/.."

./node_modules/.bin/stryker run "$@"
