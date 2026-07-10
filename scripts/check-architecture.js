#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// CLI wrapper for the architecture fitness function (#29) -- see
// architecture-rules.js for the actual rule logic. Run standalone
// (`bun scripts/check-architecture.js`) or via `bun run check` /
// `bun run check:staged` (scripts/check.js folds this in).

const path = require("node:path");
const { checkArchitecture } = require("./architecture-rules");

const srcRoot = path.join(__dirname, "..", "src");
const violations = checkArchitecture(srcRoot);

if (violations.length === 0) {
  console.log("Architecture fitness function: no boundary violations.");
  process.exit(0);
}

console.error(`Architecture fitness function: ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} — ${v.message}${v.detail ? ` (${v.detail})` : ""}`);
}
console.error("\nSee docs/ARCHITECTURE.md#dependency-rules.");
process.exit(1);
