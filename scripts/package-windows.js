// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Packages the windows-x64 cross-compiled binary (#6) plus its bundled mise
// (#8) as an NSIS installer and a portable zip (#7). `makensis` ships a
// Linux-native build via Ubuntu's own package repository, so installer
// generation stays on the same runner as compilation -- a Windows runner is
// used later, but only to *verify* the installer actually runs (see the
// verification-tier issue), never to build it.
//
//   node scripts/package-windows.js <compiledDir> <outDir>
//
// <compiledDir> is the cross-compile job's downloaded artifact root: it must
// contain ribosome-windows-x64.exe and mise-bundled/windows-x64/mise.exe.
//
// Both artifacts place the binary and its "mise-bundled" sibling directory
// together, matching what resolveMiseBinary()
// (src/vendor/resolve-mise-binary.ts) looks for beside process.execPath.
// The installer additionally appends its install directory to the machine
// PATH via a PowerShell call (built into Windows, no extra NSIS plugin
// needed) so `ribosome` is directly runnable post-install, and removes it
// again on uninstall.

const { mkdirSync, copyFileSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");

const [compiledDir, outDir] = process.argv.slice(2);
if (!compiledDir || !outDir) {
  console.error("usage: node scripts/package-windows.js <compiledDir> <outDir>");
  process.exit(2);
}

const { version } = require("../package.json");
const binaryPath = join(compiledDir, "ribosome-windows-x64.exe");
const miseBinPath = join(compiledDir, "mise-bundled", "windows-x64", "mise.exe");

mkdirSync(outDir, { recursive: true });
const work = resolve(join(outDir, ".work-windows-x64"));
rmSync(work, { recursive: true, force: true });

// --- shared staged files: both the zip and the installer pull from here ---
const dirName = "ribosome-windows-x64";
const stage = join(work, dirName);
mkdirSync(join(stage, "mise-bundled"), { recursive: true });
copyFileSync(binaryPath, join(stage, "ribosome.exe"));
copyFileSync(miseBinPath, join(stage, "mise-bundled", "mise.exe"));

// --- portable zip: no install step ---
const zipOut = resolve(join(outDir, `${dirName}.zip`));
execFileSync("zip", ["-r", "-X", zipOut, dirName], { cwd: work });
console.log(`✓ built ${zipOut}`);

// --- NSIS installer ---
const stagedExe = join(stage, "ribosome.exe");
const stagedMiseExe = join(stage, "mise-bundled", "mise.exe");
const installerOut = resolve(join(outDir, "ribosome-windows-x64-setup.exe"));
const uninstallKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ribosome";

const nsi = `
Name "ribosome ${version}"
OutFile "${installerOut}"
InstallDir "$PROGRAMFILES64\\ribosome"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /oname=ribosome.exe "${stagedExe}"
  SetOutPath "$INSTDIR\\mise-bundled"
  File /oname=mise.exe "${stagedMiseExe}"
  SetOutPath "$INSTDIR"

  WriteUninstaller "$INSTDIR\\uninstall.exe"
  WriteRegStr HKLM "${uninstallKey}" "DisplayName" "ribosome"
  WriteRegStr HKLM "${uninstallKey}" "UninstallString" "$INSTDIR\\uninstall.exe"
  WriteRegStr HKLM "${uninstallKey}" "DisplayVersion" "${version}"
  WriteRegStr HKLM "${uninstallKey}" "Publisher" "ribosome contributors"

  DetailPrint "Adding $INSTDIR to the machine PATH"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$p=[Environment]::GetEnvironmentVariable(\\"Path\\",\\"Machine\\"); if ($$p -notlike \\"*$INSTDIR*\\") { [Environment]::SetEnvironmentVariable(\\"Path\\", $$p + \\";$INSTDIR\\", \\"Machine\\") }"'
SectionEnd

Section "Uninstall"
  DetailPrint "Removing $INSTDIR from the machine PATH"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$p=[Environment]::GetEnvironmentVariable(\\"Path\\",\\"Machine\\"); [Environment]::SetEnvironmentVariable(\\"Path\\", (($$p -split \\";\\") | Where-Object { $$_ -ne \\"$INSTDIR\\" }) -join \\";\\", \\"Machine\\")"'
  Delete "$INSTDIR\\ribosome.exe"
  Delete "$INSTDIR\\mise-bundled\\mise.exe"
  RMDir "$INSTDIR\\mise-bundled"
  Delete "$INSTDIR\\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${uninstallKey}"
SectionEnd
`;

const nsiPath = join(work, "installer.nsi");
writeFileSync(nsiPath, nsi);
execFileSync("makensis", [nsiPath], { stdio: "inherit" });
console.log(`✓ built ${installerOut}`);

rmSync(work, { recursive: true, force: true });
