// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Packages one macOS architecture's cross-compiled binary (#6) plus its
// bundled mise (#8) as a zip archive -- deliberately the only artifact for
// macOS (#11): a genuine .pkg/.dmg needs Apple-only tooling and, for a
// trustworthy first run, code signing + notarization under a paid Apple
// Developer account, both out of scope for now (see #17). Stays on the
// same Linux runner as everything else in the build tier -- zip creation
// needs no macOS-specific tooling.
//
//   node scripts/package-macos.js <x64|arm64> <compiledDir> <outDir>
//
// <compiledDir> is the cross-compile job's downloaded artifact root: it must
// contain ribosome-darwin-<arch> and mise-bundled/darwin-<arch>/mise.
//
// Lays the binary and its "mise-bundled" sibling directory together inside
// the archive, matching what resolveMiseBinary()
// (src/vendor/resolve-mise-binary.ts) looks for beside process.execPath.
// An unsigned binary extracted this way triggers Gatekeeper's "unidentified
// developer" warning on first run -- documented, not worked around, in
// README/release notes.

const { mkdirSync, copyFileSync, chmodSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const ARCHES = ["x64", "arm64"];

const [arch, compiledDir, outDir] = process.argv.slice(2);
if (!ARCHES.includes(arch) || !compiledDir || !outDir) {
  console.error("usage: node scripts/package-macos.js <x64|arm64> <compiledDir> <outDir>");
  process.exit(2);
}

const target = `darwin-${arch}`;
const binaryPath = join(compiledDir, `ribosome-${target}`);
const miseBinPath = join(compiledDir, "mise-bundled", target, "mise");

mkdirSync(outDir, { recursive: true });
const work = join(outDir, `.work-${target}`);
rmSync(work, { recursive: true, force: true });

const dirName = `ribosome-darwin-${arch}`;
const stage = join(work, dirName);
mkdirSync(join(stage, "mise-bundled"), { recursive: true });
copyFileSync(binaryPath, join(stage, "ribosome"));
chmodSync(join(stage, "ribosome"), 0o755);
copyFileSync(miseBinPath, join(stage, "mise-bundled", "mise"));
chmodSync(join(stage, "mise-bundled", "mise"), 0o755);

const zipOut = join(outDir, `${dirName}.zip`);
execFileSync("zip", ["-r", "-X", zipOut, dirName], { cwd: work });
console.log(`✓ built ${zipOut}`);

rmSync(work, { recursive: true, force: true });
