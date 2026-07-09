#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// Checks every commit in a range carries a "Signed-off-by" trailer
// matching its author email (DCO — see CONTRIBUTING.md). No dependencies
// beyond git.
//
// Usage: node scripts/check-dco.js <base-sha> <head-sha>

const { execFileSync } = require("node:child_process");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("Usage: node scripts/check-dco.js <base-sha> <head-sha>");
    process.exit(2);
  }

  const shas = git(["rev-list", `${base}..${head}`])
    .split("\n")
    .filter(Boolean);
  const failures = [];

  for (const sha of shas) {
    const authorEmail = git(["show", "-s", "--format=%ae", sha]).trim().toLowerCase();
    const body = git(["show", "-s", "--format=%B", sha]);
    const signoffs = [...body.matchAll(/^Signed-off-by:\s*.+<([^>]+)>\s*$/gim)].map((m) =>
      m[1].toLowerCase(),
    );
    if (!signoffs.includes(authorEmail)) {
      failures.push({ sha: sha.slice(0, 12), authorEmail });
    }
  }

  if (failures.length > 0) {
    console.error('\nDCO check failed — missing/mismatched "Signed-off-by" on:\n');
    for (const f of failures) console.error(`  - ${f.sha} (author: ${f.authorEmail})`);
    console.error("\nEach commit must be signed off: `git commit -s` (the email must match");
    console.error("your git config user.email). Amend/rebase to fix existing commits, then");
    console.error("force-push the PR branch.\n");
    process.exit(1);
  }

  console.log(`DCO check passed (${shas.length} commit(s)).`);
}

main();
