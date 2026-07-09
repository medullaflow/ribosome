// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Adapter: mise-en-place (https://mise.jdx.dev) as an EnvironmentProvider. This
// is the ONLY file allowed to know mise exists — `mise install`/`where`/
// `bin-paths` are internal details here and appear nowhere else in ribosome.
// Swapping mise for asdf/nix/devbox is a new sibling adapter, not a core change.
//
// Design, grounded in mise's actual CLI behavior (verified, not assumed):
//   - `mise install <tool>@<spec>` installs into mise's own GLOBALLY SHARED
//     store (~/.local/share/mise/installs/<tool>/<version>) — not cwd-scoped,
//     no mise.toml needed. This IS the shared pool; ribosome doesn't
//     reimplement dedup, it inherits mise's.
//   - `mise where <tool>@<spec>` resolves a (possibly fuzzy) spec to the
//     concrete install path; its last path segment is the exact version.
//   - `mise bin-paths <tool>@<exactVersion>` gives the real bin directory —
//     NOT always `<install>/bin` (e.g. jq's binary sits at the install root),
//     so this must be asked of mise, never assumed.
// Every requirement is resolved through exactly this install -> where ->
// bin-paths sequence, always re-querying bin-paths by the EXACT resolved
// version (not the original spec), so a later install of a newer version
// under the same fuzzy prefix (e.g. mise re-pointing a "22" symlink) can
// never silently change an already-resolved pool entry's bin path.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PooledRuntime } from "@medullaflow/ribosome-schema";
import type {
  EnvironmentDelta,
  EnvironmentProvider,
  MaterializeContext,
  RuntimeRequirement,
} from "../../ports/environment-provider";

const execFileAsync = promisify(execFile);

async function mise(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("mise", args, { cwd });
  return stdout.trim();
}

interface InstallFailure {
  tool: string;
  versionSpec: string;
  reason: string;
}

export class MiseEnvironmentProvider implements EnvironmentProvider {
  // Pool id ("tool@exactVersion") -> its bin directories. Populated by the
  // most recent materialize() on this instance; composeView() reads it
  // synchronously (the port forbids new installs/subprocesses there).
  private readonly binPaths = new Map<string, string[]>();

  async materialize(reqs: RuntimeRequirement[], ctx: MaterializeContext): Promise<PooledRuntime[]> {
    const settled = await Promise.allSettled(reqs.map((req) => this.installOne(req, ctx.cwd)));

    const pool = new Map<string, PooledRuntime>(); // dedup by (tool, exact version)
    const failures: InstallFailure[] = [];

    settled.forEach((result, i) => {
      if (result.status === "fulfilled") {
        pool.set(result.value.id, result.value);
      } else {
        const req = reqs[i];
        failures.push({
          tool: req.tool,
          versionSpec: req.versionSpec,
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    if (failures.length > 0) {
      const lines = failures.map((f) => `  - ${f.tool}@${f.versionSpec || "latest"}: ${f.reason}`);
      throw new Error(
        `mise failed to provision ${failures.length} runtime(s):\n${lines.join("\n")}`,
      );
    }

    return [...pool.values()];
  }

  private async installOne(req: RuntimeRequirement, cwd: string): Promise<PooledRuntime> {
    const spec = req.versionSpec && req.versionSpec !== "latest" ? req.versionSpec : "latest";
    const query = `${req.tool}@${spec}`;

    await mise(["install", query], cwd);

    const installPath = await mise(["where", query], cwd);
    const version = installPath.split("/").filter(Boolean).pop();
    if (!version) {
      throw new Error(
        `could not determine the installed version from mise's path "${installPath}"`,
      );
    }

    const id = `${req.tool}@${version}`;
    if (!this.binPaths.has(id)) {
      const raw = await mise(["bin-paths", `${req.tool}@${version}`], cwd);
      this.binPaths.set(id, raw.split("\n").filter(Boolean));
    }

    return { id, tool: req.tool, requested: req.versionSpec, version };
  }

  composeView(pool: PooledRuntime[], select: string[]): EnvironmentDelta {
    const pathPrepend: string[] = [];
    for (const id of select) {
      if (!pool.some((p) => p.id === id)) {
        throw new Error(`composeView: pool id "${id}" is not in the given pool`);
      }
      const paths = this.binPaths.get(id);
      if (!paths) {
        throw new Error(
          `composeView: no cached bin paths for "${id}" — it wasn't materialized by this ` +
            `MiseEnvironmentProvider instance (state doesn't survive across instances/processes)`,
        );
      }
      pathPrepend.push(...paths);
    }
    return { pathPrepend, envVars: {} };
  }
}
