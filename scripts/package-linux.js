// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Packages one Linux architecture's cross-compiled binary (#6) plus its
// bundled mise (#8) into the three artifact shapes users actually install:
// a plain .tar.gz, a .deb, and a .rpm. Runs entirely on the same
// ubuntu-latest runner as compilation -- .deb and .rpm are packaging
// formats with tooling (dpkg-deb, rpmbuild) available on any Debian-family
// host, neither requires running on a matching distro to *build* (only to
// install -- see the verification-tier issue).
//
//   node scripts/package-linux.js <x64|arm64> <compiledDir> <outDir>
//
// <compiledDir> is the cross-compile job's downloaded artifact root: it must
// contain ribosome-linux-<arch> and mise-bundled/linux-<arch>/mise.
//
// Every package places the ribosome binary and its "mise-bundled" sibling
// directory together, matching what resolveMiseBinary()
// (src/vendor/resolve-mise-binary.ts) looks for beside process.execPath --
// /usr/lib/ribosome/{ribosome,mise-bundled/mise} for .deb/.rpm, symlinked
// from /usr/bin/ribosome onto PATH (process.execPath resolves through a
// symlink to the real binary's own directory, verified empirically), and
// ribosome-linux-<arch>/{ribosome,mise-bundled/mise} for the tar.gz.

const {
  mkdirSync,
  copyFileSync,
  chmodSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");

const ARCH_NAMES = {
  x64: { deb: "amd64", rpm: "x86_64" },
  arm64: { deb: "arm64", rpm: "aarch64" },
};

const [arch, compiledDir, outDir] = process.argv.slice(2);
if (!ARCH_NAMES[arch] || !compiledDir || !outDir) {
  console.error("usage: node scripts/package-linux.js <x64|arm64> <compiledDir> <outDir>");
  console.error(`  <arch> one of: ${Object.keys(ARCH_NAMES).join(", ")}`);
  process.exit(2);
}

const { version } = require("../package.json");
const target = `linux-${arch}`;
// Absolute: %install below runs as its own shell script from rpmbuild's own
// _builddir, not this script's cwd, so a path relative to <compiledDir>
// would resolve against the wrong directory there.
const binaryPath = resolve(join(compiledDir, `ribosome-${target}`));
const miseBinPath = resolve(join(compiledDir, "mise-bundled", target, "mise"));

mkdirSync(outDir, { recursive: true });
const work = join(outDir, `.work-${target}`);
rmSync(work, { recursive: true, force: true });

function stageInto(dir) {
  mkdirSync(join(dir, "mise-bundled"), { recursive: true });
  copyFileSync(binaryPath, join(dir, "ribosome"));
  chmodSync(join(dir, "ribosome"), 0o755);
  copyFileSync(miseBinPath, join(dir, "mise-bundled", "mise"));
  chmodSync(join(dir, "mise-bundled", "mise"), 0o755);
}

// --- tar.gz: a self-contained, wrapping directory, no install step ---
const tarDirName = `ribosome-linux-${arch}`;
const tarStage = join(work, "tar", tarDirName);
stageInto(tarStage);
const tarOut = join(outDir, `${tarDirName}.tar.gz`);
execFileSync("tar", ["czf", tarOut, "-C", join(work, "tar"), tarDirName]);
console.log(`✓ built ${tarOut}`);

// --- .deb: FHS layout, dpkg-deb --build (available on any Debian host) ---
const debRoot = join(work, "deb");
const debPayload = join(debRoot, "usr", "lib", "ribosome");
stageInto(debPayload);
mkdirSync(join(debRoot, "usr", "bin"), { recursive: true });
symlinkSync("../lib/ribosome/ribosome", join(debRoot, "usr", "bin", "ribosome"));
mkdirSync(join(debRoot, "DEBIAN"), { recursive: true });
writeFileSync(
  join(debRoot, "DEBIAN", "control"),
  [
    "Package: ribosome",
    `Version: ${version}`,
    `Architecture: ${ARCH_NAMES[arch].deb}`,
    "Maintainer: ribosome contributors <https://github.com/medullaflow/ribosome>",
    "Section: devel",
    "Priority: optional",
    "Description: Standalone dependency resolver for MCP-based agentic workflows",
    " Resolves tool/runtime versions via mise-en-place and MCP servers via the",
    " MCP Registry into a reproducible lockfile. Ships its own pinned mise, no",
    " separate install required.",
    "",
  ].join("\n"),
);
const debOut = join(outDir, `ribosome_${version}_${ARCH_NAMES[arch].deb}.deb`);
execFileSync("dpkg-deb", ["--build", "--root-owner-group", debRoot, debOut]);
console.log(`✓ built ${debOut}`);

// --- .rpm: rpmbuild, no RPM-family runner required to *build* one ---
const rpmTop = join(work, "rpm-topdir");
for (const sub of ["BUILD", "RPMS", "SOURCES", "SPECS", "SRPMS", "BUILDROOT"]) {
  mkdirSync(join(rpmTop, sub), { recursive: true });
}
const rpmBuildroot = join(rpmTop, "BUILDROOT", `ribosome-${version}-1.${ARCH_NAMES[arch].rpm}`);
const specPath = join(rpmTop, "SPECS", "ribosome.spec");
writeFileSync(
  specPath,
  [
    "%define __os_install_post %{nil}",
    "%define _binaries_in_noarch_packages_terminate_build 0",
    "",
    "Name: ribosome",
    `Version: ${version}`,
    "Release: 1",
    "Summary: Standalone dependency resolver for MCP-based agentic workflows",
    "License: MPL-2.0",
    "Group: Development/Tools",
    `BuildArch: ${ARCH_NAMES[arch].rpm}`,
    "",
    "%description",
    "Resolves tool/runtime versions via mise-en-place and MCP servers via the",
    "MCP Registry into a reproducible lockfile. Ships its own pinned mise, no",
    "separate install required.",
    "",
    "%install",
    "rm -rf %{buildroot}",
    "mkdir -p %{buildroot}/usr/lib/ribosome/mise-bundled",
    "mkdir -p %{buildroot}/usr/bin",
    `install -m 0755 ${binaryPath} %{buildroot}/usr/lib/ribosome/ribosome`,
    `install -m 0755 ${miseBinPath} %{buildroot}/usr/lib/ribosome/mise-bundled/mise`,
    "ln -sf ../lib/ribosome/ribosome %{buildroot}/usr/bin/ribosome",
    "",
    "%files",
    "/usr/lib/ribosome/ribosome",
    "/usr/lib/ribosome/mise-bundled/mise",
    "/usr/bin/ribosome",
    "",
  ].join("\n"),
);
execFileSync("rpmbuild", [
  "-bb",
  "--target",
  `${ARCH_NAMES[arch].rpm}-linux`,
  "--define",
  `_topdir ${rpmTop}`,
  "--buildroot",
  rpmBuildroot,
  specPath,
]);
const builtRpm = join(
  rpmTop,
  "RPMS",
  ARCH_NAMES[arch].rpm,
  `ribosome-${version}-1.${ARCH_NAMES[arch].rpm}.rpm`,
);
const rpmOut = join(outDir, `ribosome-${version}-1.${ARCH_NAMES[arch].rpm}.rpm`);
copyFileSync(builtRpm, rpmOut);
console.log(`✓ built ${rpmOut}`);

rmSync(work, { recursive: true, force: true });
