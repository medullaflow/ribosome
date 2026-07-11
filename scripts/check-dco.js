#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// Checks every commit in a range carries a "Signed-off-by" trailer
// matching its author email (DCO — see CONTRIBUTING.md). No dependencies
// beyond git.
//
// Usage: node scripts/check-dco.js <base-sha> <head-sha>

const { execFileSync } = require("node:child_process");

// Dependabot's own commits are exempt: DCO certifies a human's right to
// contribute given content, which doesn't apply to a bot's mechanical
// version-bump; accountability for the change landing is the reviewer's,
// on merge. Checked by commit AUTHOR email specifically (not branch name,
// which an unrelated commit could share) -- a human commit on a
// dependabot/* branch is still held to the normal rule. Dependabot does
// add its own "Signed-off-by: dependabot[bot] <support@github.com>"
// trailer, but that email never matches its author email
// (49699333+dependabot[bot]@users.noreply.github.com), so the exact-match
// check below would otherwise always fail it regardless.
const DEPENDABOT_AUTHOR_EMAIL = "49699333+dependabot[bot]@users.noreply.github.com";

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
  let exempted = 0;

  for (const sha of shas) {
    const authorEmail = git(["show", "-s", "--format=%ae", sha]).trim().toLowerCase();
    if (authorEmail === DEPENDABOT_AUTHOR_EMAIL) {
      exempted++;
      continue;
    }
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

  const checked = shas.length - exempted;
  const exemptedNote = exempted > 0 ? `, ${exempted} dependabot commit(s) exempted` : "";
  console.log(`DCO check passed (${checked} commit(s) checked${exemptedNote}).`);
}

main();
