#!/bin/bash
# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: © 2026 ribosome contributors

# Runs Stryker mutation testing (#31) via bunfig.toml's coverage floor (D37)
# temporarily disabled. bun's `--config` flag does not override the
# auto-discovered root bunfig.toml (confirmed empirically -- it merges
# rather than replaces), and Stryker's mutation run only exercises a fast,
# deterministic subset of the suite (see stryker.conf.json), which would
# otherwise trip the per-file coverage floor on every file that subset
# doesn't touch. `trap` guarantees the real bunfig.toml comes back even if
# Stryker errors or is interrupted.
set -euo pipefail
cd "$(dirname "$0")/.."

cp bunfig.toml bunfig.toml.orig
trap 'mv bunfig.toml.orig bunfig.toml' EXIT

sed -i 's/^coverage = true/coverage = false/' bunfig.toml

./node_modules/.bin/stryker run "$@"
