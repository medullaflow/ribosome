#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 Matteo Lacchio

"use strict";

// Checks (and optionally fixes) SPDX headers on source files.
// No dependencies beyond Node and git.
//
// Usage:
//   node scripts/check-spdx-headers.js            check staged files (used by the pre-commit hook)
//   node scripts/check-spdx-headers.js --all       check every tracked/untracked-non-ignored file
//   node scripts/check-spdx-headers.js --fix       insert missing headers into every such file

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const LICENSE_ID = "AGPL-3.0-or-later";
const HEADER_SCAN_LINES = 10;
const FALLBACK_HOLDER = "ribosome contributors";

const COMMENT_STYLE = {
  ".ts": "slashes",
  ".tsx": "slashes",
  ".js": "slashes",
  ".jsx": "slashes",
  ".mjs": "slashes",
  ".cjs": "slashes",
  ".scss": "slashes",
  ".css": "block",
};
const EXTENSIONS = Object.keys(COMMENT_STYLE);

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function stagedFiles() {
  return git(["diff", "--cached", "--name-only", "--diff-filter=ACM"])
    .split("\n")
    .filter(Boolean)
    .filter((f) => EXTENSIONS.includes(path.extname(f)));
}

function allFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .filter((f) => EXTENSIONS.includes(path.extname(f)));
}

function headerLines(ext, holder) {
  const year = new Date().getFullYear();
  const idLine = `SPDX-License-Identifier: ${LICENSE_ID}`;
  const copyrightLine = `SPDX-FileCopyrightText: © ${year} ${holder}`;
  if (COMMENT_STYLE[ext] === "block") {
    return [`/* ${idLine} */`, `/* ${copyrightLine} */`, ""];
  }
  return [`// ${idLine}`, `// ${copyrightLine}`, ""];
}

function headOf(absPath) {
  return fs.readFileSync(absPath, "utf8").split("\n").slice(0, HEADER_SCAN_LINES).join("\n");
}

function hasValidHeader(head) {
  const escapedId = LICENSE_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idRe = new RegExp(`SPDX-License-Identifier:\\s*${escapedId}\\b`);
  return idRe.test(head) && /SPDX-FileCopyrightText:/.test(head);
}

function gitUserName() {
  try {
    const name = git(["config", "user.name"]).trim();
    return name || FALLBACK_HOLDER;
  } catch {
    return FALLBACK_HOLDER;
  }
}

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const all = args.includes("--all") || fix;
  const files = (all ? allFiles() : stagedFiles()).filter((f) =>
    fs.existsSync(path.join(REPO_ROOT, f)),
  );

  const missing = files.filter((f) => !hasValidHeader(headOf(path.join(REPO_ROOT, f))));

  if (missing.length === 0) {
    if (fix) console.log("All source files already have a valid SPDX header.");
    return;
  }

  if (fix) {
    const holder = gitUserName();
    for (const file of missing) {
      const abs = path.join(REPO_ROOT, file);
      const ext = path.extname(file);
      const original = fs.readFileSync(abs, "utf8");
      const header = headerLines(ext, holder).join("\n");
      const shebangMatch = original.match(/^#!.*\n/);
      const updated = shebangMatch
        ? shebangMatch[0] + header + original.slice(shebangMatch[0].length)
        : header + original;
      fs.writeFileSync(abs, updated);
      console.log(`  fixed: ${file}`);
    }
    console.log(`\n${missing.length} file(s) updated. Review, then \`git add\` and commit.`);
    return;
  }

  console.error("\nMissing or incorrect SPDX header in:\n");
  for (const file of missing) console.error(`  - ${file}`);
  console.error(`\nEach source file must contain, within its first ${HEADER_SCAN_LINES} lines:`);
  console.error(`  SPDX-License-Identifier: ${LICENSE_ID}`);
  console.error('  SPDX-FileCopyrightText: © <year> <you, or "ribosome contributors">\n');
  console.error("Run `bun run spdx:fix` to insert them automatically, then re-stage and commit.\n");
  process.exit(1);
}

main();
