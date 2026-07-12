// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Resolves which `mise` binary MiseEnvironmentProvider actually invokes
// (#8). Lives here, not under adapters/mise/, so the architecture fitness
// function's ADAPTERS_NO_SIBLINGS rule (classify() only looks at a path's
// top-level segment, so any two files directly under adapters/ count as
// siblings regardless of subdirectory) doesn't block MiseEnvironmentProvider
// from importing it -- same "other" bucket as src/vendor/mise-version.ts,
// which this file is a natural companion to.
//
// Resolution order, most to least specific:
//   1. RIBOSOME_MISE_BIN env var — an explicit override, so a security-
//      patched or organization-mandated system mise is never unreachable.
//   2. A package-private "mise-bundled" directory sitting beside the
//      currently running executable — only ever populated inside a packaged
//      binary artifact (see scripts/fetch-bundled-mise.js), never a shared
//      system path, so a .deb/.rpm install can't collide with a mise the
//      user already has through some other means.
//   3. A bare `mise` on PATH — today's behavior, preserved as the fallback.
//
// Tier 2 is what makes a packaged binary "zero-setup": process.execPath,
// for a `bun build --compile` standalone binary, resolves to that compiled
// binary's own real path (verified empirically, including through a
// symlink) — never bun's own path, unlike a script run under a bun/node
// interpreter. For an `npm install`-as-a-library consumer running under
// plain `node`, process.execPath is node's own binary path instead, whose
// directory will never contain a "mise-bundled" sibling — tier 2 harmlessly
// never matches there, and resolution falls through to tier 3, exactly
// today's unmodified behavior. This is why library consumption needs no
// special-casing: it's a natural consequence of what execPath means in
// each runtime, not a runtime-detection branch.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const MISE_BIN_ENV_VAR = "RIBOSOME_MISE_BIN";

export interface ResolveMiseBinaryOptions {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
}

export function resolveMiseBinary(options: ResolveMiseBinaryOptions = {}): string {
  const {
    env = process.env,
    execPath = process.execPath,
    platform = process.platform,
    exists = existsSync,
  } = options;

  const override = env[MISE_BIN_ENV_VAR];
  if (override) return override;

  const bundledBin = platform === "win32" ? "mise.exe" : "mise";
  const bundledPath = join(dirname(execPath), "mise-bundled", bundledBin);
  if (exists(bundledPath)) return bundledPath;

  return "mise";
}
