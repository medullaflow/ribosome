#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 Matteo Lacchio

"use strict";

// Points git at the versioned .githooks/ directory instead of the
// untracked, per-clone .git/hooks/. Runs from package.json's "prepare"
// script, so it's set up automatically on `npm install` — no husky,
// no extra dependency. No-ops silently outside a git checkout (e.g.
// when this package is installed as a dependency).

const { execFileSync } = require("node:child_process");

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("git hooks configured (core.hooksPath = .githooks)");
} catch {
  // Not inside a git working tree — nothing to do.
}
