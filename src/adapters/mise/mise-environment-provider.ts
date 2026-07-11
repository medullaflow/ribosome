// SPDX-License-Identifier: MPL-2.0
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
//
// Tracking (#59): `mise install` alone leaves an install invisible to mise's
// OWN usage tracking (`~/.local/state/mise/tracked-configs`, which `mise
// prune`/`mise ls --prunable` read) — verified: a bare `mise install` prints
// mise's own "not activated — it is not in any config file" warning, and is
// immediately reported by `mise ls --prunable`. An unrelated `mise prune`
// run anywhere else on the same machine can silently delete a version a
// ribosome-managed project still depends on. `trackConsumption()` closes
// that gap by registering every resolved pool entry with `mise use`.
//
// The one non-obvious part, verified empirically after an initial wrong
// attempt: `mise use --path <arbitrary file>` writes a perfectly correct
// tools file, but does NOT register a tracked-configs entry — it is
// silently invisible to `mise ls --prunable`/`mise prune` regardless, no
// different from a bare `mise install`. Tracking only registers through
// mise's own DEFAULT filename discovery (a bare `mise use tool@version`
// resolving `<cwd>/mise.toml`) — so this runs the subprocess itself with its
// `cwd` set to a dedicated subdirectory (`<projectRoot>/.ribosome/`) and
// lets default resolution write `mise.toml` there, rather than pointing
// `--path` at an arbitrary location from the project root. Confirmed
// reference-counted correctly this way: independent project directories
// tracking the same tool@version are counted independently; removing one's
// reference while another remains correctly keeps the shared install;
// removing the last reference correctly frees it — same "inherit the
// backend's mechanism, don't reimplement it" precedent as pool dedup
// itself. The subdirectory is project-local and adapter-internal (see this
// file's own module comment), never the project root itself: a `mise.toml`
// in a project's own root is user-owned config, not this adapter's to write
// into.
//
// Known limitation: `mise use` only ever ADDS entries to a tools file —
// verified there is no built-in "replace with exactly this set" mode. A tool
// a project stops depending on stays tracked (and thus prune-protected)
// indefinitely rather than becoming collectible right away. This is a
// conservative bias (never LESS protected than before this fix), not a
// correctness gap — the bug this closes is silent deletion of an in-use
// tool, which this fully fixes; tightening "untrack promptly on drop" is a
// separate, later concern if it ever matters in practice.

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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

    const resolved = [...pool.values()];
    await this.trackConsumption(resolved, ctx.cwd);
    return resolved;
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

  // Registers every resolved entry with mise's OWN tracked-configs mechanism
  // in one batched call (never per-tool/concurrently -- see #59's own
  // investigation: concurrent `mise use` calls against the SAME tools file
  // race and lose entries, unlike `mise install`, which is safe per-tool
  // since each tool's install is independent). Already-installed exact
  // versions make this a fast, no-download config write, not a reinstall.
  private async trackConsumption(pool: PooledRuntime[], cwd: string): Promise<void> {
    if (pool.length === 0) return;
    const trackedDir = join(cwd, ".ribosome");
    await mkdir(trackedDir, { recursive: true });
    const queries = pool.map((p) => `${p.tool}@${p.version}`);
    await mise(["use", ...queries], trackedDir);
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
