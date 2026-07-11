#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// Single entry point for this repo's deterministic guardrails -- SPDX
// headers, Biome (lint + format + import order), the TypeScript typecheck,
// and the architecture fitness function (#29) -- run identically wherever
// they're invoked (an agent's post-edit habit, the pre-commit hook, CI) so
// none of them can drift from what the others actually check (#32). bun-only
// end to end, matching the repo's own toolchain (see AGENTS.md) -- this
// replaces the pre-commit hook's previous direct `node` call, its one
// remaining Node dependency.
//
// DCO sign-off is deliberately NOT one of the steps below: it's checked
// against a commit's *message*, not the staged tree, so it lives in the
// sibling `commit-msg` hook (and in CI's dco.yml) instead of here.
//
// Usage:
//   bun scripts/check.js            full tree: spdx (--all) + lint + typecheck + architecture
//   bun scripts/check.js --staged   pre-commit's fast path: spdx + lint scoped
//                                   to staged files; typecheck and the
//                                   architecture check are always
//                                   whole-program (neither has a staged-file
//                                   mode -- both need the full import graph)

const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const staged = process.argv.includes("--staged");
const BIOME = join(__dirname, "..", "node_modules", ".bin", "biome");

const steps = [
  {
    label: "SPDX headers",
    cmd: "bun",
    args: ["scripts/check-spdx-headers.js", ...(staged ? [] : ["--all"])],
  },
  {
    label: "Lint + format + import order (Biome)",
    cmd: BIOME,
    args: ["check", ...(staged ? ["--staged", "--no-errors-on-unmatched"] : [])],
  },
  { label: "Typecheck (tsc)", cmd: "bun", args: ["run", "build"] },
  // Widened, noEmit-only check: src/ + bin/ + test/ under the same strict
  // flags, so the test suite (and the CLI entry point, also outside the
  // build's own src/-scoped rootDir) can't silently drift out of the type
  // contract they're supposed to be held to (#30). Needs dist/ to already
  // exist (test files import the built output, not source) -- must run
  // after the build step above, never before.
  {
    label: "Typecheck (tsc, whole tree incl. tests)",
    cmd: "bun",
    args: ["run", "typecheck:test"],
  },
  {
    label: "Architecture fitness function",
    cmd: "bun",
    args: ["scripts/check-architecture.js"],
  },
];

let failed = false;
for (const { label, cmd, args } of steps) {
  console.log(`\n▶ ${label}`);
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
  } catch {
    failed = true;
  }
}

if (failed) {
  console.error("\nOne or more checks failed -- see above.");
  process.exit(1);
}
console.log("\nAll checks passed.");
