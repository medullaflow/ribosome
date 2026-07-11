// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Shared test-only helper for the real-mise integration tests
// (mise-environment-provider.test.js, convergence.test.js, cli.test.js).
// mise-environment-provider.ts installs into mise's own GLOBALLY SHARED
// store by design (see that file's own comment on why -- ribosome
// deliberately inherits mise's dedup rather than reimplementing it). Under
// `bun test --parallel` (separate worker processes per file -- see
// package.json's "test" script and `bun test --help`), two of those files
// installing the same unpinned tool (e.g. an npm-registry MCP server
// resolving to "node@latest") at the same time raced on mise's own "rebuild
// runtime symlinks" step and corrupted the shared install -- an observed CI
// failure (see the "test" job of a main-branch CI run following #29's
// merge), not a hypothetical.
//
// Tried first: giving each test file its own isolated MISE_DATA_DIR (mise
// supports this natively via an env var). That does remove the race, but it
// also throws away the shared install cache those files currently rely on
// for speed -- three concurrent *cold* `mise install node@latest` calls
// (each a real download + extract + GitHub attestation verification) blew
// well past every test's timeout. Empirically, ~49s for a single cold
// install here; three of those at once is worse, not additive.
//
// This is the fix that keeps both properties: a real, cross-process
// advisory lock (an atomically-created lock directory -- `mkdir` fails with
// EEXIST if the directory already exists, which is atomic on POSIX
// filesystems, so no separate locking library is needed) serializes the
// actual `mise install` step across the whole test run, whichever file or
// worker process gets there first. The shared store stays shared -- once
// the first real install of a given tool+version lands, every other
// caller's own `mise install` of that same tool+version becomes an
// effectively-instant "already installed" no-op, which is exactly the speed
// the pre-fix (unisolated, unlocked) tests relied on -- just without the
// concurrent-write race on mise's own symlink-rebuild step.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const LOCK_DIR = path.join(os.tmpdir(), "ribosome-mise-install.lock");
const STALE_MS = 5 * 60 * 1000; // generous over any single real install
const POLL_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

async function acquireLock(): Promise<void> {
  for (;;) {
    try {
      fs.mkdirSync(LOCK_DIR);
      return;
    } catch (err) {
      if (!isErrnoException(err) || err.code !== "EEXIST") throw err;
      // A crashed holder (killed test run, etc.) could leave the lock dir
      // behind forever -- reclaim it once it's older than any real install
      // could plausibly take, rather than hanging every future run.
      try {
        const age = Date.now() - fs.statSync(LOCK_DIR).mtimeMs;
        if (age > STALE_MS) {
          fs.rmSync(LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Lock dir vanished between our stat and now (the holder released
        // it) -- just retry the mkdir immediately.
      }
      await sleep(POLL_MS);
    }
  }
}

function releaseLock(): void {
  fs.rmSync(LOCK_DIR, { recursive: true, force: true });
}

/** Runs `fn` with the cross-process mise-install lock held; releases it even if `fn` throws/rejects. */
export async function withMiseInstallLock<T>(fn: () => T | Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}
