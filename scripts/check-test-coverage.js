#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// Per-file coverage floor (#31) for `node --test`'s own LCOV output --
// Node-native replacement for bunfig.toml's `coverageThreshold`, now that
// the test runner is `node --test`, not `bun test` (see D50). Exits
// non-zero when any file's line coverage drops below threshold, catching
// wholly- or mostly-untested code landing on the merge path. Per-file, not
// just an aggregate average: a new 0%-covered file would otherwise hide
// behind an already-high aggregate.
//
// 80%, matching bunfig.toml's prior threshold exactly -- not re-derived,
// deliberately kept identical across the runner swap so the bar didn't
// silently move. Lines only, not functions: verified empirically against
// dist/index.js (a pure re-export barrel, no application logic of its own)
// that V8's native function-counting (what --experimental-test-coverage
// instruments) counts every one of tsc's auto-generated CommonJS re-export
// getter closures as a separate function, most of which are never
// individually invoked regardless of real test coverage -- that file's
// lines figure (93.75%) closely tracked bun's own historical number for
// the same file, while its functions figure (71.43%) didn't reflect
// anything about test quality. Branches are collected in the LCOV output
// but deliberately not gated on either, same scope as the previous
// threshold (bunfig.toml never gated on branches or this file's inflated
// function count).
//
// dist/cli.js is deliberately excluded from coverage collection entirely
// (see the --test-coverage-exclude flag wherever this script is invoked
// from), not just exempted here -- matching D42's existing, deliberate
// precedent that this subprocess-only entry point sits outside the
// per-file floor, e2e-tested instead (test/cli.test.ts, test/cli-node.
// test.ts). It happened to be invisible to bun's own in-process coverage
// for the same underlying reason (subprocess execution isn't visible to
// the parent process's instrumentation) -- Node's coverage only sees it at
// all because --experimental-test-coverage's NODE_V8_COVERAGE mechanism
// happens to leak into an inherited-environment child process, which
// bun's own instrumentation structurally doesn't. Widening the floor to
// suddenly cover a file it was never meant to gate on would be a scope
// change smuggled in by a tooling migration, not something decided here.
//
// Usage: node scripts/check-test-coverage.js <path-to-lcov-file>

const fs = require("node:fs");

const THRESHOLD = 0.8;

function parseLcov(text) {
  const files = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      current = { path: line.slice(3), linesFound: 0, linesHit: 0 };
    } else if (line.startsWith("LF:") && current) {
      current.linesFound = Number(line.slice(3));
    } else if (line.startsWith("LH:") && current) {
      current.linesHit = Number(line.slice(3));
    } else if (line === "end_of_record" && current) {
      files.push(current);
      current = null;
    }
  }
  return files;
}

function ratio(hit, found) {
  // A file with zero instrumentable lines (e.g. a type-only re-export)
  // can't fail a coverage floor -- there's nothing to cover.
  return found === 0 ? 1 : hit / found;
}

function main() {
  const lcovPath = process.argv[2];
  if (!lcovPath) {
    console.error("Usage: node scripts/check-test-coverage.js <path-to-lcov-file>");
    process.exit(1);
  }

  const files = parseLcov(fs.readFileSync(lcovPath, "utf8"));
  const violations = [];

  for (const file of files) {
    const lineRatio = ratio(file.linesHit, file.linesFound);
    if (lineRatio < THRESHOLD) {
      violations.push({ path: file.path, lineRatio });
    }
  }

  if (violations.length === 0) {
    console.log(`Per-file coverage floor (${THRESHOLD * 100}% lines): all files pass.`);
    return;
  }

  console.error(`Per-file coverage floor (${THRESHOLD * 100}% lines) failed:\n`);
  for (const v of violations) {
    console.error(`  ${v.path}: lines ${(v.lineRatio * 100).toFixed(2)}%`);
  }
  process.exit(1);
}

main();
