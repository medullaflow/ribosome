#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

"use strict";

// Compiles test/ (+ scripts/architecture-rules.js) to CommonJS via tsc, into
// a throwaway .test-build/ directory, then runs the result under real
// `node --test` -- not `bun test` (see D50). bun remains this repo's
// install/build toolchain (D14) unaffected; only the test *runner* changes,
// specifically to route around the still-unfixed oven-sh/bun#23077
// nested-test scheduler bug in Bun's own node:test compatibility layer,
// which test files here have always used (none import from "bun:test").
//
// Compiling to CommonJS, not running raw .ts under Node's own
// --experimental-strip-types, is deliberate: Node's type-stripper only
// erases type annotations syntactically, it doesn't desugar TS features
// with real runtime semantics (e.g. constructor parameter-property
// shorthand, used by src/orchestrator/materializer.ts) the way tsc's real
// compiler does, and CommonJS's require() resolves the extensionless
// relative imports this codebase already uses natively, where Node's own
// ESM loader would reject them outright.
//
// The compiled output's directory depth doesn't match the repo root, which
// breaks every __dirname-relative repo-root reference (`dist/`, `bin/`,
// `package.json`, `test/fixtures/`, and architecture-fitness.test.ts's own
// live introspection of the real `src/` tree) -- each gets symlinked in
// from the real repo root rather than recompiled or copied, so nothing
// outside test/ itself needs a second copy.
//
// Usage: node scripts/run-tests.js

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BUILD_DIR = path.join(ROOT, ".test-build");
const LCOV_PATH = path.join(BUILD_DIR, "coverage.lcov");
const TSC = path.join(ROOT, "node_modules", ".bin", "tsc");

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT });
}

function symlink(target, linkPath) {
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(target, linkPath);
}

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
run(TSC, ["-p", "tsconfig.test.json"]);

symlink("../dist", path.join(BUILD_DIR, "dist"));
symlink("../bin", path.join(BUILD_DIR, "bin"));
symlink("../package.json", path.join(BUILD_DIR, "package.json"));
symlink("../src", path.join(BUILD_DIR, "src"));
symlink("../../test/fixtures", path.join(BUILD_DIR, "test", "fixtures"));

let testsFailed = false;
try {
  run("node", [
    "--test",
    "--experimental-test-coverage",
    // A bare --test-reporter=lcov replaces the default reporter entirely,
    // silently dropping every human-readable pass/fail line -- both
    // reporters must be listed explicitly to get spec output on stdout
    // *and* the lcov file this script's own coverage check reads.
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=lcov",
    `--test-reporter-destination=${LCOV_PATH}`,
    "--test-coverage-exclude=**/test/**",
    "--test-coverage-exclude=**/.test-build/test/**",
    "--test-coverage-exclude=**/dist/cli.js",
    path.join(".test-build", "test", "*.test.js"),
  ]);
} catch {
  testsFailed = true;
}

let coverageFailed = false;
try {
  run("node", [path.join("scripts", "check-test-coverage.js"), LCOV_PATH]);
} catch {
  coverageFailed = true;
}

if (testsFailed || coverageFailed) process.exit(1);
