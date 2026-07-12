#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// The `bun build --compile` target (see the "compile" script in
// package.json) for the standalone binary track. Delegates to src/cli.ts --
// the same Node-compatible module tsc compiles into dist/cli.js, the npm
// package's `bin` entry (#94) -- rather than duplicating its logic, so the
// two distribution tracks (standalone binary vs. `npx @medullaflow/ribosome`)
// can never drift apart in behavior.
//
// Consuming ribosome as an npm library imports the orchestrator directly
// from src/index.ts and never touches this file.

import "../src/cli";
